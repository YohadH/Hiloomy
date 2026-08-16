import { AppError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";

const INSTAGRAM_PROFILE_ENDPOINT = "https://www.instagram.com/api/v1/users/web_profile_info/";
const PUBLIC_CRAWLER_PLATFORM = "instagram_public";
const DEFAULT_BRAND_USERNAME = "incenseparfums";
const DEFAULT_BRAND_LIMIT = 24;
const DEFAULT_CREATOR_LIMIT = 12;
const MAX_PROFILES_PER_RUN = 25;
const PROFILE_DELAY_MS = 650;

type PublicInstagramNode = {
  __typename?: string;
  id?: string;
  shortcode?: string;
  is_video?: boolean;
  taken_at_timestamp?: number;
  display_url?: string | null;
  video_view_count?: number | null;
  video_play_count?: number | null;
  edge_liked_by?: { count?: number | null } | null;
  edge_media_preview_like?: { count?: number | null } | null;
  edge_media_to_comment?: { count?: number | null } | null;
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string | null } | null }> | null } | null;
  edge_media_to_tagged_user?: {
    edges?: Array<{ node?: { user?: { username?: string | null } | null } | null }>;
  } | null;
};

type PublicInstagramUser = {
  id?: string;
  username?: string;
  full_name?: string | null;
  is_private?: boolean;
  biography?: string | null;
  profile_pic_url_hd?: string | null;
  profile_pic_url?: string | null;
  edge_owner_to_timeline_media?: {
    count?: number;
    edges?: Array<{ node?: PublicInstagramNode | null }>;
  } | null;
};

export interface InstagramPublicCrawlerInput {
  storeId?: string | null;
  brandUsername?: string | null;
  creatorHandles?: string[] | string | null;
  brandLimit?: number | null;
  creatorLimit?: number | null;
}

export interface InstagramPublicCrawledProfile {
  username: string;
  profileUrl: string;
  role: "brand" | "creator";
  private: boolean;
  postsScanned: number;
  postsFound: number;
  postsSaved: number;
  postsUpdated: number;
  postsSkippedUnrelated: number;
}

type InstagramCrawlerTarget = {
  username: string;
  role: "brand" | "creator";
  limit: number;
  relatedTerms: string[];
};

export interface InstagramPublicCrawlerResult {
  ok: true;
  storeId: string;
  storeDomain: string;
  source: typeof PUBLIC_CRAWLER_PLATFORM;
  profilesRequested: number;
  profilesCrawled: number;
  postsFound: number;
  postsSaved: number;
  postsUpdated: number;
  crawledProfiles: InstagramPublicCrawledProfile[];
  warnings: string[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampLimit(value: number | null | undefined, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(numeric)));
}

function normalizeUsername(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let candidate = raw.replace(/^@+/, "").trim();
  try {
    const url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
    if (url.hostname.includes("instagram.com")) {
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    }
  } catch {
    candidate = candidate.split(/[/?#]/)[0] ?? candidate;
  }

  candidate = candidate.replace(/^@+/, "").replace(/\/+$/, "").trim().toLowerCase();
  if (!candidate || ["p", "reel", "reels", "stories", "explore", "accounts"].includes(candidate)) {
    return null;
  }

  return /^[a-z0-9._]{1,30}$/i.test(candidate) ? candidate : null;
}

function parseHandles(value: InstagramPublicCrawlerInput["creatorHandles"]) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\n,; ]+/)
        .map((item) => item.trim());

  return Array.from(new Set(rawItems.map((item) => normalizeUsername(item)).filter(Boolean) as string[]));
}

function normalizeHandleHint(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("@") || raw.includes("instagram.com/")) {
    return normalizeUsername(raw);
  }
  return null;
}

function normalizeRelatedTerm(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length >= 2 ? normalized : null;
}

function publicInstagramHeaders(username: string) {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "x-ig-app-id": "936619743392459",
    "x-requested-with": "XMLHttpRequest",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    Referer: `https://www.instagram.com/${username}/`
  };
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CRAWLER_LOG_PREFIX = "[instagram-crawler]";

