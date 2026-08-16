// Meta Marketing API client — the WRITE side of Meta Ads (the existing
// `meta-ads-service.ts` covers READ insights only).
//
// Surfaces the small subset of the Marketing API the Creative Sprint
// pipeline needs:
//   - listPages / listPixels   (config helpers for the launcher UI)
//   - createCampaign            (one per sprint)
//   - createAdSet               (one per ad — owns budget + targeting)
//   - uploadImage / uploadVideo (push asset bytes to Meta's CDN)
//   - createAdCreative          (link asset + copy + page + url)
//   - createAd                  (final step — places the creative in an adset)
//   - pauseAdSet                (THE KILL ACTION — cascade evaluator calls this)
//   - getAdSetInsights          (cheap targeted metrics pull for evaluation)
//
// Auth: every call needs an access token with `ads_management` scope on
// the target ad account. We do NOT mint or refresh tokens here — the
// caller must already hold a valid token (e.g. pulled from MetaAdsConnection
// after the user re-authed Meta with the wider scope). If the call
// returns OAuthException #200 ("requires ads_management"), surface a
// clear error so the UI can prompt for re-auth.
//
// All requests include `appsecret_proof` when the app secret is supplied,
// matching the existing meta-ads-service.ts hardening.

import { createHmac } from "crypto";

const META_GRAPH_VERSION = "v25.0";
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface MetaAuth {
  accessToken: string;
  // Numeric portion only (e.g. "123456789") or "act_123456789" — normalized below.
  adAccountId: string;
  appSecret?: string | null;
}

function buildAppSecretProof(accessToken: string, appSecret?: string | null): string | null {
  const secret = (appSecret ?? "").trim();
  if (!accessToken || !secret) return null;
  return createHmac("sha256", secret).update(accessToken).digest("hex");
}

function normalizeAdAccount(value: string): string {
  const numeric = String(value ?? "").replace(/^act_/i, "").replace(/\D+/g, "");
  if (!numeric) throw new Error("Meta ad account id is required (got empty).");
  return `act_${numeric}`;
}

// ── Low-level HTTP helpers ──────────────────────────────────────────────

interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface MetaGraphErrorWrap {
  error?: MetaGraphError;
}

async function metaGet<T>(path: string, auth: MetaAuth, params?: Record<string, string | number | null | undefined>): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("access_token", auth.accessToken);
  const proof = buildAppSecretProof(auth.accessToken, auth.appSecret);
  if (proof) url.searchParams.set("appsecret_proof", proof);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  const payload = await res.json().catch(() => null);
  if (!res.ok || (payload as MetaGraphErrorWrap)?.error) {
    throw buildMetaError(res.status, payload);
  }
  return payload as T;
}

async function metaPost<T>(path: string, auth: MetaAuth, body: Record<string, unknown>): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path.replace(/^\/+/, "")}`);
  const form = new URLSearchParams();
  form.set("access_token", auth.accessToken);
  const proof = buildAppSecretProof(auth.accessToken, auth.appSecret);
  if (proof) form.set("appsecret_proof", proof);
  for (const [k, v] of Object.entries(body ?? {})) {
    if (v == null) continue;
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store"
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || (payload as MetaGraphErrorWrap)?.error) {
    throw buildMetaError(res.status, payload);
  }
  return payload as T;
}

// Multipart POST for asset uploads (adimages/advideos). Body bytes are
// streamed via FormData; access_token + appsecret_proof travel as form
// fields, not URL params, so the upload doesn't hit a URL length cap.
async function metaUpload<T>(path: string, auth: MetaAuth, file: { filename: string; contentType: string; bytes: Buffer; fieldName: string }): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path.replace(/^\/+/, "")}`);
  const form = new FormData();
  form.set("access_token", auth.accessToken);
  const proof = buildAppSecretProof(auth.accessToken, auth.appSecret);
  if (proof) form.set("appsecret_proof", proof);
  // Copy to Uint8Array so Blob receives a concrete ArrayBuffer (Buffer's
  // underlying buffer is ArrayBufferLike → SharedArrayBuffer, rejected by
  // the strict TS Blob type).
  const blob = new Blob([new Uint8Array(file.bytes)], { type: file.contentType });
  form.set(file.fieldName, blob, file.filename);
  const res = await fetch(url.toString(), { method: "POST", body: form, cache: "no-store" });
  const payload = await res.json().catch(() => null);
  if (!res.ok || (payload as MetaGraphErrorWrap)?.error) {
    throw buildMetaError(res.status, payload);
  }
  return payload as T;
}

