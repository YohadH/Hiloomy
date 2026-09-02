// Diagnostic for "are we querying RivalSweeper (swiper) properly?" READ-ONLY.
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL = "postgresql://postgres.<project>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"
//   node scripts/diag-competitor-intel.mjs <storeId>
//
// Answers, for one store:
//   1. Which competitors are configured (domain, IG handle, active?). If this
//      is empty, the section has nothing to cross — add competitors in
//      Settings first; nothing is wrong with the query.
//   2. The latest snapshot per competitor (last 21 days): its SOURCE
//      (rivalsweeper = promo pipeline, rivalsweeper-ads = ads-derived
//      fallback, mock = no API key), promo count, max discount %, free-ship
//      threshold, homepage message, and whether live activity (ads/homepage/
//      news) was attached. This is exactly what feeds the brief's competitor
//      section.
//   3. The persisted crawl outcome (SystemConfig competitor_crawl:<store>) —
//      per competitor: ok / no_data / not_monitored. "not_monitored" means the
//      RivalSweeper account itself isn't tracking that domain yet (add it in
//      the provider), NOT a bug in our query. "no_data" = monitored but the
//      provider hasn't crawled it yet.
//
// Read together: competitors configured + snapshots with a real source =
// we ARE querying swiper and getting data. Empty snapshots + not_monitored =
// the provider isn't tracking those domains (provider-side, not our code).

import { PrismaClient } from "@prisma/client";

const STORE = process.argv[2];
if (!STORE) {
  console.error("Usage: node scripts/diag-competitor-intel.mjs <storeId>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the database you want to inspect.");
  process.exit(1);
}

const p = new PrismaClient({ log: [] });
const row = (r) => console.log(JSON.stringify(r));

try {
  console.log(`# store ${STORE}`);

  console.log("\n## 1. Competitors configured for this store");
  const competitors = await p.$queryRaw`
    SELECT id, name, domain, "igHandle", status, "createdAt"
    FROM "Competitor" WHERE "storeId" = ${STORE} ORDER BY "createdAt"`;
  competitors.forEach(row);
  console.log(`(${competitors.length} total, ${competitors.filter((c) => c.status === "active").length} active)`);

  console.log("\n## 2. Latest snapshot per competitor (last 21 days) — what feeds the brief");
  // The competitor section reads snapshots from the last 14 days; pull 21 so a
  // slightly stale crawl is visible too. source tells the story: rivalsweeper
  // = promo pipeline has data; rivalsweeper-ads = only the ad-library fallback
  // fired; mock = no API key wired.
  const snaps = await p.$queryRaw`
    SELECT DISTINCT ON (s."competitorId")
           c.name, c.domain, s."snapshotDate", s.source,
           s."activePromoCount" AS promos, s."maxDiscountPct"::float AS max_disc_pct,
           s."freeShippingThreshold"::float AS free_ship, s."homepageMessage",
           (s."signalsJson" -> 'activity' IS NOT NULL) AS has_live_activity,
           (s."signalsJson" -> 'activity' ->> 'adsActive') AS ads_active
    FROM "CompetitorSnapshot" s JOIN "Competitor" c ON c.id = s."competitorId"
    WHERE s."storeId" = ${STORE} AND s."snapshotDate" >= NOW() - INTERVAL '21 days'
    ORDER BY s."competitorId", s."snapshotDate" DESC`;
  snaps.forEach(row);
  console.log(`(${snaps.length} competitors have a snapshot in the last 21 days)`);
  const bySource = {};
  for (const s of snaps) bySource[s.source] = (bySource[s.source] ?? 0) + 1;
  console.log("snapshot sources:", JSON.stringify(bySource));

  console.log("\n## 3. Persisted crawl outcome (competitor_crawl:<store>)");
  // Written by syncCompetitorSignals each crawl — the definitive answer to
  // "did the query run and what did the provider return per domain".
  const cfg = await p.systemConfig
    .findUnique({ where: { key: `competitor_crawl:${STORE}` } })
    .catch(() => null);
  if (!cfg) {
    console.log("no competitor_crawl config row — the crawl has not run for this store since the outcome-persistence deploy");
  } else {
    console.log(typeof cfg.value === "string" ? cfg.value : JSON.stringify(cfg.value));
  }

  console.log("\n## 4. Last sync run for this store");
  const lastSync = await p.syncRun
    .findFirst({ where: { storeId: STORE }, orderBy: { startedAt: "desc" }, select: { startedAt: true, finishedAt: true, status: true, mode: true } })
    .catch(() => null);
  console.log(JSON.stringify(lastSync));
} finally {
  await p.$disconnect();
}
