// Read-only: where does a person stand in auth + app tables? Usage:
//   node scripts/_tmp-find-user.mjs shlomo
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
// Local .env points DATABASE_URL at localhost; build the Supabase pooler URL
// from SUPABASE_URL (project ref) + SUPABASE_DB_PASSWORD. Never printed.
const CR = String.fromCharCode(13);
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .map((l) => l.replace(CR, ""))
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
);
const ref = process.env.SUPABASE_PROJECT_REF ?? (env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const shellUrl = process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? process.env.DATABASE_URL : null;
const url = process.env.PROD_DB_URL ?? shellUrl ?? (ref && env.SUPABASE_DB_PASSWORD ? `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require` : null);
if (!url) { console.error("no production DB URL available"); process.exit(1); }
console.log(`db: project ${ref} via pooler`);
const needle = `%${(process.argv[2] ?? "").toLowerCase()}%`;
if (needle === "%%") { console.error("give a name/email fragment"); process.exit(1); }
const p = new PrismaClient({ log: [], datasources: { db: { url } } });
const row = (r) => console.log(JSON.stringify(r, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
try {
  console.log("## auth.users");
  (await p.$queryRaw`
    SELECT id::text AS auth_id, email, created_at, last_sign_in_at, email_confirmed_at IS NOT NULL AS confirmed,
           raw_app_meta_data->>'provider' AS provider, raw_user_meta_data->>'display_name' AS display_name,
           raw_user_meta_data->>'full_name' AS full_name, encrypted_password IS NOT NULL AND encrypted_password <> '' AS has_password
    FROM auth.users
    WHERE lower(email) LIKE ${needle} OR lower(coalesce(raw_user_meta_data::text, '')) LIKE ${needle}
    ORDER BY created_at DESC`).forEach(row);
  console.log("## User rows");
  (await p.$queryRaw`
    SELECT u.id, u.email, u."displayName", u."authUserId", u."createdAt", u."lastSignInAt",
           (SELECT count(*) FROM "Membership" m WHERE m."userId" = u.id)::int AS memberships
    FROM "User" u WHERE lower(u.email) LIKE ${needle} OR lower(coalesce(u."displayName", '')) LIKE ${needle}`).forEach(row);
  console.log("## Memberships");
  (await p.$queryRaw`
    SELECT u.email, m.role, o.id AS org_id, o.name AS org_name,
           (SELECT string_agg(s.domain, ', ') FROM "Store" s WHERE s."orgId" = o.id) AS stores
    FROM "Membership" m JOIN "User" u ON u.id = m."userId" JOIN "Organization" o ON o.id = m."orgId"
    WHERE lower(u.email) LIKE ${needle} OR lower(coalesce(u."displayName", '')) LIKE ${needle}`).forEach(row);
  console.log("## Invitations");
  (await p.$queryRaw`
    SELECT i.email, i.role, i."expiresAt", i."createdAt", o.name AS org_name, ib.email AS invited_by
    FROM "Invitation" i JOIN "Organization" o ON o.id = i."orgId" JOIN "User" ib ON ib.id = i."invitedById"
    WHERE lower(i.email) LIKE ${needle} ORDER BY i."createdAt" DESC`).forEach(row);
  console.log("## StoreOnboarding invitedEmail");
  (await p.$queryRaw`SELECT "shopDomain", status, "invitedEmail", "targetOrgId" FROM "StoreOnboarding" WHERE lower(coalesce("invitedEmail", '')) LIKE ${needle}`).forEach(row);
  console.log("## Orgs + stores (for reference)");
  (await p.$queryRaw`
    SELECT o.id, o.name, (SELECT string_agg(s.domain, ', ') FROM "Store" s WHERE s."orgId" = o.id) AS stores,
           (SELECT count(*) FROM "Membership" m WHERE m."orgId" = o.id)::int AS members
    FROM "Organization" o ORDER BY o."createdAt"`).forEach(row);
} finally {
  await p.$disconnect();
}
