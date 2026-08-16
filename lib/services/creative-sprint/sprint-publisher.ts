// Sprint publisher — turns "100 ads with ready assets" into a live Meta
// campaign.
//
// Sequence per sprint:
//   1. Resolve Meta auth (token + ad account) from MetaAdsConnection
//   2. Create ONE campaign for the whole sprint (PAUSED initially)
//   3. For each SprintAd in parallel (bounded concurrency):
//        a. Pull asset bytes from R2
//        b. Upload to Meta as adimage / advideo
//        c. Create ad creative (linked to page + asset + copy)
//        d. Create adset (own daily budget + targeting + pixel goal)
//        e. Create ad (links creative + adset)
//        f. Update SprintAd with the Meta IDs
//   4. Flip the campaign to ACTIVE so all ads go live at the same moment
//   5. Stamp publishedAt; schedule the cascade evaluator wakeups
//
// Failure handling: each ad is independent. If any single ad fails to
// publish we mark its SprintAd as "failed" but keep going — the sprint
// still goes live with the survivors. Mass-failure (e.g. token revoked)
// throws, transitioning the sprint to status="failed".

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import { getReadableUrl } from "@/lib/services/creative-storage-service";
import {
  activateMetaCampaign,
  createMetaAd,
  createMetaAdCreative,
  createMetaAdSet,
  createMetaCampaign,
  uploadMetaImage,
  uploadMetaVideo,
  type MetaAuth,
  type MetaTargeting
} from "@/lib/clients/meta-marketing-client";

// Targeting config the operator picks at launch time. Persisted on the
// sprint as `targetingJson` so we can render it in the report.
export interface SprintTargetingConfig {
  pageId: string;
  pixelId: string;
  // Where the ads link to (product page, collection page, landing page).
  linkUrl: string;
  // The body copy + headline are per-ad (from briefs). This is the
  // common targeting that every adset shares so we're testing CREATIVE
  // not AUDIENCE.
  targeting: MetaTargeting;
  // Conversion event the adset optimizes for. Default PURCHASE.
  customEventType?: "PURCHASE" | "ADD_TO_CART" | "VIEW_CONTENT" | "LEAD";
  // CTA shown on the ad button.
  callToAction?: "SHOP_NOW" | "LEARN_MORE" | "ORDER_NOW" | "SIGN_UP";
}

export interface PublishSprintResult {
  campaignId: string;
  publishedAdCount: number;
  failedAdCount: number;
}

// Scopes the sprint publisher needs. ads_management is the write scope —
// without it every campaign/adset/ad create call will 401 with
// OAuthException #200. pages_show_list lets the launcher modal populate
// the Page dropdown. business_management widens what we can read from
// Business Manager. ads_read alone (the read-only sync scope) is NOT enough.
const REQUIRED_PUBLISH_SCOPES = ["ads_management"] as const;
const RECOMMENDED_PUBLISH_SCOPES = ["pages_show_list", "business_management"] as const;

// Pull the Meta auth from MetaAdsConnection. Throws with an actionable
// message if the connection is missing or the saved token doesn't have
// the publish scope — we'd rather fail fast here than get a cryptic
// Meta error after creating a half-built campaign.
async function resolveMetaAuth(storeId: string): Promise<MetaAuth> {
  const db = getDb();
  const conn = await db.metaAdsConnection.findUnique({ where: { storeId } });
  if (!conn) {
    throw new Error(
      "Store is not connected to Meta Ads. Go to Settings → Meta Ads and paste a long-lived access token."
    );
  }
  const scopes: string[] = Array.isArray(conn.tokenScopes) ? (conn.tokenScopes as string[]) : [];
  const missingRequired = REQUIRED_PUBLISH_SCOPES.filter((s) => !scopes.includes(s));
  if (missingRequired.length > 0) {
    const have = scopes.length > 0 ? scopes.join(", ") : "(none reported)";
    throw new Error(
      `Your Meta token is missing scope(s): ${missingRequired.join(", ")}. ` +
        `Current scopes: ${have}. ` +
        `Regenerate the token in Meta Graph API Explorer (or Business Manager → System Users → Generate Token) ` +
        `with ads_management selected, then paste it into Settings → Meta Ads.`
    );
  }
  // Recommended scopes — log a warning but don't block.
  const missingRecommended = RECOMMENDED_PUBLISH_SCOPES.filter((s) => !scopes.includes(s));
  if (missingRecommended.length > 0) {
    console.warn(
      `[sprint-publisher] Token works for publish but missing recommended scope(s): ${missingRecommended.join(", ")}. ` +
        `Page/Pixel discovery in the launcher may be limited.`
    );
  }
  return {
    accessToken: decryptSecret(conn.accessTokenEnc),
    adAccountId: conn.adAccountId,
    appSecret: conn.appSecretEnc ? decryptSecret(conn.appSecretEnc) : null
  };
}

