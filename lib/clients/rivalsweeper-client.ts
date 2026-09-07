import { safeScrapedText, safeScrapedTexts } from "@/lib/server/scraped-text-safety";
// RivalSweeper API Layer client — competitor promo/pricing feed powering the
// weekly report's "what did competitors do this week" section.
//
// REAL CONTRACT (apilayer.rivalsweeper.com/v1, verified 14/08/2026):
//   1. POST /auth/token  {grant_type: client_credentials, client_id: rsk_...,
//      client_secret: rss_...} → short-lived JWT bearer (expires_in ~3600s).
//      The JWT payload carries `company_guid` — the tenancy for every call.
//   2. GET /companies/{cg}/domains → the company's monitored domains, each
//      with a domain_guid (matched against OUR Competitor.domain).
//   3. Domain reports: /companies/{cg}/domains/{dg}/reports/homepage-promo,
//      markdowns. Company reports: /companies/{cg}/reports/coupons,
//      free-shipping (records carry per-record domain_guid).
//   Envelope: {report_guid, page:{total}, last_refreshed_at, records:[
//     {record_id, domain_guid, signal_type, captured_at, source, payload}]}.
//   `payload` is report-specific and loosely typed — extraction below is
//   deliberately defensive (fields probed from several candidate keys).
//
// "No data yet": freshly-monitored domains return valid empty envelopes with
// last_refreshed_at=null until the crawler pipeline fills. In that state
// fetchCompetitorSignals returns NULL and the sync layer skips the snapshot
// (writing "0 promos" for an unscanned competitor would be a lie).
//
// Mock mode: set RIVALSWEEPER_MOCK=true OR omit RIVALSWEEPER_KEY_ID/SECRET.
// Mock signals are DETERMINISTIC per (domain, ISO week): stable within a
// week (idempotent daily upserts), varying across weeks so week-over-week
// diffs ("opened a promo", "deepened discount") show up in demos.

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = "https://apilayer.rivalsweeper.com/v1";

// Lookback for the ads report. Overridable so the window can be widened in
// production without a deploy if RivalSweeper's refresh cadence changes
// again — which is exactly what made this stale in the first place.
const ADS_WINDOW = process.env.RIVALSWEEPER_ADS_WINDOW || "30d";

export interface RivalSweeperSignals {
  activePromoCount: number;
  // Percent, e.g. 40 = "40% off". Null when no active promo.
  maxDiscountPct: number | null;
  // Store currency units. Null when no free-shipping offer detected.
  freeShippingThreshold: number | null;
  homepageMessage: string | null;
  // Raw provider payload, persisted to CompetitorSnapshot.signalsJson.
  raw: unknown;
}

export function isRivalSweeperConfigured(): boolean {
  return Boolean(process.env.RIVALSWEEPER_KEY_ID && process.env.RIVALSWEEPER_KEY_SECRET);
}

function isMock(): boolean {
  return process.env.RIVALSWEEPER_MOCK === "true" || !isRivalSweeperConfigured();
}

