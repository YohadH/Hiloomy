// Diagnose a store's Meta ad-account binding + which campaign-insight rows
// actually sit under its storeId. READ-ONLY. Explains why the campaigns list,
// the chart tooltip, and the cached AI insight can disagree (mis-bound account
// + stale rows from previously-bound accounts under the same storeId).
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL = "postgresql://...pooler.supabase.com:5432/postgres?sslmode=require"
//   node scripts/diag-meta-binding.mjs <storeId>

import { PrismaClient } from "@prisma/client";

const STORE = process.argv[2];
if (!STORE) { console.error("Usage: node scripts/diag-meta-binding.mjs <storeId>"); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL."); process.exit(1); }
const p = new PrismaClient({ log: [] });
const row = (r) => console.log(JSON.stringify(r));

try {
  console.log(`# meta binding · store ${STORE} · ${new Date().toISOString()}`);

  console.log("\n## 1. Connected Meta ad account for THIS store (what the list scopes to)");
  (await p.$queryRaw`
    SELECT "adAccountId", "adAccountName", "accountStatus", currency, "updatedAt"
    FROM "MetaAdsConnection" WHERE "storeId" = ${STORE}`).forEach(row);

  console.log("\n## 2. Insight rows under THIS storeId, grouped by adAccountId (mixed = contamination)");
  // If more than one adAccountId appears, this store holds rows from accounts
  // it isn't (or shouldn't be) bound to — the source of the stale tooltip.
  (await p.$queryRaw`
    SELECT "adAccountId",
           COUNT(*)::int AS rows,
           COUNT(DISTINCT "campaignName")::int AS campaigns,
           MIN("dateStart")::date AS first_day, MAX("dateStart")::date AS last_day,
           SUM(spend)::float AS spend, SUM(purchases)::int AS purchases
    FROM "MetaAdsCampaignInsight" WHERE "storeId" = ${STORE}
    GROUP BY "adAccountId" ORDER BY spend DESC`).forEach(row);

  console.log("\n## 3. Top campaigns under THIS storeId (name → account, spend, purchases, dates)");
  (await p.$queryRaw`
    SELECT "campaignName", "adAccountId",
           MIN("dateStart")::date AS first_day, MAX("dateStart")::date AS last_day,
           SUM(spend)::float AS spend, SUM(purchases)::int AS purchases
    FROM "MetaAdsCampaignInsight" WHERE "storeId" = ${STORE}
    GROUP BY "campaignName", "adAccountId" ORDER BY spend DESC LIMIT 25`).forEach(row);

  console.log("\n## 4. Does any OTHER store share these adAccountIds? (cross-brand binding check)");
  (await p.$queryRaw`
    SELECT c."storeId", s.name AS store_name, c."adAccountId", c."adAccountName"
    FROM "MetaAdsConnection" c LEFT JOIN "Store" s ON s.id = c."storeId"
    WHERE c."adAccountId" IN (SELECT DISTINCT "adAccountId" FROM "MetaAdsCampaignInsight" WHERE "storeId" = ${STORE})
    ORDER BY c."adAccountId"`).forEach(row);

  console.log("\n## READ:");
  console.log("- If #1 adAccountId != the account holding your REAL campaigns in #3, the store is bound to the WRONG account → re-connect it in Settings > Meta.");
  console.log("- If #2 shows multiple adAccountIds, stale rows from old bindings sit under this storeId → purge the ones that aren't the connected account.");
  console.log("- If #4 shows the same adAccountId on two different brands, the two brands were bound to one Meta account (cross-brand).");

  // --purge-stale: delete insight rows under this storeId whose adAccountId is
  // NOT the currently-connected account (leftover contamination from an old
  // binding, e.g. the orphaned JulyPromotions account). --dry-run previews.
  // Refuses to run when there is no connected account (would delete everything).
  if (process.argv.includes("--purge-stale")) {
    const dry = process.argv.includes("--dry-run");
    const conn = (await p.$queryRaw`SELECT "adAccountId" FROM "MetaAdsConnection" WHERE "storeId" = ${STORE}`);
    const connected = conn?.[0]?.adAccountId ?? null;
    console.log(`\n## PURGE stale insight rows (keep only connected account ${connected ?? "—"})`);
    if (!connected) {
      console.log("no connected ad account for this store — refusing to purge (would delete all rows).");
    } else {
      const victims = await p.$queryRaw`
        SELECT "adAccountId", COUNT(*)::int AS rows
        FROM "MetaAdsCampaignInsight" WHERE "storeId" = ${STORE} AND "adAccountId" <> ${connected}
        GROUP BY "adAccountId"`;
      victims.forEach(row);
      if (dry) {
        console.log("dry run — nothing deleted.");
      } else {
        const del = await p.metaAdsCampaignInsight.deleteMany({
          where: { storeId: STORE, adAccountId: { not: connected } }
        });
        console.log(`DELETED ${del.count} stale insight rows (adAccountId != ${connected}).`);
      }
    }
  }
} finally {
  await p.$disconnect();
}