function buildMetaError(status: number, payload: unknown): Error {
  const err = (payload as MetaGraphErrorWrap | null)?.error;
  if (err) {
    const msg = `Meta ${status} (${err.code ?? "?"}/${err.error_subcode ?? "?"}): ${err.message ?? "unknown"}`;
    const wrapped = new Error(msg) as Error & { metaCode?: number; metaSubcode?: number };
    wrapped.metaCode = err.code;
    wrapped.metaSubcode = err.error_subcode;
    return wrapped;
  }
  return new Error(`Meta HTTP ${status}`);
}

// ── Config helpers (used by launcher UI to fill dropdowns) ──────────────

export interface MetaPageSummary {
  id: string;
  name: string;
  // Instagram business account id linked to this page, if any. Required
  // for IG-placed ads. Stored as a hint; not all stores have one.
  instagramId?: string | null;
  // Page access token — for some ad creatives we need a page token instead
  // of the user token (e.g. when posting from the page as the actor).
  accessToken?: string | null;
}

export async function listMetaPages(auth: MetaAuth): Promise<MetaPageSummary[]> {
  const res = await metaGet<{ data?: Array<{ id: string; name: string; access_token?: string; instagram_business_account?: { id: string } }> }>(
    "me/accounts",
    auth,
    { fields: "id,name,access_token,instagram_business_account" }
  );
  return (res.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    instagramId: p.instagram_business_account?.id ?? null,
    accessToken: p.access_token ?? null
  }));
}

export interface MetaPixelSummary {
  id: string;
  name: string;
}

export async function listMetaPixels(auth: MetaAuth): Promise<MetaPixelSummary[]> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  const res = await metaGet<{ data?: Array<{ id: string; name: string }> }>(
    `${adAccount}/adspixels`,
    auth,
    { fields: "id,name" }
  );
  return res.data ?? [];
}

// ── Campaign / AdSet / Ad creation ──────────────────────────────────────

export interface CreateCampaignInput {
  name: string;
  // We use OUTCOME_SALES for purchase-optimized sprints. Override only if
  // testing a non-purchase objective (lead, traffic). See Meta docs for
  // the full list.
  objective?: "OUTCOME_SALES" | "OUTCOME_ENGAGEMENT" | "OUTCOME_TRAFFIC" | "OUTCOME_LEADS";
  // ACTIVE means the campaign starts running once adsets are added.
  // PAUSED is safer for first-time runs — flip ACTIVE after review.
  status?: "ACTIVE" | "PAUSED";
  // Required by Meta to certify the ads don't fall under special ad
  // categories (credit, employment, housing, politics). Send empty array
  // for normal commerce ads.
  specialAdCategories?: string[];
}

export interface CreatedCampaign {
  id: string;
}

export async function createMetaCampaign(auth: MetaAuth, input: CreateCampaignInput): Promise<CreatedCampaign> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  return metaPost<CreatedCampaign>(`${adAccount}/campaigns`, auth, {
    name: input.name,
    objective: input.objective ?? "OUTCOME_SALES",
    status: input.status ?? "PAUSED",
    special_ad_categories: input.specialAdCategories ?? [],
    buying_type: "AUCTION"
  });
}

export interface MetaTargeting {
  geo_locations?: { countries?: string[]; cities?: Array<{ key: string }> };
  age_min?: number;
  age_max?: number;
  // Lookalike audience custom_audience id, if any
  custom_audiences?: Array<{ id: string }>;
  publisher_platforms?: Array<"facebook" | "instagram" | "audience_network" | "messenger">;
  // device_platforms, interests, behaviors are all optional Meta fields.
  // The shape passes straight through to Meta.
  [k: string]: unknown;
}

