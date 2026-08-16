import type {
  MarketingPlannerCustomerVoice,
  MarketingPlannerCustomerVoiceProduct,
  MarketingPlannerCustomerVoiceTopic,
  MarketingPlannerStoreScope
} from "@/lib/domain/marketing-planner-types";
import { getDb } from "@/lib/server/db";

const FLASHY_REVIEWS_API_URL = "https://api.flashy.app/thunder/reviews";
const FLASHY_PAGE_SIZE = 100;
const FLASHY_MAX_PAGES = 4;
const FLASHY_FALLBACK_ACCOUNT_IDS: Record<string, string> = {
  "incenseparfums.myshopify.com": "7762"
};

type FlashyApiReview = {
  id?: number | string | null;
  item_id?: string | number | null;
  name?: string | null;
  review?: string | null;
  stars?: number | string | null;
  verified?: boolean | number | null;
  created_at?: number | string | null;
  product?: Array<{
    id?: string | number | null;
    title?: string | null;
    average_rating?: number | string | null;
  }> | null;
};

type StoreProductRow = {
  shopifyProductId: string;
  title: string;
};

type NormalizedFlashyReview = {
  id: string;
  productId: string;
  productTitle: string;
  text: string;
  stars: number;
  verified: boolean;
  createdAt: Date | null;
  productAverageRating: number | null;
};

type TopicDefinition = {
  key: string;
  label: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
  positiveSummary: string;
  negativeSummary: string;
};

const FLASHY_TOPICS: TopicDefinition[] = [
  {
    key: "scent_quality",
    label: "איכות הניחוח",
    positiveKeywords: ["ריח מושלם", "ניחוח מושלם", "ריח מעולה", "ריח מדהים", "ניחוח מדהים", "ריח נעים", "הריח מושלם", "הניחוח מושלם"],
    negativeKeywords: ["לא אהבתי את הריח", "לא התחברתי לריח", "ריח חלש", "ריח חזק מדי", "לא לטעמי"],
    positiveSummary: "הלקוחות מגיבים טוב מאוד לריח עצמו ולבחירת הניחוחות.",
    negativeSummary: "יש סימנים לפער בין הציפייה לניחוח בפועל לבין מה שחלק מהלקוחות קיבלו."
  },
  {
    key: "longevity",
    label: "עמידות הריח",
    positiveKeywords: ["מחזיק שעות", "נשאר שעות", "עמיד מאוד", "נשאר על הגוף", "מחזיק כל היום", "long lasting"],
    negativeKeywords: ["עובר מהר", "לא מחזיק", "נעלם מהר", "מתנדף מהר", "לא נשאר", "חלש על הגוף"],
    positiveSummary: "העמידות של הריח בולטת לטובה ויכולה להיות זווית מסר שיווקית.",
    negativeSummary: "עמידות הריח חוזרת כנקודת חיכוך, ולכן כדאי לחזק מסרים, טיפים לשימוש, או בחירת מוצרים עמידים יותר."
  },
  {
    key: "compliments",
    label: "מחמאות ואפקט חברתי",
    positiveKeywords: ["מחמאות", "מחמיא", "שאלו אותי", "עצרו אותי", "כולם שאלו", "כולם החמיאו"],
    negativeKeywords: [],
    positiveSummary: "הבושם יוצר אפקט חברתי חיובי, וזה חומר טוב מאוד ליוצרות תוכן, רילז ועדויות לקוח.",
    negativeSummary: ""
  },
  {
    key: "shipping",
    label: "משלוח וזמינות",
    positiveKeywords: ["הגיע מהר", "משלוח מהיר", "הגיע מהר מאוד", "הגיע תוך", "זריז"],
    negativeKeywords: ["משלוח איטי", "איחור", "לא הגיע", "חיכיתי", "עיכוב", "מאוחר מדי"],
    positiveSummary: "חוויית המשלוח נתפסת כמהירה, וזה תומך במסרים של אמינות וקנייה בטוחה.",
    negativeSummary: "יש חיכוך סביב משלוח או זמינות, ולכן צריך לבדוק ציפיות, SLA והמסר באתר."
  },
  {
    key: "packaging",
    label: "אריזה ובקבוק",
    positiveKeywords: ["אריזה יפה", "ארוז יפה", "בקבוק יפה", "מארז יפה", "אריזה מושקעת", "יפהפה"],
    negativeKeywords: ["נשבר", "דלף", "פגום", "אריזה לא טובה", "בקבוק פגום"],
    positiveSummary: "האריזה והנראות תומכות מאוד בחוויית המתנה והפרימיום.",
    negativeSummary: "יש רמזים לבעיית אריזה או בקבוק, וזו נקודה שיכולה לפגוע מאוד בהמרה החוזרת."
  },
  {
    key: "service",
    label: "שירות",
    positiveKeywords: ["שירות מעולה", "שירות טוב", "מענה מהיר", "אדיבים", "יחס מעולה"],
    negativeKeywords: ["לא עונים", "שירות לא טוב", "מענה איטי", "לא חזרו", "לא עזרו"],
    positiveSummary: "השירות נתפס כחזק, וזה נכס אמיתי לשימור לקוחות ולהמלצות מפה לאוזן.",
    negativeSummary: "יש אותות חלשים של בעיית שירות, וכדאי לוודא שמענה מהיר מגובה גם בתקופות קמפיין."
  },
  {
    key: "value",
    label: "תמורה למחיר",
    positiveKeywords: ["שווה", "שווה כל שקל", "מחיר טוב", "תמורה טובה"],
    negativeKeywords: ["יקר", "מחיר גבוה", "לא שווה", "יקר מדי"],
    positiveSummary: "יש תחושה של value טוב, כך שאפשר לדבר יותר בביטחון על איכות מול מחיר.",
    negativeSummary: "המחיר עלול להרגיש גבוה לחלק מהלקוחות, ולכן כדאי להקפיד על framing ברור של הערך."
  }
];

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeReviewText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonRecord(value: unknown) {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getConfiguredFlashyAccountIds() {
  const raw = process.env.FLASHY_ACCOUNT_IDS_JSON?.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key.trim(), String(value ?? "").trim()])
        .filter((entry) => entry[0] && entry[1])
    );
  } catch {
    return {};
  }
}

