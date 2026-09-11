import { google } from "googleapis";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";

/**
 * Google Ads data source — mirrors the GA4 layer (ga4-service.ts).
 *
 * PlatformConnection platform = "googleAds". The OAuth refresh token is
 * stored ENCRYPTED in config, next to the founder-selected customer
 * (config.customerId, config.loginCustomerId, config.customerName,
 * config.currency). Uses the same GOOGLE_OAUTH_CLIENT_ID / SECRET app as
 * GSC and GA4 — one Google Cloud project, one more consent (adwords scope).
 *
 * Developer token (GOOGLE_ADS_DEVELOPER_TOKEN): OPTIONAL since 9 Sep 2026.
 * Google now grants API access levels to the Google Cloud PROJECT that owns
 * the OAuth client (console.cloud.google.com/google/ads-apis/overview), not
 * to the token, and will reject the header in a future major version. When
 * the env var is set we still send it (accepted today); when it is not, the
 * call relies on the project's access level. The production/test split is
 * therefore decided in Google Cloud, not by this token.
 *
 * Entry points:
 *   - getGoogleAdsOAuthUrl(storeId) / decodeGoogleAdsOAuthState / handleGoogleAdsOAuthCallback
 *   - listGoogleAdsCustomers(storeId)   → every ad account the login can read
 *   - setGoogleAdsCustomer / getGoogleAdsSelectedCustomer
 *   - syncGoogleAdsData(storeId)        → daily campaign metrics → GoogleAdsCampaignInsight
 *   - getGoogleAdsOverview(storeId, range) → per-campaign totals for the dashboard
 *
 * Wire protocol: the Google Ads REST endpoints, not a client library —
 * `customers:listAccessibleCustomers` and `googleAds:search` (GAQL). The
 * API version is env-driven (GOOGLE_ADS_API_VERSION) with a probe over
 * recent versions, because Google retires a version roughly every year.
 */

export const GOOGLE_ADS_PLATFORM = "googleAds" as const;

type OAuthClient = InstanceType<typeof google.auth.OAuth2>;
type Credentials = Parameters<OAuthClient["setCredentials"]>[0];

const SCOPES = ["https://www.googleapis.com/auth/adwords"];
const SYNC_WINDOW_DAYS = 90;
const API_BASE = "https://googleads.googleapis.com";
const VERSION_CANDIDATES = ["v24", "v23", "v22", "v21", "v20"];

function getOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");
  const appUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/google-ads/oauth/callback` };
}

export function isGoogleAdsDeveloperTokenConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
}

function developerToken(): string | null {
  return process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || null;
}

function createOAuthClient(): OAuthClient {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAdsOAuthUrl(storeId: string): string {
  if (!storeId?.trim()) throw new AppError("storeId is required to start the Google Ads connection.", 400);
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state: Buffer.from(JSON.stringify({ storeId }), "utf8").toString("base64url")
  });
}

export function decodeGoogleAdsOAuthState(state: string | null | undefined): { storeId: string } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { storeId?: unknown };
    return typeof parsed.storeId === "string" && parsed.storeId.trim() ? { storeId: parsed.storeId } : null;
  } catch {
    return null;
  }
}

export async function handleGoogleAdsOAuthCallback(code: string, storeId: string): Promise<void> {
  const client = createOAuthClient();
  const cleanCode = code?.trim();
  if (!cleanCode) throw new AppError("Google did not return an authorization code.", 400);
  if (!storeId?.trim()) throw new AppError("storeId is required to complete the Google Ads connection.", 400);
  const { tokens } = await client.getToken(cleanCode);
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new AppError("Google did not return a refresh token. Disconnect the app in your Google account and reconnect.", 502);
  }
  await persistConnection(storeId, refreshToken, tokens);
}

interface ConnectionConfig {
  refreshTokenEnc?: string;
  scope?: string;
  connectedAt?: string;
  customerId?: string;
  loginCustomerId?: string;
  customerName?: string;
  currency?: string;
}

async function readConfig(storeId: string): Promise<ConnectionConfig | null> {
  const db = getDb();
  const connection = (await db.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GOOGLE_ADS_PLATFORM } },
    select: { config: true }
  })) as { config: ConnectionConfig | null } | null;
  return connection?.config ?? null;
}

async function persistConnection(storeId: string, refreshToken: string, tokens: Credentials): Promise<void> {
  const db = getDb();
  // Preserve the selected customer across reconnects.
  const prior = (await readConfig(storeId)) ?? {};
  const config: ConnectionConfig = {
    refreshTokenEnc: encryptSecret(refreshToken),
    scope: tokens.scope ?? SCOPES.join(" "),
    connectedAt: new Date().toISOString(),
    ...(prior.customerId ? { customerId: prior.customerId, loginCustomerId: prior.loginCustomerId, customerName: prior.customerName, currency: prior.currency } : {})
  };
  await db.platformConnection.upsert({
    where: { storeId_platform: { storeId, platform: GOOGLE_ADS_PLATFORM } },
    update: { status: "connected", config: config as object, healthMessage: null, tokenLastFour: refreshToken.slice(-4) },
    create: { storeId, platform: GOOGLE_ADS_PLATFORM, status: "connected", config: config as object, tokenLastFour: refreshToken.slice(-4) }
  });
}

async function accessTokenFor(storeId: string): Promise<string> {
  const config = await readConfig(storeId);
  if (!config?.refreshTokenEnc) throw new AppError("Google Ads is not connected for this store. Connect it first.", 409);
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decryptSecret(config.refreshTokenEnc) });
  const { token } = await client.getAccessToken();
  if (!token) throw new AppError("Google did not issue an access token. Reconnect Google Ads.", 502);
  return token;
}

// ─── REST plumbing ──────────────────────────────────────────────────────

let resolvedVersion: string | null = null;

async function apiFetch(
  accessToken: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; loginCustomerId?: string | null } = {}
): Promise<any> {
  const configured = process.env.GOOGLE_ADS_API_VERSION?.trim();
  const versions = resolvedVersion ? [resolvedVersion] : configured ? [configured, ...VERSION_CANDIDATES.filter((v) => v !== configured)] : VERSION_CANDIDATES;
  let lastError: string = "";
  for (const version of versions) {
    const res = await fetch(`${API_BASE}/${version}/${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(developerToken() ? { "developer-token": developerToken() as string } : {}),
        "Content-Type": "application/json",
        ...(init.loginCustomerId ? { "login-customer-id": init.loginCustomerId.replace(/-/g, "") } : {})
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store"
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    // A retired/unknown version answers 404 with an HTML or "not found"
    // body — try the next one. Anything else is a real answer.
    if (res.status === 404 && !resolvedVersion && (!json || !json.error?.details)) {
      lastError = `version ${version}: 404`;
      continue;
    }
    if (!res.ok) {
      const message = json?.error?.message ?? json?.error?.status ?? text.slice(0, 300);
      throw new AppError(`Google Ads API ${res.status}: ${message}`, res.status === 401 || res.status === 403 ? 403 : 502);
    }
    resolvedVersion = version;
    return json;
  }
  throw new AppError(`Google Ads API: no supported version found (${lastError}). Set GOOGLE_ADS_API_VERSION.`, 502);
}

async function gaql(accessToken: string, customerId: string, loginCustomerId: string | null, query: string): Promise<any[]> {
  const rows: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 50; i += 1) {
    const page = await apiFetch(accessToken, `customers/${customerId.replace(/-/g, "")}/googleAds:search`, {
      method: "POST",
      loginCustomerId,
      body: { query, pageSize: 10_000, ...(pageToken ? { pageToken } : {}) }
    });
    for (const r of page?.results ?? []) rows.push(r);
    pageToken = page?.nextPageToken;
    if (!pageToken) break;
  }
  return rows;
}

// ─── Customer (ad account) selection ────────────────────────────────────

export interface GoogleAdsCustomerEntry {
  customerId: string;
  name: string;
  currency: string | null;
  manager: boolean;
  // The account to send as login-customer-id when reading this customer
  // (its manager, or itself when directly accessible).
  loginCustomerId: string;
}