/**
 * Launches a headless Chromium via Playwright. Instagram serves a 429 to bare
 * server-side fetches of its web_profile_info endpoint, so we drive a real
 * browser instead. Dynamically imported so Playwright isn't pulled into the
 * Next build graph.
 *
 * Returns `null` (instead of throwing) when the browser is UNAVAILABLE — the
 * Playwright package can't be imported, or the Chromium binary isn't installed
 * (e.g. a Render deploy that skipped `playwright install`). The caller treats a
 * null launch as "skip the Instagram sync gracefully" rather than crashing the
 * surrounding refresh/cron. Any OTHER launch failure is still thrown so it is
 * surfaced as a real error.
 */
async function launchCrawlerBrowser(): Promise<import("playwright").Browser | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn(
      `${CRAWLER_LOG_PREFIX} Playwright is not installed — skipping Instagram sync. ` +
        'Run "npm i -D @playwright/test" then "npx playwright install".'
    );
    return null;
  }

  try {
    return await chromium.launch({
      headless: true,
      // Force the full Chromium binary (installed via `playwright install
      // chromium`) instead of Playwright 1.45+'s new chromium-headless-shell
      // default — keeps the Render build cache simpler.
      channel: "chromium",
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A missing/unfound Chromium binary is an ENVIRONMENT problem, not a
    // request problem: the deploy didn't run `playwright install`, or the
    // install path doesn't match the runtime lookup path. Skip gracefully so
    // the rest of the refresh still completes instead of crashing.
    const isBinaryMissing =
      /executable doesn't exist|playwright install|browsertype\.launch/i.test(message);
    if (isBinaryMissing) {
      console.warn(
        `${CRAWLER_LOG_PREFIX} Chromium not available — skipping Instagram sync. ` +
          `(${message}) Run "npx playwright install --with-deps chromium" on the host.`
      );
      return null;
    }
    throw new AppError(
      `Could not launch the Playwright browser for the Instagram crawler: ${message}. ` +
        'Run "npx playwright install".',
      500
    );
  }
}

/**
 * Resolves a profile's public data by loading the real Instagram page in the
 * browser. The page itself requests web_profile_info; we capture that response.
 * If it doesn't fire, we replay the request from inside the browser context
 * (which now carries Instagram's cookies) — far less likely to be 429'd than a
 * bare server fetch.
 */
async function fetchProfileViaBrowser(
  context: import("playwright").BrowserContext,
  username: string
): Promise<PublicInstagramUser | null> {
  const page = await context.newPage();
  let captured: PublicInstagramUser | null = null;

  page.on("response", async (response) => {
    try {
      if (!response.url().includes("/api/v1/users/web_profile_info/")) return;
      const json = await response.json();
      const user = json?.data?.user;
      if (user) captured = user as PublicInstagramUser;
    } catch {
      // ignore non-JSON / detached responses
    }
  });

  try {
    const navigation = await page.goto(profileUrl(username), {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    if (navigation && navigation.status() === 404) {
      return null;
    }

    // Give the in-page web_profile_info XHR a chance to land.
    for (let attempt = 0; attempt < 12 && !captured; attempt += 1) {
      await page.waitForTimeout(500);
    }
    if (captured) return captured;

    // Fallback: same endpoint, but issued from the browser context so it
    // carries the cookies/session Instagram just set.
    const apiResponse = await context.request.get(
      `${INSTAGRAM_PROFILE_ENDPOINT}?${new URLSearchParams({ username }).toString()}`,
      { headers: publicInstagramHeaders(username) }
    );

    if (apiResponse.status() === 404) {
      return null;
    }
    if (!apiResponse.ok()) {
      throw new AppError(
        `Instagram crawler failed for @${username} with status ${apiResponse.status()}.`,
        apiResponse.status()
      );
    }

    const payload = await apiResponse.json();
    return (payload?.data?.user ?? null) as PublicInstagramUser | null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

function getPostCaption(node: PublicInstagramNode) {
  return node.edge_media_to_caption?.edges?.[0]?.node?.text?.trim() ?? "";
}

function getPostMediaType(node: PublicInstagramNode) {
  if (node.__typename === "GraphSidecar") return "CAROUSEL";
  if (node.is_video || node.__typename === "GraphVideo") return "REEL";
  return "IMAGE";
}

function getPostPermalink(node: PublicInstagramNode) {
  const shortcode = node.shortcode;
  if (!shortcode) return null;
  const segment = getPostMediaType(node) === "REEL" ? "reel" : "p";
  return `https://www.instagram.com/${segment}/${shortcode}/`;
}

function getPostDate(node: PublicInstagramNode) {
  return node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000) : new Date();
}

function getPostLikeCount(node: PublicInstagramNode) {
  return Number(node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? 0);
}

function getPostViewCount(node: PublicInstagramNode) {
  return Number(node.video_view_count ?? node.video_play_count ?? 0);
}

function profileUrl(username: string) {
  return `https://www.instagram.com/${username}/`;
}

async function getStoredCreatorTargets(db: any, storeId: string, brandUsername: string, creatorLimit: number) {
  if (!db.creatorProfile) return [];

  const rows = await db.creatorProfile.findMany({
    where: {
      storeId,
      platform: { in: ["instagram", PUBLIC_CRAWLER_PLATFORM] }
    },
    select: {
      username: true,
      profileUrl: true
    },
    take: 100
  });

  const handles = rows
    .flatMap((row: { username?: string | null; profileUrl?: string | null }) => [row.username, row.profileUrl])
    .map((item: string | null | undefined) => normalizeHandleHint(item))
    .filter(Boolean) as string[];

  return Array.from(new Set(handles.filter((handle) => handle !== brandUsername))).map((username) => ({
    username,
    role: "creator" as const,
    limit: creatorLimit,
    relatedTerms: [brandUsername, "incense", "incenseparfums", "incense parfums", "אינסנס"]
  }));
}

async function getAffiliateCreatorTargets(db: any, storeId: string, brandUsername: string, creatorLimit: number) {
  if (!db.affiliateMember) return [];

  const rows = await db.affiliateMember.findMany({
    where: { storeId },
    select: {
      firstName: true,
      lastName: true,
      affiliateCode: true,
      couponCode: true,
      instagramUsername: true,
      instagramProfileUrl: true
    },
    take: 250
  });

  const targetsByUsername = new Map<string, InstagramCrawlerTarget>();
  for (const row of rows as Array<{
    firstName?: string | null;
    lastName?: string | null;
    affiliateCode?: string | null;
    couponCode?: string | null;
    instagramUsername?: string | null;
    instagramProfileUrl?: string | null;
  }>) {
    const username = normalizeHandleHint(row.instagramProfileUrl) ?? normalizeUsername(row.instagramUsername);
    if (!username || username === brandUsername) continue;

    const relatedTerms = [
      brandUsername,
      "incense",
      "incenseparfums",
      "incense parfums",
      "אינסנס",
      row.affiliateCode,
      row.couponCode
    ].map(normalizeRelatedTerm).filter(Boolean) as string[];

    targetsByUsername.set(username, {
      username,
      role: "creator",
      limit: creatorLimit,
      relatedTerms: Array.from(new Set(relatedTerms))
    });
  }

  return Array.from(targetsByUsername.values());
}

function getTaggedUsernames(node: PublicInstagramNode) {
  return (node.edge_media_to_tagged_user?.edges ?? [])
    .map((edge) => edge.node?.user?.username?.toLowerCase())
    .filter(Boolean) as string[];
}

// Pulls every "@handle" and "#hashtag" out of a caption so the matcher can
// check them as first-class signals (not just substring matches inside
// arbitrary text). Lowercased to align with the rest of the matcher.
function extractMentionsAndTags(caption: string): { mentions: string[]; hashtags: string[] } {
  const mentions = Array.from(caption.matchAll(/@([a-z0-9._]{1,30})/gi)).map((m) => m[1].toLowerCase());
  // Hashtags can include Hebrew / Unicode letters in addition to ASCII, so
  // use Unicode property classes rather than [A-Za-z0-9_].
  const hashtags = Array.from(caption.matchAll(/#([\p{L}\p{N}_]{1,80})/gu)).map((m) => m[1].toLowerCase());
  return { mentions, hashtags };
}

function isBrandRelatedPost(node: PublicInstagramNode, relatedTerms: string[]) {
  const rawCaption = getPostCaption(node);
  const caption = rawCaption.toLowerCase();
  const tagged = getTaggedUsernames(node);
  const { mentions, hashtags } = extractMentionsAndTags(rawCaption);
  const terms = relatedTerms.map(normalizeRelatedTerm).filter(Boolean) as string[];

  return terms.some((rawTerm) => {
    const term = rawTerm.replace(/^@/, "").replace(/^#/, "");
    if (!term) return false;
    // Caption substring match — covers free-form brand mentions like
    // "loving the new Incense Parfums scent".
    if (caption.includes(term)) return true;
    // Explicit @mention or tagged-in-photo match (case-insensitive).
    if (mentions.includes(term)) return true;
    if (tagged.includes(term)) return true;
    // Hashtag match — affiliates frequently tag the brand via #incenseparfums
    // even when the caption itself is a different sentence in their own voice.
    if (hashtags.includes(term)) return true;
    return false;
  });
}

async function saveProfileAndPosts(input: {
  db: any;
  storeId: string;
  user: PublicInstagramUser;
  username: string;
  role: "brand" | "creator";
  limit: number;
  relatedTerms: string[];
}) {
  const externalId = String(input.user.id ?? input.username);
  const profile = await input.db.creatorProfile.upsert({
    where: {
      storeId_platform_externalId: {
        storeId: input.storeId,
        platform: PUBLIC_CRAWLER_PLATFORM,
        externalId
      }
    },
    update: {
      username: input.username,
      displayName: input.user.full_name ?? input.username,
      profileUrl: profileUrl(input.username)
    },
    create: {
      storeId: input.storeId,
      platform: PUBLIC_CRAWLER_PLATFORM,
      externalId,
      username: input.username,
      displayName: input.user.full_name ?? input.username,
      profileUrl: profileUrl(input.username),
      affiliateCode: null
    }
  });

  const scannedNodes = (input.user.edge_owner_to_timeline_media?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is PublicInstagramNode => Boolean(node?.shortcode))
    .slice(0, input.limit);
  const nodes = input.role === "brand"
    ? scannedNodes
    : scannedNodes.filter((node) => isBrandRelatedPost(node, input.relatedTerms));

  let postsSaved = 0;
  let postsUpdated = 0;

  for (const node of nodes) {
    const shortcode = String(node.shortcode);
    const externalPostId = `${PUBLIC_CRAWLER_PLATFORM}:${shortcode}`;
    const permalink = getPostPermalink(node);
    const existing = await input.db.creatorPost.findUnique({
      where: {
        storeId_externalPostId: {
          storeId: input.storeId,
          externalPostId
        }
      },
      select: { id: true }
    });

    await input.db.creatorPost.upsert({
      where: {
        storeId_externalPostId: {
          storeId: input.storeId,
          externalPostId
        }
      },
      update: {
        creatorProfileId: profile.id,
        caption: getPostCaption(node),
        mediaType: getPostMediaType(node),
        mediaUrl: node.display_url ?? null,
        permalink,
        postedAt: getPostDate(node),
        likeCount: getPostLikeCount(node),
        commentsCount: Number(node.edge_media_to_comment?.count ?? 0),
        viewCount: getPostViewCount(node)
      },
      create: {
        storeId: input.storeId,
        creatorProfileId: profile.id,
        externalPostId,
        caption: getPostCaption(node),
        mediaType: getPostMediaType(node),
        mediaUrl: node.display_url ?? null,
        permalink,
        postedAt: getPostDate(node),
        likeCount: getPostLikeCount(node),
        commentsCount: Number(node.edge_media_to_comment?.count ?? 0),
        viewCount: getPostViewCount(node),
        attributedSales: 0,
        attributedOrders: 0
      }
    });

    if (existing) postsUpdated += 1;
    else postsSaved += 1;
  }

  return {
    username: input.username,
    profileUrl: profileUrl(input.username),
    role: input.role,
    private: Boolean(input.user.is_private),
    postsScanned: scannedNodes.length,
    postsFound: nodes.length,
    postsSaved,
    postsUpdated,
    postsSkippedUnrelated: scannedNodes.length - nodes.length
  } satisfies InstagramPublicCrawledProfile;
}

async function createSyncRun(db: any, input: {
  storeId: string;
  status: "success" | "failed";
  startedAt: Date;
  recordsCreated: number;
  recordsUpdated: number;
  errorMessage?: string | null;
  detailsJson?: Record<string, unknown>;
}) {
  if (!db.syncRun) return;

  await db.syncRun.create({
    data: {
      storeId: input.storeId,
      mode: "instagram_public_crawl",
      status: input.status,
      startedAt: input.startedAt,
      completedAt: new Date(),
      recordsCreated: input.recordsCreated,
      recordsUpdated: input.recordsUpdated,
      recordsFailed: input.status === "failed" ? 1 : 0,
      errorMessage: input.errorMessage ?? null,
      detailsJson: input.detailsJson ?? {}
    }
  });
}

export async function crawlPublicInstagramProfiles(input: InstagramPublicCrawlerInput = {}): Promise<InstagramPublicCrawlerResult> {
  const { db, store } = await getGrowthAgentStoreContext(input.storeId ?? undefined);
  if (!db) throw new AppError("Database client is not available.", 500);
  if (!store.connected) throw new AppError("Connect a Shopify store before running the Instagram public crawler.", 400);

  const startedAt = new Date();
  const brandUsername = normalizeUsername(input.brandUsername) ?? DEFAULT_BRAND_USERNAME;
  const brandTerms = [brandUsername, "incense", "incenseparfums", "incense parfums", "אינסנס"];
  const brandLimit = clampLimit(input.brandLimit, DEFAULT_BRAND_LIMIT);
  const creatorLimit = clampLimit(input.creatorLimit, DEFAULT_CREATOR_LIMIT);
  const explicitCreatorHandles = parseHandles(input.creatorHandles);
  const explicitCreatorTargets = explicitCreatorHandles.map((username) => ({
    username,
    role: "creator" as const,
    limit: creatorLimit,
    relatedTerms: brandTerms
  }));
  const [storedCreatorTargets, affiliateTargets] = await Promise.all([
    getStoredCreatorTargets(db, store.id, brandUsername, creatorLimit),
    getAffiliateCreatorTargets(db, store.id, brandUsername, creatorLimit)
  ]);
  const targetByUsername = new Map<string, InstagramCrawlerTarget>();
  for (const target of [...explicitCreatorTargets, ...storedCreatorTargets, ...affiliateTargets]) {
    if (!targetByUsername.has(target.username)) {
      targetByUsername.set(target.username, target);
    } else {
      const existing = targetByUsername.get(target.username) as InstagramCrawlerTarget;
      existing.relatedTerms = Array.from(new Set([...existing.relatedTerms, ...target.relatedTerms]));
    }
  }
  const creatorTargets = Array.from(targetByUsername.values()).slice(0, MAX_PROFILES_PER_RUN - 1);
  const profilesToCrawl = [
    { username: brandUsername, role: "brand" as const, limit: brandLimit, relatedTerms: brandTerms },
    ...creatorTargets
  ];
  const warnings: string[] = [];
  const crawledProfiles: InstagramPublicCrawledProfile[] = [];
  let browser: import("playwright").Browser | null = null;

  try {
    browser = await launchCrawlerBrowser();

    // Browser unavailable (Playwright/Chromium not installed on this host).
    // Return a valid, empty result so callers (reporting refresh, marketing
    // planner readiness, the refresh cron) keep working instead of crashing.
    if (!browser) {
      const skipWarning =
        "Instagram crawler skipped: headless Chromium is not available on this host.";
      warnings.push(skipWarning);
      console.warn(`${CRAWLER_LOG_PREFIX} ${skipWarning}`);

      await createSyncRun(db, {
        storeId: store.id,
        status: "failed",
        startedAt,
        recordsCreated: 0,
        recordsUpdated: 0,
        errorMessage: skipWarning,
        detailsJson: { source: PUBLIC_CRAWLER_PLATFORM, skipped: true, reason: "chromium_unavailable" }
      }).catch(() => undefined);

      return {
        ok: true,
        storeId: store.id,
        storeDomain: store.domain,
        source: PUBLIC_CRAWLER_PLATFORM,
        profilesRequested: profilesToCrawl.length,
        profilesCrawled: 0,
        postsFound: 0,
        postsSaved: 0,
        postsUpdated: 0,
        crawledProfiles: [],
        warnings
      } satisfies InstagramPublicCrawlerResult;
    }

    const context = await browser.newContext({
      userAgent: BROWSER_USER_AGENT,
      locale: "en-US",
      viewport: { width: 1280, height: 800 }
    });

    for (const [index, target] of profilesToCrawl.entries()) {
      if (index > 0) await sleep(PROFILE_DELAY_MS);

      let user: PublicInstagramUser | null = null;
      try {
        user = await fetchProfileViaBrowser(context, target.username);
      } catch (profileError) {
        // One unreachable / rate-limited profile shouldn't abort the whole run.
        warnings.push(
          `@${target.username} could not be crawled: ${
            profileError instanceof Error ? profileError.message : String(profileError)
          }`
        );
        continue;
      }

      if (!user?.username) {
        warnings.push(`@${target.username} did not return public profile data.`);
        continue;
      }

      if (user.is_private) {
        warnings.push(`@${target.username} is private, so the crawler stored the profile but cannot read posts.`);
      }

      crawledProfiles.push(await saveProfileAndPosts({
        db,
        storeId: store.id,
        user,
        username: normalizeUsername(user.username) ?? target.username,
        role: target.role,
        limit: target.limit,
        relatedTerms: target.relatedTerms
      }));
    }

    const result = {
      ok: true,
      storeId: store.id,
      storeDomain: store.domain,
      source: PUBLIC_CRAWLER_PLATFORM,
      profilesRequested: profilesToCrawl.length,
      profilesCrawled: crawledProfiles.length,
      postsFound: crawledProfiles.reduce((sum, profile) => sum + profile.postsFound, 0),
      postsSaved: crawledProfiles.reduce((sum, profile) => sum + profile.postsSaved, 0),
      postsUpdated: crawledProfiles.reduce((sum, profile) => sum + profile.postsUpdated, 0),
      crawledProfiles,
      warnings
    } satisfies InstagramPublicCrawlerResult;

    await createSyncRun(db, {
      storeId: store.id,
      status: "success",
      startedAt,
      recordsCreated: result.postsSaved,
      recordsUpdated: result.postsUpdated,
      detailsJson: {
        source: PUBLIC_CRAWLER_PLATFORM,
        profilesRequested: result.profilesRequested,
        profilesCrawled: result.profilesCrawled,
        postsFound: result.postsFound,
        postsSaved: result.postsSaved,
        postsUpdated: result.postsUpdated,
        crawledProfiles: result.crawledProfiles,
        warnings
      }
    });

    return result;
  } catch (error) {
    await createSyncRun(db, {
      storeId: store.id,
      status: "failed",
      startedAt,
      recordsCreated: 0,
      recordsUpdated: 0,
      errorMessage: error instanceof Error ? error.message : "Instagram public crawler failed.",
      detailsJson: { source: PUBLIC_CRAWLER_PLATFORM }
    }).catch(() => undefined);
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
