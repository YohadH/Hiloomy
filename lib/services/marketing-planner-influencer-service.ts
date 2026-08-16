import type {
  MarketingPlannerInfluencerAction,
  MarketingPlannerInfluencerContent,
  MarketingPlannerInfluencerCreator,
  MarketingPlannerInfluencerIntelligence,
  MarketingPlannerInstagramCrawlEvidence,
  MarketingPlannerInstagramCrawlPost,
  MarketingPlannerInstagramCrawlProfile,
  MarketingPlannerStoreScope
} from "@/lib/domain/marketing-planner-types";
import { getDb } from "@/lib/server/db";
import { toNumber } from "@/lib/server/numbers";

const BRAND_INSTAGRAM_URL = "https://www.instagram.com/incenseparfums/";
const BRAND_INSTAGRAM_USERNAME = "incenseparfums";
const PUBLIC_INSTAGRAM_PLATFORM = "instagram_public";

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatInlineDate(value: Date) {
  return `${value.getDate()}.${value.getMonth() + 1}`;
}

function formatCurrency(value: number) {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function getPreviousMonthBounds(planningStart: Date) {
  const start = new Date(planningStart.getFullYear(), planningStart.getMonth() - 1, 1);
  const end = new Date(planningStart.getFullYear(), planningStart.getMonth(), 0, 23, 59, 59, 999);
  return { start, end };
}

function creatorName(row: { firstName?: string | null; lastName?: string | null; affiliateCode?: string | null }) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.affiliateCode || "Creator";
}

function normalizeInstagramUsername(value?: string | null) {
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
  return candidate ? candidate : null;
}

function instagramProfileUrl(username: string) {
  return `https://www.instagram.com/${username}/`;
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "")).filter(Boolean) : [];
}

function captionPreview(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function parseLatestCrawledProfiles(details: Record<string, unknown>) {
  const rows = Array.isArray(details.crawledProfiles) ? details.crawledProfiles : [];
  const byUsername = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const record = readJsonRecord(row);
    const username = normalizeInstagramUsername(String(record.username ?? ""));
    if (username) byUsername.set(username, record);
  }

  return byUsername;
}

function buildInstagramProfileEvidence(input: {
  username: string;
  role: "brand" | "creator";
  affiliateName?: string | null;
  profile?: any | null;
  crawl?: Record<string, unknown> | null;
  posts: any[];
  lastRunAt: string | null;
}): MarketingPlannerInstagramCrawlProfile {
  const profileUrl = String(input.profile?.profileUrl ?? input.crawl?.profileUrl ?? instagramProfileUrl(input.username));
  const postsScanned = readNumber(input.crawl?.postsScanned);
  const postsFound = readNumber(input.crawl?.postsFound);
  const postsSaved = readNumber(input.crawl?.postsSaved);
  const postsUpdated = readNumber(input.crawl?.postsUpdated);
  const postsSkippedUnrelated = readNumber(input.crawl?.postsSkippedUnrelated);
  const lastPost = input.posts[0];
  const profileWasScanned = Boolean(input.crawl);
  const profileIsStored = Boolean(input.profile);
  let status: MarketingPlannerInstagramCrawlProfile["status"] = "missing";
  let note = "No public Instagram data is stored for this profile yet.";

  if (profileWasScanned) {
    status = "scanned";
  } else if (profileIsStored) {
    status = "stored";
  } else if (input.role === "creator") {
    status = "handle_saved";
  }

  if (input.role === "brand") {
    if (input.posts.length) {
      note = "Brand public posts/reels are stored and available for planner insights.";
    } else if (profileWasScanned) {
      note = "The brand profile was scanned, but no public posts/reels were stored.";
    }
  } else if (!profileWasScanned && !profileIsStored) {
    note = "Instagram handle is saved on the affiliate, but it has not been scanned yet.";
  } else if (postsFound > 0 || input.posts.length > 0) {
    note = "Crawler found brand-related public posts for this affiliate.";
  } else if (postsScanned > 0 && postsSkippedUnrelated >= postsScanned) {
    note = "Crawler scanned recent public posts, but none matched the brand, tag, hashtag, coupon, or affiliate code.";
  } else if (profileWasScanned) {
    note = "Crawler scanned the profile, but no brand-related posts are stored yet.";
  }

  return {
    username: input.username,
    profileUrl,
    role: input.role,
    affiliateName: input.affiliateName ?? null,
    postsScanned,
    postsFound,
    postsSaved,
    postsUpdated,
    postsSkippedUnrelated,
    postsStored: input.posts.length,
    lastPostAt: lastPost?.postedAt instanceof Date ? lastPost.postedAt.toISOString() : null,
    lastCrawledAt: profileWasScanned ? input.lastRunAt : null,
    status,
    note
  };
}

