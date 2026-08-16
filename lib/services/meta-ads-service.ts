import { createHmac } from "crypto";
import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { getGrowthAgentStoreContext, saveGrowthPlatformConnection } from "@/lib/services/growth-agent-service";
import type { MarketingPlannerMetaAds, MarketingPlannerMetaAdsCampaign, MarketingPlannerStoreScope } from "@/lib/domain/marketing-planner-types";

const META_GRAPH_VERSION = "v25.0";
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const DEFAULT_DATE_PRESET = "last_30d";
const CAMPAIGN_INSIGHTS_FIELDS = [
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "purchase_roas"
].join(",");
const AD_INSIGHTS_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "purchase_roas"
].join(",");

type MetaAction = {
  action_type?: string;
  value?: string;
};

type MetaAdAccountPayload = {
  id?: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
};

type MetaInsightPayload = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  purchase_roas?: MetaAction[];
  date_start?: string;
  date_stop?: string;
};

type MetaCreativePayload = {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  thumbnail_url?: string;
  object_url?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  instagram_permalink_url?: string;
};

type MetaAdPayload = {
  id?: string;
  name?: string;
  creative?: MetaCreativePayload;
};

type MetaDebugTokenPayload = {
  data?: {
    app_id?: string;
    type?: string;
    application?: string;
    expires_at?: number;
    is_valid?: boolean;
    issued_at?: number;
    scopes?: string[];
    user_id?: string;
    granular_scopes?: unknown[];
  };
};

type MetaLongLivedTokenPayload = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

export interface SaveMetaAdsConnectionInput {
  storeId?: string | null;
  accessToken: string;
  adAccountId: string;
  appId?: string | null;
  appSecret?: string | null;
  exchangeToken?: boolean | null;
}

export interface SyncMetaAdsInput {
  storeId?: string | null;
  datePreset?: string | null;
}

export interface RefreshMetaAdsTokenInput {
  storeId?: string | null;
  accessToken?: string | null;
  appId?: string | null;
  appSecret?: string | null;
}

function normalizeAdAccountId(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new AppError("Meta ad account id is required.", 400);

  const numeric = raw.replace(/^act_/i, "").replace(/\D+/g, "");
  if (!numeric) throw new AppError("Meta ad account id must look like act_123456789.", 400);
  return `act_${numeric}`;
}

function tokenLastFour(value: string) {
  return value.slice(-4);
}

