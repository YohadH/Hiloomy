import { google, type analyticsdata_v1beta } from "googleapis";
import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";

/**
 * Google Analytics 4 data source — mirrors the GSC layer (gsc-service.ts).
 *
 * Wires GA4 as a PlatformConnection (platform = "googleAnalytics", matching
 * the connector-registry slug). The OAuth refresh token is stored ENCRYPTED
 * in PlatformConnection.config; the founder-selected GA4 property id lives
 * beside it (config.propertyId), picked via listGa4Properties.
 *
 * Entry points:
 *   - getGa4OAuthUrl(storeId)            → consent URL (offline, refresh token)
 *   - handleGa4OAuthCallback(code, sid)  → persist encrypted refresh token
 *   - listGa4Properties(storeId)         → account summaries → property list
 *   - setGa4Property / getGa4SelectedProperty
 *   - syncGa4Data(storeId)               → last 90d of daily traffic by
 *     default channel group → upsert GaTrafficDaily
 *
 * OAuth scope: analytics.readonly. Uses the same GOOGLE_OAUTH_CLIENT_ID /
 * SECRET app as GSC — one Google Cloud project, two consents.
 */

export const GA4_PLATFORM = "googleAnalytics" as const;

type Ga4OAuthClient = InstanceType<typeof google.auth.OAuth2>;
type Ga4Credentials = Parameters<Ga4OAuthClient["setCredentials"]>[0];

const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const SYNC_WINDOW_DAYS = 90;

function getOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET not set");
  const appUrl = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/ga4/oauth/callback` };
}

function createOAuthClient(): Ga4OAuthClient {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGa4OAuthUrl(storeId: string): string {
  if (!storeId?.trim()) {
    throw new AppError("storeId is required to start the Google Analytics connection.", 400);
  }
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GA4_SCOPES,
    include_granted_scopes: true,
    state: Buffer.from(JSON.stringify({ storeId }), "utf8").toString("base64url")
  });
}

export function decodeGa4OAuthState(state: string | null | undefined): { storeId: string } | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      storeId?: unknown;
    };
    return typeof parsed.storeId === "string" && parsed.storeId.trim()
      ? { storeId: parsed.storeId }
      : null;
  } catch {
    return null;
  }
}

export async function handleGa4OAuthCallback(code: string, storeId: string): Promise<void> {
  const client = createOAuthClient();
  const cleanCode = code?.trim();
  if (!cleanCode) throw new AppError("Google did not return an authorization code.", 400);
  if (!storeId?.trim()) {
    throw new AppError("storeId is required to complete the Google Analytics connection.", 400);
  }

  const { tokens } = await client.getToken(cleanCode);
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new AppError(
      "Google did not return a refresh token. Disconnect the app in your Google account and reconnect.",
      502
    );
  }
  await persistConnection(storeId, refreshToken, tokens);
}

async function persistConnection(
  storeId: string,
  refreshToken: string,
  tokens: Ga4Credentials
): Promise<void> {
  const db = getDb();
  // Preserve a previously selected property across reconnects.
  const existing = (await db.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    select: { config: true }
  })) as { config: { propertyId?: unknown } | null } | null;
  const priorPropertyId =
    typeof existing?.config?.propertyId === "string" ? existing.config.propertyId : undefined;

  const config = {
    refreshTokenEnc: encryptSecret(refreshToken),
    scope: tokens.scope ?? GA4_SCOPES.join(" "),
    tokenType: tokens.token_type ?? "Bearer",
    connectedAt: new Date().toISOString(),
    ...(priorPropertyId ? { propertyId: priorPropertyId } : {})
  };

  await db.platformConnection.upsert({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    update: {
      status: "connected",
      config,
      healthMessage: null,
      tokenLastFour: refreshToken.slice(-4)
    },
    create: {
      storeId,
      platform: GA4_PLATFORM,
      status: "connected",
      config,
      tokenLastFour: refreshToken.slice(-4)
    }
  });
}

async function createAuthedClient(storeId: string): Promise<Ga4OAuthClient> {
  const db = getDb();
  const connection = (await db.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    select: { config: true }
  })) as { config: { refreshTokenEnc?: string } | null } | null;
  const refreshTokenEnc = connection?.config?.refreshTokenEnc;
  if (!refreshTokenEnc) {
    throw new AppError("Google Analytics is not connected for this store. Connect it first.", 409);
  }
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decryptSecret(refreshTokenEnc) });
  return client;
}

// ─── Property selection ─────────────────────────────────────────────────

export interface Ga4PropertyEntry {
  // "properties/123456789" — the id the Data API expects.
  property: string;
  displayName: string;
  accountName: string;
}

export async function listGa4Properties(storeId: string): Promise<Ga4PropertyEntry[]> {
  const auth = await createAuthedClient(storeId);
  const admin = google.analyticsadmin({ version: "v1beta", auth });
  const response = await admin.accountSummaries.list({ pageSize: 200 });
  const entries: Ga4PropertyEntry[] = [];
  for (const account of response.data.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      if (!prop.property) continue;
      entries.push({
        property: prop.property,
        displayName: prop.displayName ?? prop.property,
        accountName: account.displayName ?? account.account ?? ""
      });
    }
  }
  return entries;
}

export async function setGa4Property(storeId: string, property: string): Promise<void> {
  const clean = property?.trim();
  if (!clean) throw new AppError("property is required.", 400);
  const properties = await listGa4Properties(storeId);
  if (!properties.some((p) => p.property === clean)) {
    throw new AppError("That property is not accessible with the connected Google account.", 400);
  }
  const db = getDb();
  const connection = (await db.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    select: { config: true }
  })) as { config: Record<string, unknown> | null } | null;
  if (!connection) throw new AppError("Google Analytics is not connected for this store.", 409);
  await db.platformConnection.update({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    data: {
      config: { ...(connection.config ?? {}), propertyId: clean },
      healthMessage: null
    }
  });
}

export async function getGa4SelectedProperty(storeId: string): Promise<string | null> {
  const db = getDb();
  const connection = (await db.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    select: { config: true }
  })) as { config: { propertyId?: unknown } | null } | null;
  const propertyId = connection?.config?.propertyId;
  return typeof propertyId === "string" && propertyId.trim() ? propertyId.trim() : null;
}

// ─── Sync ───────────────────────────────────────────────────────────────

export async function syncGa4Data(
  storeId: string
): Promise<{ rowsUpserted: number; days: number }> {
  const property = await getGa4SelectedProperty(storeId);
  if (!property) {
    throw new AppError(
      "No GA4 property selected. Pick one in Settings → Google Analytics.",
      409
    );
  }

  const auth = await createAuthedClient(storeId);
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  const end = new Date();
  const start = new Date(end.getTime() - SYNC_WINDOW_DAYS * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const requestBody: analyticsdata_v1beta.Schema$RunReportRequest = {
    dateRanges: [{ startDate: iso(start), endDate: iso(end) }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "conversions" },
      { name: "purchaseRevenue" }
    ],
    limit: "100000"
  };
  const response = await analyticsData.properties.runReport({ property, requestBody });

  const db = getDb() as any;
  let rowsUpserted = 0;
  const daysSeen = new Set<string>();

  for (const row of response.data.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    // GA4 date dimension is YYYYMMDD.
    const rawDate = dims[0]?.value ?? "";
    if (!/^\d{8}$/.test(rawDate)) continue;
    const dateIso = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const channel = (dims[1]?.value ?? "Unassigned").slice(0, 120);
    const num = (i: number) => {
      const n = Number(mets[i]?.value ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    daysSeen.add(dateIso);
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    await db.gaTrafficDaily.upsert({
      where: { storeId_date_channel: { storeId, date, channel } },
      update: {
        sessions: Math.round(num(0)),
        totalUsers: Math.round(num(1)),
        newUsers: Math.round(num(2)),
        conversions: num(3),
        revenue: num(4)
      },
      create: {
        storeId,
        date,
        channel,
        sessions: Math.round(num(0)),
        totalUsers: Math.round(num(1)),
        newUsers: Math.round(num(2)),
        conversions: num(3),
        revenue: num(4)
      }
    });
    rowsUpserted += 1;
  }

  await db.platformConnection.update({
    where: { storeId_platform: { storeId, platform: GA4_PLATFORM } },
    data: { lastSyncAt: new Date(), healthMessage: null }
  }).catch(() => undefined);

  return { rowsUpserted, days: daysSeen.size };
}