function getBaseUrl(): string {
  return (process.env.RIVALSWEEPER_API_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

// ── Deterministic mock ──────────────────────────────────────────────────

// ISO-8601 week key, e.g. "2026-W33". Exported for the service layer and
// unit tests so everyone derives the same key for the same date.
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to the Thursday of this week — ISO weeks belong to the year of
  // their Thursday.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// FNV-1a 32-bit — tiny, stable, good enough for demo variety.
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const MOCK_DISCOUNTS = [10, 15, 20, 25, 30, 40];
const MOCK_SHIPPING_THRESHOLDS = [149, 199, 249, 299];
const MOCK_MESSAGES_HE = [
  "מבצע סוף עונה — עד {pct}% הנחה",
  "{pct}% הנחה על כל האתר",
  "1+1 על קולקציית הדגל",
  "משלוח חינם מעל ₪{ship} + {pct}% הנחה",
  "SALE — {pct}% על המותגים המובילים"
];

// Pure mock generator, exported for unit tests. Deterministic per
// (domain, weekKey): ~1 in 3 weeks a competitor runs no promo at all, so
// opened/closed transitions occur naturally across weeks.
export function mockSignalsFor(domain: string, weekKey: string): RivalSweeperSignals {
  const h = hash32(`${domain}|${weekKey}`);
  const hasPromo = h % 3 !== 0;
  if (!hasPromo) {
    return {
      activePromoCount: 0,
      maxDiscountPct: null,
      freeShippingThreshold: null,
      homepageMessage: null,
      raw: { mock: true, domain, weekKey }
    };
  }
  const pct = MOCK_DISCOUNTS[(h >>> 3) % MOCK_DISCOUNTS.length];
  const ship =
    (h >>> 7) % 2 === 0
      ? MOCK_SHIPPING_THRESHOLDS[(h >>> 9) % MOCK_SHIPPING_THRESHOLDS.length]
      : null;
  const message = MOCK_MESSAGES_HE[(h >>> 11) % MOCK_MESSAGES_HE.length]
    .replace("{pct}", String(pct))
    .replace("{ship}", String(ship ?? 199));
  return {
    activePromoCount: 1 + ((h >>> 5) % 3),
    maxDiscountPct: pct,
    freeShippingThreshold: ship,
    homepageMessage: message,
    raw: { mock: true, domain, weekKey }
  };
}

// ── Real HTTP path ──────────────────────────────────────────────────────

// The report types the API actually fills for most monitored domains
// (verified against the published OpenAPI + a live sweep, 7 Sep 2026):
// markdowns (price cuts with drop %), out-of-stock events, the company-wide
// price-index (catalog size, median price, on-sale count) and ad-presence
// (active / total ads in Meta's library). homepage-promo, coupons and
// free-shipping were empty for every domain — so these are the signals
// that make the competitor section say something true.
export interface CompetitorMarketSignals {
  markdowns: { count: number; maxDropPct: number | null; avgDropPct: number | null };
  outOfStock: { count: number; products: string[] };
  priceIndex: {
    products: number;
    medianPrice: number | null;
    avgPrice: number | null;
    onSaleCount: number;
    onSalePct: number | null;
  } | null;
  adPresence: { activeAds: number; totalAds: number } | null;
  // Ad-library read (see CompetitorAdInsights). The library has NO
  // performance numbers, so "what works" is a proxy: the ads they keep
  // paying for longest.
  ads: CompetitorAdInsights | null;
}

export interface CompetitorAdInsights {
  active: number;
  total: number;
  // Share of ads whose CTA is PROMO or DIRECT_SALE (vs awareness / other).
  promoShare: number | null;
  // Longest-running ACTIVE ads — headline screened, days since delivery_start.
  longestRunning: Array<{ headline: string; days: number; cta: string | null; platforms: string | null; snapshotUrl: string | null }>;
}

export function adInsightsFromJson(activity: unknown): CompetitorAdInsights | null {
  if (typeof activity !== "object" || activity === null) return null;
  const a = (activity as Record<string, any>).adInsights;
  if (typeof a !== "object" || a === null) return null;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    active: n(a.active) ?? 0,
    total: n(a.total) ?? 0,
    promoShare: n(a.promoShare),
    longestRunning: Array.isArray(a.longestRunning)
      ? a.longestRunning
          .filter((x: any) => x && typeof x.headline === "string" && isSafeScrapedTextLocal(x.headline))
          .slice(0, 3)
          .map((x: any) => ({
            headline: String(x.headline),
            days: n(x.days) ?? 0,
            cta: typeof x.cta === "string" ? x.cta : null,
            platforms: typeof x.platforms === "string" ? x.platforms : null,
            snapshotUrl: typeof x.snapshotUrl === "string" ? x.snapshotUrl : null
          }))
      : []
  };
}

function isSafeScrapedTextLocal(text: string): boolean {
  return safeScrapedTexts([text]).length === 1;
}

export function marketSignalsFromJson(signalsJson: unknown): CompetitorMarketSignals | null {
  if (typeof signalsJson !== "object" || signalsJson === null) return null;
  const m = (signalsJson as Record<string, unknown>).market;
  if (typeof m !== "object" || m === null) return null;
  const o = m as Record<string, any>;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    markdowns: {
      count: n(o.markdowns?.count) ?? 0,
      maxDropPct: n(o.markdowns?.maxDropPct),
      avgDropPct: n(o.markdowns?.avgDropPct)
    },
    outOfStock: {
      count: n(o.outOfStock?.count) ?? 0,
      products: Array.isArray(o.outOfStock?.products) ? o.outOfStock.products.filter((x: unknown) => typeof x === "string").slice(0, 5) : []
    },
    priceIndex:
      o.priceIndex && typeof o.priceIndex === "object"
        ? {
            products: n(o.priceIndex.products) ?? 0,
            medianPrice: n(o.priceIndex.medianPrice),
            avgPrice: n(o.priceIndex.avgPrice),
            onSaleCount: n(o.priceIndex.onSaleCount) ?? 0,
            onSalePct: n(o.priceIndex.onSalePct)
          }
        : null,
    adPresence:
      o.adPresence && typeof o.adPresence === "object"
        ? { activeAds: n(o.adPresence.activeAds) ?? 0, totalAds: n(o.adPresence.totalAds) ?? 0 }
        : null,
    ads: adInsightsFromJson((signalsJson as Record<string, unknown>).activity)
  };
}