export async function buildInstagramCrawlEvidence(
  db: any,
  storeId: string,
  members: any[],
  options: {
    start?: Date | null;
    end?: Date | null;
    takePosts?: number;
  } = {}
): Promise<MarketingPlannerInstagramCrawlEvidence> {
  if (!db.creatorProfile || !db.creatorPost || !db.syncRun) {
    return {
      source: PUBLIC_INSTAGRAM_PLATFORM,
      lastRunAt: null,
      lastRunStatus: null,
      profilesRequested: 0,
      profilesCrawled: 0,
      postsSaved: 0,
      postsUpdated: 0,
      brandProfile: null,
      affiliateProfiles: [],
      recentPosts: [],
      warnings: ["Instagram crawler storage is not available in this environment."]
    };
  }

  const [latestRun, profiles] = await Promise.all([
    db.syncRun.findFirst({
      where: { storeId, mode: "instagram_public_crawl" },
      orderBy: { startedAt: "desc" }
    }),
    db.creatorProfile.findMany({
      where: { storeId, platform: PUBLIC_INSTAGRAM_PLATFORM },
      orderBy: { updatedAt: "desc" },
      take: 100
    })
  ]);

  const profileIds = (profiles as any[]).map((profile) => profile.id).filter(Boolean);
  const postedAt = options.start || options.end
    ? {
        ...(options.start ? { gte: options.start } : {}),
        ...(options.end ? { lte: options.end } : {})
      }
    : undefined;
  const storedPosts = profileIds.length
    ? await db.creatorPost.findMany({
        where: {
          storeId,
          creatorProfileId: { in: profileIds },
          ...(postedAt ? { postedAt } : {})
        },
        include: { creatorProfile: true },
        orderBy: { postedAt: "desc" },
        take: options.takePosts ?? 500
      })
    : [];

  const latestDetails = readJsonRecord(latestRun?.detailsJson);
  const latestCrawledProfiles = parseLatestCrawledProfiles(latestDetails);
  const lastRunAt = latestRun?.startedAt instanceof Date ? latestRun.startedAt.toISOString() : null;
  const profilesByUsername = new Map<string, any>();
  const postsByUsername = new Map<string, any[]>();

  for (const profile of profiles as any[]) {
    const username = normalizeInstagramUsername(profile.username ?? profile.profileUrl);
    if (username) profilesByUsername.set(username, profile);
  }

  for (const post of storedPosts as any[]) {
    const username = normalizeInstagramUsername(post.creatorProfile?.username ?? post.creatorProfile?.profileUrl);
    if (!username) continue;
    postsByUsername.set(username, [...(postsByUsername.get(username) ?? []), post]);
  }

  const brandProfile = buildInstagramProfileEvidence({
    username: BRAND_INSTAGRAM_USERNAME,
    role: "brand",
    profile: profilesByUsername.get(BRAND_INSTAGRAM_USERNAME) ?? null,
    crawl: latestCrawledProfiles.get(BRAND_INSTAGRAM_USERNAME) ?? null,
    posts: postsByUsername.get(BRAND_INSTAGRAM_USERNAME) ?? [],
    lastRunAt
  });

  const affiliateProfiles = (members as any[])
    .map((member) => {
      const username = normalizeInstagramUsername(member.instagramProfileUrl) ?? normalizeInstagramUsername(member.instagramUsername);
      if (!username || username === BRAND_INSTAGRAM_USERNAME) return null;

      return buildInstagramProfileEvidence({
        username,
        role: "creator",
        affiliateName: creatorName(member),
        profile: profilesByUsername.get(username) ?? null,
        crawl: latestCrawledProfiles.get(username) ?? null,
        posts: postsByUsername.get(username) ?? [],
        lastRunAt
      });
    })
    .filter(Boolean) as MarketingPlannerInstagramCrawlProfile[];

  const recentPosts = (storedPosts as any[]).slice(0, 8).map((post) => {
    const username = normalizeInstagramUsername(post.creatorProfile?.username ?? post.creatorProfile?.profileUrl) ?? "instagram";
    return {
      id: post.id,
      username,
      creatorName: post.creatorProfile?.displayName ?? username,
      role: username === BRAND_INSTAGRAM_USERNAME ? "brand" : "creator",
      permalink: post.permalink ?? null,
      mediaType: post.mediaType ?? "Media",
      postedAt: post.postedAt instanceof Date ? post.postedAt.toISOString() : new Date().toISOString(),
      views: Number(post.viewCount ?? 0),
      likes: Number(post.likeCount ?? 0),
      comments: Number(post.commentsCount ?? 0),
      captionPreview: captionPreview(post.caption)
    } satisfies MarketingPlannerInstagramCrawlPost;
  });

  const warnings = readStringArray(latestDetails.warnings);
  if (!latestRun) {
    warnings.push("The public Instagram crawler has not run yet for this store.");
  }
  if (!affiliateProfiles.length) {
    warnings.push("No affiliate Instagram handles are saved yet, so the crawler can only use the brand page.");
  }
  if (affiliateProfiles.some((profile) => profile.status === "handle_saved")) {
    warnings.push("Some affiliate Instagram handles are saved but have not been scanned yet. Run the public crawler before generating the final GANT.");
  }

  return {
    source: PUBLIC_INSTAGRAM_PLATFORM,
    lastRunAt,
    lastRunStatus: latestRun?.status ?? null,
    profilesRequested: readNumber(latestDetails.profilesRequested),
    profilesCrawled: readNumber(latestDetails.profilesCrawled),
    postsSaved: readNumber(latestDetails.postsSaved ?? latestRun?.recordsCreated),
    postsUpdated: readNumber(latestDetails.postsUpdated ?? latestRun?.recordsUpdated),
    brandProfile,
    affiliateProfiles,
    recentPosts,
    warnings
  };
}