function cleanAppCredential(value?: string | null) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseMetaDate(value?: string | null) {
  const date = new Date(`${value ?? ""}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function getActionValue(actions: MetaAction[] | undefined, candidates: string[]) {
  if (!Array.isArray(actions)) return 0;
  for (const candidate of candidates) {
    const match = actions.find((action) => action.action_type === candidate);
    if (match) return toNumber(match.value);
  }

  return 0;
}

function getRoasValue(rows: MetaAction[] | undefined) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const preferred = rows.find((row) => row.action_type === "omni_purchase") ?? rows[0];
  const value = toNumber(preferred.value);
  return Number.isFinite(value) ? value : null;
}

function buildAppSecretProof(accessToken: string, appSecret?: string | null) {
  const secret = cleanAppCredential(appSecret);
  if (!accessToken || !secret) return null;
  return createHmac("sha256", secret).update(accessToken).digest("hex");
}

async function fetchMetaGraph<T>(
  pathOrUrl: string,
  accessToken: string,
  params?: Record<string, string | number | null | undefined>,
  options?: { appSecret?: string | null }
): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`${META_GRAPH_BASE_URL}/${pathOrUrl.replace(/^\/+/, "")}`);

  if (accessToken && !url.searchParams.has("access_token")) {
    url.searchParams.set("access_token", accessToken);
  }
  const proof = buildAppSecretProof(accessToken, options?.appSecret);
  if (proof && !url.searchParams.has("appsecret_proof")) {
    url.searchParams.set("appsecret_proof", proof);
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.error) {
    const message = payload?.error?.message ?? `Meta Graph request failed with status ${response.status}.`;
    throw new AppError(message, response.status || 502, payload);
  }

  return payload as T;
}

function expiresAtFromSeconds(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

function epochToDate(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function appAccessToken(appId: string, appSecret: string) {
  return `${appId}|${appSecret}`;
}

async function debugMetaToken(accessToken: string, appId?: string | null, appSecret?: string | null) {
  const resolvedAppId = cleanAppCredential(appId);
  const resolvedAppSecret = cleanAppCredential(appSecret);
  if (!resolvedAppId || !resolvedAppSecret) return null;

  const payload = await fetchMetaGraph<MetaDebugTokenPayload>("debug_token", appAccessToken(resolvedAppId, resolvedAppSecret), {
    input_token: accessToken
  });
  const data = payload.data ?? {};

  return {
    appId: data.app_id ?? null,
    tokenType: data.type ?? null,
    isValid: data.is_valid ?? null,
    issuedAt: epochToDate(data.issued_at),
    expiresAt: epochToDate(data.expires_at),
    scopes: Array.isArray(data.scopes) ? data.scopes : []
  };
}

async function exchangeLongLivedUserToken(accessToken: string, appId: string, appSecret: string) {
  const payload = await fetchMetaGraph<MetaLongLivedTokenPayload>("oauth/access_token", "", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: accessToken
  });
  const nextToken = String(payload.access_token ?? "").trim();
  if (!nextToken) throw new AppError("Meta did not return a refreshed access token.", 502, payload);

  return {
    accessToken: nextToken,
    tokenType: payload.token_type ?? "bearer",
    expiresAt: expiresAtFromSeconds(payload.expires_in)
  };
}

function summarizeTokenHealth(expiresAt?: Date | string | null) {
  if (!expiresAt) return { status: "unknown", label: "Expiry unknown" };
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return { status: "unknown", label: "Expiry unknown" };

  const diffMs = date.getTime() - Date.now();
  const days = Math.ceil(diffMs / 86400000);
  if (diffMs <= 0) return { status: "expired", label: "Expired" };
  if (days <= 7) return { status: "expires_soon", label: `Expires in ${days} day${days === 1 ? "" : "s"}` };
  if (days <= 14) return { status: "watch", label: `Expires in ${days} days` };
  return { status: "healthy", label: `Expires in ${days} days` };
}

function resolveConnectionAppCredentials(connection: any, input?: { appId?: string | null; appSecret?: string | null }) {
  const appId = cleanAppCredential(input?.appId)
    || cleanAppCredential(connection?.appId)
    || cleanAppCredential(process.env.META_ADS_CLIENT_ID);
  const appSecret = cleanAppCredential(input?.appSecret)
    || (connection?.appSecretEnc ? decryptSecret(connection.appSecretEnc) : "")
    || cleanAppCredential(process.env.META_ADS_CLIENT_SECRET);

  return { appId, appSecret };
}

async function fetchMetaAdAccount(accessToken: string, adAccountId: string, appSecret?: string | null) {
  return fetchMetaGraph<MetaAdAccountPayload>(adAccountId, accessToken, {
    fields: "id,account_id,name,account_status,currency,timezone_name"
  }, { appSecret });
}

function adAccountNumericId(adAccountId: string) {
  return normalizeAdAccountId(adAccountId).replace(/^act_/, "");
}

function buildAdsManagerAdUrl(adAccountId: string, adId?: string | null) {
  if (!adId) return null;
  const accountId = adAccountNumericId(adAccountId);
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${encodeURIComponent(adId)}`;
}

async function fetchAllInsights(
  accessToken: string,
  adAccountId: string,
  datePreset: string,
  level: "campaign" | "ad",
  appSecret?: string | null
) {
  const rows: MetaInsightPayload[] = [];
  let nextUrl: string | null = null;
  const fields = level === "ad" ? AD_INSIGHTS_FIELDS : CAMPAIGN_INSIGHTS_FIELDS;

  do {
    const payload: { data?: MetaInsightPayload[]; paging?: { next?: string } } = nextUrl
      ? await fetchMetaGraph<{ data?: MetaInsightPayload[]; paging?: { next?: string } }>(nextUrl, accessToken, undefined, { appSecret })
      : await fetchMetaGraph<{ data?: MetaInsightPayload[]; paging?: { next?: string } }>(`${adAccountId}/insights`, accessToken, {
          level,
          date_preset: datePreset,
          time_increment: 1,
          fields,
          limit: 100
        }, { appSecret });

    rows.push(...(Array.isArray(payload.data) ? payload.data : []));
    nextUrl = payload.paging?.next ?? null;
  } while (nextUrl);

  return rows;
}

async function fetchCreativeByAdId(accessToken: string, adId: string, appSecret?: string | null): Promise<MetaCreativePayload | null> {
  try {
    const payload = await fetchMetaGraph<MetaAdPayload>(adId, accessToken, {
      fields: "id,name,creative{id,name,title,body,thumbnail_url,object_url,object_story_id,effective_object_story_id,instagram_permalink_url}"
    }, { appSecret });
    return payload.creative ?? null;
  } catch {
    return null;
  }
}

async function fetchCreativesForAds(accessToken: string, adIds: string[], appSecret?: string | null) {
  const uniqueAdIds = Array.from(new Set(adIds.filter(Boolean))).slice(0, 100);
  const creativeByAdId = new Map<string, MetaCreativePayload | null>();

  for (const adId of uniqueAdIds) {
    creativeByAdId.set(adId, await fetchCreativeByAdId(accessToken, adId, appSecret));
  }

  return creativeByAdId;
}

function metaConnectionSummary(storeId: string, connection: any, latestRun?: any | null) {
  // System User tokens never expire — `tokenExpiresAt` stays null after
  // save because Meta's debug_token doesn't return an expiry for them.
  // Show "Never expires" instead of the generic "Expiry unknown" so the
  // merchant sees that their permanent token is working as intended.
  const tokenHealth =
    !connection.tokenExpiresAt && connection.tokenType === "SYSTEM_USER"
      ? { status: "healthy" as const, label: "Never expires" }
      : summarizeTokenHealth(connection.tokenExpiresAt ?? null);

  return {
    storeId,
    adAccountId: connection.adAccountId,
    adAccountName: connection.adAccountName,
    accountStatus: connection.accountStatus,
    currency: connection.currency,
    timezoneName: connection.timezoneName,
    appId: connection.appId || cleanAppCredential(process.env.META_ADS_CLIENT_ID) || null,
    hasAppSecret: Boolean(connection.appSecretEnc || process.env.META_ADS_CLIENT_SECRET),
    tokenLastFour: connection.tokenLastFour,
    tokenType: connection.tokenType ?? null,
    tokenIssuedAt: connection.tokenIssuedAt?.toISOString() ?? null,
    tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
    tokenScopes: Array.isArray(connection.tokenScopes) ? connection.tokenScopes : [],
    tokenHealth,
    syncStatus: connection.syncStatus,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSyncError: connection.lastSyncError,
    latestRun: latestRun
      ? {
          ...latestRun,
          startedAt: latestRun.startedAt.toISOString(),
          completedAt: latestRun.completedAt?.toISOString() ?? null
        }
      : null
  };
}

export async function saveMetaAdsConnection(input: SaveMetaAdsConnectionInput) {
  let token = String(input.accessToken ?? "").trim();
  if (!token) throw new AppError("Meta access token is required.", 400);

  const { db, store } = await getGrowthAgentStoreContext(input.storeId ?? undefined);
  if (!db) throw new AppError("Database client is not available.", 500);
  const existing = await db.metaAdsConnection.findUnique({ where: { storeId: store.id } });
  const appCredentials = resolveConnectionAppCredentials(existing, input);
  const shouldExchange = input.exchangeToken !== false && Boolean(appCredentials.appId && appCredentials.appSecret);
  let tokenType: string | null = null;
  let tokenIssuedAt: Date | null = null;
  let tokenExpiresAt: Date | null = null;
  let tokenScopes: string[] = [];

  if (shouldExchange) {
    const exchange = await exchangeLongLivedUserToken(token, appCredentials.appId, appCredentials.appSecret);
    token = exchange.accessToken;
    tokenType = exchange.tokenType;
    tokenExpiresAt = exchange.expiresAt;
  }

  const debug = await debugMetaToken(token, appCredentials.appId, appCredentials.appSecret);
  if (debug?.isValid === false) {
    throw new AppError("Meta token is not valid for this app. Generate a new token or check the App ID/App Secret.", 400);
  }
  tokenType = debug?.tokenType ?? tokenType;
  tokenIssuedAt = debug?.issuedAt ?? null;
  tokenExpiresAt = debug?.expiresAt ?? tokenExpiresAt;
  tokenScopes = debug?.scopes ?? [];

  const adAccountId = normalizeAdAccountId(input.adAccountId);
  const account = await fetchMetaAdAccount(token, adAccountId, appCredentials.appSecret);
  const accountId = normalizeAdAccountId(account.id ?? adAccountId);
  const appId = cleanAppCredential(input.appId) || existing?.appId || cleanAppCredential(process.env.META_ADS_CLIENT_ID) || null;
  const appSecretEnc = cleanAppCredential(input.appSecret)
    ? encryptSecret(cleanAppCredential(input.appSecret))
    : existing?.appSecretEnc ?? null;

  const connection = await db.metaAdsConnection.upsert({
    where: { storeId: store.id },
    update: {
      adAccountId: accountId,
      adAccountName: account.name ?? null,
      accountStatus: account.account_status ?? null,
      currency: account.currency ?? null,
      timezoneName: account.timezone_name ?? null,
      appId,
      appSecretEnc,
      accessTokenEnc: encryptSecret(token),
      tokenLastFour: tokenLastFour(token),
      tokenType,
      tokenIssuedAt,
      tokenExpiresAt,
      tokenScopes,
      syncStatus: "idle",
      lastSyncError: null
    },
    create: {
      storeId: store.id,
      adAccountId: accountId,
      adAccountName: account.name ?? null,
      accountStatus: account.account_status ?? null,
      currency: account.currency ?? null,
      timezoneName: account.timezone_name ?? null,
      appId,
      appSecretEnc,
      accessTokenEnc: encryptSecret(token),
      tokenLastFour: tokenLastFour(token),
      tokenType,
      tokenIssuedAt,
      tokenExpiresAt,
      tokenScopes
    }
  });

  await saveGrowthPlatformConnection({
    platform: "metaAds",
    status: "connected",
    healthMessage: `Meta Ads connected to ${connection.adAccountName ?? connection.adAccountId}.`,
    tokenLastFour: connection.tokenLastFour,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    config: {
      adAccountId: connection.adAccountId,
      adAccountName: connection.adAccountName,
      currency: connection.currency,
      timezoneName: connection.timezoneName,
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
      tokenType: connection.tokenType ?? null
    }
  }, store.id);

  return {
    ok: true,
    exchanged: shouldExchange,
    connection: metaConnectionSummary(store.id, connection)
  };
}

export async function getMetaAdsConnectionSummary(storeId?: string | null) {
  const { db, store } = await getGrowthAgentStoreContext(storeId ?? undefined);
  if (!db?.metaAdsConnection) return null;

  const connection = await db.metaAdsConnection.findUnique({ where: { storeId: store.id } });
  if (!connection) return null;

  const latestRun = db.syncRun
    ? await db.syncRun.findFirst({
        where: { storeId: store.id, mode: "meta_ads_campaign_insights" },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          recordsCreated: true,
          recordsUpdated: true,
          recordsFailed: true,
          errorMessage: true
        }
      })
    : null;

  return metaConnectionSummary(store.id, connection, latestRun);
}

