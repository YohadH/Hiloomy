# Connecting Shopify to the Deployed App

Two paths depending on whether you want to keep your existing connection
or start fresh on production.

---

## Background — why this matters

Your local Postgres has a `ShopifyConnection` row with an admin API
access token, **encrypted** with `SHOPIFY_CREDENTIALS_ENCRYPTION_KEY` from
your local `.env`. When you migrated data to Supabase, that encrypted row
came along — but the token is unreadable in production unless the same
encryption key is set on Render.

---

## Path 1 — Reuse the existing token (5 minutes, recommended)

Copy your local encryption key into Render. The migrated `ShopifyConnection`
row decrypts cleanly on first cron tick, and Shopify sync starts
automatically.

### Step 1 — Copy the key

Your current key (from local `.env`):

```
SHOPIFY_CREDENTIALS_ENCRYPTION_KEY="<the value already in your .env>"
```

(I won't paste your real value in this file — open `.env` and copy it.)

### Step 2 — Set it on Render

1. Render dashboard → your service → **Environment** tab
2. Add a new env var:
   - Key: `SHOPIFY_CREDENTIALS_ENCRYPTION_KEY`
   - Value: the value you just copied from `.env`
3. Save. Render redeploys automatically (~2 min).

### Step 3 — Verify

After redeploy:

1. Open the deployed app → **Settings** → Shopify section
   You should see the connection listed with `myshopify.com` domain.
2. Trigger a manual sync:
   ```bash
   curl -X POST https://your-render-url.onrender.com/api/cron/refresh-all
   ```
   Response should show `{ ok: true, stores: 1, summary: { allOk: 1, withFailures: 0 } }`.
3. Within 2 hours, the unified data-refresh cron picks up automatically.

---

## Path 2 — Fresh token on production (slower, cleaner separation)

Generate a new admin API access token from Shopify Admin and save it via
the deployed app's Settings page. The local key stays local; production
gets its own.

### Step 1 — Create a custom Shopify app (if you don't have one)

1. **Shopify Admin** → Settings → Apps and sales channels → Develop apps
2. **Create an app** → name it (e.g. "Analytics SaaS")
3. Click **Configure Admin API scopes** → grant at minimum:
   - `read_products`
   - `read_orders`
   - `read_customers`
   - `read_inventory`
   - `read_customer_journey` ← needed for UTM/referrer attribution
4. **Install app** → confirm install
5. **API credentials** tab → reveal the **Admin API access token**
   (the long string starting with `shpat_…`)
6. Copy the token. **You can only reveal it once** — copy now.

### Step 2 — Generate a new encryption key for production

```powershell
# Run this in PowerShell to generate a fresh 256-bit key
[Convert]::ToBase64String([byte[]]@(0..47 | ForEach-Object { Get-Random -Min 0 -Max 256 }))
```

Or just let Render auto-generate one — `render.yaml` already does this:

```yaml
- key: SHOPIFY_CREDENTIALS_ENCRYPTION_KEY
  generateValue: true
```

You'll see the generated value in Render → Environment after first deploy.

### Step 3 — Save the token via deployed Settings page

1. Open the deployed app → **Settings**
2. Find the Shopify connection card → enter:
   - **Shop domain**: `incenseparfums.myshopify.com` (or whatever you have)
   - **Admin API access token**: the `shpat_…` value
3. Click **Save**. The app encrypts the token with the production key and
   stores it in `ShopifyConnection`.

### Step 4 — Trigger first sync

```bash
curl -X POST https://your-render-url.onrender.com/api/cron/refresh-all
```

After ~30 seconds you'll see new `SyncRun` rows in Supabase and the
Command Center starts populating with fresh data.

---

## Sync timing

Once connected, the **unified data-refresh cron** runs automatically every
2 hours (default — configurable via `DATA_REFRESH_CRON_MS`). Per tick it
fans out to all connected sources for every store:

- Shopify (orders / products / customers / refunds)
- Meta Ads (if `MetaAdsConnection` exists)
- Instagram (if `InstagramConnection` exists)
- BixGrow (placeholder; CSV upload preferred)

Per-source failures are isolated — if Meta fails, Shopify still completes
for the same store. Per-store failures are isolated — store A's error
doesn't block store B's sync.

You can also fire it manually any time:

```bash
# Force a refresh tick now
curl -X POST https://your-render-url.onrender.com/api/cron/refresh-all
```

The response tells you per-store, per-source results.

---

## Troubleshooting

### "Decryption failed" in logs

The token was encrypted with a different key than what Render has now.
Either restore the original key (Path 1) or re-save the token via Settings
(Path 2).

### Sync runs but no new orders appear

Check the `SyncRun` table on Supabase — the `errorMessage` column tells
you what went wrong. Common causes:

- Token expired or scopes missing — regenerate the custom app token with
  the scope list above
- `read_customer_journey` not granted — partial sync but no UTM data;
  upgrade scope and re-sync
- Network timeout to Shopify — usually transient; next tick retries

### Cron not firing in production

Check Render logs for `[data-refresh-cron] scheduled multi-source refresh
every 120 min`. If you see `DISABLED` instead, set
`ENABLE_DATA_REFRESH_CRON=1` in Render env (it should auto-enable in
production via `NODE_ENV=production`, but you can force it explicitly).