export interface CreateAdSetInput {
  campaignId: string;
  name: string;
  dailyBudgetMinor: number; // in MINOR units (e.g. agorot for ILS, cents for USD)
  // Pixel id this adset optimizes against
  pixelId: string;
  // Conversion event we're optimizing for: "PURCHASE" / "ADD_TO_CART" / "VIEW_CONTENT" etc.
  optimizationGoal?: "OFFSITE_CONVERSIONS" | "LINK_CLICKS" | "IMPRESSIONS";
  // Custom event types Meta recognizes for the pixel
  customEventType?: "PURCHASE" | "ADD_TO_CART" | "VIEW_CONTENT" | "LEAD";
  billingEvent?: "IMPRESSIONS" | "LINK_CLICKS";
  targeting: MetaTargeting;
  status?: "ACTIVE" | "PAUSED";
  // ISO timestamp for start; Meta uses Unix seconds — we convert.
  startTimeIso?: string;
  // ISO timestamp for end; optional (open-ended runs forever)
  endTimeIso?: string | null;
}

export interface CreatedAdSet {
  id: string;
}

export async function createMetaAdSet(auth: MetaAuth, input: CreateAdSetInput): Promise<CreatedAdSet> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  const body: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: input.dailyBudgetMinor, // Meta expects minor units (cents/agorot)
    billing_event: input.billingEvent ?? "IMPRESSIONS",
    optimization_goal: input.optimizationGoal ?? "OFFSITE_CONVERSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    promoted_object: {
      pixel_id: input.pixelId,
      custom_event_type: input.customEventType ?? "PURCHASE"
    },
    targeting: input.targeting,
    status: input.status ?? "PAUSED"
  };
  if (input.startTimeIso) body.start_time = input.startTimeIso;
  if (input.endTimeIso) body.end_time = input.endTimeIso;
  return metaPost<CreatedAdSet>(`${adAccount}/adsets`, auth, body);
}

// ── Asset uploads ───────────────────────────────────────────────────────

export interface UploadedImage {
  hash: string;
  url?: string;
}

export async function uploadMetaImage(auth: MetaAuth, file: { filename: string; contentType: string; bytes: Buffer }): Promise<UploadedImage> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  // The Marketing API returns { images: { <filename>: { hash, url } } }
  const res = await metaUpload<{ images?: Record<string, { hash?: string; url?: string }> }>(
    `${adAccount}/adimages`,
    auth,
    { ...file, fieldName: "filename" }
  );
  const entry = res.images ? Object.values(res.images)[0] : null;
  if (!entry?.hash) throw new Error("Meta upload: no image hash returned");
  return { hash: entry.hash, url: entry.url };
}

export interface UploadedVideo {
  id: string;
}

export async function uploadMetaVideo(auth: MetaAuth, file: { filename: string; contentType: string; bytes: Buffer; name?: string }): Promise<UploadedVideo> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  // Returns { id: "<video_id>" }
  const res = await metaUpload<{ id?: string; success?: boolean }>(
    `${adAccount}/advideos`,
    auth,
    { ...file, fieldName: "source" }
  );
  if (!res.id) throw new Error("Meta video upload: no video id returned");
  return { id: res.id };
}

// ── Creative + Ad ───────────────────────────────────────────────────────

export interface CreateAdCreativeInput {
  name: string;
  pageId: string;
  // Either imageHash (single image ad) or videoId (single video ad).
  imageHash?: string;
  videoId?: string;
  // The thumbnail to display while a video ad loads. Meta requires this
  // for video ads — without it the ad will be rejected.
  thumbnailUrl?: string;
  // Ad body text shown above the asset in the feed.
  message: string;
  headline?: string;
  description?: string;
  linkUrl: string;
  callToAction?: "SHOP_NOW" | "LEARN_MORE" | "ORDER_NOW" | "SIGN_UP";
}

export interface CreatedCreative {
  id: string;
}

export async function createMetaAdCreative(auth: MetaAuth, input: CreateAdCreativeInput): Promise<CreatedCreative> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  const linkData: Record<string, unknown> = {
    link: input.linkUrl,
    message: input.message,
    name: input.headline ?? undefined,
    description: input.description ?? undefined,
    call_to_action: input.callToAction
      ? { type: input.callToAction, value: { link: input.linkUrl } }
      : undefined
  };
  let objectStorySpec: Record<string, unknown> = { page_id: input.pageId };
  if (input.videoId) {
    objectStorySpec.video_data = {
      video_id: input.videoId,
      title: input.headline,
      message: input.message,
      image_url: input.thumbnailUrl,
      call_to_action: linkData.call_to_action
    };
  } else if (input.imageHash) {
    objectStorySpec.link_data = { ...linkData, image_hash: input.imageHash };
  } else {
    throw new Error("createMetaAdCreative: must pass either imageHash or videoId");
  }
  return metaPost<CreatedCreative>(`${adAccount}/adcreatives`, auth, {
    name: input.name,
    object_story_spec: objectStorySpec
  });
}

