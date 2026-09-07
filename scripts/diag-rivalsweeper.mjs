// Probe the RivalSweeper ("swiper") API for a store's competitors and report,
// per competitor, exactly what data comes back vs what's missing. Uses the
// SAME wired client the app uses (apilayer.rivalsweeper.com, OAuth via
// RIVALSWEEPER_KEY_ID/_SECRET) so it reflects what actually flows into Hiloomy.
//
// Runs where the keys + DB live (NOT the assistant session — no outbound there).
//
// Usage (PowerShell):
//   $env:DATABASE_URL       = "postgresql://...pooler.supabase.com:5432/postgres?sslmode=require"
//   $env:RIVALSWEEPER_KEY_ID     = "..."      # your RivalSweeper client id
//   $env:RIVALSWEEPER_KEY_SECRET = "..."      # your RivalSweeper client secret
//   node --import tsx scripts/diag-rivalsweeper.mjs [storeId]
//
// Reports, per competitor domain:
//   monitored?            — is the domain in the RS account's monitored set
//   promo signals         — homepage-promo + markdowns + coupons + free-shipping
//                           (activePromoCount / maxDiscountPct / freeShipping / homepage message)
//   ads-derived signals   — promo signals inferred from the ad library
//   live activity         — ads running, top ad headline, homepage links, news
// Then a summary of which signal categories are populated vs empty.

import { getDb } from "../lib/server/db";
import {
  isRivalSweeperConfigured,
  getMonitoredHosts,
  rivalSweeperHost,
  fetchCompetitorSignals,
  fetchAdsDerivedSignals,
  fetchCompetitorActivity
} from "../lib/clients/rivalsweeper-client";

const STORE = process.argv[2] || "cmofolt410000wkzw93wecvf7"; // Incense
if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL."); process.exit(1); }

const J = (o) => console.log(JSON.stringify(o));
const line = (c) => console.log(c);

const db = getDb();
try {
  line(`# RivalSweeper probe · store ${STORE} · ${new Date().toISOString()}`);
  line(`configured (KEY_ID + KEY_SECRET present): ${isRivalSweeperConfigured()}`);
  if (!isRivalSweeperConfigured()) {
    line("NOT CONFIGURED — set RIVALSWEEPER_KEY_ID and RIVALSWEEPER_KEY_SECRET, then re-run. (Without them the app runs in mock mode and fetches nothing real.)");
    process.exit(0);
  }

  const competitors = await db.competitor.findMany({
    where: { storeId: STORE },
    select: { name: true, domain: true, igHandle: true, status: true }
  });
  line(`\n## Competitors configured for this store: ${competitors.length}`);
  competitors.forEach((c) => J(c));
  if (competitors.length === 0) {
    line("No competitors configured — add them in Settings first; there is nothing for RivalSweeper to return.");
    process.exit(0);
  }

  line("\n## RS account monitored hosts (domains RivalSweeper is actually tracking)");
  const monitored = await getMonitoredHosts().catch((e) => { line("getMonitoredHosts failed: " + (e?.message ?? e)); return null; });
  line(monitored ? JSON.stringify([...monitored]) : "null (mock or call failed)");

  // Account-wide live activity (ads / homepage links / news), matched by domain.
  line("\n## Fetching account-wide live activity (ads/news/homepage-links)…");
  const activity = await fetchCompetitorActivity({ timeoutMs: 20000 }).catch((e) => { line("fetchCompetitorActivity failed: " + (e?.message ?? e)); return null; });
  const actByHost = new Map((activity ?? []).map((a) => [rivalSweeperHost(a.domain), a]));

  const summary = { promo: 0, adsDerived: 0, activity: 0, monitored: 0, notMonitored: 0, noData: 0 };

  for (const c of competitors) {
    const host = rivalSweeperHost(c.domain);
    line("\n" + "=".repeat(70));
    line(`## ${c.name || c.domain}  (${c.domain} → ${host})`);
    const isMon = monitored ? monitored.has(host) : null;
    line(`monitored by RS account: ${isMon === null ? "unknown" : isMon}`);
    if (isMon === true) summary.monitored++; else if (isMon === false) summary.notMonitored++;

    // 1. Promo signals (homepage-promo + markdowns + coupons + free-shipping)
    let promo = null;
    try { promo = await fetchCompetitorSignals({ domain: c.domain, igHandle: c.igHandle ?? undefined, date: new Date() }); }
    catch (e) { line("  promo signals ERROR: " + (e?.message ?? e)); }
    if (promo) {
      summary.promo++;
      J({ promoSignals: { activePromoCount: promo.activePromoCount, maxDiscountPct: promo.maxDiscountPct, freeShippingThreshold: promo.freeShippingThreshold, homepageMessage: promo.homepageMessage } });
    } else {
      line("  promo signals: NULL (not monitored, or promo-report pipeline has no data for this domain yet)");
    }

    // 2. Ads-derived signals (promo inferred from the ad library)
    let ads = null;
    try { ads = await fetchAdsDerivedSignals(c.domain); }
    catch (e) { line("  ads-derived ERROR: " + (e?.message ?? e)); }
    if (ads) {
      summary.adsDerived++;
      J({ adsDerivedSignals: { activePromoCount: ads.activePromoCount, maxDiscountPct: ads.maxDiscountPct, freeShippingThreshold: ads.freeShippingThreshold, homepageMessage: ads.homepageMessage } });
    } else {
      line("  ads-derived signals: NULL (no ad-library data / not monitored)");
    }

    // 3. Live activity (ads running / top headline / homepage links / news)
    const act = actByHost.get(host);
    if (act) {
      summary.activity++;
      J({ activity: { adsActive: act.adsActive ?? null, topAdHeadline: (act.adHeadlines ?? [])[0] ?? null, homepageLinks: (act.homepageLinks ?? []).slice(0, 3), news: (act.news ?? []).slice(0, 2).map((n) => n.title) } });
    } else {
      line("  live activity: none matched for this domain");
    }

    if (!promo && !ads && !act) summary.noData++;
  }

  line("\n" + "=".repeat(70));
  line("## SUMMARY");
  J({
    competitors: competitors.length,
    monitored: summary.monitored,
    not_monitored: summary.notMonitored,
    with_promo_report: summary.promo,
    with_ads_derived: summary.adsDerived,
    with_live_activity: summary.activity,
    with_NO_data_at_all: summary.noData
  });
  line("\nREAD:");
  line("- 'not_monitored' → RivalSweeper isn't tracking that domain yet; add it in the RS dashboard.");
  line("- promo-report NULL but ads-derived present → RS crawls the ads but its promo/coupon pipeline hasn't filled for that domain (known: promo analyses land later than ads).");
  line("- NOTE: this is the apilayer.rivalsweeper.com surface the app uses (homepage-promo/markdowns/coupons/free-shipping/ads/news/homepage-links). RivalSweeper's newer mcp.rivalsweeper.com per-SKU endpoints (price, stock_status, promotions, launches, AI-readiness) are NOT wired here — that's the 'missing' data class for per-SKU competitor intelligence.");
} finally {
  await db.$disconnect?.().catch(() => {});
}