// Scraped homepage link labels sometimes arrive doubled ("BedroomBedroom":
// an icon's alt text plus the visible label). Collapse an exact repeat.
export function undoubleLabel(value: string): string {
  const s = value.trim();
  const m = s.match(/^(.{2,})\1$/);
  return m ? m[1] : s;
}

// News relevance: the provider matches news by brand name loosely, so
// "Linera" surfaced a crypto article and "ד"ר גב" a snake sighting. Keep an
// item only when the competitor's name (or a ≥4-char token of it) appears
// in the title or description.
export function newsMentionsCompetitor(name: string, domain: string, text: string): boolean {
  const hay = text.toLowerCase();
  const tokens = new Set<string>();
  const brandFromDomain = domain.replace(/^www\./, "").split(".")[0];
  for (const t of [name, brandFromDomain, ...name.split(/[\s\-/|,]+/)]) {
    const tok = t.trim().toLowerCase();
    if (tok.length >= 4) tokens.add(tok);
  }
  if (tokens.size === 0) return true;
  return [...tokens].some((tok) => hay.includes(tok));
}

interface ReportRecord {
  record_id: string;
  domain_guid?: string | null;
  signal_type?: string;
  captured_at?: string;
  source?: string;
  is_delta?: boolean;
  payload?: Record<string, unknown>;
}

interface ReportEnvelope {
  report_guid?: string;
  company_guid?: string;
  domain_guid?: string | null;
  report?: string;
  last_refreshed_at?: string | null;
  page?: { total?: number | null; next_cursor?: string | null };
  records?: ReportRecord[];
  // RFC 7807 problem fields on errors
  title?: string;
  status?: number;
  detail?: string;
}

// Module-level caches. Token is short-lived (~1h); the domain map changes
// rarely — 1h TTL keeps a daily cron to at most one discovery call.
let tokenCache: { token: string; companyGuid: string; expiresAtMs: number } | null = null;
let domainMapCache: { map: Map<string, { guid: string; name: string }>; expiresAtMs: number } | null =
  null;

function normalizeHost(input: string): string {
  let value = String(input ?? "").trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/^www\./, "");
  return value.split(/[/?#]/)[0].replace(/\.$/, "");
}

function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1] ?? "";
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getAccessToken(timeoutMs: number): Promise<{ token: string; companyGuid: string }> {
  if (tokenCache && Date.now() < tokenCache.expiresAtMs - 60_000) {
    return tokenCache;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.RIVALSWEEPER_KEY_ID,
        client_secret: process.env.RIVALSWEEPER_KEY_SECRET
      })
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      detail?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new Error(`RivalSweeper auth failed (${res.status}): ${body.detail ?? "no token"}`);
    }
    const claims = decodeJwtClaims(body.access_token);
    const companyGuid = String(claims["company_guid"] ?? "");
    if (!companyGuid) {
      throw new Error("RivalSweeper token has no company_guid claim.");
    }
    tokenCache = {
      token: body.access_token,
      companyGuid,
      expiresAtMs: Date.now() + (body.expires_in ?? 3600) * 1000
    };
    return tokenCache;
  } finally {
    clearTimeout(timer);
  }
}

// The provider allows 10 requests/second per key. Callers fan out
// (15 domains × 3 reports in one Promise.all; 7 reports per competitor in
// the snapshot sync), which blew through the cap and silently dropped a
// random subset of ads/news every sync (7 Sep 2026: twelve 429s in one
// activity fetch). One module-level gate spaces every request start ≥125ms
// apart (≤8/s) no matter how many callers run in parallel.
const REQUEST_SPACING_MS = 125;
let nextRequestAt = 0;
async function rateGate(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt);
  nextRequestAt = at + REQUEST_SPACING_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function getReport(
  path: string,
  timeoutMs: number,
  retryOnce = true
): Promise<ReportEnvelope> {
  const auth = await getAccessToken(timeoutMs);
  await rateGate();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.token}` },
      cache: "no-store",
      signal: ctrl.signal
    });
    if (res.status === 401 && retryOnce) {
      // Token may have been revoked/expired server-side — re-auth once.
      tokenCache = null;
      return getReport(path, timeoutMs, false);
    }
    const body = (await res.json().catch(() => ({}))) as ReportEnvelope;
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && retryOnce) {
        await new Promise((r) => setTimeout(r, 1000));
        return getReport(path, timeoutMs, false);
      }
      throw new Error(`RivalSweeper ${res.status} on ${path}: ${body.detail ?? body.title ?? ""}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Monitored-domain map: normalized host → {domain_guid, name}.