export async function refreshMetaAdsAccessToken(input: RefreshMetaAdsTokenInput = {}) {
  const { db, store } = await getGrowthAgentStoreContext(input.storeId ?? undefined);
  if (!db) throw new AppError("Database client is not available.", 500);

  const existing = await db.metaAdsConnection.findUnique({ where: { storeId: store.id } });
  if (!existing) throw new AppError("Connect Meta Ads before regenerating the token.", 400);

  const appCredentials = resolveConnectionAppCredentials(existing, input);
  if (!appCredentials.appId || !appCredentials.appSecret) {
    throw new AppError("App ID and App Secret are required to regenerate a long-lived Meta token.", 400);
  }

  const sourceToken = cleanAppCredential(input.accessToken) || decryptSecret(existing.accessTokenEnc);
  const exchange = await exchangeLongLivedUserToken(sourceToken, appCredentials.appId, appCredentials.appSecret);
  const debug = await debugMetaToken(exchange.accessToken, appCredentials.appId, appCredentials.appSecret);
  if (debug?.isValid === false) {
    throw new AppError("Meta returned a token, but debug_token says it is not valid.", 502);
  }

  const account = await fetchMetaAdAccount(exchange.accessToken, existing.adAccountId, appCredentials.appSecret);
  const appSecretEnc = cleanAppCredential(input.appSecret)
    ? encryptSecret(cleanAppCredential(input.appSecret))
    : existing.appSecretEnc;
  const connection = await db.metaAdsConnection.update({
    where: { storeId: store.id },
    data: {
      adAccountName: account.name ?? existing.adAccountName,
      accountStatus: account.account_status ?? existing.accountStatus,
      currency: account.currency ?? existing.currency,
      timezoneName: account.timezone_name ?? existing.timezoneName,
      appId: cleanAppCredential(input.appId) || existing.appId || appCredentials.appId,
      appSecretEnc,
      accessTokenEnc: encryptSecret(exchange.accessToken),
      tokenLastFour: tokenLastFour(exchange.accessToken),
      tokenType: debug?.tokenType ?? exchange.tokenType,
      tokenIssuedAt: debug?.issuedAt ?? null,
      tokenExpiresAt: debug?.expiresAt ?? exchange.expiresAt,
      tokenScopes: debug?.scopes ?? [],
      lastSyncError: null
    }
  });

  await saveGrowthPlatformConnection({
    platform: "metaAds",
    status: "connected",
    healthMessage: `Meta Ads token regenerated for ${connection.adAccountName ?? connection.adAccountId}.`,
    tokenLastFour: connection.tokenLastFour,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    config: {
      adAccountId: connection.adAccountId,
      adAccountName: connection.adAccountName,
      currency: connection.currency,
      timezoneName: connection.timezoneName,
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
      tokenType: connection.tokenType ?? null
    }
  }, store.id);

  return {
    ok: true,
    connection: metaConnectionSummary(store.id, connection)
  };
}