async function resolveFlashyAccountId(storeScope: MarketingPlannerStoreScope) {
  const configured = getConfiguredFlashyAccountIds();
  if (storeScope.storeId && configured[storeScope.storeId]) {
    return configured[storeScope.storeId];
  }

  if (configured[storeScope.storeDomain]) {
    return configured[storeScope.storeDomain];
  }

  const singleAccountId = process.env.FLASHY_ACCOUNT_ID?.trim();
  if (singleAccountId) {
    return singleAccountId;
  }

  const db = getDb();
  if (db?.platformConnection && storeScope.storeId) {
    const rows = await db.platformConnection.findMany({
      where: {
        storeId: storeScope.storeId,
        platform: { in: ["flashyReviews", "flashy"] }
      },
      take: 2
    });

    for (const row of rows as Array<{ config?: unknown }>) {
      const config = parseJsonRecord(row.config);
      const configuredAccountId = String(config?.accountId ?? "").trim();
      if (configuredAccountId) {
        return configuredAccountId;
      }
    }
  }

  return FLASHY_FALLBACK_ACCOUNT_IDS[storeScope.storeDomain] ?? null;
}

async function getActiveStoreProducts(storeId: string) {
  const db = getDb();
  if (!db?.product) {
    return [] as StoreProductRow[];
  }

  return db.product.findMany({
    where: {
      storeId,
      status: "ACTIVE"
    },
    select: {
      shopifyProductId: true,
      title: true
    },
    orderBy: { updatedAt: "desc" },
    take: 250
  }) as Promise<StoreProductRow[]>;
}

