// Design-partner membership diagnostic + fix. Works without the Supabase
// dashboard (uses the DB connection directly).
//
// Usage (PowerShell):
//   $env:DATABASE_URL = "postgresql://postgres.<project>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"
//   node scripts/diag-partner-membership.mjs takeanap-israel.myshopify.com               # read-only report
//   node scripts/diag-partner-membership.mjs takeanap-israel.myshopify.com --fix dror@takeanap.com   # add that user as OWNER of the store's org
//
// Report shows: where the store landed (org, onboarding status, pending
// invites) and every recent user with their memberships — so you can see
// which email the partner actually signed in with before fixing.

import { PrismaClient } from "@prisma/client";

const shopDomain = process.argv[2];
const fixIdx = process.argv.indexOf("--fix");
const fixEmail = fixIdx > -1 ? process.argv[fixIdx + 1] : null;
if (!shopDomain) {
  console.error("Usage: node scripts/diag-partner-membership.mjs <shop.myshopify.com> [--fix <email>]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const p = new PrismaClient({ log: [] });
const row = (r) => console.log(JSON.stringify(r));

try {
  console.log(`\n## Store ${shopDomain}`);
  const stores = await p.$queryRaw`
    SELECT s.id AS store_id, s.domain, s."orgId", o.name AS org_name, s.connected,
           so.status AS onboarding_status, so."invitedEmail", so."targetOrgId",
           (SELECT string_agg(i.email || ' (' || i.role || ', expires ' || to_char(i."expiresAt", 'YYYY-MM-DD') || ')', ', ')
              FROM "Invitation" i WHERE i."orgId" = s."orgId") AS pending_invites
    FROM "Store" s
    JOIN "Organization" o ON o.id = s."orgId"
    LEFT JOIN "StoreOnboarding" so ON so."shopDomain" = s.domain
    WHERE s.domain = ${shopDomain}`;
  if (!stores.length) console.log("NO STORE ROW — the OAuth callback never completed for this shop.");
  stores.forEach(row);

  console.log("\n## Members of the store's org");
  (await p.$queryRaw`
    SELECT u.email, m.role, m."createdAt"
    FROM "Membership" m JOIN "User" u ON u.id = m."userId"
    WHERE m."orgId" IN (SELECT "orgId" FROM "Store" WHERE domain = ${shopDomain})`).forEach(row);

  console.log("\n## Users created in the last 3 days, with their memberships (which email did the partner sign in with?)");
  (await p.$queryRaw`
    SELECT u.email, u."createdAt" AS user_created, o.name AS org_name, m.role,
           (SELECT count(*) FROM "Store" s WHERE s."orgId" = m."orgId")::int AS stores_in_org
    FROM "User" u
    LEFT JOIN "Membership" m ON m."userId" = u.id
    LEFT JOIN "Organization" o ON o.id = m."orgId"
    WHERE u."createdAt" > now() - interval '3 days'
    ORDER BY u."createdAt" DESC`).forEach(row);

  if (fixEmail) {
    console.log(`\n## FIX: make ${fixEmail} an owner of the org that holds ${shopDomain}`);
    const store = stores[0];
    const user = await p.user.findFirst({ where: { email: { equals: fixEmail, mode: "insensitive" } }, select: { id: true, email: true } });
    if (!store) throw new Error("No store row — nothing to attach to.");
    if (!user) throw new Error(`No User with email ${fixEmail} — they have not signed up yet (or used another address; see the list above).`);
    const existing = await p.membership.findFirst({ where: { userId: user.id, orgId: store.orgId } });
    if (existing) {
      console.log(`already a member (${existing.role}) — nothing to do`);
    } else {
      const m = await p.membership.create({ data: { userId: user.id, orgId: store.orgId, role: "owner" } });
      console.log(`created membership ${m.id}: ${user.email} → org ${store.org_name} (${store.orgId}) as owner`);
    }
    // Consume a matching pending invitation so it doesn't linger.
    const removed = await p.invitation.deleteMany({ where: { orgId: store.orgId, email: { equals: fixEmail, mode: "insensitive" } } });
    if (removed.count) console.log(`removed ${removed.count} pending invitation(s) for ${fixEmail}`);
    console.log("Done. The user should reload — the org switcher in the top bar now lists this org; pick it.");
  }
} finally {
  await p.$disconnect();
}