export async function syncMetaAdsCampaignInsights(input: SyncMetaAdsInput = {}) {
  const { db, store } = await getGrowthAgentStoreContext(input.storeId ?? undefined);
  if (!db) throw new AppError("Database client is not available.", 500);

  const connection = await db.metaAdsConnection.findUnique({ where: { storeId: store.id } });
  if (!connection) throw new AppError("Connect Meta Ads before syncing campaign insights.", 400);

  const datePreset = String(input.datePreset ?? DEFAULT_DATE_PRESET).trim() || DEFAULT_DATE_PRESET;
  const startedAt = new Date();
  let syncRun: { id: string } | null = null;

  if (db.syncRun) {
    syncRun = await db.syncRun.create({
      data: {
        storeId: store.id,
        mode: "meta_ads_campaign_insights",
        status: "running",
        detailsJson: {
          adAccountId: connection.adAccountId,
          datePreset
        }
      },
      select: { id: true }
    });
  }

  await db.metaAdsConnection.update({
    where: { storeId: store.id },
    data: { syncStatus: "running", lastSyncError: null }
  });

  try {
    const accessToken = decryptSecret(connection.accessTokenEnc);
    const appSecret = connection.appSecretEnc
      ? decryptSecret(connection.appSecretEnc)
      : cleanAppCredential(process.env.META_ADS_CLIENT_SECRET);
    const tokenHealth = summarizeTokenHealth(connection.tokenExpiresAt ?? null);
    if (tokenHealth.status === "expired") {
      throw new AppError("Meta Ads token is expired. Regenerate the token in Settings before syncing.", 401);
    }
    const [campaignRows, adRows] = await Promise.all([
      fetchAllInsights(accessToken, connection.adAccountId, datePreset, "campaign", appSecret),
      fetchAllInsights(accessToken, connection.adAccountId, datePreset, "ad", appSecret)
    ]);
    const creativeByAdId = await fetchCreativesForAds(
      accessToken,
      adRows.map((row) => String(row.ad_id ?? "")).filter(Boolean),
      appSecret
    );
    const rows = [
      ...campaignRows.map((row) => ({ level: "campaign" as const, row })),
      ...adRows.map((row) => ({ level: "ad" as const, row }))
    ];
    let created = 0;
    let updated = 0;

    for (const insight of rows) {
      const row = insight.row;
      const campaignId = String(row.campaign_id ?? row.campaign_name ?? "unknown");
      const adId = row.ad_id ? String(row.ad_id) : null;
      const entityId = insight.level === "ad" ? adId ?? campaignId : campaignId;
      const creative = adId ? creativeByAdId.get(adId) ?? null : null;
      const dateStart = parseMetaDate(row.date_start);
      const dateStop = parseMetaDate(row.date_stop);
      const existing = await db.metaAdsCampaignInsight.findUnique({
        where: {
          storeId_adAccountId_level_entityId_dateStart_dateStop: {
            storeId: store.id,
            adAccountId: connection.adAccountId,
            level: insight.level,
            entityId,
            dateStart,
            dateStop
          }
        },
        select: { id: true }
      });

      const actions = Array.isArray(row.actions) ? row.actions : [];
      const purchaseRoas = getRoasValue(row.purchase_roas);
      await db.metaAdsCampaignInsight.upsert({
        where: {
          storeId_adAccountId_level_entityId_dateStart_dateStop: {
            storeId: store.id,
            adAccountId: connection.adAccountId,
            level: insight.level,
            entityId,
            dateStart,
            dateStop
          }
        },
        update: {
          metaConnectionId: connection.id,
          entityId,
          campaignName: row.campaign_name ?? campaignId,
          adsetId: row.adset_id ?? null,
          adsetName: row.adset_name ?? null,
          adId,
          adName: row.ad_name ?? null,
          creativeId: creative?.id ?? null,
          creativeName: creative?.name ?? null,
          creativeTitle: creative?.title ?? null,
          creativeBody: creative?.body ?? null,
          creativeThumbnailUrl: creative?.thumbnail_url ?? null,
          creativePreviewUrl: buildAdsManagerAdUrl(connection.adAccountId, adId),
          creativePermalinkUrl: creative?.instagram_permalink_url ?? null,
          creativeObjectUrl: creative?.object_url ?? null,
          objectStoryId: creative?.object_story_id ?? null,
          effectiveObjectStoryId: creative?.effective_object_story_id ?? null,
          level: insight.level,
          datePreset,
          spend: toNumber(row.spend),
          impressions: Math.round(toNumber(row.impressions)),
          clicks: Math.round(toNumber(row.clicks)),
          linkClicks: Math.round(getActionValue(actions, ["link_click"])),
          landingPageViews: Math.round(getActionValue(actions, ["landing_page_view", "omni_landing_page_view"])),
          addToCart: Math.round(getActionValue(actions, ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"])),
          initiateCheckout: Math.round(getActionValue(actions, ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"])),
          purchases: Math.round(getActionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "web_in_store_purchase"])),
          ctr: toNumber(row.ctr),
          cpc: toNumber(row.cpc),
          cpm: toNumber(row.cpm),
          purchaseRoas,
          actionsJson: actions,
          purchaseRoasJson: row.purchase_roas ?? null,
          syncedAt: new Date()
        },
        create: {
          storeId: store.id,
          metaConnectionId: connection.id,
          adAccountId: connection.adAccountId,
          entityId,
          campaignId,
          campaignName: row.campaign_name ?? campaignId,
          adsetId: row.adset_id ?? null,
          adsetName: row.adset_name ?? null,
          adId,
          adName: row.ad_name ?? null,
          creativeId: creative?.id ?? null,
          creativeName: creative?.name ?? null,
          creativeTitle: creative?.title ?? null,
          creativeBody: creative?.body ?? null,
          creativeThumbnailUrl: creative?.thumbnail_url ?? null,
          creativePreviewUrl: buildAdsManagerAdUrl(connection.adAccountId, adId),
          creativePermalinkUrl: creative?.instagram_permalink_url ?? null,
          creativeObjectUrl: creative?.object_url ?? null,
          objectStoryId: creative?.object_story_id ?? null,
          effectiveObjectStoryId: creative?.effective_object_story_id ?? null,
          level: insight.level,
          datePreset,
          dateStart,
          dateStop,
          spend: toNumber(row.spend),
          impressions: Math.round(toNumber(row.impressions)),
          clicks: Math.round(toNumber(row.clicks)),
          linkClicks: Math.round(getActionValue(actions, ["link_click"])),
          landingPageViews: Math.round(getActionValue(actions, ["landing_page_view", "omni_landing_page_view"])),
          addToCart: Math.round(getActionValue(actions, ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"])),
          initiateCheckout: Math.round(getActionValue(actions, ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"])),
          purchases: Math.round(getActionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "web_in_store_purchase"])),
          ctr: toNumber(row.ctr),
          cpc: toNumber(row.cpc),
          cpm: toNumber(row.cpm),
          purchaseRoas,
          actionsJson: actions,
          purchaseRoasJson: row.purchase_roas ?? null
        }
      });

      if (existing) updated += 1;
      else created += 1;
    }

    const completedAt = new Date();
    await db.metaAdsConnection.update({
      where: { storeId: store.id },
      data: {
        syncStatus: "success",
        lastSyncAt: completedAt,
        lastSyncError: null
      }
    });

    if (syncRun) {
      await db.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "success",
          completedAt,
          recordsCreated: created,
          recordsUpdated: updated,
          recordsFailed: 0,
          errorMessage: null,
          detailsJson: {
            adAccountId: connection.adAccountId,
            datePreset,
            campaignRowsFetched: campaignRows.length,
            adRowsFetched: adRows.length,
            insightRowsFetched: rows.length
          }
        }
      });
    }

    await saveGrowthPlatformConnection({
      platform: "metaAds",
      status: "connected",
      healthMessage: `Meta Ads synced ${campaignRows.length} daily campaign row(s) and ${adRows.length} daily ad/creative row(s).`,
      tokenLastFour: connection.tokenLastFour,
      lastSyncAt: completedAt.toISOString(),
      config: {
        adAccountId: connection.adAccountId,
        adAccountName: connection.adAccountName,
        currency: connection.currency,
        timezoneName: connection.timezoneName,
        datePreset,
        campaignRowsFetched: campaignRows.length,
        adRowsFetched: adRows.length,
        tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null
      }
    }, store.id);

    return {
      ok: true,
      storeId: store.id,
      adAccountId: connection.adAccountId,
      datePreset,
      campaignsFetched: campaignRows.length,
      adsFetched: adRows.length,
      insightRowsFetched: rows.length,
      recordsCreated: created,
      recordsUpdated: updated
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta Ads sync failed.";
    await db.metaAdsConnection.update({
      where: { storeId: store.id },
      data: {
        syncStatus: "error",
        lastSyncError: message
      }
    }).catch(() => undefined);

    if (syncRun) {
      await db.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "error",
          completedAt: new Date(),
          recordsFailed: 1,
          errorMessage: message
        }
      }).catch(() => undefined);
    }

    await saveGrowthPlatformConnection({
      platform: "metaAds",
      status: "degraded",
      healthMessage: message,
      tokenLastFour: connection.tokenLastFour,
      config: {
        adAccountId: connection.adAccountId,
        adAccountName: connection.adAccountName
      }
    }, store.id).catch(() => undefined);

    throw error;
  }
}

