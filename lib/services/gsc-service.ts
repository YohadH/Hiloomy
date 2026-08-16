import { google, type searchconsole_v1 } from "googleapis";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";

/**
 * Google Search Console (GSC) data source — DATA-01 scaffolding.
 *
 * Wires GSC as a generic PlatformConnection (platform = "googleSearchConsole").
 * The OAuth refresh token is stored ENCRYPTED in PlatformConnection.config so
 * we can mint short-lived access tokens for background sync without a session.
 *
 * Three entry points:
 *   - getGscOAuthUrl(storeId)           → consent URL (offline access, refresh token)
 *   - handleGscOAuthCallback(code, ...)  → exchange code, persist encrypted refresh token
 *   - syncGscData(storeId, siteUrl)      → pull last 90d of Search Analytics, upsert rows
 *
 * OAuth scope: webmasters.readonly (read Search Analytics; no write).
 * Uses the official `googleapis` SDK types throughout (no `any`).
 *
 * NOTE: storefront keyword/page matching against synced data is a SEPARATE
 * shopify-dev phase. This file is the data-source layer only.
 */

export const GSC_PLATFORM = "googleSearchConsole" as const;

// Derive the auth client + token types from the SAME googleapis graph the
// searchconsole client consumes. Importing OAuth2Client/Credentials directly
// from `google-auth-library` resolves to a DIFFERENT copy than the one
// `googleapis-common` bundles, and TS rejects the cross-package assignment
// (private `redirectUri` mismatch). Aliasing off `google.auth.OAuth2` avoids it.
type GscOAuthClient = InstanceType<typeof google.auth.OAuth2>;
// `setCredentials` takes a Credentials object — borrow its parameter type so we
// don't import Credentials from the (duplicated) google-auth-library package.
type GscCredentials = Parameters<GscOAuthClient["setCredentials"]>[0];

// Read-only Search Analytics access. Offline access (refresh token) is what
// lets the background sync run without a logged-in user.
const GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

// How far back to pull on a sync. GSC retains ~16 months; 90d is the MVP window.
const SYNC_WINDOW_DAYS = 90;

// Search Analytics page size. API max is 25,000; we page until a short page.
const ROW_LIMIT = 25000;

interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Resolve the Google OAuth app credentials from env. Throws a clear error if
 * either secret is missing so callers/routes fail loudly rather than building
 * a broken consent URL.
 */
