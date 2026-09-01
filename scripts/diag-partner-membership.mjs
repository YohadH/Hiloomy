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

// First argument: a shop domain (x.myshopify.com) OR an org name / id
// ("yoadhakimv's Brands"). Either resolves to the org whose members we fix.
const target = process.argv[2];
const roleIdx = process.argv.indexOf("--role");
const fixRole = roleIdx > -1 ? process.argv[roleIdx + 1] : "owner"; // owner | admin | member
const fixIdx = process.argv.indexOf("--fix");
const fixEmail = fixIdx > -1 ? process.argv[fixIdx + 1] : null;
if (!shopDomain) {
  console.error(
    "Usage: node scripts/diag-partner-membership.mjs <shop.myshopify.com | \"org name\" | orgId> [--fix <email> [--role owner|admin|member]] [--relink <email>] [--drop-empty-orgs <email>]"
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const p = new PrismaClient({ log: [] });
const row = (r) => console.log(JSON.stringify(r));

try {
  // Resolve the target: a shop domain, or an org by id / name (case-insensitive).
  let shopDomain = target;
  if (!/\.myshopify\.com$/i.test(target)) {
    const orgs = await p.$queryRaw`
      SELECT o.id, o.name, (SELECT s.domain FROM "Store" s WHERE s."orgId" = o.id ORDER BY s."createdAt" LIMIT 1) AS first_store
      FROM "Organization" o WHERE o.id = ${target} OR lower(o.name) = lower(${target})`;
    if (!orgs.length) throw new Error(`No organization matches "${target}" (by id or exact name).`);
    if (!orgs[0].first_store) throw new Error(`Org "${orgs[0].name}" has no stores — nothing to attach members to.`);
    console.log(`\n## Org "${orgs[0].name}" (${orgs[0].id}) — using its store ${orgs[0].first_store}`);
    shopDomain = orgs[0].first_store;
  }

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

  // Auth identity check. The app finds the User row by auth.users.id
  // (User.authUserId). If the person now signs in under a DIFFERENT auth id
  // for the same email (provider change, re-created auth user), the app sees
  // no User, tries to create one, hits the unique email, and falls back to a
  // blank session with no org -> "connect your first store", regardless of
  // memberships or cookies. --relink <email> repairs the pointer.
  console.log("\n## Auth identity (auth.users vs User.authUserId) for recent users");
  const identities = await p.$queryRaw`
    SELECT u.email, u."authUserId", au.id AS auth_id, au.last_sign_in_at,
           au.raw_app_meta_data->>'provider' AS provider, au.email_confirmed_at IS NOT NULL AS confirmed,
           (u."authUserId" = au.id::text) AS linked
    FROM "User" u
    LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
    WHERE u."createdAt" > now() - interval '3 days'
    ORDER BY u.email, au.last_sign_in_at DESC NULLS LAST`;
  identities.forEach(row);
  const broken = identities.filter((r) => r.auth_id && !r.linked);
  if (broken.length) console.log(`!! ${broken.length} auth identit(y/ies) NOT linked to their User row — run --relink <email>`);

  const relinkIdx = process.argv.indexOf("--relink");
  const relinkEmail = relinkIdx > -1 ? process.argv[relinkIdx + 1] : null;
  if (relinkEmail) {
    console.log(`\n## RELINK ${relinkEmail}: point User.authUserId at the auth user they actually sign in with`);
    const auths = await p.$queryRaw`
      SELECT id::text AS id, last_sign_in_at FROM auth.users WHERE lower(email) = lower(${relinkEmail})
      ORDER BY last_sign_in_at DESC NULLS LAST`;
    if (!auths.length) throw new Error(`No auth.users row for ${relinkEmail}`);
    const target = auths[0].id;
    const user = await p.user.findFirst({ where: { email: { equals: relinkEmail, mode: "insensitive" } }, select: { id: true, email: true, authUserId: true } });
    if (!user) throw new Error(`No User row for ${relinkEmail}`);
    if (user.authUserId === target) console.log("already linked — nothing to do");
    else {
      await p.user.update({ where: { id: user.id }, data: { authUserId: target } });
      console.log(`relinked ${user.email}: ${user.authUserId} -> ${target}`);
    }
    if (auths.length > 1) console.log(`note: ${auths.length} auth users share this email; linked the most recently signed-in one`);
  }

  // --drop-empty-orgs <email>: delete the user's EMPTY personal org(s) so the
  // org that holds the store is the only one they belong to. Then nothing —
  // no cookie, no switcher — can land them anywhere else. Only deletes orgs
  // with zero stores where this user is the sole member (cascade removes the
  // membership). Never touches the store's org.
  const dropIdx = process.argv.indexOf("--drop-empty-orgs");
  const dropEmail = dropIdx > -1 ? process.argv[dropIdx + 1] : null;
  if (dropEmail) {
    console.log(`\n## DROP empty personal orgs of ${dropEmail}`);
    const store = stores[0];
    const user = await p.user.findFirst({ where: { email: { equals: dropEmail, mode: "insensitive" } }, select: { id: true, email: true } });
    if (!user) throw new Error(`No User with email ${dropEmail}`);
    const candidates = await p.$queryRaw`
      SELECT o.id, o.name,
             (SELECT count(*) FROM "Store" s WHERE s."orgId" = o.id)::int AS stores,
             (SELECT count(*) FROM "Membership" m2 WHERE m2."orgId" = o.id)::int AS members
      FROM "Membership" m JOIN "Organization" o ON o.id = m."orgId"
      WHERE m."userId" = ${user.id}`;
    for (const c of candidates) {
      const isStoreOrg = store && c.id === store.orgId;
      if (isStoreOrg || c.stores > 0 || c.members > 1) {
        console.log(`keep  ${c.name} (${c.id}) — stores ${c.stores}, members ${c.members}${isStoreOrg ? ", holds the store" : ""}`);
        continue;
      }
      await p.organization.delete({ where: { id: c.id } });
      console.log(`DELETED empty org ${c.name} (${c.id})`);
    }
    const left = await p.membership.count({ where: { userId: user.id } });
    console.log(`${user.email} now belongs to ${left} org(s). Reload the app — no switching needed.`);
  }

  if (fixEmail) {
    console.log(`\n## FIX: make ${fixEmail} a(n) ${fixRole} of the org that holds ${shopDomain}`);
    const store = stores[0];
    const user = await p.user.findFirst({ where: { email: { equals: fixEmail, mode: "insensitive" } }, select: { id: true, email: true } });
    if (!store) throw new Error("No store row — nothing to attach to.");
    if (!user) throw new Error(`No User with email ${fixEmail} — they have not signed up yet (or used another address; see the list above).`);
    const existing = await p.membership.findFirst({ where: { userId: user.id, orgId: store.orgId } });
    if (existing) {
      console.log(`already a member (${existing.role}) — nothing to do`);
    } else {
      const m = await p.membership.create({ data: { userId: user.id, orgId: store.orgId, role: fixRole } });
      console.log(`created membership ${m.id}: ${user.email} → org ${store.org_name} (${store.orgId}) as ${fixRole}`);
    }
    // Consume a matching pending invitation so it doesn't linger.
    const removed = await p.invitation.deleteMany({ where: { orgId: store.orgId, email: { equals: fixEmail, mode: "insensitive" } } });
    if (removed.count) console.log(`removed ${removed.count} pending invitation(s) for ${fixEmail}`);
    console.log("Done. The user should reload — the org switcher in the top bar now lists this org; pick it.");
  }
} finally {
  await p.$disconnect();
}