async function fetchFlashyReviewsPage(accountId: string, page: number) {
  const params = new URLSearchParams({
    account_id: accountId,
    limit: String(FLASHY_PAGE_SIZE),
    page: String(page)
  });

  const response = await fetch(`${FLASHY_REVIEWS_API_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Flashy reviews request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.data?.results) ? payload.data.results as FlashyApiReview[] : [];
  return results;
}

function normalizeFlashyReview(review: FlashyApiReview, titleByProductId: Map<string, string>) {
  const linkedProduct = Array.isArray(review.product) && review.product.length ? review.product[0] : null;
  const rawProductId = String(linkedProduct?.id ?? review.item_id ?? "").trim();
  if (!/^\d+$/.test(rawProductId)) {
    return null;
  }

  const stars = toFiniteNumber(review.stars) ?? 0;
  const text = normalizeReviewText(review.review);
  const productTitle = String(linkedProduct?.title ?? titleByProductId.get(rawProductId) ?? "").trim() || `Product ${rawProductId}`;
  const createdAtSeconds = toFiniteNumber(review.created_at);

  return {
    id: String(review.id ?? `${rawProductId}-${text.slice(0, 16)}`),
    productId: rawProductId,
    productTitle,
    text,
    stars,
    verified: review.verified === true || Number(review.verified) === 1,
    createdAt: createdAtSeconds ? new Date(createdAtSeconds * 1000) : null,
    productAverageRating: toFiniteNumber(linkedProduct?.average_rating)
  } satisfies NormalizedFlashyReview;
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

function buildTopics(reviews: NormalizedFlashyReview[]) {
  const minimumMentions = reviews.length >= 18 ? 2 : 1;
  const positiveTopics: MarketingPlannerCustomerVoiceTopic[] = [];
  const negativeTopics: MarketingPlannerCustomerVoiceTopic[] = [];

  for (const definition of FLASHY_TOPICS) {
    let positiveMentions = 0;
    let negativeMentions = 0;

    for (const review of reviews) {
      const text = review.text.toLowerCase();
      const positiveHit = includesAny(text, definition.positiveKeywords.map((keyword) => keyword.toLowerCase()));
      const negativeHit = includesAny(text, definition.negativeKeywords.map((keyword) => keyword.toLowerCase()));

      if (positiveHit) positiveMentions += 1;
      if (negativeHit) negativeMentions += 1;

      if (!positiveHit && !negativeHit && definition.key === "scent_quality" && review.stars >= 5 && includesAny(text, ["ריח", "ניחוח", "scent", "smell"])) {
        positiveMentions += 1;
      }
    }

    if (positiveMentions >= minimumMentions) {
      positiveTopics.push({
        key: definition.key,
        label: definition.label,
        sentiment: "positive",
        mentions: positiveMentions,
        summary: definition.positiveSummary
      });
    }

    if (negativeMentions >= minimumMentions) {
      negativeTopics.push({
        key: definition.key,
        label: definition.label,
        sentiment: "negative",
        mentions: negativeMentions,
        summary: definition.negativeSummary
      });
    }
  }

  positiveTopics.sort((left, right) => right.mentions - left.mentions || left.label.localeCompare(right.label, "he"));
  negativeTopics.sort((left, right) => right.mentions - left.mentions || left.label.localeCompare(right.label, "he"));
  return {
    positiveTopics: positiveTopics.slice(0, 3),
    negativeTopics: negativeTopics.slice(0, 3)
  };
}

function buildTopProducts(reviews: NormalizedFlashyReview[]) {
  const byProduct = new Map<string, { title: string; reviewCount: number; ratingTotal: number; ratingCount: number; productAverageRating: number | null }>();

  for (const review of reviews) {
    const current = byProduct.get(review.productId) ?? {
      title: review.productTitle,
      reviewCount: 0,
      ratingTotal: 0,
      ratingCount: 0,
      productAverageRating: review.productAverageRating
    };

    current.reviewCount += 1;
    current.ratingTotal += review.stars;
    current.ratingCount += review.stars > 0 ? 1 : 0;
    if (current.productAverageRating == null && review.productAverageRating != null) {
      current.productAverageRating = review.productAverageRating;
    }
    byProduct.set(review.productId, current);
  }

  return Array.from(byProduct.entries())
    .sort((left, right) => right[1].reviewCount - left[1].reviewCount || right[1].ratingTotal - left[1].ratingTotal)
    .slice(0, 4)
    .map(([shopifyProductId, stats]) => ({
      shopifyProductId,
      title: stats.title,
      sampleReviewCount: stats.reviewCount,
      averageRating: stats.productAverageRating ?? (stats.ratingCount ? stats.ratingTotal / stats.ratingCount : null)
    })) satisfies MarketingPlannerCustomerVoiceProduct[];
}

function buildSummaryLines(
  sampledReviews: number,
  sampledProducts: number,
  averageRating: number | null,
  verifiedShare: number,
  positiveTopics: MarketingPlannerCustomerVoiceTopic[],
  negativeTopics: MarketingPlannerCustomerVoiceTopic[],
  topProducts: MarketingPlannerCustomerVoiceProduct[]
) {
  const lines = [
    `נדגמו ${sampledReviews} ביקורות Flashy על ${sampledProducts} מוצרים פעילים. דירוג המדגם הוא ${averageRating != null ? averageRating.toFixed(1) : "לא זמין"} ו-${formatPercent(verifiedShare)} מהביקורות מסומנות כמאומתות.`
  ];

  if (positiveTopics.length) {
    lines.push(`נקודות החוזק החוזרות הן ${positiveTopics.map((topic) => topic.label).join(", ")}.`);
  }

  if (negativeTopics.length) {
    lines.push(`נקודות החיכוך המרכזיות כרגע הן ${negativeTopics.map((topic) => topic.label).join(", ")}.`);
  } else {
    lines.push("לא בלטו כרגע תלונות חוזרות חזקות במדגם הביקורות האחרון.");
  }

  if (topProducts.length) {
    lines.push(`המוצרים שעליהם הלקוחות הכי מדברים כרגע הם ${topProducts.slice(0, 3).map((product) => product.title).join(", ")}.`);
  }

  return lines.slice(0, 4);
}

export async function buildMarketingPlannerCustomerVoice(
  storeScope: MarketingPlannerStoreScope
): Promise<MarketingPlannerCustomerVoice | null> {
  if (!storeScope.connected || !storeScope.storeId) {
    return null;
  }

  const accountId = await resolveFlashyAccountId(storeScope);
  if (!accountId) {
    return null;
  }

  const products = await getActiveStoreProducts(storeScope.storeId);
  if (!products.length) {
    return {
      source: "flashy",
      accountId,
      sampledReviews: 0,
      sampledProducts: 0,
      averageRating: null,
      verifiedShare: 0,
      positiveTopics: [],
      negativeTopics: [],
      topProducts: [],
      summaryLines: ["לא נמצאו מוצרים פעילים בחנות לצורך הצלבת ביקורות Flashy."]
    };
  }

  const titleByProductId = new Map(products.map((product) => [product.shopifyProductId, product.title]));
  const activeProductIds = new Set(titleByProductId.keys());
  const reviewMap = new Map<string, NormalizedFlashyReview>();

  for (let page = 1; page <= FLASHY_MAX_PAGES; page += 1) {
    const pageResults = await fetchFlashyReviewsPage(accountId, page);
    for (const rawReview of pageResults) {
      const normalized = normalizeFlashyReview(rawReview, titleByProductId);
      if (!normalized || !activeProductIds.has(normalized.productId)) continue;
      reviewMap.set(normalized.id, normalized);
    }

    if (pageResults.length < FLASHY_PAGE_SIZE) {
      break;
    }
  }

  const reviews = Array.from(reviewMap.values())
    .sort((left, right) => {
      const rightTime = right.createdAt?.getTime() ?? 0;
      const leftTime = left.createdAt?.getTime() ?? 0;
      return rightTime - leftTime;
    })
    .slice(0, 200);

  if (!reviews.length) {
    return {
      source: "flashy",
      accountId,
      sampledReviews: 0,
      sampledProducts: 0,
      averageRating: null,
      verifiedShare: 0,
      positiveTopics: [],
      negativeTopics: [],
      topProducts: [],
      summaryLines: ["חיבור Flashy קיים, אבל לא נמצאו כרגע ביקורות פעילות למוצרים הפעילים של החנות."]
    };
  }

  const averageRating = reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length;
  const verifiedShare = (reviews.filter((review) => review.verified).length / reviews.length) * 100;
  const { positiveTopics, negativeTopics } = buildTopics(reviews);
  const topProducts = buildTopProducts(reviews);

  return {
    source: "flashy",
    accountId,
    sampledReviews: reviews.length,
    sampledProducts: new Set(reviews.map((review) => review.productId)).size,
    averageRating,
    verifiedShare,
    positiveTopics,
    negativeTopics,
    topProducts,
    summaryLines: buildSummaryLines(
      reviews.length,
      new Set(reviews.map((review) => review.productId)).size,
      averageRating,
      verifiedShare,
      positiveTopics,
      negativeTopics,
      topProducts
    )
  };
}