export async function getLatestMetaAdsCampaignInsights(storeId: string, take = 10) {
  const db = getDb();
  if (!db?.metaAdsCampaignInsight) return [];

  const latest = await db.metaAdsCampaignInsight.findFirst({
    where: { storeId },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true, dateStart: true, dateStop: true, datePreset: true }
  });
  if (!latest) return [];

  return db.metaAdsCampaignInsight.findMany({
    where: {
      storeId,
      dateStart: latest.dateStart,
      dateStop: latest.dateStop
    },
    orderBy: [
      { spend: "desc" },
      { purchases: "desc" }
    ],
    take
  });
}

function decimalToNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    return Number((value as { toNumber: () => number }).toNumber());
  }
  return Number(value);
}

function formatCurrency(value: number) {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function toDateKey(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function mapPlannerCampaign(row: any): MarketingPlannerMetaAdsCampaign {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    spend: decimalToNumber(row.spend),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.linkClicks ?? 0),
    landingPageViews: Number(row.landingPageViews ?? 0),
    addToCart: Number(row.addToCart ?? 0),
    initiateCheckout: Number(row.initiateCheckout ?? 0),
    purchases: Number(row.purchases ?? 0),
    ctr: decimalToNumber(row.ctr),
    cpc: decimalToNumber(row.cpc),
    cpm: decimalToNumber(row.cpm),
    purchaseRoas: row.purchaseRoas == null ? null : decimalToNumber(row.purchaseRoas),
    dateStart: row.dateStart instanceof Date ? row.dateStart.toISOString().slice(0, 10) : String(row.dateStart ?? ""),
    dateStop: row.dateStop instanceof Date ? row.dateStop.toISOString().slice(0, 10) : String(row.dateStop ?? "")
  };
}