function buildCreatorRole(input: {
  sales: number;
  orders: number;
  clicks: number;
  topSalesThreshold: number;
}): MarketingPlannerInfluencerCreator["role"] {
  if (input.sales >= input.topSalesThreshold || input.orders >= 10) return "scale";
  if (input.clicks >= 25 && input.orders === 0) return "watch";
  if (input.sales > 0 || input.clicks > 0) return "test";
  return "watch";
}

function buildCreatorReason(
  creator: Pick<MarketingPlannerInfluencerCreator, "sales" | "orders" | "clicks" | "conversionRate" | "role">,
  periodDescription = "previous month"
) {
  if (creator.role === "scale") {
    return `${formatCurrency(creator.sales)} attributed sales and ${creator.orders} orders in the ${periodDescription}.`;
  }

  if (creator.clicks > 0 && creator.orders === 0) {
    return `${creator.clicks} clicks but no attributed orders. Needs offer, landing, or code check before scaling.`;
  }

  if (creator.sales > 0) {
    return `${formatCurrency(creator.sales)} attributed sales, but still below the scale group. Good candidate for a controlled test.`;
  }

  return `No meaningful attributed activity in the ${periodDescription}.`;
}

function normalizeSource(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function buildActions(input: {
  topCreators: MarketingPlannerInfluencerCreator[];
  watchCreators: MarketingPlannerInfluencerCreator[];
  contentWinners: MarketingPlannerInfluencerContent[];
  totalCreators: number;
}) {
  const actions: MarketingPlannerInfluencerAction[] = [];
  const topNames = input.topCreators.slice(0, 3).map((creator) => creator.name);

  if (topNames.length) {
    actions.push({
      impact: "High",
      action: `לבנות גל משפיעניות ראשון סביב ${topNames.join(", ")} עם קוד אחד נקי ומסר אחיד.`,
      why: "אלה היוצרות שכבר הוכיחו מכירות בחודש הקודם, ולכן עדיף להתחיל איתן לפני פתיחת ניסויים רחבים.",
      ganttPlacement: "משפיעניות + יוצרות תוכן + אפיליאציה, 2-4 ימים לפני פתיחת המבצע המרכזי."
    });
  }

  if (input.watchCreators.length) {
    actions.push({
      impact: "Med",
      action: "להפריד בין יוצרות סקייל ליוצרות בדיקה, ולא לתת לכולן אותו עומק הנחה או אותו תקציב מוצר.",
      why: "חלק מהיוצרות לא הראו מכירות/המרה בחודש הקודם, ולכן צריך brief או offer אחר לפני שמגדילים אותן.",
      ganttPlacement: "משפיעניות, לסמן wave בדיקה קצרה באמצע החודש."
    });
  }

  if (input.contentWinners.length) {
    const winner = input.contentWinners[0];
    actions.push({
      impact: "Med",
      action: `למחזר את זווית התוכן שעבדה הכי טוב: ${winner.title.slice(0, 90)}.`,
      why: "פוסט/ריל שכבר קיבל מעורבות או מכירות נותן לנו creative proof יותר טוב מניחוש.",
      ganttPlacement: "פוסט / ריל - סושיאל אורגני + משפיעניות, בשבוע הראשון של הקמפיין."
    });
  } else {
    actions.push({
      impact: "Med",
      action: "לחבר/לסנכרן את חשבון Instagram כדי שהGANT יוכל לבחור גם לפי רילז ופוסטים, לא רק לפי קופונים ומכירות.",
      why: "כרגע יש תמונת מכירות טובה, אבל חסרה שכבת content performance חיה מהחשבון והיוצרות.",
      ganttPlacement: "הפקות / צילומי סושיאל + משפיעניות, לפני סגירת הבריף."
    });
  }

  if (!input.totalCreators) {
    actions.push({
      impact: "High",
      action: "להעלות/לסנכרן את רשימת המשפיעניות לפני יצירת GANT סופי לחודש עם פוקוס Influencers.",
      why: "בלי רשימת יוצרות וקודים אי אפשר לבחור מי מקבלת סקייל, מי בדיקה ומי pause.",
      ganttPlacement: "משפיעניות, לפני כל חלון קמפיין."
    });
  }

  return actions.slice(0, 4);
}

export async function buildMarketingPlannerInfluencerIntelligence(
  storeScope: MarketingPlannerStoreScope,
  planningStart: Date,
  options: {
    start?: Date | null;
    end?: Date | null;
    periodLabel?: string | null;
  } = {}
): Promise<MarketingPlannerInfluencerIntelligence | null> {
  if (!storeScope.connected || !storeScope.storeId) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  const hasExplicitRange = Boolean(options.start && options.end);
  const previousMonth = hasExplicitRange
    ? { start: options.start as Date, end: options.end as Date }
    : getPreviousMonthBounds(planningStart);
  const periodDescription = hasExplicitRange ? "selected date window" : "previous month";
  const contentStart = hasExplicitRange
    ? previousMonth.start
    : new Date(previousMonth.start.getFullYear(), previousMonth.start.getMonth() - 2, 1);
  const [members, attributions, sessions, posts] = await Promise.all([
    db.affiliateMember
      ? db.affiliateMember.findMany({
          where: { storeId: storeScope.storeId },
          include: { program: true },
          orderBy: [{ salesTotal: "desc" }, { joinedAt: "asc" }]
        })
      : Promise.resolve([]),
    db.affiliateAttribution
      ? db.affiliateAttribution.findMany({
          where: {
            storeId: storeScope.storeId,
            occurredAt: {
              gte: previousMonth.start,
              lte: previousMonth.end
            }
          },
          include: { affiliateMember: true },
          orderBy: { occurredAt: "desc" }
        })
      : Promise.resolve([]),
    db.attributionSession
      ? db.attributionSession.findMany({
          where: {
            storeId: storeScope.storeId,
            createdAt: {
              gte: previousMonth.start,
              lte: previousMonth.end
            }
          },
          include: { affiliateMember: true },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([]),
    db.creatorPost
      ? db.creatorPost.findMany({
          where: {
            storeId: storeScope.storeId,
            postedAt: {
              gte: contentStart,
              lte: previousMonth.end
            }
          },
          include: { creatorProfile: true, attributions: true },
          orderBy: { postedAt: "desc" },
          take: 30
        })
      : Promise.resolve([])
  ]);
  const instagramCrawl = await buildInstagramCrawlEvidence(
    db,
    storeScope.storeId,
    members as any[],
    hasExplicitRange ? { start: previousMonth.start, end: previousMonth.end } : {}
  );

  const statsByMemberId = new Map<string, { clicks: number; orders: number; sales: number; commission: number }>();
  const memberIdByCode = new Map<string, string>();

  for (const member of members as any[]) {
    memberIdByCode.set(String(member.affiliateCode ?? "").toUpperCase(), member.id);
    const couponCode = String(member.couponCode ?? "").toUpperCase();
    if (couponCode) memberIdByCode.set(couponCode, member.id);
    statsByMemberId.set(member.id, { clicks: 0, orders: 0, sales: 0, commission: 0 });
  }

  for (const row of attributions as any[]) {
    const memberId = row.affiliateMemberId ?? row.affiliateMember?.id ?? null;
    if (!memberId) continue;
    const stats = statsByMemberId.get(memberId) ?? { clicks: 0, orders: 0, sales: 0, commission: 0 };
    stats.orders += Number(row.ordersCount ?? 0);
    stats.sales += toNumber(row.salesAmount);
    stats.commission += toNumber(row.commissionAmount);
    stats.clicks += Number(row.clicks ?? 0);
    statsByMemberId.set(memberId, stats);
  }

  for (const row of sessions as any[]) {
    const memberId = row.affiliateMemberId
      ?? row.affiliateMember?.id
      ?? memberIdByCode.get(String(row.affiliateCode ?? "").toUpperCase())
      ?? memberIdByCode.get(String(row.couponCode ?? "").toUpperCase())
      ?? null;
    if (!memberId) continue;
    const stats = statsByMemberId.get(memberId) ?? { clicks: 0, orders: 0, sales: 0, commission: 0 };
    stats.clicks += 1;
    statsByMemberId.set(memberId, stats);
  }

  const totalSales = Array.from(statsByMemberId.values()).reduce((sum, stats) => sum + stats.sales, 0);
  const topSalesThreshold = Math.max(1, totalSales * 0.12);

  const creators = (members as any[]).map((member) => {
    const stats = statsByMemberId.get(member.id) ?? { clicks: 0, orders: 0, sales: 0, commission: 0 };
    const conversionRate = stats.clicks > 0 ? (stats.orders / stats.clicks) * 100 : null;
    const score = Math.round(stats.sales + stats.orders * 250 + stats.clicks * 8);
    const role = buildCreatorRole({ ...stats, topSalesThreshold });
    const draft = {
      id: member.id,
      name: creatorName(member),
      affiliateCode: String(member.affiliateCode ?? ""),
      couponCode: member.couponCode ?? null,
      status: member.status ?? "unknown",
      clicks: stats.clicks,
      orders: stats.orders,
      sales: Math.round(stats.sales * 100) / 100,
      commission: Math.round(stats.commission * 100) / 100,
      conversionRate,
      score,
      role,
      reason: ""
    } satisfies MarketingPlannerInfluencerCreator;
    return { ...draft, reason: buildCreatorReason(draft, periodDescription) };
  });

  const activeCreators = creators.filter((creator) => creator.clicks > 0 || creator.orders > 0 || creator.sales > 0);
  const topCreators = [...creators]
    .filter((creator) => creator.sales > 0 || creator.orders > 0)
    .sort((left, right) => right.sales - left.sales || right.orders - left.orders)
    .slice(0, 5);
  const trafficCreators = [...creators]
    .filter((creator) => creator.clicks > 0)
    .sort((left, right) => right.clicks - left.clicks || right.sales - left.sales)
    .slice(0, 5);
  const watchCreators = [...creators]
    .filter((creator) => creator.role === "watch")
    .sort((left, right) => right.clicks - left.clicks || left.sales - right.sales)
    .slice(0, 5);

  const contentWinners = (posts as any[])
    .map((post) => {
      const attributionStats = Array.isArray(post.attributions)
        ? post.attributions.reduce(
            (acc: { clicks: number; orders: number; sales: number }, attribution: any) => ({
              clicks: acc.clicks + Number(attribution.clicks ?? 0),
              orders: acc.orders + Number(attribution.ordersCount ?? 0),
              sales: acc.sales + toNumber(attribution.salesAmount)
            }),
            { clicks: 0, orders: 0, sales: 0 }
          )
        : { clicks: 0, orders: 0, sales: 0 };

      return {
        id: post.id,
        creatorName: post.creatorProfile?.displayName ?? post.creatorProfile?.username ?? "Incense",
        platform: post.creatorProfile?.platform ?? "Instagram",
        title: post.caption ?? "Untitled content",
        contentType: post.mediaType ?? "Media",
        postedAt: post.postedAt.toISOString(),
        views: Number(post.viewCount ?? 0),
        likes: Number(post.likeCount ?? 0),
        comments: Number(post.commentsCount ?? 0),
        clicks: attributionStats.clicks,
        orders: Math.max(Number(post.attributedOrders ?? 0), attributionStats.orders),
        sales: Math.max(toNumber(post.attributedSales), attributionStats.sales)
      } satisfies MarketingPlannerInfluencerContent;
    })
    .filter((post) => post.sales > 0 || post.orders > 0 || post.views > 0 || post.likes > 0 || post.comments > 0)
    .sort((left, right) => right.sales - left.sales || right.orders - left.orders || (right.views + right.likes + right.comments) - (left.views + left.likes + left.comments))
    .slice(0, 5);

  const totalOrders = creators.reduce((sum, creator) => sum + creator.orders, 0);
  const totalClicks = creators.reduce((sum, creator) => sum + creator.clicks, 0);
  const dataWarnings: string[] = [];
  const sourceTypes = new Set((attributions as any[]).map((row) => normalizeSource(row.trackingMethod || row.sourceType)).filter(Boolean));

  if (!contentWinners.length) {
    dataWarnings.push(`לא נמצאו פוסטים/רילז מסונכרנים מהחשבון ${BRAND_INSTAGRAM_URL}; כרגע הדירוג נשען בעיקר על קופונים, bg_ref והזמנות.`);
  }

  if (!totalClicks && totalOrders > 0) {
    dataWarnings.push("יש מכירות משפיעניות דרך קופונים, אבל כמעט אין click data. זה אומר שאפשר לדעת מי מכרה, אבל קשה לדעת איזה תוכן הביא את התנועה.");
  }

  if (!sourceTypes.has("bixgrow_link_and_coupon") && !sourceTypes.has("bixgrow_link_only")) {
    dataWarnings.push("רוב הייחוס בחלון הזה נראה coupon-first. כדאי לוודא שהקישורים עם bg_ref מופצים ליוצרות לפני הגל הבא.");
  }

  const scannedButUnrelated = instagramCrawl.affiliateProfiles.filter(
    (profile) => profile.postsScanned > 0 && profile.postsFound === 0
  );
  if (scannedButUnrelated.length) {
    dataWarnings.push(
      `Instagram crawler scanned ${scannedButUnrelated.length} affiliate profile(s), but found no recent posts that mention/tag the brand or their codes.`
    );
  }
  if (instagramCrawl.warnings.length) {
    dataWarnings.push(...instagramCrawl.warnings.slice(0, 2));
  }

  const suggestedActions = buildActions({ topCreators, watchCreators, contentWinners, totalCreators: creators.length });
  const periodLabel = options.periodLabel ?? `${formatInlineDate(previousMonth.start)}-${formatInlineDate(previousMonth.end)}`;
  const summaryLines = [
    `${activeCreators.length} מתוך ${creators.length} יוצרות היו פעילות בחודש הקודם (${periodLabel}); הן יצרו ${formatCurrency(totalSales)} ו-${totalOrders} הזמנות מיוחסות.`,
    topCreators.length
      ? `היוצרות החזקות לסקייל כרגע: ${topCreators.slice(0, 3).map((creator) => `${creator.name} (${formatCurrency(creator.sales)})`).join(", ")}.`
      : "לא נמצאו יוצרות עם מכירות מיוחסות בחודש הקודם, ולכן החודש צריך להתחיל כגל בדיקה ולא כסקייל.",
    trafficCreators.length
      ? `היוצרות שמביאות הכי הרבה תנועה: ${trafficCreators.slice(0, 3).map((creator) => `${creator.name} (${creator.clicks})`).join(", ")}.`
      : "אין עדיין מספיק נתוני click כדי להבדיל בין יוצרות שמביאות תנועה לבין יוצרות שמוכרות דרך קופון בלבד."
  ];

  return {
    source: "affiliate_portal",
    brandInstagramUrl: BRAND_INSTAGRAM_URL,
    periodLabel,
    periodStart: formatDateKey(previousMonth.start),
    periodEnd: formatDateKey(previousMonth.end),
    totalCreators: creators.length,
    activeCreators: activeCreators.length,
    creatorsWithSales: creators.filter((creator) => creator.sales > 0 || creator.orders > 0).length,
    creatorsWithClicks: creators.filter((creator) => creator.clicks > 0).length,
    totalSales: Math.round(totalSales * 100) / 100,
    totalOrders,
    totalClicks,
    topCreators,
    trafficCreators,
    watchCreators,
    contentWinners,
    instagramCrawl,
    suggestedActions,
    summaryLines,
    dataWarnings
  };
}