function getGscOAuthConfig(): GscOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  }
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");
  }
  const appUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/gsc/oauth/callback`
  };
}

/** Build a configured OAuth2 client for the GSC app. */
function createOAuthClient(): GscOAuthClient {
  const { clientId, clientSecret, redirectUri } = getGscOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Build the Google OAuth consent URL for a given store.
 *
 * `state` carries the storeId so the callback knows which store to attach the
 * connection to. `access_type=offline` + `prompt=consent` ensures Google
 * returns a refresh token (without prompt, Google omits it on re-auth).
 */
export function getGscOAuthUrl(storeId: string): string {
  if (!storeId?.trim()) {
    throw new AppError("storeId is required to start the Google Search Console connection.", 400);
  }
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GSC_SCOPES,
    include_granted_scopes: true,
    state: encodeState(storeId)
  });
}

/**
 * Handle the OAuth callback: exchange the authorization code for tokens and
 * persist the (encrypted) refresh token on the store's PlatformConnection.
 *
 * The refresh token is the durable credential; the access token is short-lived
 * and re-minted on each sync, so we only persist the refresh token.
 */
export async function handleGscOAuthCallback(code: string, storeId: string): Promise<void> {
  // getGscOAuthConfig() throws "GOOGLE_OAUTH_CLIENT_ID not set" etc. before we
  // ever talk to Google.
  const client = createOAuthClient();

  const cleanCode = code?.trim();
  if (!cleanCode) {
    throw new AppError("Google did not return an authorization code.", 400);
  }
  if (!storeId?.trim()) {
    throw new AppError("storeId is required to complete the Google Search Console connection.", 400);
  }

  const { tokens } = await client.getToken(cleanCode);
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    // No refresh token means we cannot sync in the background. This happens
    // when the user previously granted access and Google withheld a new one;
    // prompt=consent in getGscOAuthUrl is meant to prevent it.
    throw new AppError(
      "Google did not return a refresh token. Disconnect the app in your Google account and reconnect.",
      502
    );
  }

  await persistGscConnection(storeId, refreshToken, tokens);
}

/**
 * Pull the last 90 days of Search Analytics data for a verified GSC property
 * (`siteUrl`, e.g. "sc-domain:example.com" or "https://example.com/") and
 * upsert it into SearchConsoleMetric / SearchConsolePage / SearchConsoleQuery.
 *
 * Strategy: query grouped by [date, page, query] for the per-row metrics, then
 * derive page and query rollups from the same rows in one pass. Pagination uses
 * startRow/rowLimit until a short page signals the end.
 */
export async function syncGscData(
  storeId: string,
  siteUrl: string
): Promise<{ pagesUpserted: number; queriesUpserted: number }> {
  if (!storeId?.trim()) {
    throw new AppError("storeId is required to sync Google Search Console data.", 400);
  }
  if (!siteUrl?.trim()) {
    throw new AppError("A verified Search Console siteUrl is required to sync.", 400);
  }

  const searchConsole = await createSearchConsoleClient(storeId);
  const { startDate, endDate } = getSyncDateRange();

  // Accumulators for the rollups, keyed by url / query.
  const pageRollup = new Map<string, { impressions: number; clicks: number; positionWeighted: number }>();
  const queryRollup = new Map<string, { impressions: number; clicks: number; positionWeighted: number }>();
  const metricRows: Array<{
    date: Date;
    url: string;
    query: string | null;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  }> = [];

  let startRow = 0;
  // Hard page cap so a runaway property can't loop forever (25k * 40 = 1M rows).
  const MAX_PAGES = 40;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const requestBody: searchconsole_v1.Schema$SearchAnalyticsQueryRequest = {
      startDate,
      endDate,
      dimensions: ["date", "page", "query"],
      rowLimit: ROW_LIMIT,
      startRow
    };

    const response = await searchConsole.searchanalytics.query({
      siteUrl,
      requestBody
    });

    const rows: searchconsole_v1.Schema$ApiDataRow[] = response.data.rows ?? [];
    for (const row of rows) {
      const keys = row.keys ?? [];
      const dateKey = keys[0];
      const url = keys[1];
      const query = keys[2] ?? null;
      if (!dateKey || !url) continue;

      const impressions = Math.round(row.impressions ?? 0);
      const clicks = Math.round(row.clicks ?? 0);
      const ctr = row.ctr ?? 0;
      const position = row.position ?? 0;

      metricRows.push({
        date: new Date(`${dateKey}T00:00:00.000Z`),
        url,
        query,
        impressions,
        clicks,
        ctr,
        position
      });

      accumulate(pageRollup, url, impressions, clicks, position);
      if (query) {
        accumulate(queryRollup, query, impressions, clicks, position);
      }
    }

    // A page shorter than the limit means we've reached the end.
    if (rows.length < ROW_LIMIT) break;
    startRow += rows.length;
  }

  await persistSyncResults(storeId, metricRows, pageRollup, queryRollup);

  return { pagesUpserted: pageRollup.size, queriesUpserted: queryRollup.size };
}

// ─── internals ────────────────────────────────────────────────────────

function accumulate(
  map: Map<string, { impressions: number; clicks: number; positionWeighted: number }>,
  key: string,
  impressions: number,
  clicks: number,
  position: number
): void {
  const existing = map.get(key) ?? { impressions: 0, clicks: 0, positionWeighted: 0 };
  existing.impressions += impressions;
  existing.clicks += clicks;
  // Impression-weighted position so the rollup average reflects high-traffic
  // pages/queries more than long-tail ones.
  existing.positionWeighted += position * impressions;
  map.set(key, existing);
}

/** YYYY-MM-DD range: [today-90d, today-2d]. GSC data lags ~2 days. */
function getSyncDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - SYNC_WINDOW_DAYS);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** state = base64url(JSON({ storeId })). Opaque round-trip value for the callback. */
function encodeState(storeId: string): string {
  return Buffer.from(JSON.stringify({ storeId }), "utf8").toString("base64url");
}

/** Decode the OAuth `state` param back into a storeId (used by the callback route). */
export function decodeGscOAuthState(state: string | null | undefined): { storeId: string } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { storeId?: unknown };
    if (typeof parsed.storeId === "string" && parsed.storeId.trim()) {
      return { storeId: parsed.storeId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Upsert the PlatformConnection row carrying the encrypted refresh token. */
async function persistGscConnection(storeId: string, refreshToken: string, tokens: GscCredentials): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate the Prisma client and try again.", 500);
  }

  const config = {
    refreshTokenEnc: encryptSecret(refreshToken),
    scope: tokens.scope ?? GSC_SCOPES.join(" "),
    tokenType: tokens.token_type ?? "Bearer",
    connectedAt: new Date().toISOString()
  };

  await db.platformConnection.upsert({
    where: { storeId_platform: { storeId, platform: GSC_PLATFORM } },
    update: {
      status: "connected",
      config,
      healthMessage: null,
      tokenLastFour: refreshToken.slice(-4)
    },
    create: {
      storeId,
      platform: GSC_PLATFORM,
      status: "connected",
      config,
      tokenLastFour: refreshToken.slice(-4)
    }
  });
}

/**
 * Build a Search Console API client authenticated as the store's connection.
 * Reads + decrypts the refresh token from PlatformConnection.config and lets
 * the OAuth2 client mint a fresh access token on demand.
 */
async function createSearchConsoleClient(storeId: string): Promise<searchconsole_v1.Searchconsole> {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate the Prisma client and try again.", 500);
  }

  const connection = (await db.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GSC_PLATFORM } },
    select: { config: true }
  })) as { config: { refreshTokenEnc?: string } | null } | null;

  const refreshTokenEnc = connection?.config?.refreshTokenEnc;
  if (!refreshTokenEnc) {
    throw new AppError("Google Search Console is not connected for this store. Connect it first.", 409);
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decryptSecret(refreshTokenEnc) });

  return google.searchconsole({ version: "v1", auth: client });
}

/**
 * Persist a sync pass: replace this store's raw metric rows for the synced
 * window, then upsert the page + query rollups. The metric upsert keys on the
 * (storeId, date, url, query) unique constraint so re-running a sync is
 * idempotent (no duplicate rows).
 */
async function persistSyncResults(
  storeId: string,
  metricRows: Array<{
    date: Date;
    url: string;
    query: string | null;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  }>,
  pageRollup: Map<string, { impressions: number; clicks: number; positionWeighted: number }>,
  queryRollup: Map<string, { impressions: number; clicks: number; positionWeighted: number }>
): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new AppError("Database client is not available. Generate the Prisma client and try again.", 500);
  }

  const now = new Date();

  // Raw metric rows — idempotent upsert on the composite unique key. Done
  // sequentially to keep the connection pool small (MVP scale); batch later if
  // a property returns tens of thousands of rows per sync.
  for (const row of metricRows) {
    await db.searchConsoleMetric.upsert({
      where: {
        storeId_date_url_query: {
          storeId,
          date: row.date,
          url: row.url,
          query: row.query
        }
      },
      update: {
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        position: row.position
      },
      create: {
        storeId,
        date: row.date,
        url: row.url,
        query: row.query,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        position: row.position
      }
    });
  }

  for (const [url, agg] of pageRollup) {
    const avgPosition = agg.impressions > 0 ? agg.positionWeighted / agg.impressions : 0;
    await db.searchConsolePage.upsert({
      where: { storeId_url: { storeId, url } },
      update: {
        totalImpressions: agg.impressions,
        totalClicks: agg.clicks,
        avgPosition,
        lastSyncAt: now
      },
      create: {
        storeId,
        url,
        totalImpressions: agg.impressions,
        totalClicks: agg.clicks,
        avgPosition,
        lastSyncAt: now
      }
    });
  }

  for (const [query, agg] of queryRollup) {
    const avgPosition = agg.impressions > 0 ? agg.positionWeighted / agg.impressions : 0;
    await db.searchConsoleQuery.upsert({
      where: { storeId_query: { storeId, query } },
      update: {
        totalImpressions: agg.impressions,
        totalClicks: agg.clicks,
        avgPosition,
        lastSyncAt: now
      },
      create: {
        storeId,
        query,
        totalImpressions: agg.impressions,
        totalClicks: agg.clicks,
        avgPosition,
        lastSyncAt: now
      }
    });
  }
}