function pickFirst<T>(current: T | null | undefined, next: T | null | undefined) {
  return current ?? next ?? null;
}

type MetaAdsAggregate = MarketingPlannerMetaAdsCampaign & {
  roasWeightedSpend: number;
  roasWeightedValue: number;
  roasFallbackCount: number;
  roasFallbackValue: number;
};

function createAggregate(row: any, key: string, label?: string): MetaAdsAggregate {
  return {
    id: key,
    campaignId: row.campaignId ?? key,
    campaignName: label ?? row.campaignName ?? "Meta Ads",
    adsetId: row.adsetId ?? null,
    adsetName: row.adsetName ?? null,
    adId: row.adId ?? null,
    adName: row.adName ?? null,
    creativeId: row.creativeId ?? null,
    creativeName: row.creativeName ?? null,
    creativeTitle: row.creativeTitle ?? null,
    creativeBody: row.creativeBody ?? null,
    creativeThumbnailUrl: row.creativeThumbnailUrl ?? null,
    creativePreviewUrl: row.creativePreviewUrl ?? null,
    creativePermalinkUrl: row.creativePermalinkUrl ?? null,
    creativeObjectUrl: row.creativeObjectUrl ?? null,
    spend: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    landingPageViews: 0,
    addToCart: 0,
    initiateCheckout: 0,
    purchases: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    purchaseRoas: null,
    dateStart: toDateKey(row.dateStart),
    dateStop: toDateKey(row.dateStop),
    roasWeightedSpend: 0,
    roasWeightedValue: 0,
    roasFallbackCount: 0,
    roasFallbackValue: 0
  };
}

function addRowToAggregate(aggregate: MetaAdsAggregate, row: any) {
  const spend = decimalToNumber(row.spend);
  aggregate.spend += spend;
  aggregate.impressions += Number(row.impressions ?? 0);
  aggregate.clicks += Number(row.clicks ?? 0);
  aggregate.linkClicks += Number(row.linkClicks ?? 0);
  aggregate.landingPageViews += Number(row.landingPageViews ?? 0);
  aggregate.addToCart += Number(row.addToCart ?? 0);
  aggregate.initiateCheckout += Number(row.initiateCheckout ?? 0);
  aggregate.purchases += Number(row.purchases ?? 0);
  aggregate.campaignName = aggregate.campaignName || row.campaignName || "Meta Ads";
  aggregate.adsetId = pickFirst(aggregate.adsetId, row.adsetId);
  aggregate.adsetName = pickFirst(aggregate.adsetName, row.adsetName);
  aggregate.adId = pickFirst(aggregate.adId, row.adId);
  aggregate.adName = pickFirst(aggregate.adName, row.adName);
  aggregate.creativeId = pickFirst(aggregate.creativeId, row.creativeId);
  aggregate.creativeName = pickFirst(aggregate.creativeName, row.creativeName);
  aggregate.creativeTitle = pickFirst(aggregate.creativeTitle, row.creativeTitle);
  aggregate.creativeBody = pickFirst(aggregate.creativeBody, row.creativeBody);
  aggregate.creativeThumbnailUrl = pickFirst(aggregate.creativeThumbnailUrl, row.creativeThumbnailUrl);
  aggregate.creativePreviewUrl = pickFirst(aggregate.creativePreviewUrl, row.creativePreviewUrl);
  aggregate.creativePermalinkUrl = pickFirst(aggregate.creativePermalinkUrl, row.creativePermalinkUrl);
  aggregate.creativeObjectUrl = pickFirst(aggregate.creativeObjectUrl, row.creativeObjectUrl);

  const rowStart = toDateKey(row.dateStart);
  const rowStop = toDateKey(row.dateStop);
  if (rowStart && (!aggregate.dateStart || rowStart < aggregate.dateStart)) aggregate.dateStart = rowStart;
  if (rowStop && (!aggregate.dateStop || rowStop > aggregate.dateStop)) aggregate.dateStop = rowStop;

  if (row.purchaseRoas != null) {
    const roas = decimalToNumber(row.purchaseRoas);
    if (spend > 0) {
      aggregate.roasWeightedSpend += spend;
      aggregate.roasWeightedValue += roas * spend;
    } else {
      aggregate.roasFallbackCount += 1;
      aggregate.roasFallbackValue += roas;
    }
  }
}