export interface CreateAdInput {
  name: string;
  adsetId: string;
  creativeId: string;
  status?: "ACTIVE" | "PAUSED";
}

export interface CreatedAd {
  id: string;
}

export async function createMetaAd(auth: MetaAuth, input: CreateAdInput): Promise<CreatedAd> {
  const adAccount = normalizeAdAccount(auth.adAccountId);
  return metaPost<CreatedAd>(`${adAccount}/ads`, auth, {
    name: input.name,
    adset_id: input.adsetId,
    creative: { creative_id: input.creativeId },
    status: input.status ?? "PAUSED"
  });
}

// ── The kill action (used by the cascade evaluator) ─────────────────────

export async function pauseMetaAdSet(auth: MetaAuth, adsetId: string): Promise<void> {
  await metaPost<{ success?: boolean }>(adsetId, auth, { status: "PAUSED" });
}

export async function activateMetaAdSet(auth: MetaAuth, adsetId: string): Promise<void> {
  await metaPost<{ success?: boolean }>(adsetId, auth, { status: "ACTIVE" });
}

// Bulk-activate the parent campaign + all its adsets. Used at the end of
// the publishing phase: we create everything as PAUSED, then flip the
// campaign + adsets to ACTIVE in one atomic-feeling sweep so the sprint
// "goes live" at a single timestamp.
export async function activateMetaCampaign(auth: MetaAuth, campaignId: string): Promise<void> {
  await metaPost<{ success?: boolean }>(campaignId, auth, { status: "ACTIVE" });
}

// ── Insights (targeted pull for cascade eval) ───────────────────────────
//
// The existing meta-ads-service does broad insights pulls for the daily
// sync. For cascade evaluation we need cheap, surgical per-adset pulls
// scoped to "since the sprint launched" — different shape, lives here.

export interface MetaAdSetInsightsRow {
  adsetId: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // Meta returns "0.0234" already as a fraction
  cpc: number;
  // Add-to-cart events. Needed by the cascade evaluator's stage-2
  // composite "intent" metric (cpc_plus_atc).
  addToCarts: number;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
}

export async function getMetaAdSetInsights(
  auth: MetaAuth,
  adsetId: string,
  timeRange: { sinceIso: string; untilIso: string }
): Promise<MetaAdSetInsightsRow> {
  const res = await metaGet<{ data?: Array<{ spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; actions?: Array<{ action_type: string; value: string }>; action_values?: Array<{ action_type: string; value: string }>; purchase_roas?: Array<{ value: string }> }> }>(
    `${adsetId}/insights`,
    auth,
    {
      fields: "spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas",
      time_range: JSON.stringify({
        since: timeRange.sinceIso.slice(0, 10),
        until: timeRange.untilIso.slice(0, 10)
      })
    }
  );
  const row = res.data?.[0];
  const num = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const actionVal = (actions: Array<{ action_type: string; value: string }> | undefined, names: string[]) => {
    if (!actions) return 0;
    for (const name of names) {
      const m = actions.find((a) => a.action_type === name);
      if (m) return num(m.value);
    }
    return 0;
  };
  const roasRaw = row?.purchase_roas?.[0]?.value;
  return {
    adsetId,
    spend: num(row?.spend),
    impressions: num(row?.impressions),
    clicks: num(row?.clicks),
    ctr: num(row?.ctr) / 100, // Meta returns CTR as percentage (e.g. 2.34); we store as fraction (0.0234)
    cpc: num(row?.cpc),
    // Add-to-cart event names vary by pixel config — try all common ones.
    addToCarts: actionVal(row?.actions, [
      "add_to_cart",
      "omni_add_to_cart",
      "offsite_conversion.fb_pixel_add_to_cart"
    ]),
    purchases: actionVal(row?.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
    purchaseValue: actionVal(row?.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
    roas: roasRaw != null ? num(roasRaw) : null
  };
}
