# Supabase Schema

Self-contained SQL to provision the entire database on a new Supabase
project. Generated from [../schema.prisma](../schema.prisma) via:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/supabase/init.sql
```

## What's inside [init.sql](init.sql)

- **42 tables** — Store, Order, OrderLineItem, Product, ProductVariant,
  Customer, Refund, MetaAdsCampaignInsight, AffiliateMember,
  AffiliateAttribution, Alert, WeeklyReport, CreativeProject, etc.
- **111 indexes** — including the multi-tenant scoping indexes like
  `Order_storeId_createdAt_idx`, `Alert_storeId_status_severity_idx`,
  etc.
- **66 foreign key constraints** — all with `ON DELETE CASCADE` from
  `Store` so deleting a tenant cleanly removes their data.
- **CREATE SCHEMA IF NOT EXISTS "public"** — safe to run on a fresh
  Supabase project where `public` already exists.

## How to apply

### Option A — Supabase SQL Editor (recommended for first-time apply)

1. Open your Supabase project → **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `init.sql` in your editor, copy the entire contents (~1,368 lines).
4. Paste into the Supabase SQL editor.
5. Click **Run**.
6. Wait ~5-10 seconds. You should see "Success. No rows returned."
7. Verify in **Table Editor** — you should see all 42 tables under `public`.

### Option B — `psql` from the command line

```bash
# Use the DIRECT connection (port 5432), not pooled
psql "postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" \
  -f prisma/supabase/init.sql
```

### Option C — Prisma (only if you have direct DB credentials in .env)

```bash
# DIRECT_URL must be set to Supabase's :5432 endpoint for this to work
# (PgBouncer can't run prepared statements which Prisma migrations need)
DIRECT_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" \
DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" \
npx prisma db push
```

## Safety notes

- **Idempotency: NO.** Re-running `init.sql` on a database that already
  has these tables will fail with "relation already exists" errors. This
  is intentional — protects against accidentally wiping a populated
  schema. To re-apply cleanly, DROP and re-create the database first.

- **The local app is NOT writing to Supabase.** Your local `.env` points
  `DATABASE_URL` at `localhost:5432`. Supabase URLs only appear in:
  - `.env.example` (template, not loaded)
  - `DEPLOYMENT.md` (docs)
  - Render's environment variables (production runtime only)

- **Future schema changes:** when you edit `schema.prisma`, regenerate
  this file by re-running the `prisma migrate diff` command at the top
  and apply the **diff** to production (not the full init). The Prisma
  team's official guide:
  https://www.prisma.io/docs/orm/prisma-migrate/workflows/native-database-types

## When to regenerate

Whenever any of these happen, rerun the diff command and re-apply (or
write a manual ALTER script):

- New model added to `schema.prisma`
- New `@@unique` or `@@index` added
- Column rename / removal
- Foreign key changes

For one-off ALTER scripts (less risky than a full re-apply), use:

```bash
npx prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

That diffs your **running production schema** against the desired Prisma
state and emits only the deltas.