function finalizeAggregate(aggregate: MetaAdsAggregate): MarketingPlannerMetaAdsCampaign {
  const purchaseRoas = aggregate.roasWeightedSpend > 0
    ? aggregate.roasWeightedValue / aggregate.roasWeightedSpend
    : aggregate.roasFallbackCount > 0
      ? aggregate.roasFallbackValue / aggregate.roasFallbackCount
      : null;

  return {
    id: aggregate.id,
    campaignId: aggregate.campaignId,
    campaignName: aggregate.campaignName,
    adsetId: aggregate.adsetId,
    adsetName: aggregate.adsetName,
    adId: aggregate.adId,
    adName: aggregate.adName,
    creativeId: aggregate.creativeId,
    creativeName: aggregate.creativeName,
    creativeTitle: aggregate.creativeTitle,
    creativeBody: aggregate.creativeBody,
    creativeThumbnailUrl: aggregate.creativeThumbnailUrl,
    creativePreviewUrl: aggregate.creativePreviewUrl,
    creativePermalinkUrl: aggregate.creativePermalinkUrl,
    creativeObjectUrl: aggregate.creativeObjectUrl,
    spend: aggregate.spend,
    impressions: aggregate.impressions,
    clicks: aggregate.clicks,
    linkClicks: aggregate.linkClicks,
    landingPageViews: aggregate.landingPageViews,
    addToCart: aggregate.addToCart,
    initiateCheckout: aggregate.initiateCheckout,
    purchases: aggregate.purchases,
    ctr: aggregate.impressions > 0 ? (aggregate.clicks / aggregate.impressions) * 100 : 0,
    cpc: aggregate.clicks > 0 ? aggregate.spend / aggregate.clicks : 0,
    cpm: aggregate.impressions > 0 ? (aggregate.spend / aggregate.impressions) * 1000 : 0,
    purchaseRoas,
    dateStart: aggregate.dateStart,
    dateStop: aggregate.dateStop
  };
}

function compareCreativePerformance(left: MarketingPlannerMetaAdsCampaign, right: MarketingPlannerMetaAdsCampaign) {
  const leftRoas = Number(left.purchaseRoas ?? 0);
  const rightRoas = Number(right.purchaseRoas ?? 0);

  return right.purchases - left.purchases
    || rightRoas - leftRoas
    || right.spend - left.spend
    || right.clicks - left.clicks;
}

function compareCampaignPerformance(left: MarketingPlannerMetaAdsCampaign, right: MarketingPlannerMetaAdsCampaign) {
  const leftRoas = Number(left.purchaseRoas ?? 0);
  const rightRoas = Number(right.purchaseRoas ?? 0);

  return right.purchases - left.purchases
    || rightRoas - leftRoas
    || right.spend - left.spend
    || right.clicks - left.clicks;
}

function aggregateInsightRows(
  rows: any[],
  getKey: (row: any) => string,
  getLabel?: (row: any, key: string) => string
) {
  const aggregates = new Map<string, MetaAdsAggregate>();

  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    const aggregate = aggregates.get(key) ?? createAggregate(row, key, getLabel?.(row, key));
    addRowToAggregate(aggregate, row);
    aggregates.set(key, aggregate);
  }

  return Array.from(aggregates.values()).map(finalizeAggregate);
}