export async function listGoogleAdsCustomers(storeId: string): Promise<GoogleAdsCustomerEntry[]> {
  const accessToken = await accessTokenFor(storeId);
  const accessible = await apiFetch(accessToken, "customers:listAccessibleCustomers");
  const roots: string[] = (accessible?.resourceNames ?? []).map((n: string) => n.replace(/^customers\//, ""));
  // GOOGLE_ADS_LOGIN_CUSTOMER_ID = the Hiloomy manager (MCC) account that owns
  // the developer token. Always try it as a root so its linked client accounts
  // show up even when the signed-in Google user is not listed on it directly.
  // Dashes are tolerated ("123-456-7890" → "1234567890").
  const envManager = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "") ?? "";
  if (envManager && !roots.includes(envManager)) roots.push(envManager);
  const byId = new Map<string, GoogleAdsCustomerEntry>();
  for (const root of roots) {
    // Every account reachable through this login — itself plus, for a
    // manager, its client accounts one level down.
    const rows = await gaql(
      accessToken,
      root,
      root,
      "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1"
    ).catch(() => [] as any[]);
    if (rows.length === 0) {
      // The env manager is only a probe; if this login cannot read it, skip it
      // rather than offering it as a pickable account.
      if (root !== envManager) byId.set(root, { customerId: root, name: root, currency: null, manager: false, loginCustomerId: root });
      continue;
    }
    for (const r of rows) {
      const c = r.customerClient ?? {};
      const id = String(c.id ?? "");
      if (!id) continue;
      if (!byId.has(id)) {
        byId.set(id, {
          customerId: id,
          name: String(c.descriptiveName ?? id),
          currency: typeof c.currencyCode === "string" ? c.currencyCode : null,
          manager: Boolean(c.manager),
          loginCustomerId: root
        });
      }
    }
  }
  return [...byId.values()].sort((a, b) => Number(a.manager) - Number(b.manager) || a.name.localeCompare(b.name));
}

export async function setGoogleAdsCustomer(storeId: string, customerId: string): Promise<void> {
  const clean = customerId.replace(/-/g, "").trim();
  if (!/^\d{6,12}$/.test(clean)) throw new AppError("customerId must be a Google Ads customer id (digits).", 400);
  // Validate against the login's own account list — the client's choice is never trusted blindly.
  const customers = await listGoogleAdsCustomers(storeId);
  const picked = customers.find((c) => c.customerId === clean);
  if (!picked) throw new AppError("That Google Ads account is not accessible with the connected Google login.", 400);
  if (picked.manager) throw new AppError("Pick a client account, not a manager (MCC) account.", 400);
  const db = getDb();
  const prior = (await readConfig(storeId)) ?? {};
  await db.platformConnection.update({
    where: { storeId_platform: { storeId, platform: GOOGLE_ADS_PLATFORM } },
    data: {
      config: { ...prior, customerId: picked.customerId, loginCustomerId: picked.loginCustomerId, customerName: picked.name, currency: picked.currency ?? undefined } as object,
      healthMessage: null
    }
  });
}

export async function getGoogleAdsSelectedCustomer(storeId: string): Promise<{ customerId: string; loginCustomerId: string; name: string | null; currency: string | null } | null> {
  const config = await readConfig(storeId);
  if (!config?.customerId) return null;
  return {
    customerId: config.customerId,
    loginCustomerId: config.loginCustomerId ?? config.customerId,
    name: config.customerName ?? null,
    currency: config.currency ?? null
  };
}

// ─── Sync ───────────────────────────────────────────────────────────────

export async function syncGoogleAdsData(storeId: string): Promise<{ rowsUpserted: number; days: number; campaigns: number }> {
  const selected = await getGoogleAdsSelectedCustomer(storeId);
  if (!selected) throw new AppError("No Google Ads account selected. Pick one in Settings → Google Ads.", 409);
  const accessToken = await accessTokenFor(storeId);
  const end = new Date();
  const start = new Date(end.getTime() - SYNC_WINDOW_DAYS * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const rows = await gaql(
    accessToken,
    selected.customerId,
    selected.loginCustomerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date,
            metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
     FROM campaign
     WHERE segments.date BETWEEN '${iso(start)}' AND '${iso(end)}' AND metrics.impressions > 0`
  );
  const db = getDb() as any;
  let rowsUpserted = 0;
  const days = new Set<string>();
  const campaigns = new Set<string>();
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  for (const r of rows) {
    const c = r.campaign ?? {};
    const m = r.metrics ?? {};
    const dateIso = String(r.segments?.date ?? "");
    const campaignId = String(c.id ?? "");
    if (!campaignId || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
    days.add(dateIso);
    campaigns.add(campaignId);
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    const data = {
      campaignName: String(c.name ?? campaignId),
      campaignStatus: typeof c.status === "string" ? c.status : null,
      channelType: typeof c.advertisingChannelType === "string" ? c.advertisingChannelType : null,
      spend: Math.round((num(m.costMicros) / 1_000_000) * 100) / 100,
      impressions: Math.round(num(m.impressions)),
      clicks: Math.round(num(m.clicks)),
      conversions: Math.round(num(m.conversions) * 100) / 100,
      conversionsValue: Math.round(num(m.conversionsValue) * 100) / 100,
      syncedAt: new Date()
    };
    await db.googleAdsCampaignInsight.upsert({
      where: { storeId_customerId_campaignId_date: { storeId, customerId: selected.customerId, campaignId, date } },
      update: data,
      create: { storeId, customerId: selected.customerId, campaignId, date, ...data }
    });
    rowsUpserted += 1;
  }
  await db.platformConnection
    .update({ where: { storeId_platform: { storeId, platform: GOOGLE_ADS_PLATFORM } }, data: { lastSyncAt: new Date(), healthMessage: null } })
    .catch(() => undefined);
  return { rowsUpserted, days: days.size, campaigns: campaigns.size };
}

// ─── Overview for the dashboard ─────────────────────────────────────────

export interface GoogleAdsCampaignRow {
  campaignId: string;
  campaignName: string;
  channelType: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
  lastActiveDate: string | null;
  activeRecently: boolean;
}

export interface GoogleAdsOverview {
  customerId: string;
  customerName: string | null;
  currency: string | null;
  rangeStart: string;
  rangeEnd: string;
  dataThrough: string | null;
  totalSpend: number;
  totalConversions: number;
  totalConversionsValue: number;
  blendedRoas: number | null;
  campaigns: GoogleAdsCampaignRow[];
}

export async function getGoogleAdsOverview(storeId: string, range: { start: Date; end: Date }): Promise<GoogleAdsOverview | null> {
  const selected = await getGoogleAdsSelectedCustomer(storeId);
  if (!selected) return null;
  const db = getDb() as any;
  const rows = (await db.googleAdsCampaignInsight.findMany({
    where: { storeId, customerId: selected.customerId, date: { gte: range.start, lte: range.end } },
    select: { campaignId: true, campaignName: true, channelType: true, campaignStatus: true, date: true, spend: true, impressions: true, clicks: true, conversions: true, conversionsValue: true },
    orderBy: { date: "asc" }
  })) as Array<{ campaignId: string; campaignName: string; channelType: string | null; campaignStatus: string | null; date: Date; spend: unknown; impressions: number; clicks: number; conversions: unknown; conversionsValue: unknown }>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const byCampaign = new Map<string, GoogleAdsCampaignRow>();
  let dataThrough: Date | null = null;
  for (const r of rows) {
    if (!dataThrough || r.date > dataThrough) dataThrough = r.date;
    const c = byCampaign.get(r.campaignId) ?? {
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      channelType: r.channelType,
      status: r.campaignStatus,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionsValue: 0,
      roas: null,
      cpa: null,
      ctr: null,
      lastActiveDate: null,
      activeRecently: false
    };
    c.campaignName = r.campaignName;
    c.status = r.campaignStatus;
    c.spend += num(r.spend);
    c.impressions += r.impressions;
    c.clicks += r.clicks;
    c.conversions += num(r.conversions);
    c.conversionsValue += num(r.conversionsValue);
    if (num(r.spend) > 0) {
      const d = r.date.toISOString().slice(0, 10);
      if (!c.lastActiveDate || d > c.lastActiveDate) c.lastActiveDate = d;
    }
    byCampaign.set(r.campaignId, c);
  }
  const recencyCutoff = dataThrough ? new Date(dataThrough.getTime() - 3 * 86_400_000).toISOString().slice(0, 10) : null;
  const campaigns = [...byCampaign.values()]
    .map((c) => ({
      ...c,
      roas: c.spend > 0 ? c.conversionsValue / c.spend : null,
      cpa: c.conversions > 0 ? c.spend / c.conversions : null,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
      activeRecently: Boolean(recencyCutoff && c.lastActiveDate && c.lastActiveDate >= recencyCutoff)
    }))
    .sort((a, b) => b.spend - a.spend);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalConversionsValue = campaigns.reduce((s, c) => s + c.conversionsValue, 0);
  return {
    customerId: selected.customerId,
    customerName: selected.name,
    currency: selected.currency,
    rangeStart: range.start.toISOString().slice(0, 10),
    rangeEnd: range.end.toISOString().slice(0, 10),
    dataThrough: dataThrough ? dataThrough.toISOString().slice(0, 10) : null,
    totalSpend,
    totalConversions,
    totalConversionsValue,
    blendedRoas: totalSpend > 0 ? totalConversionsValue / totalSpend : null,
    campaigns
  };
}