async function getDomainGuidMap(timeoutMs: number): Promise<Map<string, { guid: string; name: string }>> {
  if (domainMapCache && Date.now() < domainMapCache.expiresAtMs) {
    return domainMapCache.map;
  }
  const auth = await getAccessToken(timeoutMs);
  const envelope = await getReport(`/companies/${auth.companyGuid}/domains?limit=500`, timeoutMs);
  const map = new Map<string, { guid: string; name: string }>();
  for (const record of envelope.records ?? []) {
    const payload = record.payload ?? {};
    const host = normalizeHost(String(payload["url"] ?? ""));
    const guid = String(record.domain_guid ?? record.record_id ?? "");
    if (host && guid) {
      map.set(host, { guid, name: String(payload["name"] ?? host) });
    }
  }
  domainMapCache = { map, expiresAtMs: Date.now() + 60 * 60 * 1000 };
  return map;
}

/**
 * Hosts the RivalSweeper company account monitors. Null in mock mode (every
 * domain "exists" there). The provider only crawls domains added in ITS
 * dashboard — adding a competitor in Hiloomy does not register it — so the
 * sync uses this to tell the merchant "add x.com on RivalSweeper" rather than
 * "no data yet" (Take a Nap, 1 Sep 2026: three competitors, zero snapshots).
 */