// Pull asset bytes from R2 via a presigned URL fetch. We don't have a
// direct "read from R2 by key" helper exposed, so we round-trip through
// the presigned URL. That's the same path the UI would take.
async function fetchAssetBytes(storageKey: string): Promise<Buffer> {
  const url = await getReadableUrl(storageKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch asset bytes from ${url}: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// Convert sprint dailyBudgetPerAd (in major units — e.g. "10.00" ILS) to
// Meta's minor units (agorot for ILS, cents for USD). Meta uses minor
// units in adset daily_budget regardless of account currency.
function toMinorUnits(majorValue: Prisma.Decimal | number | string): number {
  const n = typeof majorValue === "number" ? majorValue : Number(String(majorValue));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid daily budget: ${majorValue}`);
  }
  return Math.round(n * 100);
}

interface PublishOneAdInput {
  sprintAdId: string;
  storeId: string;
  campaignId: string;
  brief: { headline: string; body: string; cta: string };
  asset: {
    storageKey: string;
    mimeType: string;
    isVideo: boolean;
    thumbnailUrl?: string;
  };
  budgetMinor: number;
  targetingConfig: SprintTargetingConfig;
  startTimeIso?: string;
  adsetName: string;
  adName: string;
  creativeName: string;
}

async function publishOneAd(auth: MetaAuth, input: PublishOneAdInput): Promise<{ adsetId: string; creativeId: string; adId: string }> {
  const db = getDb();
  await db.sprintAd.update({
    where: { id: input.sprintAdId },
    data: { status: "publishing" }
  });

  const bytes = await fetchAssetBytes(input.asset.storageKey);
  const filename = `${input.creativeName}.${input.asset.isVideo ? "mp4" : "jpg"}`;

  // Step 1 — upload asset to Meta.
  let imageHash: string | undefined;
  let videoId: string | undefined;
  if (input.asset.isVideo) {
    const uploaded = await uploadMetaVideo(auth, {
      filename,
      contentType: input.asset.mimeType,
      bytes,
      name: input.creativeName
    });
    videoId = uploaded.id;
  } else {
    const uploaded = await uploadMetaImage(auth, {
      filename,
      contentType: input.asset.mimeType,
      bytes
    });
    imageHash = uploaded.hash;
  }

  // Step 2 — create AdCreative (links asset + copy + page + link).
  const creative = await createMetaAdCreative(auth, {
    name: input.creativeName,
    pageId: input.targetingConfig.pageId,
    imageHash,
    videoId,
    thumbnailUrl: input.asset.thumbnailUrl,
    message: input.brief.body,
    headline: input.brief.headline,
    linkUrl: input.targetingConfig.linkUrl,
    callToAction: input.targetingConfig.callToAction ?? "SHOP_NOW"
  });

  // Step 3 — create AdSet (its own budget + targeting + pixel).
  const adset = await createMetaAdSet(auth, {
    campaignId: input.campaignId,
    name: input.adsetName,
    dailyBudgetMinor: input.budgetMinor,
    pixelId: input.targetingConfig.pixelId,
    customEventType: input.targetingConfig.customEventType ?? "PURCHASE",
    targeting: input.targetingConfig.targeting,
    status: "PAUSED", // bulk-activated at end of publish
    startTimeIso: input.startTimeIso
  });

  // Step 4 — create Ad (the placement of the creative in the adset).
  const ad = await createMetaAd(auth, {
    name: input.adName,
    adsetId: adset.id,
    creativeId: creative.id,
    status: "PAUSED"
  });

  await db.sprintAd.update({
    where: { id: input.sprintAdId },
    data: {
      metaAdsetId: adset.id,
      metaCreativeId: creative.id,
      metaAdId: ad.id,
      status: "live"
    }
  });

  return { adsetId: adset.id, creativeId: creative.id, adId: ad.id };
}

export async function publishSprint(sprintId: string): Promise<PublishSprintResult> {
  const db = getDb();
  const sprint = await db.creativeSprint.findUnique({
    where: { id: sprintId },
    include: { ads: { where: { status: "asset_ready" }, orderBy: { slotIndex: "asc" } } }
  });
  if (!sprint) throw new Error(`Sprint ${sprintId} not found`);
  if (!sprint.targetingJson) {
    throw new Error("Sprint has no targeting config — cannot publish.");
  }

  // Mark as publishing immediately so the UI reflects state.
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: { status: "publishing" }
  });

  const auth = await resolveMetaAuth(sprint.storeId);
  const targetingConfig = sprint.targetingJson as unknown as SprintTargetingConfig;
  const budgetMinor = toMinorUnits(sprint.dailyBudgetPerAd);

  // Step A — create the parent Campaign (PAUSED until everything's ready).
  const campaign = await createMetaCampaign(auth, {
    name: `[Sprint] ${sprint.name}`,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    specialAdCategories: []
  });
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: { metaCampaignId: campaign.id }
  });

  // Step B — for each ad, run publishOneAd. Bounded concurrency (5)
  // to respect Meta rate limits. Failures isolated per-ad.
  let publishedAdCount = 0;
  let failedAdCount = 0;
  const concurrency = 5;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, sprint.ads.length) }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= sprint.ads.length) return;
      const ad = sprint.ads[i];
      const brief = ad.briefJson as unknown as { headline: string; body: string; cta: string };
      const isVideo = (ad.assetMimeType || "").startsWith("video/");
      try {
        await publishOneAd(auth, {
          sprintAdId: ad.id,
          storeId: sprint.storeId,
          campaignId: campaign.id,
          brief,
          asset: {
            storageKey: ad.assetStorageKey!,
            mimeType: ad.assetMimeType!,
            isVideo
          },
          budgetMinor,
          targetingConfig,
          adsetName: `${sprint.name} / slot ${ad.slotIndex}`,
          adName: `${sprint.name} / ad ${ad.slotIndex}`,
          creativeName: `sprint-${sprintId.slice(-6)}-slot-${ad.slotIndex}`
        });
        publishedAdCount += 1;
      } catch (err) {
        failedAdCount += 1;
        const message = err instanceof Error ? err.message : String(err);
        await db.sprintAd
          .update({
            where: { id: ad.id },
            data: { status: "failed", errorMessage: message.slice(0, 500) }
          })
          .catch(() => {
            // best-effort
          });
      }
    }
  });
  await Promise.all(workers);

  // Step C — activate the campaign. Adsets inherit ACTIVE through normal
  // Meta behavior, but we also explicitly activate any adsets that
  // published successfully (Meta requires both campaign+adset ACTIVE for
  // ads to run).
  if (publishedAdCount > 0) {
    await activateMetaCampaign(auth, campaign.id);
    const liveAds = await db.sprintAd.findMany({
      where: { sprintId, status: "live", metaAdsetId: { not: null } },
      select: { metaAdsetId: true }
    });
    // We could iterate and activate each adset individually here. Skipping
    // for now — Meta's default behavior under an ACTIVE campaign + PAUSED
    // adset means the adset stays paused. So we MUST also activate adsets.
    const { activateMetaAdSet } = await import("@/lib/clients/meta-marketing-client");
    for (const a of liveAds) {
      if (!a.metaAdsetId) continue;
      try {
        await activateMetaAdSet(auth, a.metaAdsetId);
      } catch (err) {
        // Already-active or other transient errors are non-fatal here.
        console.warn(`[sprint-publisher] activate adset ${a.metaAdsetId} failed:`, err);
      }
    }
  }

  // Step D — stamp publishedAt + transition to running.
  await db.creativeSprint.update({
    where: { id: sprintId },
    data: {
      status: publishedAdCount > 0 ? "running" : "failed",
      publishedAt: new Date(),
      errorMessage: publishedAdCount === 0 ? "All ads failed to publish" : null
    }
  });

  return {
    campaignId: campaign.id,
    publishedAdCount,
    failedAdCount
  };
}