export async function buildMarketingPlannerMetaAds(
  storeScope: MarketingPlannerStoreScope,
  options: {
    start?: Date | null;
    end?: Date | null;
  } = {}
): Promise<MarketingPlannerMetaAds | null> {
  if (!storeScope.connected || !storeScope.storeId) return null;
  const db = getDb();
  if (!db?.metaAdsConnection || !db?.metaAdsCampaignInsight) return null;

  const connection = await db.metaAdsConnection.findUnique({ where: { storeId: storeScope.storeId } });
  if (!connection) return null;

  const latestRun = db.syncRun
    ? await db.syncRun.findFirst({
        where: { storeId: storeScope.storeId, mode: "meta_ads_campaign_insights", status: "success" },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, completedAt: true, detailsJson: true }
      })
    : null;
  const latestInsight = await db.metaAdsCampaignInsight.findFirst({
    where: { storeId: storeScope.storeId, adAccountId: connection.adAccountId },
    orderBy: { syncedAt: "desc" },
    select: { datePreset: true, syncedAt: true }
  });
  if (!latestInsight) {
    return {
      source: "meta_ads",
      adAccountId: connection.adAccountId,
      adAccountName: connection.adAccountName,
      currency: connection.currency,
      timezoneName: connection.timezoneName,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      dateStart: "",
      dateStop: "",
      totalSpend: 0,
      totalPurchases: 0,
      totalClicks: 0,
      averagePurchaseRoas: null,
      topCampaigns: [],
      watchCampaigns: [],
      topCreatives: [],
      dailyBreakdown: [],
      campaigns: [],
      summaryLines: ["Meta Ads is connected, but no campaign insights have been synced yet."],
      dataWarnings: ["Run Meta Ads sync from Settings before generating the final GANT."]
    };
  }

  const hasExplicitRange = Boolean(options.start && options.end);
  const runDetails = latestRun?.detailsJson && typeof latestRun.detailsJson === "object"
    ? latestRun.detailsJson as Record<string, unknown>
    : {};
  const datePreset = String(runDetails.datePreset ?? latestInsight.datePreset ?? DEFAULT_DATE_PRESET);
  const syncedFrom = latestRun?.startedAt ?? new Date(latestInsight.syncedAt.getTime() - 10 * 60 * 1000);
  const rows = await db.metaAdsCampaignInsight.findMany({
    where: {
      storeId: storeScope.storeId,
      adAccountId: connection.adAccountId,
      ...(hasExplicitRange
        ? {
            // Filter by dateStart only — Meta's `dateStop` is the
            // EXCLUSIVE start of the next day; `dateStop <= end` drops
            // the last day of the window.
            dateStart: { gte: options.start as Date, lte: options.end as Date }
          }
        : {
            datePreset,
            syncedAt: { gte: syncedFrom }
          })
    },
    orderBy: [{ dateStart: "asc" }, { spend: "desc" }]
  });
  if (!rows.length && hasExplicitRange) {
    const dateStart = toDateKey(options.start);
    const dateStop = toDateKey(options.end);

    return {
      source: "meta_ads",
      adAccountId: connection.adAccountId,
      adAccountName: connection.adAccountName,
      currency: connection.currency,
      timezoneName: connection.timezoneName,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      dateStart,
      dateStop,
      totalSpend: 0,
      totalPurchases: 0,
      totalClicks: 0,
      averagePurchaseRoas: null,
      topCampaigns: [],
      watchCampaigns: [],
      topCreatives: [],
      dailyBreakdown: [],
      campaigns: [],
      summaryLines: [`Meta Ads is connected, but no campaign/ad rows are stored for ${dateStart || "the selected start"}-${dateStop || "the selected end"}.`],
      dataWarnings: ["Sync Meta Ads for a date preset that covers this reporting window before relying on paid-media conclusions."]
    };
  }
  const campaignRows = rows.filter((row: any) => row.level === "campaign");
  const adRows = rows.filter((row: any) => row.level === "ad");
  const campaigns = aggregateInsightRows(
    campaignRows,
    (row) => String(row.campaignId ?? row.entityId ?? ""),
    (row) => String(row.campaignName ?? row.campaignId ?? "Meta campaign")
  ).sort((left, right) => right.spend - left.spend);
  const dailyBreakdown = aggregateInsightRows(
    campaignRows,
    (row) => toDateKey(row.dateStart),
    (_row, key) => `Meta Ads daily total ${key}`
  ).sort((left, right) => left.dateStart.localeCompare(right.dateStart));
  const creativeRows = aggregateInsightRows(
    adRows,
    (row) => String(row.adId ?? row.entityId ?? ""),
    (row) => String(row.campaignName ?? "Meta ad creative")
  );
  const totalSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const totalPurchases = campaigns.reduce((sum, campaign) => sum + campaign.purchases, 0);
  const totalClicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
  const roasRows = campaigns.filter((campaign) => campaign.purchaseRoas != null && campaign.spend > 0);
  const averagePurchaseRoas = roasRows.length
    ? roasRows.reduce((sum, campaign) => sum + Number(campaign.purchaseRoas) * campaign.spend, 0) / roasRows.reduce((sum, campaign) => sum + campaign.spend, 0)
    : null;
  const topCampaigns = campaigns
    .filter((campaign) => campaign.spend > 0)
    .sort(compareCampaignPerformance)
    .slice(0, 5);
  const watchCampaigns = campaigns
    .filter((campaign) => campaign.spend > 0 && (!campaign.purchaseRoas || campaign.purchaseRoas < 2.5 || campaign.purchases === 0))
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 5);
  const topCreatives = creativeRows
    .filter((creative) => creative.spend > 0)
    .sort(compareCreativePerformance)
    .slice(0, 8);
  const best = topCampaigns[0];
  const bestCreative = topCreatives[0];
  const dateStart = dailyBreakdown[0]?.dateStart ?? campaigns[0]?.dateStart ?? "";
  const dateStop = dailyBreakdown[dailyBreakdown.length - 1]?.dateStop ?? campaigns[0]?.dateStop ?? "";
  const summaryLines = [
    `Meta Ads synced ${dailyBreakdown.length} daily date(s), ${campaigns.length} campaign(s), and ${creativeRows.length} ad/creative row(s) for ${dateStart || "unknown"}-${dateStop || "unknown"} with ${formatCurrency(totalSpend)} spend and ${totalPurchases} purchases.`,
    best
      ? `Best paid signal: ${best.campaignName} with ROAS ${best.purchaseRoas != null ? best.purchaseRoas.toFixed(2) : "n/a"}, ${formatCurrency(best.spend)} spend, ${best.purchases} purchases.`
      : "No clear paid winner is available yet.",
    bestCreative
      ? `Best creative signal: ${bestCreative.adName ?? bestCreative.creativeName ?? bestCreative.campaignName} in ${bestCreative.campaignName}, ROAS ${bestCreative.purchaseRoas != null ? bestCreative.purchaseRoas.toFixed(2) : "n/a"}, ${bestCreative.purchases} purchases.`
      : "Ad creative rows are not available yet. Sync Meta Ads again to collect ad-level creative links.",
    averagePurchaseRoas != null
      ? `Average campaign ROAS in the synced set is ${averagePurchaseRoas.toFixed(2)}.`
      : "ROAS is missing from the synced campaign set."
  ];
  const dataWarnings = [
    ...(watchCampaigns.length
      ? [`${watchCampaigns.length} Meta campaign(s) need review because ROAS is low/missing or purchases are weak.`]
      : []),
    ...(adRows.length && topCreatives.some((creative) => !creative.creativePreviewUrl && !creative.creativePermalinkUrl)
      ? ["Some Meta ad rows synced without a preview/permalink, usually because Meta did not expose the creative object for that ad."]
      : []),
    ...(!adRows.length
      ? ["No ad-level creative rows were synced yet, so creative recommendations are campaign-only."]
      : [])
  ];

  return {
    source: "meta_ads",
    adAccountId: connection.adAccountId,
    adAccountName: connection.adAccountName,
    currency: connection.currency,
    timezoneName: connection.timezoneName,
    lastSyncAt: latestInsight.syncedAt.toISOString(),
    dateStart,
    dateStop,
    totalSpend,
    totalPurchases,
    totalClicks,
    averagePurchaseRoas,
    topCampaigns,
    watchCampaigns,
    topCreatives,
    dailyBreakdown,
    campaigns,
    summaryLines,
    dataWarnings
  };
}