export async function getMonitoredHosts(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Set<string> | null> {
  if (isMock()) return null;
  try {
    const map = await getDomainGuidMap(timeoutMs);
    return new Set(map.keys());
  } catch (error) {
    console.warn("[rivalsweeper] monitored-domain lookup failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Normalised host for matching against the monitored set (exported for the sync). */
export function rivalSweeperHost(domain: string): string {
  return normalizeHost(domain);
}

// ── Defensive payload extraction ────────────────────────────────────────
// Report payloads are additionalProperties:true — probe likely keys and
// fall back to parsing "NN%" out of text so new provider fields degrade
// gracefully instead of breaking the sync.

const PCT_KEYS = ["max_discount_pct", "discount_pct", "discount_percent", "depth_pct", "drop_pct", "pct", "percent"];
const THRESHOLD_KEYS = ["free_shipping_threshold", "threshold", "min_order", "minimum", "amount"];
const TEXT_KEYS = ["message", "title", "text", "banner_text", "description", "headline", "code", "promo_text"];

function pickNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function pickText(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function parsePctFromText(text: string | null): number | null {
  if (!text) return null;
  const matches = [...text.matchAll(/(\d{1,2})\s*%/g)].map((m) => Number(m[1]));
  const valid = matches.filter((n) => n > 0 && n < 100);
  return valid.length ? Math.max(...valid) : null;
}

// Report lookback in days. Callers pass the dashboard's selected date range
// so a "last 90 days" view pulls 90 days of provider records instead of the
// default window; clamped to [min, 90] — the provider serves at most ~90d.
function clampSinceDays(value: number | undefined, min: number): number {
  if (value === undefined || !Number.isFinite(value)) return min;
  return Math.min(90, Math.max(min, Math.round(value)));
}

/** The dashboard's applied reporting window, for date-scoped pulls. */
export interface ReportDateRange {
  start: Date;
  end: Date;
}

function lookbackDays(range: ReportDateRange | undefined, min: number): number {
  return clampSinceDays(
    range ? Math.ceil((Date.now() - range.start.getTime()) / 86_400_000) : undefined,
    min
  );
}

// Date-scoping rule (verified against the live API, 25/08/2026): every
// record of a crawl shares one captured_at = the crawl date — it says when
// the provider PHOTOGRAPHED the competitor, not when an ad/promo ran. So a
// ranged pull keeps records captured up to range.end (a crawl from before
// the window is the last known state going INTO it), and drops crawls from
// after the window — those would leak future state into a historical view.
// Records the provider ships without captured_at can't be placed in time
// and are dropped from ranged pulls only.
function capturedWithinEnd(record: ReportRecord, range?: ReportDateRange): boolean {
  if (!range) return true;
  const t = Date.parse(String(record.captured_at ?? ""));
  return Number.isFinite(t) && t <= range.end.getTime();
}

// ── Competitor activity (ads / news / homepage links) ───────────────────
// The provider's crawl pipeline fills in stages: raw homepage + ad-library
// + news data lands FIRST, and the promo/coupon analyses (which feed our
// snapshots) come later. This call surfaces whatever already exists so the
// weekly report shows live competitor activity from day one.

export interface CompetitorActivityEntry {
  domain: string;
  name: string;
  // page.total of the ads report over the window; null when the report is
  // empty/not yet crawled.
  adsActive: number | null;
  // Up to 3 distinct ad headlines (the campaign themes).
  adHeadlines: string[];
  news: Array<{ title: string; source: string; date: string }>;
  // Top homepage link labels — what the competitor pushes above the fold.
  homepageLinks: string[];
  adInsights: CompetitorAdInsights | null;
}

export async function fetchCompetitorActivity(options?: {
  timeoutMs?: number;
}): Promise<CompetitorActivityEntry[] | null> {
  if (isMock()) return null;
  const timeoutMs = options?.timeoutMs ?? 15_000;
  try {
    const auth = await getAccessToken(timeoutMs);
    const cg = auth.companyGuid;
    const domainMap = await getDomainGuidMap(timeoutMs);
    const entries = await Promise.all(
      [...domainMap.entries()].map(async ([host, meta]): Promise<CompetitorActivityEntry> => {
        const dg = meta.guid;
        // A failed report and an empty one both used to collapse to null, so
        // "the API is broken" and "there is nothing to report" were
        // indistinguishable — which is how a wrong window went unnoticed.
        // Log the failure and keep going.
        const report = (label: string, path: string) =>
          getReport(path, timeoutMs).catch((err) => {
            console.error(`[rivalsweeper] ${label} failed for ${host}:`, err instanceof Error ? err.message : err);
            return null;
          });

        const [ads, news, links] = await Promise.all([
          // 30d, not 7d. RivalSweeper's ad snapshots refresh far less often
          // than weekly — measured against the live API, `since=7d` returned
          // 0 records for every monitored domain while `since=30d` returned
          // 60/60/0/26. The 7d window was reporting "no competitor ads" for
          // competitors who were in fact advertising the whole time.
          // 200, not 60: the longevity read needs the whole active set, and a
          // brand like Byredo keeps 150+ ads live at once.
          report("ads", `/companies/${cg}/domains/${dg}/reports/ads?since=${ADS_WINDOW}&limit=200`),
          report("news", `/companies/${cg}/domains/${dg}/reports/news?since=14d&limit=10`),
          report("homepage-links", `/companies/${cg}/domains/${dg}/reports/homepage-top-links?since=30d&limit=10`)
        ]);

        const headlines: string[] = [];
        for (const record of ads?.records ?? []) {
          const h = pickText(record.payload ?? {}, ["headline", "title"]);
          if (h && !headlines.includes(h)) headlines.push(h);
          if (headlines.length >= 3) break;
        }

        // Ad-library read. The library never exposes spend or results (0 of
        // ~800 ads carried a spend/impressions range, 7 Sep 2026), so the
        // honest "what works" proxy is longevity: an ad still running after
        // months is one the competitor keeps paying for.
        const adRows = (ads?.records ?? []).map((r) => r.payload ?? {});
        const now = Date.now();
        const daysRunning = (a: Record<string, unknown>): number | null => {
          const start = typeof a.delivery_start === "string" ? Date.parse(a.delivery_start) : NaN;
          if (!Number.isFinite(start)) return null;
          const end = typeof a.last_seen === "string" && Number.isFinite(Date.parse(a.last_seen)) ? Date.parse(a.last_seen) : now;
          return Math.max(0, Math.round((end - start) / 86_400_000));
        };
        const promoCtas = new Set(["PROMO", "DIRECT_SALE", "SHOP_NOW", "BUY_NOW"]);
        const withCta = adRows.filter((a) => typeof a.cta_type === "string");
        const activeRows = adRows.filter((a) => a.is_active === true);
        const longestRunning = activeRows
          .map((a) => ({ a, days: daysRunning(a) }))
          .filter((x): x is { a: Record<string, unknown>; days: number } => x.days !== null)
          .sort((x, y) => y.days - x.days)
          .map(({ a, days }) => ({
            headline: safeScrapedTexts([pickText(a, ["headline", "title", "body"]) ?? ""])[0] ?? "",
            days,
            cta: typeof a.cta_type === "string" ? a.cta_type : null,
            platforms: typeof a.platforms === "string" ? a.platforms : null,
            snapshotUrl: typeof a.snapshot_url === "string" ? a.snapshot_url : null
          }))
          .filter((x) => x.headline)
          .filter((x, i, arr) => arr.findIndex((y) => y.headline === x.headline) === i)
          .slice(0, 3);
        const adInsights: CompetitorAdInsights | null =
          adRows.length > 0
            ? {
                active: activeRows.length,
                total: ads?.page?.total ?? adRows.length,
                promoShare: withCta.length > 0 ? Math.round((withCta.filter((a) => promoCtas.has(String(a.cta_type))).length / withCta.length) * 100) / 100 : null,
                longestRunning
              }
            : null;

        return {
          domain: host,
          name: meta.name,
          adsActive: ads?.page?.total ?? null,
          // Ad-library copy is whatever the competitor runs — screen it here
          // at the source so no consumer can quote explicit text.
          adHeadlines: safeScrapedTexts(headlines),
          adInsights,
          news: (news?.records ?? [])
            .filter((r) =>
              newsMentionsCompetitor(
                meta.name,
                host,
                `${pickText(r.payload ?? {}, ["title"]) ?? ""} ${pickText(r.payload ?? {}, ["description"]) ?? ""}`
              )
            )
            .map((r) => ({
              title: pickText(r.payload ?? {}, ["title"]) ?? "",
              source: String(r.payload?.["source"] ?? r.source ?? ""),
              date: String(r.captured_at ?? "").slice(0, 10)
            }))
            .filter((n) => n.title)
            .slice(0, 3),
          homepageLinks: [
            ...new Set(
              (links?.records ?? [])
                .map((r) => pickText(r.payload ?? {}, ["name"]))
                .filter((v): v is string => Boolean(v && v.trim()))
                .map(undoubleLabel)
            )
          ].slice(0, 4)
        };
      })
    );
    return entries;
  } catch (err) {
    console.warn(
      "[rivalsweeper] activity fetch failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ── Ads-derived promo signals ───────────────────────────────────────────
// Probe finding (2026-08-22): the provider's promo/coupon analysis
// pipeline (homepage-promo, markdowns, coupons, free-shipping) can stay
// EMPTY for weeks after a domain is added, while the ads + news feeds are
// fresh within days and carry rich payloads (headline, body, spend_range,
// impressions_range, platforms). Until the promo pipeline matures, derive
// promo signals from the ad creatives themselves — an ad shouting
// "20% הנחה" IS a promo signal, arguably a stronger one than a homepage
// banner because money is behind it.

const PROMO_TEXT_RE = /(\d{1,2})\s*%|(\b|^)(sale|off)(\b|$)|מבצע|הנחה|1\s*\+\s*1|חינם/i;
const FREE_SHIP_RE = /(?:משלוח חינם.{0,12}?|free shipping.{0,12}?)(?:₪|\$|over |מעל )\s*(\d{2,4})/i;

export async function fetchAdsDerivedSignals(
  domain: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  range?: ReportDateRange
): Promise<RivalSweeperSignals | null> {
  if (isMock()) return null;
  try {
    const host = normalizeHost(domain);
    const domainMap = await getDomainGuidMap(timeoutMs);
    const entry = domainMap.get(host);
    if (!entry) return null;

    const auth = await getAccessToken(timeoutMs);
    const ads = await getReport(
      `/companies/${auth.companyGuid}/domains/${entry.guid}/reports/ads?since=${lookbackDays(range, 14)}d&limit=200`,
      timeoutMs
    );
    if (ads.last_refreshed_at == null) return null;
    const records = (ads.records ?? []).filter((r) => capturedWithinEnd(r, range));
    // Ranged pull with no crawl at or before the window's end — the window
    // predates tracking, so there is no signal (not "0 promos").
    if (range && records.length === 0) return null;

    let promoAds = 0;
    let maxPct: number | null = null;
    let shippingThreshold: number | null = null;
    let topPromoHeadline: string | null = null;
    const platforms = new Map<string, number>();

    for (const record of records) {
      const payload = (record.payload ?? {}) as Record<string, unknown>;
      const text = [pickText(payload, ["headline", "title"]), pickText(payload, ["body", "text", "description"])]
        .filter(Boolean)
        .join(" · ");
      for (const p of Array.isArray(payload["platforms"]) ? (payload["platforms"] as unknown[]) : []) {
        const key = String(p);
        platforms.set(key, (platforms.get(key) ?? 0) + 1);
      }
      if (!text || !PROMO_TEXT_RE.test(text)) continue;
      promoAds += 1;
      const pct = parsePctFromText(text);
      if (pct != null && (maxPct == null || pct > maxPct)) {
        maxPct = pct;
        topPromoHeadline = pickText(payload, ["headline", "title"]) ?? topPromoHeadline;
      }
      if (!topPromoHeadline) topPromoHeadline = pickText(payload, ["headline", "title"]);
      const ship = text.match(FREE_SHIP_RE);
      if (ship && shippingThreshold == null) shippingThreshold = Number(ship[1]);
    }

    return {
      activePromoCount: promoAds,
      maxDiscountPct: maxPct,
      freeShippingThreshold: shippingThreshold,
      homepageMessage: safeScrapedText(topPromoHeadline),
      raw: {
        source: "ads-derived",
        adsTotal: ads.page?.total ?? records.length,
        adsRefreshedAt: ads.last_refreshed_at,
        promoAds,
        platforms: Object.fromEntries(platforms)
      }
    };
  } catch (err) {
    console.warn("[rivalsweeper] ads-derived signals failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface FetchCompetitorSignalsInput {
  domain: string;
  igHandle?: string | null;
  // Injectable for tests / backfills; defaults to now.
  date?: Date;
  timeoutMs?: number;
  // The dashboard's applied date range. Widens the report lookback to cover
  // the range and keeps only records captured up to its end, so the signals
  // describe the selected window rather than the default 7d one.
  range?: ReportDateRange;
}

// Returns null in real mode when the provider has no usable data for this
// domain yet (not monitored, or monitored but never crawled) — the sync
// layer skips the snapshot instead of recording a false "no promos".
export async function fetchCompetitorSignals(
  input: FetchCompetitorSignalsInput
): Promise<RivalSweeperSignals | null> {
  const date = input.date ?? new Date();
  if (isMock()) {
    return mockSignalsFor(input.domain, isoWeekKey(date));
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const host = normalizeHost(input.domain);
  const domainMap = await getDomainGuidMap(timeoutMs);
  const entry = domainMap.get(host);
  if (!entry) {
    console.warn(
      `[rivalsweeper] domain "${host}" is not in the company's monitored set — add it on RivalSweeper. Skipping.`
    );
    return null;
  }

  const auth = await getAccessToken(timeoutMs);
  const cg = auth.companyGuid;
  const dg = entry.guid;
  const since = `${lookbackDays(input.range, 7)}d`;
  const soft = (path: string) =>
    getReport(path, timeoutMs).catch((err) => {
      console.warn(`[rivalsweeper] ${path.split("/reports/")[1]?.split("?")[0]} failed for ${host}:`, err instanceof Error ? err.message : err);
      return {} as ReportEnvelope;
    });
  const [homepagePromo, markdowns, coupons, freeShipping, outOfStock, priceIndex, adPresence] = await Promise.all([
    getReport(`/companies/${cg}/domains/${dg}/reports/homepage-promo?since=${since}&limit=100`, timeoutMs),
    getReport(`/companies/${cg}/domains/${dg}/reports/markdowns?since=${since}&limit=100`, timeoutMs),
    getReport(`/companies/${cg}/reports/coupons?since=${since}&limit=200`, timeoutMs),
    getReport(`/companies/${cg}/reports/free-shipping?since=${since}&limit=200`, timeoutMs),
    // The reports that are actually populated (see CompetitorMarketSignals).
    soft(`/companies/${cg}/domains/${dg}/reports/out-of-stock?since=${since}&limit=100`),
    soft(`/companies/${cg}/reports/price-index?since=30d&limit=200`),
    soft(`/companies/${cg}/reports/ad-presence?since=30d&limit=200`)
  ]);

  // Company-scoped reports: keep only this domain's records; ranged pulls
  // also drop records captured after the window's end.
  const inWindow = (r: ReportRecord) => capturedWithinEnd(r, input.range);
  const domainCoupons = (coupons.records ?? []).filter((r) => r.domain_guid === dg && inWindow(r));
  const domainShipping = (freeShipping.records ?? []).filter((r) => r.domain_guid === dg && inWindow(r));
  const promoRecords = (homepagePromo.records ?? []).filter(inWindow);
  const markdownRecords = (markdowns.records ?? []).filter(inWindow);
  const oosRecords = (outOfStock.records ?? []).filter(inWindow);
  const priceIndexRecord = (priceIndex.records ?? []).find((r) => r.domain_guid === dg) ?? null;
  const adPresenceRecord = (adPresence.records ?? []).find((r) => r.domain_guid === dg) ?? null;

  const everRefreshed = [homepagePromo, markdowns, coupons, freeShipping, outOfStock, priceIndex, adPresence].some(
    (e) => e.last_refreshed_at != null
  );
  const totalRecords =
    promoRecords.length + markdownRecords.length + domainCoupons.length + domainShipping.length +
    oosRecords.length + (priceIndexRecord ? 1 : 0) + (adPresenceRecord ? 1 : 0);
  if (totalRecords === 0 && (!everRefreshed || input.range)) {
    // Never crawled — or a ranged pull with no crawl at or before the
    // window's end. Either way: no signal for this window, not "no promos".
    return null;
  }

  // Discount depth: explicit numeric fields first, then % parsed from text.
  const pctCandidates: number[] = [];
  for (const record of [...promoRecords, ...markdownRecords, ...domainCoupons]) {
    const payload = record.payload ?? {};
    const explicit = pickNumber(payload, PCT_KEYS);
    if (explicit !== null && explicit > 0 && explicit < 100) pctCandidates.push(explicit);
    const fromText = parsePctFromText(pickText(payload, TEXT_KEYS));
    if (fromText !== null) pctCandidates.push(fromText);
  }

  // Free-shipping threshold: smallest observed (the binding offer).
  const thresholds = domainShipping
    .map((r) => pickNumber(r.payload ?? {}, THRESHOLD_KEYS))
    .filter((n): n is number => n !== null && n >= 0);

  // Homepage message: newest homepage-promo record's text.
  const newestPromo = [...promoRecords].sort((a, b) =>
    String(b.captured_at ?? "").localeCompare(String(a.captured_at ?? ""))
  )[0];

  // Market signals from the populated reports.
  const drops = markdownRecords
    .map((r) => pickNumber(r.payload ?? {}, ["drop_pct"]))
    .filter((v): v is number => v !== null && v > 0 && v < 100);
  const pi = priceIndexRecord?.payload ?? null;
  const ap = adPresenceRecord?.payload ?? null;
  const piProducts = pi ? (pickNumber(pi, ["products"]) ?? 0) : 0;
  const piOnSale = pi ? (pickNumber(pi, ["on_sale_count"]) ?? 0) : 0;
  const market: CompetitorMarketSignals = {
    markdowns: {
      count: markdownRecords.length,
      maxDropPct: drops.length ? Math.max(...drops) : null,
      avgDropPct: drops.length ? Math.round((drops.reduce((a, b) => a + b, 0) / drops.length) * 10) / 10 : null
    },
    outOfStock: {
      count: oosRecords.length,
      // Events are per variant — the same product shows up once per size.
      products: safeScrapedTexts(
        [...new Set(oosRecords.map((r) => pickText(r.payload ?? {}, ["product"]) ?? "").filter(Boolean))]
      ).slice(0, 5)
    },
    priceIndex: pi
      ? {
          products: piProducts,
          medianPrice: pickNumber(pi, ["median_price"]),
          avgPrice: pickNumber(pi, ["avg_price"]),
          onSaleCount: piOnSale,
          onSalePct: piProducts > 0 ? Math.round((piOnSale / piProducts) * 1000) / 10 : null
        }
      : null,
    adPresence: ap ? { activeAds: pickNumber(ap, ["active_ads"]) ?? 0, totalAds: pickNumber(ap, ["total_ads"]) ?? 0 } : null,
    // Filled from the activity fetch (signalsJson.activity.adInsights) at read time.
    ads: null
  };

  return {
    // A markdown is a price cut the shopper sees — it IS a promotion signal.
    // Counting it here is what lets the week-over-week diff fire for stores
    // whose provider never fills homepage-promo (every domain, 7 Sep 2026).
    activePromoCount: promoRecords.length + domainCoupons.length + markdownRecords.length,
    maxDiscountPct: pctCandidates.length ? Math.max(...pctCandidates) : null,
    freeShippingThreshold: thresholds.length ? Math.min(...thresholds) : null,
    homepageMessage: newestPromo ? safeScrapedText(pickText(newestPromo.payload ?? {}, TEXT_KEYS)) : null,
    raw: {
      provider: "rivalsweeper",
      domainGuid: dg,
      reportGuids: {
        homepagePromo: homepagePromo.report_guid,
        markdowns: markdowns.report_guid,
        coupons: coupons.report_guid,
        freeShipping: freeShipping.report_guid
      },
      totals: {
        homepagePromo: promoRecords.length,
        markdowns: markdownRecords.length,
        coupons: domainCoupons.length,
        freeShipping: domainShipping.length,
        outOfStock: oosRecords.length
      },
      market
    }
  };
}
