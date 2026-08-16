import ExcelJS from "exceljs";
import { HebrewCalendar } from "@hebcal/core";
import type {
  MarketingBrand,
  MarketingCampaign,
  MarketingPlannerCustomerVoice,
  MarketingPlannerDiscountDiagnostic,
  MarketingPlannerDirection,
  MarketingPlannerExecutionMode,
  MarketingPlannerFocus,
  MarketingPlannerInfluencerIntelligence,
  MarketingPlannerInsights,
  MarketingPlannerLocale,
  MarketingPlannerMetaAds,
  MarketingPlannerPreviousMonthBaseline,
  MarketingPlannerRequest,
  MarketingPlannerResult,
  MarketingRecommendation,
  MarketingPlannerStoreScope,
  MarketingSpecialDay
} from "@/lib/domain/marketing-planner-types";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { toNumber } from "@/lib/server/numbers";
import { isAnalyticsDiscountCode, shouldIgnoreOrderForAnalytics } from "@/lib/server/analytics-order-rules";
import { buildMarketingPlannerCustomerVoice } from "@/lib/services/flashy-review-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { saveMarketingPlannerLearnings } from "@/lib/services/marketing-planner-learning-service";
import { buildMarketingPlannerInfluencerIntelligence } from "@/lib/services/marketing-planner-influencer-service";
import { getActiveShopifyCodeDiscountRules, type ShopifyPlannerDiscountRule } from "@/lib/services/marketing-planner-shopify-service";
import { buildMarketingPlannerMetaAds } from "@/lib/services/meta-ads-service";

const BASE_ROW_LABELS = [
  "ימים מיוחדים",
  "חלוקת דוגמיות / גלויות",
  "סיפור ראשי",
  "קידום ממומן",
  "אתר",
  "הטבות אונליין",
  "משפיעניות",
  "מהלך טיק טוק",
  "יוצרות תוכן + אפיליאציה",
  "ניוזלטר",
  "סמס",
  "יחץ",
  "הפקות / צילומי סושיאל",
  "פוסט / ריל - סושיאל אורגני",
  "סיפור תוכן סטורי - סושיאל אורגני",
  "סופר פארם",
  "מגזר הערבי",
  "דיוטי פרי",
  "הטבות אופליין",
  "קמפיין יומנז",
  "מיתוגי ממומן (מטא/יוטיוב/טיקטוק)",
  "קהל חדש",
  "מטא ממומן"
] as const;

const ROW_FILL_COLORS: Record<string, string> = {
  "ימים מיוחדים": "FDE68A",
  "חלוקת דוגמיות / גלויות": "F5D0FE",
  "סיפור ראשי": "C7D2FE",
  "קידום ממומן": "BFDBFE",
  "אתר": "BAE6FD",
  "הטבות אונליין": "A7F3D0",
  "משפיעניות": "FBCFE8",
  "מהלך טיק טוק": "F9A8D4",
  "יוצרות תוכן + אפיליאציה": "DDD6FE",
  "ניוזלטר": "FEF3C7",
  "סמס": "FECACA",
  "יחץ": "E5E7EB",
  "הפקות / צילומי סושיאל": "FDE68A",
  "פוסט / ריל - סושיאל אורגני": "BBF7D0",
  "סיפור תוכן סטורי - סושיאל אורגני": "BFDBFE",
  "סופר פארם": "FBCFE8",
  "מגזר הערבי": "A7F3D0",
  "דיוטי פרי": "C4B5FD",
  "הטבות אופליין": "FDE68A",
  "קמפיין יומנז": "F5D0FE",
  "מיתוגי ממומן (מטא/יוטיוב/טיקטוק)": "C7D2FE",
  "קהל חדש": "DBEAFE",
  "מטא ממומן": "BFDBFE"
};

const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;
const HEBREW_MONTH_NAMES = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"] as const;
const HOLIDAY_ROW = "ימים מיוחדים";

const CHANNEL_RULES = [
  { rowLabel: "ימים מיוחדים", keywords: ["פסח", "מימונה", "יום השואה", "יום הזיכרון", "יום העצמאות", "רמדאן", "עיד", "יום אהבה", "valentine", "black friday", "cyber monday", "christmas", "holiday", "חג", "special day"] },
  { rowLabel: "חלוקת דוגמיות / גלויות", keywords: ["דוגמיות", "דוגמית", "גלויה", "גלויות", "postcard", "sample"] },
  { rowLabel: "סיפור ראשי", keywords: ["סיפור ראשי", "hero", "קמפיין ראשי", "main story", "main campaign"] },
  { rowLabel: "קידום ממומן", keywords: ["קידום ממומן", "קוד", "coupon", "promo", "promotion", "discount", "מבצע", "הנחה"] },
  { rowLabel: "אתר", keywords: ["אתר", "homepage", "hero banner", "banner", "popup", "pop-up", "cart", "upsell", "landing page", "דף נחיתה"] },
  { rowLabel: "הטבות אונליין", keywords: ["הטבות אונליין", "bundle", "מארז", "online offer"] },
  { rowLabel: "משפיעניות", keywords: ["משפיענית", "משפיעניות", "influencer", "creator code"] },
  { rowLabel: "מהלך טיק טוק", keywords: ["טיק טוק", "טיקטוק", "tiktok", "tik tok"] },
  { rowLabel: "יוצרות תוכן + אפיליאציה", keywords: ["יוצרות תוכן", "ugc", "אפיליאציה", "affiliate", "creator"] },
  { rowLabel: "ניוזלטר", keywords: ["ניוזלטר", "newsletter", "email", "mailing", "אימייל"] },
  { rowLabel: "סמס", keywords: ["סמס", "sms"] },
  { rowLabel: "יחץ", keywords: ["יחצ", "יח\"צ", "press", "pr", "מגזין"] },
  { rowLabel: "הפקות / צילומי סושיאל", keywords: ["הפקה", "הפקות", "צילומים", "shoot", "production"] },
  { rowLabel: "סיפור תוכן סטורי - סושיאל אורגני", keywords: ["סטורי", "stories", "story frame"] },
  { rowLabel: "פוסט / ריל - סושיאל אורגני", keywords: ["ריל", "reel", "פוסט", "organic social", "סושיאל אורגני"] },
  { rowLabel: "סופר פארם", keywords: ["סופר פארם", "super-pharm", "super pharm"] },
  { rowLabel: "מגזר הערבי", keywords: ["מגזר הערבי", "arab", "arabic"] },
  { rowLabel: "דיוטי פרי", keywords: ["דיוטי פרי", "duty free"] },
  { rowLabel: "הטבות אופליין", keywords: ["אופליין", "offline", "store promo", "retail"] },
  { rowLabel: "קמפיין יומנז", keywords: ["יומנז", "humanz"] },
  { rowLabel: "מיתוגי ממומן (מטא/יוטיוב/טיקטוק)", keywords: ["מיתוגי", "brand awareness", "youtube", "יוטיוב", "reach campaign"] },
  { rowLabel: "קהל חדש", keywords: ["קהל חדש", "prospecting", "cold audience", "acquisition"] },
  { rowLabel: "מטא ממומן", keywords: ["מטא", "meta", "facebook ads", "instagram ads"] }
] as const;

const HIGH_VALUE_EVENT_PATTERNS = [
  "פסח",
  "ראש השנה",
  "שבועות",
  "פורים",
  "יום אהבה",
  "Black Friday",
  "Cyber Monday",
  "עיד אל-פיטר",
  "עיד אל-אדחא",
  "רמדאן"
];

const MEMORIAL_EVENT_PATTERNS = ["יום השואה", "יום הזיכרון"];

const EXPLICIT_ROW_PREFIXES = [
  { rowLabel: "סיפור ראשי", prefixes: ["סיפור ראשי", "hero campaign", "main story"] },
  { rowLabel: "קידום ממומן", prefixes: ["קידום ממומן", "paid", "promo"] },
  { rowLabel: "אתר", prefixes: ["אתר", "site", "homepage", "landing page"] },
  { rowLabel: "הטבות אונליין", prefixes: ["הטבות אונליין"] },
  { rowLabel: "משפיעניות", prefixes: ["משפיעניות", "משפיענית", "influencer"] },
  { rowLabel: "מהלך טיק טוק", prefixes: ["מהלך טיק טוק", "טיקטוק", "tiktok", "tik tok"] },
  { rowLabel: "יוצרות תוכן + אפיליאציה", prefixes: ["יוצרות תוכן", "ugc", "affiliate", "creator"] },
  { rowLabel: "ניוזלטר", prefixes: ["ניוזלטר", "newsletter", "email"] },
  { rowLabel: "סמס", prefixes: ["סמס", "sms"] },
  { rowLabel: "יחץ", prefixes: ["יחץ", "pr", "press"] },
  { rowLabel: "פוסט / ריל - סושיאל אורגני", prefixes: ["פוסט", "ריל", "post", "reel"] },
  { rowLabel: "סיפור תוכן סטורי - סושיאל אורגני", prefixes: ["סטורי", "story"] },
  { rowLabel: "סופר פארם", prefixes: ["סופר פארם", "super-pharm", "super pharm"] },
  { rowLabel: "מגזר הערבי", prefixes: ["מגזר הערבי", "arab"] },
  { rowLabel: "דיוטי פרי", prefixes: ["דיוטי פרי", "duty free"] },
  { rowLabel: "הטבות אופליין", prefixes: ["הטבות אופליין", "offline"] },
  { rowLabel: "קמפיין יומנז", prefixes: ["יומנז", "humanz"] },
  { rowLabel: "מיתוגי ממומן (מטא/יוטיוב/טיקטוק)", prefixes: ["מיתוגי ממומן", "brand awareness"] },
  { rowLabel: "קהל חדש", prefixes: ["קהל חדש", "prospecting"] },
  { rowLabel: "מטא ממומן", prefixes: ["מטא ממומן", "meta ads"] }
] as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function detectPlannerLocale(text: string): MarketingPlannerLocale {
  const hebrewMatches = text.match(/[\u0590-\u05FF]/g) ?? [];
  const latinMatches = text.match(/[A-Za-z]/g) ?? [];

  if (hebrewMatches.length && !latinMatches.length) return "he";
  if (latinMatches.length && !hebrewMatches.length) return "en";
  if (hebrewMatches.length >= latinMatches.length) return "mixed";
  return "en";
}

function getPlannerDirection(locale: MarketingPlannerLocale): MarketingPlannerDirection {
  return locale === "en" ? "ltr" : "rtl";
}

function isHebrewDirection(direction: MarketingPlannerDirection) {
  return direction === "rtl";
}

function getCellHorizontalAlignment(direction: MarketingPlannerDirection) {
  return direction === "rtl" ? "right" : "left";
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWorkbookDate(value: Date) {
  const day = `${value.getDate()}`.padStart(2, "0");
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  return `${day}/${month}/${value.getFullYear()}`;
}

function formatInlineDate(value: Date) {
  return `${value.getDate()}.${value.getMonth() + 1}`;
}

function buildSheetName(planningDate: Date) {
  return `${HEBREW_MONTH_NAMES[planningDate.getMonth()]} ${planningDate.getFullYear()}`;
}

function getPlannerFocus(focusMode?: MarketingPlannerFocus | null): MarketingPlannerFocus {
  return focusMode ?? "balanced";
}

function getPlannerExecutionMode(mode?: MarketingPlannerExecutionMode | null): MarketingPlannerExecutionMode {
  return mode ?? "recommend_only";
}

function getFocusLabel(focusMode: MarketingPlannerFocus) {
  switch (focusMode) {
    case "site":
      return "Site / אתר";
    case "influencers":
      return "Influencers / משפיעניות";
    case "paid_ads":
      return "Paid Ads / פרסום ממומן";
    case "retention":
      return "Retention / שימור";
    default:
      return "Balanced / מאוזן";
  }
}

function getPreviousMonthBounds(planningStart: Date) {
  const start = new Date(planningStart.getFullYear(), planningStart.getMonth() - 1, 1);
  const end = new Date(planningStart.getFullYear(), planningStart.getMonth(), 0);
  return { start, end, label: buildSheetName(start) };
}

function formatPlannerCurrency(value: number) {
  return `₪${Math.round(value).toLocaleString("en-US")}`;
}

function formatPlannerPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export async function buildStoreScope(storeId?: string | null): Promise<MarketingPlannerStoreScope> {
  try {
    const { store } = await getGrowthAgentStoreContext(storeId ?? undefined);
    return {
      storeId: store.id,
      storeName: store.name,
      storeDomain: store.domain,
      connected: store.connected
    };
  } catch {
    return {
      storeId: null,
      storeName: "Planner preview",
      storeDomain: "not-connected",
      connected: false
    };
  }
}

export async function buildPreviousMonthBaseline(
  storeScope: MarketingPlannerStoreScope,
  planningStart: Date
): Promise<MarketingPlannerPreviousMonthBaseline | null> {
  if (!storeScope.connected || !storeScope.storeId) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  const previousMonth = getPreviousMonthBounds(planningStart);
  const [orderRows, historyRows] = await Promise.all([
    db.order.findMany({
      where: {
        storeId: storeScope.storeId,
        createdAt: {
          gte: previousMonth.start,
          lte: previousMonth.end
        }
      },
      include: {
        lineItems: true,
        discountUsages: true
      },
      orderBy: { createdAt: "asc" }
    }),
    db.order.findMany({
      where: {
        storeId: storeScope.storeId,
        customerId: { not: null },
        createdAt: { lte: previousMonth.end }
      },
      select: {
        id: true,
        customerId: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const filteredOrders = orderRows.filter((order: any) => !shouldIgnoreOrderForAnalytics(order));
  const customerHistory = new Map<string, string[]>();
  for (const order of historyRows) {
    if (!order.customerId) continue;
    const existing = customerHistory.get(order.customerId) ?? [];
    existing.push(order.id);
    customerHistory.set(order.customerId, existing);
  }

  if (!filteredOrders.length) {
    return {
      monthLabel: previousMonth.label,
      revenue: 0,
      orders: 0,
      averageOrderValue: 0,
      discountRate: 0,
      refundRate: 0,
      returningCustomerRate: 0,
      topProducts: [],
      topDiscountCodes: [],
      summaryLines: [
        `לא נמצאו הזמנות בחודש הקודם (${previousMonth.label}) עבור ${storeScope.storeDomain}.`,
        "כדאי להתייחס לבריף הזה כחודש בנייה ולא כחודש אופטימיזציה על בסיס ביקוש קיים."
      ]
    };
  }

  let revenue = 0;
  let discounts = 0;
  let refunds = 0;
  let returningOrders = 0;
  const productRevenue = new Map<string, number>();
  const discountPerformance = new Map<string, { orders: number; amount: number }>();

  for (const order of filteredOrders) {
    revenue += toNumber(order.totalPrice);
    discounts += toNumber(order.totalDiscounts);
    refunds += toNumber(order.totalRefunds);

    const history = order.customerId ? customerHistory.get(order.customerId) ?? [] : [];
    if (history.indexOf(order.id) > 0) {
      returningOrders += 1;
    }

    for (const item of order.lineItems) {
      const title = String(item.title ?? "").trim() || "Unknown product";
      const lineRevenue = Math.max(0, toNumber(item.lineSubtotal) - toNumber(item.lineDiscountAmount));
      productRevenue.set(title, (productRevenue.get(title) ?? 0) + lineRevenue);
    }

    for (const usage of order.discountUsages) {
      if (!isAnalyticsDiscountCode(usage.code)) continue;
      const current = discountPerformance.get(usage.code) ?? { orders: 0, amount: 0 };
      current.orders += 1;
      current.amount += toNumber(usage.amount);
      discountPerformance.set(usage.code, current);
    }
  }

  const topProducts = Array.from(productRevenue.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([title]) => title);

  const topDiscountCodes = Array.from(discountPerformance.entries())
    .sort((left, right) => right[1].orders - left[1].orders || right[1].amount - left[1].amount)
    .slice(0, 3)
    .map(([code, stats]) => `${code} (${stats.orders})`);

  const averageOrderValue = filteredOrders.length ? revenue / filteredOrders.length : 0;
  // Denominator is GROSS sales (pre-discount, pre-refund) — matches the
  // Shopify Admin Sales report definition. Previously divided by net
  // revenue (post-discount), so a ₪100 order with ₪10 discount read
  // 11.1% instead of the true 10%.
  const grossDiscountBase = revenue + discounts;
  const grossRefundBase = revenue + refunds;
  const discountRate = grossDiscountBase ? (discounts / grossDiscountBase) * 100 : 0;
  const refundRate = grossRefundBase ? (refunds / grossRefundBase) * 100 : 0;
  const returningCustomerRate = filteredOrders.length ? (returningOrders / filteredOrders.length) * 100 : 0;

  const summaryLines = [
    `בחודש הקודם (${previousMonth.label}) החנות עשתה ${formatPlannerCurrency(revenue)} מ-${filteredOrders.length} הזמנות, עם AOV של ${formatPlannerCurrency(averageOrderValue)}.`,
    `שיעור ההנחה בפועל היה ${formatPlannerPercent(discountRate)} ושיעור ההחזרים ${formatPlannerPercent(refundRate)}. שיעור הזמנות חוזרות: ${formatPlannerPercent(returningCustomerRate)}.`
  ];

  if (topProducts.length) {
    summaryLines.push(`המוצרים הבולטים בחודש הקודם: ${topProducts.join(", ")}.`);
  }

  if (topDiscountCodes.length) {
    summaryLines.push(`קודי ההנחה שעבדו בפועל: ${topDiscountCodes.join(", ")}.`);
  } else {
    summaryLines.push("בחודש הקודם לא בלט קוד הנחה משמעותי, כך שאפשר לשמור על מבנה הצעה פשוט יותר.");
  }

  return {
    monthLabel: previousMonth.label,
    revenue,
    orders: filteredOrders.length,
    averageOrderValue,
    discountRate,
    refundRate,
    returningCustomerRate,
    topProducts,
    topDiscountCodes,
    summaryLines
  };
}

function getMonthBounds(planningMonth: string) {
  const match = planningMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new AppError("בחרו חודש בפורמט תקין לפני יצירת הגאנט.", 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) {
    throw new AppError("החודש שנבחר אינו תקין.", 400);
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { year, month, start, end };
}

function enumerateMonthDates(start: Date, end: Date) {
  const dates: Date[] = [];
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(new Date(current));
  }
  return dates;
}

function clampDateToMonth(value: Date, monthStart: Date, monthEnd: Date) {
  if (value < monthStart) return new Date(monthStart);
  if (value > monthEnd) return new Date(monthEnd);
  return value;
}

function buildDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

function cleanSegment(value: string) {
  return normalizeWhitespace(value)
    .replace(/[•▪●◦]/g, "\n")
    .replace(/[ \t]*\-[ \t]+/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

function stripLeadingPlannerDate(segment: string) {
  return segment
    .replace(/^\s*\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\s*(?:[-–]\s*\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)?\s*/u, "")
    .replace(/^[:\-–\s]+/u, "")
    .trim();
}

function splitBriefSegments(briefText: string) {
  const normalized = cleanSegment(briefText);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const segments: string[] = [];
  let current = "";

  const startsNewSegment = (line: string) => {
    if (/^\d{1,2}[./-]\d{1,2}/.test(line)) return true;
    if (/^\d{1,2}\s*[-–]\s*\d{1,2}(?![./]\d)/.test(line)) return true;
    if (/^[A-Za-zא-ת].{0,40}:/.test(line)) return true;
    if (
      /\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/.test(line)
      && !/^(?:עד|בתוקף|תקף|קוד|קופון|ברכישת|בקניית|בין|החל מ)/.test(line)
      && /^[A-Za-zא-ת"'\-\\/0-9\s]{1,42}\d{1,2}[./]\d{1,2}/.test(line)
    ) {
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (!current) {
      current = line;
      continue;
    }

    if (startsNewSegment(line)) {
      segments.push(current.trim());
      current = line;
      continue;
    }

    current = `${current}\n${line}`.trim();
  }

  if (current) {
    segments.push(current.trim());
  }

  return Array.from(new Set(segments.filter(Boolean)));
}

function uppercaseCouponCodes(text: string) {
  return text.replace(/\b[a-z]{2,}[a-z0-9]{0,10}\b/gi, (token) => {
    if (!/[a-z]/i.test(token) || token.length < 3) return token;
    if (/^(meta|tiktok|instagram|email|story|site|hero)$/i.test(token)) return token;
    return token.toUpperCase();
  });
}

function stripHebrewMarks(value: string) {
  return value.replace(/[\u0591-\u05C7]/g, "");
}

function getHolidayFamily(label: string) {
  if (label.includes("ערב פסח")) return "ערב פסח";
  if (label.includes("פסח")) return "פסח";
  if (label.includes("חנוכה")) return "חנוכה";
  if (label.includes("סוכות")) return "סוכות";
  if (label.includes("שבועות")) return "שבועות";
  if (label.includes("פורים")) return "פורים";
  if (label.includes("ראש השנה")) return "ראש השנה";
  if (label.includes("יום כיפור")) return "יום כיפור";
  if (label.includes("יום השואה")) return "יום השואה";
  if (label.includes("יום הזיכרון")) return "יום הזיכרון";
  if (label.includes("יום העצמאות")) return "יום העצמאות";
  if (label.includes("רמדאן")) return "רמדאן";
  if (label.includes("עיד אל-פיטר")) return "עיד אל-פיטר";
  if (label.includes("עיד אל-אדחא")) return "עיד אל-אדחא";
  if (label.includes("Black Friday")) return "Black Friday";
  if (label.includes("Cyber Monday")) return "Cyber Monday";
  if (label.includes("יום אהבה")) return "יום אהבה";
  return label;
}

function detectCouponCodes(text: string) {
  const matches = uppercaseCouponCodes(text).match(/\b[A-Z][A-Z0-9]{2,11}\b/g) ?? [];
  return Array.from(new Set(matches.filter((item) => /\d/.test(item) || /OFF|SALE|GIFT|BEST|SPRING|VIP|LOVE|NEW/i.test(item))));
}

function parseNumericDate(day: number, month: number, year: number) {
  if (!day || !month || !year) return null;
  const date = buildDate(year, month, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Map Hebrew month names to JS month numbers (1-based)
const HEBREW_MONTH_NUMBER: Record<string, number> = {
  "ינואר": 1, "פברואר": 2, "מרץ": 3, "מרס": 3, "אפריל": 4,
  "מאי": 5, "יוני": 6, "יולי": 7, "אוגוסט": 8, "ספטמבר": 9,
  "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12
};

function parseHebrewMonthDay(segment: string, monthStart: Date, monthEnd: Date) {
  // Matches "ה1 ביולי", "1 ביולי", "1-15 ביולי", "ה1-15 ביולי"
  const hebrewMonthNames = Object.keys(HEBREW_MONTH_NUMBER).join("|");
  const re = new RegExp(
    `(?:ה-?)?(\\d{1,2})\\s*(?:[-–]\\s*(\\d{1,2}))?\\s*ב?(${hebrewMonthNames})`,
    "u"
  );
  const m = segment.match(re);
  if (!m) return null;

  const monthName = m[3];
  const hebrewMonth = HEBREW_MONTH_NUMBER[monthName];
  if (!hebrewMonth) return null;

  const year = monthStart.getFullYear();
  const d1 = Number(m[1]);
  const d2 = m[2] ? Number(m[2]) : d1;

  const start = parseNumericDate(d1, hebrewMonth, year);
  const end = parseNumericDate(d2, hebrewMonth, year);
  if (!start || !end) return null;

  const clampedStart = clampDateToMonth(start, monthStart, monthEnd);
  const clampedEnd = clampDateToMonth(end, monthStart, monthEnd);
  return clampedStart <= clampedEnd
    ? { start: clampedStart, end: clampedEnd }
    : { start: clampedEnd, end: clampedStart };
}

function parseIsoDateRange(segment: string, monthStart: Date, monthEnd: Date) {
  // Matches ISO dates: "2026-07-01", "2026-07-01 - 2026-07-15", "2026-07-01 עד 2026-07-15"
  const iso = segment.match(/(\d{4})-(\d{2})-(\d{2})(?:\s*(?:עד|[-–])\s*(\d{4})-(\d{2})-(\d{2}))?/);
  if (!iso) return null;

  const start = parseNumericDate(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  if (!start) return null;

  const end = iso[4]
    ? parseNumericDate(Number(iso[6]), Number(iso[5]), Number(iso[4]))
    : start;
  if (!end) return null;

  const clampedStart = clampDateToMonth(start, monthStart, monthEnd);
  const clampedEnd = clampDateToMonth(end, monthStart, monthEnd);
  return clampedStart <= clampedEnd
    ? { start: clampedStart, end: clampedEnd }
    : { start: clampedEnd, end: clampedStart };
}

function parseDateRange(segment: string, monthStart: Date, monthEnd: Date) {
  // 1. ISO dates first (most unambiguous)
  const isoResult = parseIsoDateRange(segment, monthStart, monthEnd);
  if (isoResult) return isoResult;

  // 2. Hebrew month name with day(s): "1-15 ביולי", "ה1 ביולי"
  const hebrewMonthResult = parseHebrewMonthDay(segment, monthStart, monthEnd);
  if (hebrewMonthResult) return hebrewMonthResult;

  // 3. Explicit numeric range with . or / separator: "01.07 - 15.07", "1/7 עד 15/7"
  const explicitRange = segment.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:עד|ל|[-–])\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (explicitRange) {
    const startYear = explicitRange[3] ? normalizeYear(Number(explicitRange[3])) : monthStart.getFullYear();
    const endYear = explicitRange[6] ? normalizeYear(Number(explicitRange[6])) : startYear;
    const start = parseNumericDate(Number(explicitRange[1]), Number(explicitRange[2]), startYear);
    const end = parseNumericDate(Number(explicitRange[4]), Number(explicitRange[5]), endYear);
    if (start && end) {
      const clampedStart = clampDateToMonth(start, monthStart, monthEnd);
      const clampedEnd = clampDateToMonth(end, monthStart, monthEnd);
      return clampedStart <= clampedEnd
        ? { start: clampedStart, end: clampedEnd }
        : { start: clampedEnd, end: clampedStart };
    }
  }

  // 4. Same-month range with only day numbers: "1-15", "5–20"
  const sameMonthRange = segment.match(/(?<![./]\d)(\d{1,2})\s*[-–]\s*(\d{1,2})(?![./]\d)/);
  if (sameMonthRange) {
    const start = buildDate(monthStart.getFullYear(), monthStart.getMonth() + 1, Number(sameMonthRange[1]));
    const end = buildDate(monthStart.getFullYear(), monthStart.getMonth() + 1, Number(sameMonthRange[2]));
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const clampedStart = clampDateToMonth(start, monthStart, monthEnd);
      const clampedEnd = clampDateToMonth(end, monthStart, monthEnd);
      return clampedStart <= clampedEnd
        ? { start: clampedStart, end: clampedEnd }
        : { start: clampedEnd, end: clampedStart };
    }
  }

  // 5. Leading date with "until": "01.07 עד 15.07"
  const leadingDateWithUntil = segment.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?.*?עד\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (leadingDateWithUntil) {
    const startYear = leadingDateWithUntil[3] ? normalizeYear(Number(leadingDateWithUntil[3])) : monthStart.getFullYear();
    const endYear = leadingDateWithUntil[6] ? normalizeYear(Number(leadingDateWithUntil[6])) : startYear;
    const start = parseNumericDate(Number(leadingDateWithUntil[1]), Number(leadingDateWithUntil[2]), startYear);
    const end = parseNumericDate(Number(leadingDateWithUntil[4]), Number(leadingDateWithUntil[5]), endYear);
    if (start && end) {
      const clampedStart = clampDateToMonth(start, monthStart, monthEnd);
      const clampedEnd = clampDateToMonth(end, monthStart, monthEnd);
      return clampedStart <= clampedEnd
        ? { start: clampedStart, end: clampedEnd }
        : { start: clampedEnd, end: clampedStart };
    }
  }

  // 6. Single short date: "ב1.7", "1.7", "מ01.07"
  const shortDate = segment.match(/(?:ב-|בין |מ-)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (shortDate) {
    const year = shortDate[3] ? normalizeYear(Number(shortDate[3])) : monthStart.getFullYear();
    const date = parseNumericDate(Number(shortDate[1]), Number(shortDate[2]), year);
    if (date) {
      const clamped = clampDateToMonth(date, monthStart, monthEnd);
      return { start: clamped, end: clamped };
    }
  }

  // 7. "Until" date: "עד 15.7"
  const untilDate = segment.match(/עד\s*(\d{1,2})[./](\d{1,2})/);
  if (untilDate) {
    const end = parseNumericDate(Number(untilDate[1]), Number(untilDate[2]), monthStart.getFullYear());
    if (end) {
      return { start: new Date(monthStart), end: clampDateToMonth(end, monthStart, monthEnd) };
    }
  }

  // 8. Whole-month keywords
  if (/כל החודש|לאורך החודש|כלל החודש/.test(segment)) {
    return { start: new Date(monthStart), end: new Date(monthEnd) };
  }

  // 9. Week-of-month keywords
  if (/שבוע ראשון/.test(segment)) return buildWeekRange(1, monthStart, monthEnd);
  if (/שבוע שני/.test(segment)) return buildWeekRange(2, monthStart, monthEnd);
  if (/שבוע שלישי/.test(segment)) return buildWeekRange(3, monthStart, monthEnd);
  if (/שבוע רביעי|שבוע אחרון/.test(segment)) return buildWeekRange(4, monthStart, monthEnd);

  // 10. "Beginning / middle / end of month" in Hebrew
  if (/תחילת החודש|בתחילת החודש|ראשית החודש/.test(segment)) return buildWeekRange(1, monthStart, monthEnd);
  if (/אמצע החודש|באמצע החודש/.test(segment)) return buildWeekRange(2, monthStart, monthEnd);
  if (/סוף החודש|בסוף החודש|סיום החודש/.test(segment)) return buildWeekRange(4, monthStart, monthEnd);

  return null;
}

function normalizeYear(value: number) {
  if (value >= 1000) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

function buildWeekRange(weekIndex: number, monthStart: Date, monthEnd: Date) {
  const startDay = 1 + (weekIndex - 1) * 7;
  const endDay = Math.min(startDay + 6, monthEnd.getDate());
  return {
    start: buildDate(monthStart.getFullYear(), monthStart.getMonth() + 1, startDay),
    end: buildDate(monthStart.getFullYear(), monthStart.getMonth() + 1, endDay)
  };
}

function classifyRow(segment: string) {
  const normalizedLead = stripLeadingPlannerDate(segment).toLowerCase();
  const explicitMatch = EXPLICIT_ROW_PREFIXES.find((rule) =>
    rule.prefixes.some((prefix) => normalizedLead.startsWith(prefix.toLowerCase()))
  );
  if (explicitMatch) {
    return explicitMatch.rowLabel;
  }

  const lower = segment.toLowerCase();
  let bestMatch: { rowLabel: string; score: number } | null = null;
  let secondMatch: { rowLabel: string; score: number } | null = null;

  for (const rule of CHANNEL_RULES) {
    const score = rule.keywords.reduce((total, keyword) => total + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0);
    if (!score) continue;
    if (!bestMatch || score > bestMatch.score) {
      secondMatch = bestMatch;
      bestMatch = { rowLabel: rule.rowLabel, score };
    } else if (!secondMatch || score > secondMatch.score) {
      secondMatch = { rowLabel: rule.rowLabel, score };
    }
  }

  if (!bestMatch && detectCouponCodes(segment).length > 0) {
    return "קידום ממומן";
  }

  if (bestMatch?.rowLabel === HOLIDAY_ROW && secondMatch && secondMatch.score >= bestMatch.score) {
    return secondMatch.rowLabel;
  }

  if (
    bestMatch?.rowLabel === "קידום ממומן"
    && secondMatch
    && detectCouponCodes(segment).length === 0
    && !/קידום ממומן|coupon|קוד/i.test(segment)
  ) {
    return secondMatch.rowLabel;
  }

  return bestMatch?.rowLabel ?? null;
}

function buildCampaignText(segment: string, range: { start: Date; end: Date }, couponCodes: string[]) {
  const lines = cleanSegment(uppercaseCouponCodes(segment))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleSource = lines[0] ?? segment;
  const title = titleSource.length <= 90
    ? titleSource
    : titleSource.split(" ").slice(0, 8).join(" ");

  const detailLines = lines.slice(1, 4);
  if (couponCodes.length) {
    detailLines.unshift(`קוד: ${couponCodes.join(" / ")}`);
  }

  const dateLine = range.start.getTime() === range.end.getTime()
    ? formatInlineDate(range.start)
    : `${formatInlineDate(range.start)}-${formatInlineDate(range.end)}`;

  const campaignLines = [title, ...detailLines];
  if (!campaignLines.some((line) => /\d{1,2}[./]\d{1,2}/.test(line))) {
    campaignLines.push(`עד ${formatInlineDate(range.end)}`);
  } else if (!campaignLines.some((line) => line.includes(dateLine))) {
    campaignLines.push(`עד ${formatInlineDate(range.end)}`);
  }

  return {
    title,
    detailLines: campaignLines.slice(1, 5)
  };
}

function buildSpecialDayLabel(segment: string) {
  const firstLine = cleanSegment(segment).split("\n")[0]?.trim() ?? segment.trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.split(" ").slice(0, 6).join(" ");
}

function extractCampaigns(briefText: string, monthStart: Date, monthEnd: Date) {
  const segments = splitBriefSegments(briefText);
  const campaigns: MarketingCampaign[] = [];
  const specialDays: MarketingSpecialDay[] = [];
  const unplacedItems: string[] = [];

  segments.forEach((segment, index) => {
    const range = parseDateRange(segment, monthStart, monthEnd);
    const rowLabel = classifyRow(segment);

    if (rowLabel === HOLIDAY_ROW && range) {
      specialDays.push({
        date: formatDateKey(range.start),
        label: buildSpecialDayLabel(segment),
        source: "brief",
        category: "holiday"
      });
      return;
    }

    if (!rowLabel || !range) {
      unplacedItems.push(segment);
      return;
    }

    const couponCodes = detectCouponCodes(segment);
    const cellText = buildCampaignText(segment, range, couponCodes);

    campaigns.push({
      id: `campaign-${index + 1}`,
      rowLabel,
      startDate: formatDateKey(range.start),
      endDate: formatDateKey(range.end),
      title: cellText.title,
      detailLines: cellText.detailLines,
      sourceExcerpt: segment,
      couponCodes,
      confidence: 0.64
    });
  });

  return { campaigns, specialDays, unplacedItems };
}

function buildManualRetailEvents(year: number, month: number) {
  const events: MarketingSpecialDay[] = [];

  if (month === 2) {
    events.push({ date: formatDateKey(new Date(year, 1, 14)), label: "יום אהבה / Valentine's Day", source: "calendar", category: "retail" });
  }

  if (month === 5) {
    const mothersDay = nthWeekdayOfMonth(year, month - 1, 0, 2);
    events.push({ date: formatDateKey(mothersDay), label: "Mother's Day", source: "calendar", category: "retail" });
  }

  if (month === 11) {
    const blackFriday = getBlackFriday(year);
    const cyberMonday = new Date(blackFriday);
    cyberMonday.setDate(cyberMonday.getDate() + 3);
    events.push({ date: formatDateKey(blackFriday), label: "Black Friday", source: "calendar", category: "retail" });
    events.push({ date: formatDateKey(cyberMonday), label: "Cyber Monday", source: "calendar", category: "retail" });
  }

  if (month === 12) {
    events.push({ date: formatDateKey(new Date(year, 11, 25)), label: "Christmas", source: "calendar", category: "retail" });
  }

  if (month === 1) {
    events.push({ date: formatDateKey(new Date(year, 0, 1)), label: "New Year's Day", source: "calendar", category: "retail" });
  }

  if (month >= 6 && month <= 8) {
    events.push({ date: formatDateKey(new Date(year, month - 1, 1)), label: "Summer scent season", source: "calendar", category: "seasonal" });
  }

  if (month >= 5 && month <= 9) {
    events.push({ date: formatDateKey(new Date(year, month - 1, 5)), label: "Wedding season", source: "calendar", category: "seasonal" });
  }

  if (month === 8 || month === 9) {
    events.push({ date: formatDateKey(new Date(year, month - 1, 20)), label: "Back to school", source: "calendar", category: "seasonal" });
  }

  return events;
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, nth: number) {
  const first = new Date(year, monthIndex, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, monthIndex, 1 + offset + (nth - 1) * 7);
}

function getBlackFriday(year: number) {
  const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);
  const blackFriday = new Date(thanksgiving);
  blackFriday.setDate(blackFriday.getDate() + 1);
  return blackFriday;
}

function buildIslamicEvents(monthDates: Date[]) {
  const formatter = new Intl.DateTimeFormat("en-u-ca-islamic", {
    day: "numeric",
    month: "numeric"
  });

  const labels = new Map<string, string>();
  for (const date of monthDates) {
    const parts = formatter.formatToParts(date);
    const monthPart = parts.find((part) => part.type === "month")?.value;
    const dayPart = parts.find((part) => part.type === "day")?.value;
    const islamicMonth = Number(monthPart);
    const islamicDay = Number(dayPart);

    if (islamicMonth === 9 && islamicDay === 1) {
      labels.set(formatDateKey(date), "רמדאן");
    }

    if (islamicMonth === 10 && islamicDay === 1) {
      labels.set(formatDateKey(date), "עיד אל-פיטר");
    }

    if (islamicMonth === 12 && islamicDay === 10) {
      labels.set(formatDateKey(date), "עיד אל-אדחא");
    }
  }

  return Array.from(labels.entries()).map(([date, label]) => ({
    date,
    label,
    source: "calendar" as const,
    category: "holiday" as const
  }));
}

function buildHebcalEvents(year: number, month: number) {
  const events = HebrewCalendar.calendar({
    year,
    month,
    isHebrewYear: false,
    il: true,
    candlelighting: false,
    sedrot: false,
    noMinorFast: false,
    noModern: false
  });

  const labels = new Map<string, string>();
  const seenFamilies = new Set<string>();
  for (const event of events) {
    const date = event.getDate().greg();
    const label = stripHebrewMarks(event.render("he"));
    if (!label) continue;
    if (!/פסח|פורים|שבועות|ראש השנה|יום כיפור|סוכות|חנוכה|ט״ו בשבט|ט\"ו בשבט|יום השואה|יום הזיכרון|יום העצמאות|ל\"ג בעומר|ל״ג בעומר|תשעה באב|שמחת תורה/.test(label)) {
      continue;
    }
    const family = getHolidayFamily(label);
    if (["פסח", "חנוכה", "סוכות"].includes(family)) {
      if (seenFamilies.has(family)) continue;
      seenFamilies.add(family);
      labels.set(formatDateKey(date), family);
      continue;
    }

    labels.set(formatDateKey(date), label);
  }

  return Array.from(labels.entries()).map(([date, label]) => ({
    date,
    label,
    source: "calendar" as const,
    category: "holiday" as const
  }));
}

function buildCalendarEvents(year: number, month: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const monthDates = enumerateMonthDates(monthStart, monthEnd);

  const allEvents = [
    ...buildHebcalEvents(year, month),
    ...buildIslamicEvents(monthDates),
    ...buildManualRetailEvents(year, month)
  ];

  const deduped = new Map<string, MarketingSpecialDay>();
  for (const event of allEvents) {
    const key = `${event.date}-${event.label}`;
    deduped.set(key, event);
  }
  return Array.from(deduped.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function hasCampaignNearDate(campaigns: MarketingCampaign[], dateKey: string, dayTolerance = 1) {
  const target = new Date(`${dateKey}T00:00:00`);
  return campaigns.some((campaign) => {
    const start = new Date(`${campaign.startDate}T00:00:00`);
    const end = new Date(`${campaign.endDate}T00:00:00`);
    const toleranceStart = new Date(start);
    toleranceStart.setDate(toleranceStart.getDate() - dayTolerance);
    const toleranceEnd = new Date(end);
    toleranceEnd.setDate(toleranceEnd.getDate() + dayTolerance);
    return target >= toleranceStart && target <= toleranceEnd;
  });
}

function overlapsCampaignDate(campaign: MarketingCampaign, dateKey: string) {
  return dateKey >= campaign.startDate && dateKey <= campaign.endDate;
}

function hasCampaignInRows(campaigns: MarketingCampaign[], rowLabels: string[]) {
  return campaigns.some((campaign) => rowLabels.includes(campaign.rowLabel));
}

function formatCampaignWindow(campaign: MarketingCampaign) {
  const start = new Date(`${campaign.startDate}T00:00:00`);
  const end = new Date(`${campaign.endDate}T00:00:00`);
  return start.getTime() === end.getTime()
    ? formatInlineDate(start)
    : `${formatInlineDate(start)}-${formatInlineDate(end)}`;
}

function normalizeDiscountCodeKey(code: string) {
  return String(code ?? "").trim().toUpperCase();
}

function extractDiscountValueFromText(text: string) {
  const percentMatch = text.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
  if (percentMatch) {
    return {
      valueType: "percent" as const,
      value: Number(percentMatch[1].replace(",", "."))
    };
  }

  const shekelMatch = text.match(/(?:₪\s*(\d{1,4}(?:[.,]\d+)?)|(\d{1,4}(?:[.,]\d+)?)\s*(?:₪|ש"ח|שח|nis|ils))/i);
  const raw = shekelMatch?.[1] ?? shekelMatch?.[2];
  if (raw) {
    return {
      valueType: "fixed" as const,
      value: Number(raw.replace(",", "."))
    };
  }

  return null;
}

function inferOncePerCustomer(text: string) {
  return /first order|new customer|one use|one-time|פעם אחת|פעם ראשונה|ברכישה ראשונה|לקוח חדש|לקוחה חדשה/i.test(text);
}

function buildDiscountProposals(
  campaigns: MarketingCampaign[],
  activeRules: ShopifyPlannerDiscountRule[],
  focusMode: MarketingPlannerFocus
): MarketingPlannerResult["discountProposals"] {
  const grouped = new Map<string, {
    code: string;
    title: string;
    rowLabel: string;
    startDate: string;
    endDate: string;
    summaryParts: string[];
    valueType: "percent" | "fixed" | null;
    value: number | null;
    appliesOncePerCustomer: boolean;
  }>();
  const activeRuleLookup = new Map(
    activeRules.flatMap((rule) => rule.codes.map((code) => [normalizeDiscountCodeKey(code), rule] as const))
  );

  for (const campaign of campaigns) {
    if (!campaign.couponCodes.length) continue;
    const text = [campaign.title, ...campaign.detailLines, campaign.sourceExcerpt].join(" ");
    const value = extractDiscountValueFromText(text);

    for (const code of campaign.couponCodes) {
      const key = normalizeDiscountCodeKey(code);
      const current = grouped.get(key) ?? {
        code,
        title: campaign.title || code,
        rowLabel: campaign.rowLabel,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        summaryParts: [],
        valueType: null,
        value: null,
        appliesOncePerCustomer: inferOncePerCustomer(text)
      };

      current.startDate = current.startDate < campaign.startDate ? current.startDate : campaign.startDate;
      current.endDate = current.endDate > campaign.endDate ? current.endDate : campaign.endDate;
      if (!current.summaryParts.includes(campaign.sourceExcerpt)) {
        current.summaryParts.push(campaign.sourceExcerpt);
      }
      if (!current.valueType && value?.valueType) {
        current.valueType = value.valueType;
        current.value = value.value;
      }
      current.appliesOncePerCustomer = current.appliesOncePerCustomer || inferOncePerCustomer(text);
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.values()).map((proposal, index) => {
    const activeRule = activeRuleLookup.get(normalizeDiscountCodeKey(proposal.code));
    let createDisabledReason: string | null = null;

    if (activeRule) {
      createDisabledReason = `הקוד כבר פעיל בShopify (${activeRule.summary || activeRule.title}).`;
    } else if (!proposal.valueType || !proposal.value || !Number.isFinite(proposal.value)) {
      createDisabledReason = "לא זוהה ערך הנחה ברור ליצירה אוטומטית.";
    }

    const channelHint = focusMode === "influencers"
      ? "מיועד לעבוד כקוד ייחודי לערוץ משפיעניות."
      : focusMode === "paid_ads"
        ? "מומלץ לשמור עליו כהצעה אחת ברורה ללנדינג/קמפיין."
        : focusMode === "retention"
          ? "מומלץ ללוות אותו בערוץ owned כמו אימייל או SMS."
          : focusMode === "site"
            ? "מומלץ ליישר סביבו hero, popup ובאנר באתר."
            : "מומלץ לשמור אותו כהצעת hero אחת ולמנוע כפילויות.";

    return {
      id: `discount-proposal-${index + 1}`,
      title: proposal.title,
      code: normalizeDiscountCodeKey(proposal.code),
      rowLabel: proposal.rowLabel,
      startDate: proposal.startDate,
      endDate: proposal.endDate,
      valueType: proposal.valueType,
      value: proposal.value,
      summary: `${channelHint} כברירת מחדל היצירה תוגדר כלא-נערמת עם קודים אחרים כדי למנוע בלבול.`,
      appliesOncePerCustomer: proposal.appliesOncePerCustomer,
      combinePolicy: {
        productDiscounts: false,
        orderDiscounts: false,
        shippingDiscounts: false
      },
      canCreate: !createDisabledReason,
      alreadyExists: Boolean(activeRule),
      createDisabledReason
    };
  });
}

function buildDiscountDiagnostics(
  campaigns: MarketingCampaign[],
  activeRules: ShopifyPlannerDiscountRule[],
  focusMode: MarketingPlannerFocus,
  baseline: MarketingPlannerPreviousMonthBaseline | null
): MarketingPlannerDiscountDiagnostic[] {
  const diagnostics: MarketingPlannerDiscountDiagnostic[] = [];
  const couponCampaigns = campaigns.filter((campaign) => campaign.couponCodes.length > 0);
  const activeRuleLookup = new Map(
    activeRules.flatMap((rule) => rule.codes.map((code) => [normalizeDiscountCodeKey(code), rule] as const))
  );

  for (const campaign of couponCampaigns) {
    if (campaign.couponCodes.length > 1) {
      diagnostics.push({
        severity: "high",
        title: "יותר מקוד אחד באותו מהלך",
        detail: `במהלך "${campaign.title}" הופיעו כמה קודים (${campaign.couponCodes.join(", ")}). מבחינת לקוחה זה נראה כמו כמה הצעות במקביל במקום מבצע אחד ברור.`,
        relatedCodes: campaign.couponCodes,
        ganttPlacement: `${campaign.rowLabel} • ${formatCampaignWindow(campaign)}`
      });
    }

    for (const code of campaign.couponCodes) {
      const activeRule = activeRuleLookup.get(normalizeDiscountCodeKey(code));
      if (!activeRule) continue;
      diagnostics.push({
        severity: "med",
        title: "קוד כבר קיים בShopify",
        detail: `הקוד ${code} כבר פעיל בShopify. ההגדרה הקיימת היא: ${activeRule.summary || activeRule.title}. חשוב לוודא שהבריף לא מניח מכניקה אחרת.`,
        relatedCodes: [code],
        ganttPlacement: `${campaign.rowLabel} • ${formatCampaignWindow(campaign)}`
      });
    }
  }

  for (let index = 0; index < couponCampaigns.length; index += 1) {
    for (let cursor = index + 1; cursor < couponCampaigns.length; cursor += 1) {
      const left = couponCampaigns[index];
      const right = couponCampaigns[cursor];
      if (left.endDate < right.startDate || right.endDate < left.startDate) continue;
      const leftCodes = left.couponCodes.map(normalizeDiscountCodeKey);
      const rightCodes = right.couponCodes.map(normalizeDiscountCodeKey);
      const sameSet = leftCodes.length === rightCodes.length && leftCodes.every((code) => rightCodes.includes(code));
      if (sameSet) continue;

      const blockingRule = [...leftCodes, ...rightCodes]
        .map((code) => activeRuleLookup.get(code))
        .find((rule) => rule && !rule.combinePolicy.orderDiscounts && !rule.combinePolicy.productDiscounts);

      diagnostics.push({
        severity: "high",
        title: "קודים חופפים באותם תאריכים",
        detail: blockingRule
          ? `יש חפיפה בין ${left.couponCodes.join("/")} לבין ${right.couponCodes.join("/")} וShopify כבר מחזיק לפחות אחד מהם כלא-נערם. בפועל הלקוחה לא תוכל ליהנות משני הקודים יחד.`
          : `יש חפיפה בין ${left.couponCodes.join("/")} לבין ${right.couponCodes.join("/")} באותם תאריכים. גם אם טכנית חלקם יעבדו, זה יוצר עומס החלטה ומבלבל את ההבטחה המסחרית.`,
        relatedCodes: Array.from(new Set([...left.couponCodes, ...right.couponCodes])),
        ganttPlacement: `${left.rowLabel} + ${right.rowLabel} • ${formatCampaignWindow(left)} / ${formatCampaignWindow(right)}`
      });
    }
  }

  const uniqueCodes = Array.from(new Set(couponCampaigns.flatMap((campaign) => campaign.couponCodes.map(normalizeDiscountCodeKey))));
  if (uniqueCodes.length >= 4) {
    diagnostics.push({
      severity: "med",
      title: "יותר מדי קודים בחודש אחד",
      detail: `זוהו ${uniqueCodes.length} קודי הנחה שונים בתוכנית. גם אם כולם תקינים, זה בדרך כלל מרגיש ללקוחה כמו טלאים ולא כמו הצעה מסחרית אחת מסודרת.`,
      relatedCodes: uniqueCodes,
      ganttPlacement: "קידום ממומן / הטבות אונליין לאורך החודש"
    });
  }

  if (focusMode === "influencers" && campaigns.some((campaign) => campaign.rowLabel === "משפיעניות")) {
    const broadSiteCodes = couponCampaigns
      .filter((campaign) => ["אתר", "קידום ממומן", "הטבות אונליין", "מטא ממומן"].includes(campaign.rowLabel))
      .flatMap((campaign) => campaign.couponCodes);
    if (broadSiteCodes.length) {
      diagnostics.push({
        severity: "high",
        title: "פוקוס משפיעניות עם קוד ציבורי חופף",
        detail: "אם החודש אמור להישען על משפיעניות, קוד ציבורי רחב שחופף לאותם ימים יחליש את המדידה, את הייחוד של המשפיעניות ואת התחושה שיש להן הצעה בלעדית.",
        relatedCodes: Array.from(new Set(broadSiteCodes.map(normalizeDiscountCodeKey))),
        ganttPlacement: "משפיעניות + אתר/קידום ממומן"
      });
    }
  }

  if (baseline && baseline.discountRate >= 15 && uniqueCodes.length >= 2) {
    diagnostics.push({
      severity: "med",
      title: "החנות כבר הגיעה לחודש מוזל יחסית",
      detail: `בחודש הקודם שיעור ההנחה בפועל כבר היה ${formatPlannerPercent(baseline.discountRate)}. הוספת כמה קודים במקביל החודש עלולה להעמיק שחיקת מרווח בלי להוסיף בהירות.`,
      relatedCodes: uniqueCodes,
      ganttPlacement: "כל מהלכי ההנחה המתוכננים"
    });
  }

  return diagnostics.slice(0, 8);
}

function buildFocusIssues(
  focusMode: MarketingPlannerFocus,
  campaigns: MarketingCampaign[],
  baseline: MarketingPlannerPreviousMonthBaseline | null
) {
  const issues: string[] = [];
  const hasSite = campaigns.some((campaign) => campaign.rowLabel === "אתר");
  const hasInfluencers = campaigns.some((campaign) => ["משפיעניות", "מהלך טיק טוק", "יוצרות תוכן + אפיליאציה"].includes(campaign.rowLabel));
  const hasPaid = campaigns.some((campaign) => ["קידום ממומן", "מטא ממומן", "מיתוגי ממומן (מטא/יוטיוב/טיקטוק)"].includes(campaign.rowLabel));
  const hasRetention = campaigns.some((campaign) => ["ניוזלטר", "סמס", "הטבות אונליין"].includes(campaign.rowLabel));

  if (focusMode === "site" && !hasSite) {
    issues.push("נבחר פוקוס Site, אבל אין כמעט נכסי אתר בבריף. בלי hero / popup / landing / cart support קשה לגרום להצעה להיסגר בתוך החנות.");
  }

  if (focusMode === "influencers" && !hasInfluencers) {
    issues.push("נבחר פוקוס Influencers, אבל אין בגליון מספיק מהלכי משפיעניות / TikTok / יוצרות תוכן שיכולים באמת להחזיק את החודש.");
  }

  if (focusMode === "paid_ads" && (!hasPaid || !hasSite)) {
    issues.push("נבחר פוקוס Paid Ads, אבל חסרה כרגע אחת משתי שכבות קריטיות: קידום ממומן ברור או תמיכת אתר/לנדינג שתסגור את התנועה.");
  }

  if (focusMode === "retention" && !hasRetention) {
    issues.push("נבחר פוקוס Retention, אבל אין מספיק אימייל / SMS / הטבות אונליין סביב הלקוחות הקיימים.");
  }

  if (focusMode === "retention" && baseline && baseline.returningCustomerRate < 25) {
    issues.push(`שיעור ההזמנות החוזרות בחודש הקודם היה רק ${formatPlannerPercent(baseline.returningCustomerRate)}. אם זה חודש שימור, כדאי שהבריף ייתן יותר מקום לאימייל, SMS או VIP offer.`);
  }

  if (focusMode === "balanced") {
    const channelCounts = campaigns.reduce((map, campaign) => {
      if (campaign.rowLabel === HOLIDAY_ROW) return map;
      map.set(campaign.rowLabel, (map.get(campaign.rowLabel) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
    const busiest = Array.from(channelCounts.values()).sort((left, right) => right - left)[0] ?? 0;
    if (campaigns.length && busiest / campaigns.length > 0.45) {
      issues.push("נבחר פוקוס Balanced, אבל רוב הפעילות יושבת על ערוץ אחד. שווה לאזן קצת יותר בין owned, paid, site וsocial כדי לא להישען רק על נקודת מגע אחת.");
    }
  }

  return issues;
}

function campaignCorpus(campaigns: MarketingCampaign[]) {
  return campaigns
    .map((campaign) => [
      campaign.title,
      campaign.rowLabel,
      ...campaign.detailLines,
      ...campaign.couponCodes
    ].join(" "))
    .join(" ")
    .toLowerCase();
}

function buildPreviousMonthIssues(
  baseline: MarketingPlannerPreviousMonthBaseline | null,
  campaigns: MarketingCampaign[]
) {
  if (!baseline) return [];

  const issues: string[] = [];
  const corpus = campaignCorpus(campaigns);
  const topProduct = baseline.topProducts[0];

  if (topProduct && !corpus.includes(topProduct.toLowerCase())) {
    issues.push(`Previous month winner "${topProduct}" is not clearly mentioned in the current brief. If it is still in stock, the GANT should give it a site/content/paid support slot.`);
  }

  if (baseline.topDiscountCodes.length && baseline.discountRate > 12) {
    issues.push(`Last month already had meaningful discount activity (${formatPlannerPercent(baseline.discountRate)} discount rate). Avoid creating a new month with too many overlapping codes unless the offer hierarchy is very clear.`);
  }

  if (baseline.returningCustomerRate < 20) {
    issues.push(`Returning-customer rate last month was ${formatPlannerPercent(baseline.returningCustomerRate)}. The plan should include owned retention touches, not only acquisition or influencer activity.`);
  }

  return issues;
}

function buildFocusRecommendations(
  focusMode: MarketingPlannerFocus,
  campaigns: MarketingCampaign[],
  baseline: MarketingPlannerPreviousMonthBaseline | null
) {
  const recommendations: MarketingRecommendation[] = [];

  if (focusMode === "site" && !campaigns.some((campaign) => campaign.rowLabel === "אתר")) {
    recommendations.push({
      impact: "High",
      recommendation: "להוסיף לאותו מהלך hero באתר, popup וcart support כדי שההצעה לא תחיה רק מחוץ לחנות.",
      why: "בחודש עם פוקוס Site, החנות עצמה צריכה להיות המנוע שסוגר את ההמרה ולא רק יעד סופי לתנועה.",
      ganttPlacement: "אתר, באותם התאריכים של המבצע המרכזי."
    });
  }

  if (focusMode === "influencers" && !campaigns.some((campaign) => ["משפיעניות", "יוצרות תוכן + אפיליאציה"].includes(campaign.rowLabel))) {
    recommendations.push({
      impact: "High",
      recommendation: "להוסיף גל משפיעניות / יוצרות תוכן עם קוד אחד ברור לכל מהלך ולא להתחרות בו עם קוד ציבורי.",
      why: "אחרת החודש לא באמת יאפשר מדידה וסקייל לערוץ המשפיעניות.",
      ganttPlacement: "משפיעניות + יוצרות תוכן + אפיליאציה, סביב חלון המבצע המרכזי."
    });
  }

  if (focusMode === "paid_ads") {
    recommendations.push({
      impact: "High",
      recommendation: "לשמור על הצעת paid אחת ברורה בכל חלון, עם לנדינג/hero תואם ולא עם כמה קודים במקביל.",
      why: "קמפיין ממומן עובד טוב יותר כשהלקוחה מבינה מיד מה ההבטחה ומה עליה לעשות.",
      ganttPlacement: "קידום ממומן + מטא ממומן + אתר, באותם תאריכים."
    });
  }

  if (focusMode === "retention") {
    recommendations.push({
      impact: "High",
      recommendation: "לבנות את המבצע סביב owned first: ניוזלטר פתיחה, SMS follow-up, ואז תמיכת אתר.",
      why: baseline && baseline.returningCustomerRate < 25
        ? "שיעור החזרה עדיין לא חזק, ולכן צריך מהלך שימור מוצהר ולא רק קידום כללי."
        : "בחודש שימור חשוב שהמסר יעבור קודם ללקוחות שכבר מכירים את המותג.",
      ganttPlacement: "ניוזלטר + סמס + אתר, בתחילת חלון המבצע."
    });
  }

  if (focusMode === "balanced") {
    recommendations.push({
      impact: "Med",
      recommendation: "לבחור offer hero אחד לחודש ולתת לו תמיכה מבוקרת בערוצי site, paid וowned במקום לפצל את המסר בין יותר מדי קודים.",
      why: "איזון טוב לא אומר הרבה הצעות, אלא מעט הצעות עם תמיכה מלאה מסביב.",
      ganttPlacement: "סיפור ראשי + אתר + קידום ממומן + ניוזלטר."
    });
  }

  return recommendations.slice(0, 2);
}

function buildPreviousMonthRecommendations(
  baseline: MarketingPlannerPreviousMonthBaseline | null,
  campaigns: MarketingCampaign[]
) {
  if (!baseline) return [];

  const recommendations: MarketingRecommendation[] = [];
  const corpus = campaignCorpus(campaigns);
  const topProduct = baseline.topProducts[0];
  const topDiscountCode = baseline.topDiscountCodes[0]?.replace(/\s*\(.+\)$/, "");

  if (topProduct) {
    recommendations.push({
      impact: "High",
      recommendation: `Use last month's winning product as a planning anchor: ${topProduct}.`,
      why: `It was one of the strongest revenue products in ${baseline.monthLabel}, so the next GANT should not ignore it unless inventory or positioning changed.`,
      ganttPlacement: corpus.includes(topProduct.toLowerCase())
        ? "Strengthen the existing product mention with site, email, and paid support."
        : "Add it to Site / Paid / Newsletter rows as a support story or bundle anchor."
    });
  }

  if (topDiscountCode) {
    recommendations.push({
      impact: baseline.discountRate > 12 ? "Med" : "Low",
      recommendation: `Use the learnings from last month's working code pattern (${topDiscountCode}) without duplicating too many parallel codes.`,
      why: `The code appeared in last-month orders, but discount clarity matters more than adding more codes.`,
      ganttPlacement: "Discount rows and Shopify code creation review before launch."
    });
  }

  if (baseline.returningCustomerRate < 25) {
    recommendations.push({
      impact: "Med",
      recommendation: "Add a retention layer based on last month's low returning-customer rate.",
      why: `Returning orders were ${formatPlannerPercent(baseline.returningCustomerRate)}, so owned channels should help pull existing customers back.`,
      ganttPlacement: "Newsletter + SMS + online benefits rows around the main offer window."
    });
  }

  return recommendations.slice(0, 3);
}

function buildCalendarCheck(campaigns: MarketingCampaign[], specialDays: MarketingSpecialDay[]) {
  const checks: string[] = [];
  const calendarEvents = specialDays.filter((event) => event.source === "calendar");
  const briefEvents = specialDays.filter((event) => event.source === "brief");
  const missingFamilies = new Set<string>();

  for (const briefEvent of briefEvents) {
    const family = getHolidayFamily(briefEvent.label);
    const calendarEvent = calendarEvents.find((event) => getHolidayFamily(event.label) === family);
    if (calendarEvent && calendarEvent.date !== briefEvent.date) {
      checks.push(`יש פער תאריכים: בבריף ${family} סומן ל-${formatInlineDate(new Date(`${briefEvent.date}T00:00:00`))}, אבל בלוח השנה הוא חל ב-${formatInlineDate(new Date(`${calendarEvent.date}T00:00:00`))}.`);
    }
  }

  for (const event of specialDays) {
    const family = getHolidayFamily(event.label);
    if (
      event.source === "calendar"
      && HIGH_VALUE_EVENT_PATTERNS.some((pattern) => family.includes(pattern))
      && !hasCampaignNearDate(campaigns, event.date, 1)
      && !missingFamilies.has(family)
    ) {
      checks.push(`חסר מהלך סביב ${family} (${formatInlineDate(new Date(`${event.date}T00:00:00`))}) למרות שזה חלון מסחרי חזק.`);
      missingFamilies.add(family);
    }

    if (MEMORIAL_EVENT_PATTERNS.some((pattern) => family.includes(pattern))) {
      const conflicting = campaigns.find((campaign) => overlapsCampaignDate(campaign, event.date) && ["קידום ממומן", "מטא ממומן", "הטבות אונליין", "אתר"].includes(campaign.rowLabel));
      if (conflicting) {
        checks.push(`יש קונפליקט: ${conflicting.title} רץ על ${family}. שקלו להזיז את המבצע יום קדימה או אחורה.`);
      }
    }

    if ((family.includes("רמדאן") || family.includes("עיד")) && !campaigns.some((campaign) => campaign.rowLabel === "מגזר הערבי" && overlapsCampaignDate(campaign, event.date))) {
      checks.push(`אין פעילות ב"שורת מגזר הערבי" סביב ${family}, למרות הרלוונטיות לקהל הזה.`);
    }
  }

  if (!checks.length) {
    checks.push("אין התנגשות בולטת מול לוח השנה, אבל עדיין כדאי לוודא זמני שילוח סביב ערבי חג.");
  }

  return checks.slice(0, 6);
}

function buildSeasonalTrends(planningDate: Date, brand: MarketingBrand) {
  const month = planningDate.getMonth() + 1;
  const seasonalNotes: string[] = [
    "כרגע אין חיבור לפיד טרנדים חי מהווב, אז ההמלצות כאן מבוססות עונתיות ולוגיקת קטגוריה ולא על חיפושים בזמן אמת."
  ];

  if (month >= 6 && month <= 8) {
    seasonalNotes.push("הכניסי 2-3 ריילז של ניחוחות נקיים / fresh linen / cotton scent השבוע - בקיץ מסרים קלילים ומרעננים עובדים טוב יותר ממסרים כבדים.");
  }

  if (month >= 10 || month <= 2) {
    seasonalNotes.push("חזקי מסרי gifting וlayering עם מארזים וניחוחות חמים - בחודשים הקרים עולה הנכונות לקנייה מתנהית ולרכישה בסטים.");
  }

  if (month >= 5 && month <= 9) {
    seasonalNotes.push("בנו וריאציה תוכנית לwedding season עם מסרי 'מתנה לאירוע' ו'ריח לחתונה' במיוחד אם המותג הוא אינסנס.");
  }

  if (brand === "After") {
    seasonalNotes.push("בדקו אם יש מקום למסרי lifestyle קלים ומהירים יותר - המותג אפטר יכול ליהנות מפורמטים קצרים, יומיומיים ופחות טקסיים.");
  } else {
    seasonalNotes.push("שמרו על עוגן sensory ברור: חומרי גלם, שכבות ריח וטקס שימוש. זה בדרך כלל מחזק את בידול אינסנס בתוכן.");
  }

  return seasonalNotes.slice(0, 4);
}

function getCoveredRowsAroundCampaign(campaigns: MarketingCampaign[], campaign: MarketingCampaign, extraDays = 1) {
  const start = new Date(`${campaign.startDate}T00:00:00`);
  start.setDate(start.getDate() - extraDays);
  const end = new Date(`${campaign.endDate}T00:00:00`);
  end.setDate(end.getDate() + extraDays);
  return new Set(
    campaigns
      .filter((candidate) => {
        const candidateStart = new Date(`${candidate.startDate}T00:00:00`);
        const candidateEnd = new Date(`${candidate.endDate}T00:00:00`);
        return candidateEnd >= start && candidateStart <= end;
      })
      .map((candidate) => candidate.rowLabel)
  );
}

function buildIssues(campaigns: MarketingCampaign[], monthStart: Date, monthEnd: Date) {
  const issues: string[] = [];
  const smsCampaigns = campaigns.filter((campaign) => campaign.rowLabel === "סמס");
  const newsletterCampaigns = campaigns.filter((campaign) => campaign.rowLabel === "ניוזלטר");
  const siteCampaigns = campaigns.filter((campaign) => campaign.rowLabel === "אתר");
  const heroCampaign = campaigns.find((campaign) => campaign.rowLabel === "סיפור ראשי");

  const smsByWeek = new Map<number, number>();
  for (const campaign of smsCampaigns) {
    const week = Math.ceil(new Date(`${campaign.startDate}T00:00:00`).getDate() / 7);
    smsByWeek.set(week, (smsByWeek.get(week) ?? 0) + 1);
  }
  for (const [week, count] of smsByWeek.entries()) {
    if (count >= 3) {
      issues.push(`יש ${count} שליחות סמס בשבוע ${week} - זה נראה כמו עומס שיכול לייצר עייפות קהל.`);
    }
  }

  const overlappingCoupons = campaigns.filter((campaign) => campaign.couponCodes.length > 0);
  for (let index = 0; index < overlappingCoupons.length; index += 1) {
    for (let cursor = index + 1; cursor < overlappingCoupons.length; cursor += 1) {
      const left = overlappingCoupons[index];
      const right = overlappingCoupons[cursor];
      if (left.id === right.id) continue;
      if (left.endDate < right.startDate || right.endDate < left.startDate) continue;
      const differentCoupons = left.couponCodes.some((coupon) => !right.couponCodes.includes(coupon));
      if (differentCoupons) {
        issues.push(`יש חפיפה בין קודי קופון (${left.couponCodes.join("/")}) ו-(${right.couponCodes.join("/")}) באותם תאריכים - צריך להחליט מה הקוד המוביל.`);
        index = overlappingCoupons.length;
        break;
      }
    }
  }

  const weeks = Math.ceil(monthEnd.getDate() / 7);
  for (let week = 1; week <= weeks; week += 1) {
    const weekStart = buildDate(monthStart.getFullYear(), monthStart.getMonth() + 1, 1 + (week - 1) * 7);
    const weekEnd = buildDate(monthStart.getFullYear(), monthStart.getMonth() + 1, Math.min(week * 7, monthEnd.getDate()));
    const hasStory = campaigns.some((campaign) => campaign.endDate >= formatDateKey(weekStart) && campaign.startDate <= formatDateKey(weekEnd));
    if (!hasStory) {
      issues.push(`שבוע ${week} כמעט ריק מפעילות. צריך לפחות עוגן תוכן או מבצע אחד בין ${formatInlineDate(weekStart)}-${formatInlineDate(weekEnd)}.`);
    }
  }

  if (heroCampaign) {
    const coveredRows = getCoveredRowsAroundCampaign(campaigns, heroCampaign);
    const supportRows = ["אתר", "ניוזלטר", "סמס", "פוסט / ריל - סושיאל אורגני", "משפיעניות", "מטא ממומן"];
    const supports = supportRows.filter((rowLabel) => coveredRows.has(rowLabel));
    if (supports.length < 2) {
      issues.push(`הסיפור הראשי "${heroCampaign.title}" כמעט לא מקבל מעטפת תומכת. חסרים סביבו אתר / אימייל / אורגני / משפיעניות.`);
    }
  }

  if (campaigns.some((campaign) => campaign.couponCodes.length > 0) && siteCampaigns.length === 0) {
    issues.push("יש מבצעי קופון אבל אין בכלל שורת אתר. חסרים באנר / פופ-אפ / דף נחיתה שמתרגמים את ההצעה באתר.");
  }

  if (newsletterCampaigns.length === 0 && campaigns.some((campaign) => campaign.couponCodes.length > 0)) {
    issues.push("יש מבצעים, אבל אין אף ניוזלטר מתוכנן. זה משאיר את הסיפור המסחרי בלי ערוץ owned מרכזי.");
  }

  return Array.from(new Set(issues)).slice(0, 6);
}

function buildRecommendations(campaigns: MarketingCampaign[], calendarChecks: string[], issues: string[]) {
  const recommendations: MarketingRecommendation[] = [];

  if (calendarChecks.some((item) => item.includes("חסר מהלך סביב"))) {
    recommendations.push({
      impact: "High",
      recommendation: "להוסיף חבילת תמיכה מסחרית סביב יום/חג מפתח שחסר כרגע בתוכנית.",
      why: "אירועים עונתיים ותרבותיים מרכזיים הם נקודות ביקוש טבעיות בקטגוריית gifting ובישום.",
      ganttPlacement: "סיפור ראשי + קידום ממומן + אתר, סביב התאריך החסר שסומן בבדיקה."
    });
  }

  if (issues.some((item) => item.includes("חפיפה בין קודי קופון"))) {
    recommendations.push({
      impact: "High",
      recommendation: "לאחד או לדרג קודי קופון חופפים כדי למנוע בלבול ושחיקת מרווח.",
      why: "שני קודים פעילים במקביל מורידים בהירות, פוגעים במדידה ומעודדים קניבליזציה בין מהלכים.",
      ganttPlacement: "קידום ממומן / הטבות אונליין בתאריכי החפיפה."
    });
  }

  if (issues.some((item) => item.includes("מעטפת תומכת"))) {
    recommendations.push({
      impact: "High",
      recommendation: "לבנות מעטפת תומכת לסיפור הראשי עם אתר, אימייל, סטורי ואורגני לפחות.",
      why: "קמפיין ראשי בלי owned + social support משאיר כסף על השולחן ומחליש תדירות מסר.",
      ganttPlacement: "אתר + ניוזלטר + פוסט/ריל + סטורי, סביב ימי הסיפור הראשי."
    });
  }

  if (issues.some((item) => item.includes("שליחות סמס"))) {
    recommendations.push({
      impact: "Med",
      recommendation: "לפזר שליחות SMS כך שלא יהיו יותר משתי נגיעות מסחריות בשבוע.",
      why: "זה מוריד fatigue ושומר על ערך הערוץ לרגעים שבאמת צריך דחיפה.",
      ganttPlacement: "שורת סמס בשבוע הצפוף שסומן."
    });
  }

  if (issues.some((item) => item.includes("שורת אתר"))) {
    recommendations.push({
      impact: "Med",
      recommendation: "להוסיף נכסי אתר לכל מבצע: hero, banner, popup או cart upsell.",
      why: "בלי translation לאתר, חלק ניכר מהטראפיק יפגוש את ההצעה רק מחוץ לחנות.",
      ganttPlacement: "שורת אתר, באותם התאריכים של המבצע."
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      impact: "Low",
      recommendation: "להוסיף נקודת בדיקה שבועית אחת על assets וlanding readiness לפני כל עלייה לאוויר.",
      why: "גם תוכנית טובה נופלת כשאין סגירה על קריאייטיב, דף נחיתה או זמינות מלאי.",
      ganttPlacement: "הפקות / צילומי סושיאל + אתר, 2-3 ימים לפני כל עלייה."
    });
  }

  return recommendations.slice(0, 5);
}

function buildBriefSummary(campaigns: MarketingCampaign[], brand: MarketingBrand) {
  const heroCampaign = campaigns.find((campaign) => campaign.rowLabel === "סיפור ראשי")
    ?? campaigns.find((campaign) => campaign.couponCodes.length > 0)
    ?? campaigns[0];
  const coupons = Array.from(new Set(campaigns.flatMap((campaign) => campaign.couponCodes)));
  const supportingChannels = Array.from(new Set(campaigns.map((campaign) => campaign.rowLabel))).filter((row) => row !== HOLIDAY_ROW);

  const summary = [
    heroCampaign
      ? `המהלך המרכזי לחודש ${heroCampaign.title ? `הוא "${heroCampaign.title}"` : "מוגדר בעיקר דרך המבצע המסחרי"}.`
      : `הועלה בריף ל-${brand}, אבל לא זוהה מהלך מרכזי ברור בטקסט.`,
    coupons.length
      ? `מכניקת ההטבה נשענת כרגע על הקודים ${coupons.join(", ")} ועל קידום ממומן סביבם.`
      : "לא זוהתה מכניקת קופון ברורה, ולכן כדאי לוודא מה ההצעה המסחרית המובילה של החודש.",
    `הערוצים הפעילים ביותר בבריף: ${supportingChannels.slice(0, 5).join(", ")}.`,
    "לא צורף גאנט של החודש הקודם, לכן הזיהוי של 'מה חדש' מבוסס רק על הבריף הנוכחי ולא על השוואה מלאה."
  ];

  return summary.slice(0, 4);
}

function buildOpenQuestions(unplacedItems: string[], campaigns: MarketingCampaign[], briefText: string) {
  const questions = unplacedItems.slice(0, 5).map((item) => `לא הצלחתי למקם בגאנט: "${item.slice(0, 140)}". חסר תאריך או חסר ערוץ ברור.`);

  if (campaigns.some((campaign) => campaign.couponCodes.length > 0) && !/landing|דף נחיתה|banner|popup|hero/i.test(briefText)) {
    questions.push("האם יש דף נחיתה / hero / popup ייעודי למבצעים, או שהקידום יירד לעמודי קטגוריה קיימים?");
  }

  if (!/budget|תקציב|media/i.test(briefText)) {
    questions.push("לא הוזכרו תקציבים או סדרי עדיפויות בין הערוצים. צריך לאשר מה מקבל משקל מדיה ומי נשאר אורגני.");
  }

  if (!/approval|אישור|asset|קריאייטיב/.test(briefText)) {
    questions.push("לא ברור מי מאשר קריאייטיב ובאילו תאריכים. כדאי להוסיף gate ברור לפני העלאת מבצעים.");
  }

  return questions.slice(0, 6);
}

function buildSeasonalTrendsV2(
  planningDate: Date,
  brand: MarketingBrand,
  campaigns: MarketingCampaign[],
  specialDays: MarketingSpecialDay[]
) {
  const month = planningDate.getMonth() + 1;
  const seasonalNotes: string[] = [];
  const creatorRows = ["משפיעניות", "מהלך טיק טוק", "יוצרות תוכן + אפיליאציה"];
  const commercialRows = ["אתר", "ניוזלטר", "סמס", "הטבות אונליין"];
  const upcomingRetailMoment = specialDays.find((event) =>
    event.source === "calendar"
    && HIGH_VALUE_EVENT_PATTERNS.some((pattern) => getHolidayFamily(event.label).includes(pattern))
    && !hasCampaignNearDate(campaigns, event.date, 1)
  );

  if (month >= 6 && month <= 8) {
    seasonalNotes.push(
      hasCampaignInRows(campaigns, creatorRows)
        ? "בחודשי הקיץ מסרי fresh / clean / airy עובדים טוב במיוחד. כבר יש שכבת creators בתוכנית, אז כדאי לכוון אותה לתכני ריח קליל, חופשה ובגדי קיץ."
        : "בחודשי הקיץ מסרי fresh / clean / airy עובדים טוב במיוחד, אבל כרגע אין מספיק שכבת creators או טיקטוק שתתרגם את זה לתוכן יומיומי."
    );
  }

  if (month >= 10 || month <= 2) {
    seasonalNotes.push(
      hasCampaignInRows(campaigns, ["הטבות אונליין", "אתר"])
        ? "בחודשים הקרים מארזים, layering וgifting מתחזקים. כדאי לוודא שהאתר והמסרים הממומנים מדגישים ערך מתנה ולא רק את הקוד."
        : "בחודשים הקרים מארזים, layering וgifting מתחזקים, אבל כרגע חסר תרגום מספיק ברור שלהם באתר או בשורת ההטבות אונליין."
    );
  }

  if (month >= 5 && month <= 9 && !hasCampaignInRows(campaigns, ["משפיעניות", "יוצרות תוכן + אפיליאציה"])) {
    seasonalNotes.push("בין מאי לספטמבר עונת החתונות יכולה לעבוד מצוין לקטגוריה. כדאי לתת מקום למשפיעניות או UGC עם מסר של gifting, אירועים או ריח לאירוע.");
  }

  if (campaigns.some((campaign) => campaign.couponCodes.length > 0) && !hasCampaignInRows(campaigns, commercialRows)) {
    seasonalNotes.push("החודש נשען על קודי קופון, אבל חסר תרגום מספיק לאתר, לאימייל או לSMS. זה יוצר מסר מסחרי שלא נסגר עד הסוף בתוך החנות.");
  }

  if (upcomingRetailMoment) {
    const date = formatInlineDate(new Date(`${upcomingRetailMoment.date}T00:00:00`));
    seasonalNotes.push(`יש בחודש חלון ריטייל שלא מקבל כרגע מספיק תרגום: ${upcomingRetailMoment.label} (${date}). זה רגע טוב לרענן creative, offer או מסר סביבו.`);
  }

  if (brand === "After" && !hasCampaignInRows(campaigns, ["פוסט / ריל - סושיאל אורגני", "מהלך טיק טוק"])) {
    seasonalNotes.push("עבור After כדאי בדרך כלל להישען יותר על פורמטים קצרים, יומיומיים ומהירים. כרגע חסרה בתוכנית נוכחות מספקת של אורגני קצר או TikTok.");
  }

  if (brand === "Incense" && !hasCampaignInRows(campaigns, ["סיפור ראשי", "פוסט / ריל - סושיאל אורגני"])) {
    seasonalNotes.push("עבור Incense שווה לבנות החודש עוגן sensory בולט יותר: חומרי גלם, שכבות ריח, טקס שימוש או עולם השראה ברור.");
  }

  if (!seasonalNotes.length) {
    seasonalNotes.push("התוכנית נראית מאוזנת יחסית. מכאן הפוקוס צריך לעבור לחידוד המסר, לנכסי האתר ולקריאייטיב שמחזיק את החלון המסחרי המרכזי.");
  }

  return Array.from(new Set(seasonalNotes)).slice(0, 4);
}

function buildRecommendationsV2(
  campaigns: MarketingCampaign[],
  specialDays: MarketingSpecialDay[],
  calendarChecks: string[],
  issues: string[]
) {
  const recommendations: MarketingRecommendation[] = [];
  const heroCampaign = campaigns.find((campaign) => campaign.rowLabel === "סיפור ראשי") ?? null;
  const primaryCommercialCampaign = campaigns.find((campaign) => campaign.couponCodes.length > 0) ?? heroCampaign ?? campaigns[0] ?? null;
  const missingRetailMoment = specialDays.find((event) =>
    event.source === "calendar"
    && HIGH_VALUE_EVENT_PATTERNS.some((pattern) => getHolidayFamily(event.label).includes(pattern))
    && !hasCampaignNearDate(campaigns, event.date, 1)
  );

  if (missingRetailMoment || calendarChecks.some((item) => item.includes("חסר מהלך סביב"))) {
    const retailMomentDate = missingRetailMoment
      ? formatInlineDate(new Date(`${missingRetailMoment.date}T00:00:00`))
      : null;
    recommendations.push({
      impact: "High",
      recommendation: missingRetailMoment
        ? `להוסיף חבילת תמיכה מסחרית סביב ${missingRetailMoment.label}.`
        : "להוסיף חבילת תמיכה מסחרית סביב יום או חג מפתח שחסר כרגע בתוכנית.",
      why: "אירועים עונתיים ותרבותיים מרכזיים הם נקודות ביקוש טבעיות בקטגוריית gifting ובישום.",
      ganttPlacement: retailMomentDate
        ? `סיפור ראשי + קידום ממומן + אתר, סביב ${retailMomentDate}.`
        : "סיפור ראשי + קידום ממומן + אתר, סביב התאריך החסר שסומן בבדיקה."
    });
  }

  if (issues.some((item) => item.includes("חפיפה בין קודי קופון"))) {
    recommendations.push({
      impact: "High",
      recommendation: "לאחד או לדרג קודי קופון חופפים כדי למנוע בלבול ושחיקת מרווח.",
      why: "שני קודים פעילים במקביל מורידים בהירות, פוגעים במדידה ומעודדים קניבליזציה בין מהלכים.",
      ganttPlacement: primaryCommercialCampaign
        ? `קידום ממומן / הטבות אונליין, בחלון ${formatCampaignWindow(primaryCommercialCampaign)}.`
        : "קידום ממומן / הטבות אונליין בתאריכי החפיפה."
    });
  }

  if (issues.some((item) => item.includes("מעטפת תומכת"))) {
    recommendations.push({
      impact: "High",
      recommendation: "לבנות מעטפת תומכת לסיפור הראשי עם אתר, אימייל, סטורי ואורגני לפחות.",
      why: "קמפיין ראשי בלי owned + social support משאיר כסף על השולחן ומחליש תדירות מסר.",
      ganttPlacement: heroCampaign
        ? `אתר + ניוזלטר + פוסט/ריל + סטורי, סביב ${formatCampaignWindow(heroCampaign)}.`
        : "אתר + ניוזלטר + פוסט/ריל + סטורי, סביב ימי הסיפור הראשי."
    });
  }

  if (issues.some((item) => item.includes("שליחות סמס"))) {
    recommendations.push({
      impact: "Med",
      recommendation: "לפזר שליחות SMS כך שלא יהיו יותר משתי נגיעות מסחריות בשבוע.",
      why: "זה מוריד fatigue ושומר על ערך הערוץ לרגעים שבאמת צריך דחיפה.",
      ganttPlacement: "שורת סמס בשבוע הצפוף שסומן."
    });
  }

  if (issues.some((item) => item.includes("שורת אתר"))) {
    recommendations.push({
      impact: "Med",
      recommendation: "להוסיף נכסי אתר לכל מבצע: hero, banner, popup או cart upsell.",
      why: "בלי translation לאתר, חלק ניכר מהטראפיק יפגוש את ההצעה רק מחוץ לחנות.",
      ganttPlacement: primaryCommercialCampaign
        ? `שורת אתר, באותם התאריכים של ${formatCampaignWindow(primaryCommercialCampaign)}.`
        : "שורת אתר, באותם התאריכים של המבצע."
    });
  }

  if (issues.some((item) => item.includes("אין אף ניוזלטר"))) {
    recommendations.push({
      impact: "Med",
      recommendation: "להוסיף לפחות שליחת ניוזלטר אחת שפותחת את המהלך המסחרי של החודש.",
      why: "כשיש מבצע אבל אין email, חסר ערוץ owned שמסביר את ההצעה עם קצב ואסטרטגיית מרווח ברורה.",
      ganttPlacement: primaryCommercialCampaign
        ? `ניוזלטר, בתחילת החלון ${formatCampaignWindow(primaryCommercialCampaign)}.`
        : "ניוזלטר, בתחילת המבצע הראשי."
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      impact: "Low",
      recommendation: "להוסיף נקודת בדיקה שבועית אחת על assets וlanding readiness לפני כל עליה לאוויר.",
      why: "גם תוכנית טובה נופלת כשאין סגירה על קריאייטיב, דף נחיתה או זמינות מלאי.",
      ganttPlacement: "הפקות / צילומי סושיאל + אתר, 2-3 ימים לפני כל עליה."
    });
  }

  return recommendations.slice(0, 5);
}

function buildCustomerVoiceIssues(customerVoice: MarketingPlannerCustomerVoice | null) {
  if (!customerVoice || !customerVoice.sampledReviews) {
    return [] as string[];
  }

  return customerVoice.negativeTopics.map((topic) => `${topic.label}: ${topic.summary}`);
}

function buildCustomerVoiceTrendLines(customerVoice: MarketingPlannerCustomerVoice | null) {
  if (!customerVoice || !customerVoice.sampledReviews) {
    return [] as string[];
  }

  const lines = [...customerVoice.summaryLines];
  if (customerVoice.positiveTopics.length) {
    lines.push(`מהלקוחות עולה כרגע חוזק ברור סביב ${customerVoice.positiveTopics.map((topic) => topic.label).join(", ")}.`);
  }
  return lines.slice(0, 3);
}

function buildCustomerVoiceRecommendations(
  customerVoice: MarketingPlannerCustomerVoice | null,
  focusMode: MarketingPlannerFocus
) {
  if (!customerVoice || !customerVoice.sampledReviews) {
    return [] as MarketingRecommendation[];
  }

  const recommendations: MarketingRecommendation[] = [];
  const hasNegativeTopic = (key: string) => customerVoice.negativeTopics.some((topic) => topic.key === key);
  const hasPositiveTopic = (key: string) => customerVoice.positiveTopics.some((topic) => topic.key === key);

  if (hasNegativeTopic("longevity")) {
    recommendations.push({
      impact: focusMode === "influencers" ? "High" : "Med",
      recommendation: "לחדד את מסרי ההצעה סביב עמידות הריח: לבחור מוצרים חזקים יותר למהלך, ולהוסיף טיפים לשכבות שימוש/מתי להתיז.",
      why: "ביקורות הלקוחות מראות שעמידות הריח היא נקודת חיכוך פעילה, ולכן כדאי לא לייצר הבטחה כללית מדי בלי חיזוק מסר.",
      ganttPlacement: focusMode === "influencers"
        ? "משפיעניות + פוסט / ריל + אתר, לאורך חלון המבצע המרכזי."
        : "אתר + ניוזלטר + סיפור תוכן סטורי, סביב המוצרים המשתתפים."
    });
  }

  if (hasNegativeTopic("shipping")) {
    recommendations.push({
      impact: "Med",
      recommendation: "להוסיף מסר שירותי ברור על זמני משלוח, cut-off ומעקב הזמנה במקום להסתמך רק על מבצע.",
      why: "כשמשלוח וזמינות צפים בביקורות, חוסר בהירות סביב fulfillment יכול למחוק חלק גדול מהערך של הקמפיין.",
      ganttPlacement: "אתר + סמס + ימים מיוחדים, במיוחד לפני עומסי חג או סוף שבוע."
    });
  }

  if (hasPositiveTopic("compliments")) {
    recommendations.push({
      impact: focusMode === "influencers" || focusMode === "paid_ads" ? "High" : "Med",
      recommendation: "להפוך עדויות לקוח וUGC סביב 'מחמאות' לזווית קריאייטיב מרכזית, במיוחד בערוצי משפיעניות ומודעות.",
      why: "זה social proof טבעי שכבר קיים בשוק ויכול להוריד חיכוך בלי עוד הנחה.",
      ganttPlacement: "משפיעניות / יוצרות תוכן + אפיליאציה + מטא ממומן."
    });
  }

  if (hasPositiveTopic("packaging")) {
    recommendations.push({
      impact: "Med",
      recommendation: "לחזק מסרים של gifting וunboxing אם האריזה נתפסת כנקודת חוזק אמיתית בביקורות.",
      why: "כשלקוחות כבר מזכירים את האריזה לטובה, זה יכול להפוך מסתם feature לזווית מסחרית שמצדיקה רכישה.",
      ganttPlacement: "פוסט / ריל - סושיאל אורגני + אתר + הטבות אונליין."
    });
  }

  return recommendations.slice(0, 2);
}

function hasInfluencerPlan(campaigns: MarketingCampaign[]) {
  return campaigns.some((campaign) => ["משפיעניות", "מהלך טיק טוק", "יוצרות תוכן + אפיליאציה"].includes(campaign.rowLabel));
}

function buildInfluencerIssues(
  influencerIntelligence: MarketingPlannerInfluencerIntelligence | null,
  focusMode: MarketingPlannerFocus,
  campaigns: MarketingCampaign[]
) {
  if (!influencerIntelligence) {
    return [] as string[];
  }

  const issues: string[] = [];
  const influencerFocused = focusMode === "influencers" || focusMode === "balanced" || hasInfluencerPlan(campaigns);

  if (influencerFocused && influencerIntelligence.totalCreators && !influencerIntelligence.activeCreators) {
    issues.push("יש רשימת משפיעניות במערכת, אבל בחודש הקודם לא הייתה פעילות מיוחסת. צריך להתחיל את החודש כגל בדיקה עם מדידה ברורה.");
  }

  if (influencerFocused && influencerIntelligence.topCreators.length) {
    const topCreator = influencerIntelligence.topCreators[0];
    const share = influencerIntelligence.totalSales ? (topCreator.sales / influencerIntelligence.totalSales) * 100 : 0;
    if (share >= 45) {
      issues.push(`${topCreator.name} אחראית על ${share.toFixed(0)}% ממכירות המשפיעניות בחודש הקודם. זה טוב לסקייל, אבל מסוכן אם כל החודש נשען על יוצרת אחת.`);
    }
  }

  for (const warning of influencerIntelligence.dataWarnings.slice(0, 2)) {
    issues.push(warning);
  }

  return issues;
}

function buildInfluencerTrendLines(influencerIntelligence: MarketingPlannerInfluencerIntelligence | null) {
  if (!influencerIntelligence) {
    return [] as string[];
  }

  return [
    ...influencerIntelligence.summaryLines,
    influencerIntelligence.contentWinners.length
      ? `התוכן החזק ביותר כרגע הוא ${influencerIntelligence.contentWinners[0].title.slice(0, 90)}.`
      : null
  ].filter(Boolean).slice(0, 3) as string[];
}

function buildInfluencerRecommendations(
  influencerIntelligence: MarketingPlannerInfluencerIntelligence | null,
  focusMode: MarketingPlannerFocus,
  campaigns: MarketingCampaign[]
) {
  if (!influencerIntelligence) {
    return [] as MarketingRecommendation[];
  }

  const influencerFocused = focusMode === "influencers" || hasInfluencerPlan(campaigns);
  if (!influencerFocused) {
    return influencerIntelligence.suggestedActions
      .filter((action) => action.impact !== "High")
      .slice(0, 1)
      .map((action) => ({
        impact: action.impact,
        recommendation: action.action,
        why: action.why,
        ganttPlacement: action.ganttPlacement
      }));
  }

  return influencerIntelligence.suggestedActions.slice(0, 2).map((action) => ({
    impact: action.impact,
    recommendation: action.action,
    why: action.why,
    ganttPlacement: action.ganttPlacement
  }));
}

function buildBriefSummaryV2(campaigns: MarketingCampaign[], brand: MarketingBrand) {
  const heroCampaign = campaigns.find((campaign) => campaign.rowLabel === "סיפור ראשי")
    ?? campaigns.find((campaign) => campaign.couponCodes.length > 0)
    ?? campaigns[0];
  const coupons = Array.from(new Set(campaigns.flatMap((campaign) => campaign.couponCodes)));
  const firstCampaign = [...campaigns].sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
  const lastCampaign = [...campaigns].sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
  const busiestRows = Array.from(
    campaigns.reduce((map, campaign) => {
      if (campaign.rowLabel === HOLIDAY_ROW) return map;
      map.set(campaign.rowLabel, (map.get(campaign.rowLabel) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries()
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([rowLabel]) => rowLabel);

  return [
    heroCampaign
      ? `המהלך המרכזי לחודש הוא ${heroCampaign.title ? `"${heroCampaign.title}"` : "הצעה מסחרית מרכזית"}${heroCampaign ? ` (${formatCampaignWindow(heroCampaign)})` : ""}.`
      : `הועלה בריף ל-${brand}, אבל לא זוהה מהלך מרכזי ברור בטקסט.`,
    coupons.length
      ? `מכניקת ההטבה נשענת כרגע על הקודים ${coupons.join(", ")} ועל קידום ממומן סביבם.`
      : "לא זוהתה מכניקת קופון ברורה, ולכן כדאי לוודא מה ההצעה המסחרית המובילה של החודש.",
    firstCampaign && lastCampaign
      ? `זוהו ${campaigns.length} מהלכים בחלון זמן שנע בין ${formatInlineDate(new Date(`${firstCampaign.startDate}T00:00:00`))} ל-${formatInlineDate(new Date(`${lastCampaign.endDate}T00:00:00`))}.`
      : `זוהו ${campaigns.length} מהלכים בבריף הנוכחי.`,
    busiestRows.length
      ? `רוב המשקל האופרטיבי יושב כרגע על ${busiestRows.join(", ")}.`
      : "כדאי לעבור שוב על פיזור הערוצים כדי לוודא שיש מספיק תמיכה מסביב למהלך המרכזי."
  ].slice(0, 4);
}

function buildMetaAdsIssues(
  metaAds: MarketingPlannerMetaAds | null,
  focusMode: MarketingPlannerFocus
) {
  if (!metaAds) {
    return focusMode === "paid_ads" || focusMode === "balanced"
      ? ["Meta Ads is not synced yet, so paid-media recommendations are not using live spend, ROAS, or funnel data."]
      : [];
  }

  const issues = metaAds.watchCampaigns.slice(0, 3).map((campaign) => (
    `${campaign.campaignName}: spend ${formatPlannerCurrency(campaign.spend)} with ROAS ${campaign.purchaseRoas != null ? campaign.purchaseRoas.toFixed(2) : "missing"} and ${campaign.purchases} purchases.`
  ));
  const weakDay = metaAds.dailyBreakdown
    .filter((day) => day.spend > 0 && (!day.purchaseRoas || day.purchaseRoas < 2.5 || day.purchases === 0))
    .sort((left, right) => right.spend - left.spend)[0];

  if (weakDay) {
    issues.push(`Meta daily check: ${weakDay.dateStart} spent ${formatPlannerCurrency(weakDay.spend)} with ROAS ${weakDay.purchaseRoas != null ? weakDay.purchaseRoas.toFixed(2) : "missing"} and ${weakDay.purchases} purchases.`);
  }

  if (metaAds.campaigns.length && !metaAds.topCreatives.length) {
    issues.push("Meta Ads campaign data is synced, but ad-level creative data is still missing. Creative decisions are less reliable until the next daily + creatives sync succeeds.");
  }

  return issues.slice(0, 5);
}

function buildMetaAdsRecommendations(
  metaAds: MarketingPlannerMetaAds | null,
  focusMode: MarketingPlannerFocus
): MarketingRecommendation[] {
  if (!metaAds || !metaAds.campaigns.length) {
    if (focusMode !== "paid_ads" && focusMode !== "balanced") return [];
    return [{
      impact: "High",
      recommendation: "Sync Meta Ads before finalizing the paid-media rows.",
      why: "Without campaign spend, ROAS and funnel data, the planner cannot tell which paid campaign should support the hero story.",
      ganttPlacement: "Meta paid / campaign planning, before locking budget and discount support."
    }];
  }

  const recommendations: MarketingRecommendation[] = [];
  const topCreative = metaAds.topCreatives[0];
  if (topCreative && topCreative.purchaseRoas != null && topCreative.purchaseRoas >= 3) {
    recommendations.push({
      impact: "High",
      recommendation: `Brief around the winning creative: ${topCreative.creativeTitle ?? topCreative.adName ?? topCreative.campaignName}.`,
      why: `This ad/creative has the strongest synced signal with ROAS ${topCreative.purchaseRoas.toFixed(2)}, ${topCreative.purchases} purchases and ${formatPlannerCurrency(topCreative.spend)} spend.`,
      ganttPlacement: "Meta paid + organic/social inspiration rows, during the main paid push."
    });
  }

  const top = metaAds.topCampaigns[0];
  if (top && top.purchaseRoas != null && top.purchaseRoas >= 3) {
    recommendations.push({
      impact: "High",
      recommendation: `Use ${top.campaignName} as the paid-media anchor for the month.`,
      why: `It is the strongest synced Meta signal with ROAS ${top.purchaseRoas.toFixed(2)}, ${top.purchases} purchases and ${formatPlannerCurrency(top.spend)} spend.`,
      ganttPlacement: "Meta paid + site hero rows, first week of the main campaign."
    });
  }

  const watch = metaAds.watchCampaigns[0];
  if (watch) {
    recommendations.push({
      impact: "Med",
      recommendation: `Review ${watch.campaignName} before scaling budget.`,
      why: `It has ${formatPlannerCurrency(watch.spend)} spend with ${watch.purchaseRoas != null ? `ROAS ${watch.purchaseRoas.toFixed(2)}` : "missing ROAS"}, so it may need landing/offer/creative adjustment.`,
      ganttPlacement: "Meta paid row, budget review checkpoint before the next push."
    });
  }

  const weakDay = metaAds.dailyBreakdown
    .filter((day) => day.spend > 0 && (!day.purchaseRoas || day.purchaseRoas < 2.5 || day.purchases === 0))
    .sort((left, right) => right.spend - left.spend)[0];
  if (weakDay) {
    recommendations.push({
      impact: "Med",
      recommendation: `Add a daily paid-media checkpoint after weak Meta dates like ${weakDay.dateStart}.`,
      why: `The synced daily view shows ${formatPlannerCurrency(weakDay.spend)} spend with ${weakDay.purchaseRoas != null ? `ROAS ${weakDay.purchaseRoas.toFixed(2)}` : "missing ROAS"}, so budget and creative need faster feedback.`,
      ganttPlacement: "Meta paid row, one day after each major spend spike."
    });
  }

  return recommendations.slice(0, 5);
}

function buildMetaAdsTrendLines(metaAds: MarketingPlannerMetaAds | null) {
  if (!metaAds) return [];
  return metaAds.summaryLines.slice(0, 3);
}

function buildInsights(
  brand: MarketingBrand,
  planningDate: Date,
  campaigns: MarketingCampaign[],
  specialDays: MarketingSpecialDay[],
  unplacedItems: string[],
  briefText: string,
  focusMode: MarketingPlannerFocus,
  storeScope: MarketingPlannerStoreScope,
  baseline: MarketingPlannerPreviousMonthBaseline | null,
  customerVoice: MarketingPlannerCustomerVoice | null,
  influencerIntelligence: MarketingPlannerInfluencerIntelligence | null,
  metaAds: MarketingPlannerMetaAds | null,
  discountDiagnostics: MarketingPlannerDiscountDiagnostic[]
): MarketingPlannerInsights {
  const calendarCheck = buildCalendarCheck(campaigns, specialDays);
  const issues = [
    ...buildIssues(campaigns, new Date(planningDate.getFullYear(), planningDate.getMonth(), 1), new Date(planningDate.getFullYear(), planningDate.getMonth() + 1, 0)),
    ...buildPreviousMonthIssues(baseline, campaigns),
    ...buildFocusIssues(focusMode, campaigns, baseline),
    ...buildCustomerVoiceIssues(customerVoice),
    ...buildInfluencerIssues(influencerIntelligence, focusMode, campaigns),
    ...buildMetaAdsIssues(metaAds, focusMode),
    ...discountDiagnostics
      .filter((item) => item.severity !== "low")
      .slice(0, 3)
      .map((item) => `${item.title}: ${item.detail}`)
  ].slice(0, 8);
  const recommendations = [
    ...buildPreviousMonthRecommendations(baseline, campaigns),
    ...buildCustomerVoiceRecommendations(customerVoice, focusMode),
    ...buildInfluencerRecommendations(influencerIntelligence, focusMode, campaigns),
    ...buildMetaAdsRecommendations(metaAds, focusMode),
    ...buildRecommendationsV2(campaigns, specialDays, calendarCheck, issues),
    ...buildFocusRecommendations(focusMode, campaigns, baseline)
  ].filter((item, index, array) => array.findIndex((candidate) => candidate.recommendation === item.recommendation) === index);
  const briefSummary = [
    `התוכנית נבנתה עבור ${storeScope.storeDomain} עם פוקוס ${getFocusLabel(focusMode)}.`,
    ...(baseline?.summaryLines.slice(0, 2) ?? []),
    ...(customerVoice?.summaryLines.slice(0, 1) ?? []),
    ...(influencerIntelligence?.summaryLines.slice(0, 1) ?? []),
    ...(metaAds?.summaryLines.slice(0, 1) ?? []),
    ...buildBriefSummaryV2(campaigns, brand)
  ].slice(0, 4);
  const liveTrends = [
    ...buildCustomerVoiceTrendLines(customerVoice),
    ...buildInfluencerTrendLines(influencerIntelligence),
    ...buildMetaAdsTrendLines(metaAds),
    ...buildSeasonalTrendsV2(planningDate, brand, campaigns, specialDays),
    baseline?.topProducts.length
      ? `בחודש הקודם בלטו במיוחד ${baseline.topProducts.slice(0, 2).join(" ו-")}. שווה לבדוק אם הבריף הנוכחי נותן להם מספיק מקום מסחרי או תוכני.`
      : null
  ].filter(Boolean) as string[];

  return {
    briefSummary,
    calendarCheck,
    liveTrends: liveTrends.slice(0, 4),
    issues,
    recommendations: recommendations.slice(0, 5),
    openQuestions: buildOpenQuestions(unplacedItems, campaigns, briefText)
  };
}

function getWorksheetRowLabels(campaigns: MarketingCampaign[]) {
  const extraLabels = campaigns
    .map((campaign) => campaign.rowLabel)
    .filter((rowLabel) => !BASE_ROW_LABELS.includes(rowLabel as (typeof BASE_ROW_LABELS)[number]));
  return [...BASE_ROW_LABELS, ...Array.from(new Set(extraLabels))];
}

function appendCellText(cell: ExcelJS.Cell, text: string) {
  const current = typeof cell.value === "string" ? cell.value : "";
  cell.value = current ? `${current}\n\n${text}` : text;
}

function buildCellBody(campaign: MarketingCampaign) {
  return [campaign.title, ...campaign.detailLines].filter(Boolean).slice(0, 5).join("\n");
}

function compactText(value?: string | null, maxLength = 140) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function auditStatusLabel(status: "ready" | "warning" | "missing") {
  if (status === "ready") return "Ready";
  if (status === "warning") return "Needs review";
  return "Missing";
}

function buildWorkbookAuditRows(input: {
  storeScope: MarketingPlannerStoreScope;
  previousMonthBaseline: MarketingPlannerPreviousMonthBaseline | null;
  customerVoice: MarketingPlannerCustomerVoice | null;
  influencerIntelligence: MarketingPlannerInfluencerIntelligence | null;
  metaAds: MarketingPlannerMetaAds | null;
  activeDiscountRules: ShopifyPlannerDiscountRule[];
}) {
  const baseline = input.previousMonthBaseline;
  const customerVoice = input.customerVoice;
  const influencer = input.influencerIntelligence;
  const instagram = influencer?.instagramCrawl ?? null;
  const metaAds = input.metaAds;
  const brandProfile = instagram?.brandProfile ?? null;
  const affiliateProfiles = instagram?.affiliateProfiles ?? [];
  const affiliatePostsFound = affiliateProfiles.reduce((sum, profile) => sum + profile.postsFound, 0);
  const affiliatePostsSkipped = affiliateProfiles.reduce((sum, profile) => sum + profile.postsSkippedUnrelated, 0);

  return [
    {
      source: "Shopify previous month",
      status: baseline?.orders ? "ready" as const : input.storeScope.connected ? "warning" as const : "missing" as const,
      headline: baseline
        ? `${baseline.orders} orders, ${formatPlannerCurrency(baseline.revenue)} revenue, AOV ${formatPlannerCurrency(baseline.averageOrderValue)}.`
        : "No previous-month Shopify baseline loaded.",
      details: baseline?.summaryLines.slice(0, 2).join("\n") ?? "Connect or refresh Shopify before planning."
    },
    {
      source: "Affiliate / BixGrow attribution",
      status: influencer?.totalCreators ? "ready" as const : "missing" as const,
      headline: influencer
        ? `${influencer.activeCreators}/${influencer.totalCreators} active creators, ${formatPlannerCurrency(influencer.totalSales)} attributed sales, ${influencer.totalOrders} orders.`
        : "No affiliate attribution loaded.",
      details: influencer?.summaryLines.slice(0, 3).join("\n") ?? "Creator ranking cannot use coupons, bg_ref, clicks, or orders yet."
    },
    {
      source: "Meta Ads",
      status: metaAds?.campaigns.length && metaAds.topCreatives.length ? "ready" as const : metaAds ? "warning" as const : "missing" as const,
      headline: metaAds
        ? `${metaAds.dailyBreakdown.length} daily dates, ${metaAds.campaigns.length} campaigns, ${metaAds.topCreatives.length} creatives, ${formatPlannerCurrency(metaAds.totalSpend)} spend, ${metaAds.totalPurchases} purchases, ROAS ${metaAds.averagePurchaseRoas != null ? metaAds.averagePurchaseRoas.toFixed(2) : "n/a"}.`
        : "Meta Ads was not synced for this store.",
      details: metaAds?.summaryLines.slice(0, 3).join("\n") ?? "Paid ads insights will be skipped until Meta Ads is connected and synced."
    },
    {
      source: "Brand Instagram public crawler",
      status: brandProfile?.postsStored ? "ready" as const : brandProfile ? "warning" as const : "missing" as const,
      headline: brandProfile
        ? `@${brandProfile.username}: scanned ${brandProfile.postsScanned}, stored ${brandProfile.postsStored}, found ${brandProfile.postsFound}.`
        : "Brand Instagram was not crawled.",
      details: brandProfile?.note ?? "Run Refresh data before planning to crawl the public brand account."
    },
    {
      source: "Influencer Instagram public crawler",
      status: affiliateProfiles.length ? (affiliatePostsFound ? "ready" as const : "warning" as const) : "missing" as const,
      headline: affiliateProfiles.length
        ? `${affiliateProfiles.length} handles saved, ${affiliatePostsFound} brand-related posts found, ${affiliatePostsSkipped} posts skipped as unrelated.`
        : "No affiliate Instagram handles saved.",
      details: affiliateProfiles.slice(0, 5).map((profile) => {
        return `@${profile.username}: scanned ${profile.postsScanned}, found ${profile.postsFound}, stored ${profile.postsStored}. ${profile.note}`;
      }).join("\n") || "Add profile URLs in the affiliate page, then refresh."
    },
    {
      source: "Flashy customer reviews",
      status: customerVoice?.sampledReviews ? "ready" as const : customerVoice ? "warning" as const : "missing" as const,
      headline: customerVoice
        ? `${customerVoice.sampledReviews} reviews sampled across ${customerVoice.sampledProducts} active products.`
        : "Flashy customer voice was not loaded.",
      details: customerVoice?.summaryLines.slice(0, 3).join("\n") ?? "Customer review insights will be skipped."
    },
    {
      source: "Shopify discount rules",
      status: input.activeDiscountRules.length ? "ready" as const : "warning" as const,
      headline: `${input.activeDiscountRules.length} active Shopify code discount rule(s) loaded for collision checks.`,
      details: input.activeDiscountRules.slice(0, 8).flatMap((rule) => rule.codes).filter(Boolean).join(", ") || "No active code rules were available, so discount collision checks rely on the brief only."
    }
  ];
}

function addWorkbookAuditSheet(
  workbook: ExcelJS.Workbook,
  input: {
    storeScope: MarketingPlannerStoreScope;
    previousMonthBaseline: MarketingPlannerPreviousMonthBaseline | null;
    customerVoice: MarketingPlannerCustomerVoice | null;
    influencerIntelligence: MarketingPlannerInfluencerIntelligence | null;
    metaAds: MarketingPlannerMetaAds | null;
    activeDiscountRules: ShopifyPlannerDiscountRule[];
    direction: MarketingPlannerDirection;
  }
) {
  const horizontal = getCellHorizontalAlignment(input.direction);
  const worksheet = workbook.addWorksheet("Data sources", {
    properties: { defaultRowHeight: 28 },
    views: [{ rightToLeft: isHebrewDirection(input.direction) }]
  });

  worksheet.columns = [
    { key: "source", width: 32 },
    { key: "status", width: 18 },
    { key: "headline", width: 48 },
    { key: "details", width: 82 }
  ];

  worksheet.getCell("A1").value = "Data used for this GANT";
  worksheet.getCell("A1").font = { name: "Arial", size: 14, bold: true };
  worksheet.getCell("A1").alignment = { horizontal, vertical: "middle" };
  worksheet.mergeCells("A1:D1");

  worksheet.getCell("A2").value = `Store: ${input.storeScope.storeName} (${input.storeScope.storeDomain})`;
  worksheet.getCell("A2").alignment = { horizontal, vertical: "middle" };
  worksheet.mergeCells("A2:D2");

  const headerRow = worksheet.getRow(4);
  headerRow.values = ["Source", "Status", "What was gathered", "Planner notes"];
  headerRow.font = { name: "Arial", size: 11, bold: true };
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    cell.border = buildBorder();
    cell.alignment = { horizontal, vertical: "middle", wrapText: true };
  });

  const auditRows = buildWorkbookAuditRows(input);
  auditRows.forEach((row, index) => {
    const excelRow = worksheet.getRow(index + 5);
    excelRow.values = [row.source, auditStatusLabel(row.status), row.headline, row.details];
    excelRow.height = Math.max(44, Math.min(118, 26 + row.details.split("\n").length * 18));
    excelRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { horizontal, vertical: "top", wrapText: true };
      cell.border = buildBorder();
    });
    worksheet.getCell(index + 5, 2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: row.status === "ready" ? "FFD1FAE5" : row.status === "warning" ? "FFFEF3C7" : "FFFECACA"
      }
    };
  });

  const recentPosts = input.influencerIntelligence?.instagramCrawl.recentPosts ?? [];
  if (recentPosts.length) {
    const startRow = auditRows.length + 7;
    worksheet.getCell(startRow, 1).value = "Recent public Instagram posts gathered";
    worksheet.getCell(startRow, 1).font = { name: "Arial", size: 12, bold: true };
    worksheet.getCell(startRow, 1).alignment = { horizontal, vertical: "middle" };
    worksheet.mergeCells(startRow, 1, startRow, 4);

    const postHeader = worksheet.getRow(startRow + 1);
    postHeader.values = ["Profile", "Metrics", "Permalink", "Caption preview"];
    postHeader.font = { name: "Arial", size: 11, bold: true };
    postHeader.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      cell.border = buildBorder();
      cell.alignment = { horizontal, vertical: "middle", wrapText: true };
    });

    recentPosts.slice(0, 8).forEach((post, index) => {
      const rowNumber = startRow + 2 + index;
      const excelRow = worksheet.getRow(rowNumber);
      excelRow.values = [
        `@${post.username} / ${post.mediaType}`,
        `${post.views} views, ${post.likes} likes, ${post.comments} comments`,
        post.permalink ?? "",
        compactText(post.captionPreview, 220)
      ];
      excelRow.height = 50;
      excelRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10 };
        cell.alignment = { horizontal, vertical: "top", wrapText: true };
        cell.border = buildBorder();
      });
    });
  }

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { ...(cell.alignment ?? {}), horizontal };
    });
  });
}

async function buildWorkbook(
  sheetName: string,
  monthDates: Date[],
  rowLabels: string[],
  campaigns: MarketingCampaign[],
  specialDays: MarketingSpecialDay[],
  direction: MarketingPlannerDirection,
  auditInput: {
    storeScope: MarketingPlannerStoreScope;
    previousMonthBaseline: MarketingPlannerPreviousMonthBaseline | null;
    customerVoice: MarketingPlannerCustomerVoice | null;
    influencerIntelligence: MarketingPlannerInfluencerIntelligence | null;
    metaAds: MarketingPlannerMetaAds | null;
    activeDiscountRules: ShopifyPlannerDiscountRule[];
  }
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hiloomy";
  workbook.created = new Date();
  const horizontal = getCellHorizontalAlignment(direction);
  const worksheet = workbook.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 28 },
    views: [{ rightToLeft: isHebrewDirection(direction), state: "frozen", xSplit: 1, ySplit: 2 }]
  });
  worksheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    orientation: "landscape"
  };

  worksheet.getColumn(1).width = 34;
  monthDates.forEach((_, index) => {
    worksheet.getColumn(index + 2).width = 16;
  });

  worksheet.getCell("A1").value = sheetName;
  worksheet.getCell("A1").font = { name: "Arial", size: 12, bold: true };
  worksheet.getCell("A1").alignment = { horizontal, vertical: "middle" };
  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 22;

  monthDates.forEach((date, index) => {
    const column = index + 2;
    const dateCell = worksheet.getCell(1, column);
    dateCell.value = formatWorkbookDate(date);
    dateCell.font = { name: "Arial", size: 12, bold: true };
    dateCell.alignment = { horizontal: "center", vertical: "middle" };
    dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    dateCell.border = buildBorder();

    const dayCell = worksheet.getCell(2, column);
    dayCell.value = DAY_LETTERS[date.getDay()];
    dayCell.font = { name: "Arial", size: 11, bold: true };
    dayCell.alignment = { horizontal: "center", vertical: "middle" };
    dayCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    dayCell.border = buildBorder();
  });

  rowLabels.forEach((label, index) => {
    const rowNumber = index + 3;
    const labelCell = worksheet.getCell(rowNumber, 1);
    labelCell.value = label;
    labelCell.font = { name: "Arial", size: 11, bold: true };
    labelCell.alignment = { horizontal, vertical: "middle" };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    labelCell.border = buildBorder();
    worksheet.getRow(rowNumber).height = 40;

    monthDates.forEach((_, dateIndex) => {
      worksheet.getCell(rowNumber, dateIndex + 2).border = buildBorder();
      worksheet.getCell(rowNumber, dateIndex + 2).alignment = { wrapText: true, vertical: "top", horizontal };
      worksheet.getCell(rowNumber, dateIndex + 2).font = { name: "Arial", size: 10 };
    });
  });

  const rowLookup = new Map(rowLabels.map((label, index) => [label, index + 3]));
  const dateLookup = new Map(monthDates.map((date, index) => [formatDateKey(date), index + 2]));

  for (const event of specialDays) {
    const rowNumber = rowLookup.get(HOLIDAY_ROW);
    const column = dateLookup.get(event.date);
    if (!rowNumber || !column) continue;
    const cell = worksheet.getCell(rowNumber, column);
    appendCellText(cell, event.label);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
    cell.font = { name: "Arial", size: 10, bold: true };
  }

  // Precompute first and last column for fallback when campaign dates are outside the month grid
  const firstDateColumn = 2;
  const lastDateColumn = monthDates.length + 1;

  for (const campaign of campaigns) {
    const rowNumber = rowLookup.get(campaign.rowLabel);
    if (!rowNumber) continue;

    // Fallback to first/last column if campaign dates fall outside the month grid
    // (can happen if clamping produced edge dates not represented in dateLookup)
    const startColumn = dateLookup.get(campaign.startDate) ?? firstDateColumn;
    const endColumn = dateLookup.get(campaign.endDate) ?? lastDateColumn;

    const startCell = worksheet.getCell(rowNumber, startColumn);
    appendCellText(startCell, buildCellBody(campaign));
    const estimatedLineCount = String(startCell.value ?? "").split("\n").filter(Boolean).length;
    worksheet.getRow(rowNumber).height = Math.max(
      worksheet.getRow(rowNumber).height ?? 40,
      Math.min(120, 18 + estimatedLineCount * 12)
    );

    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = worksheet.getCell(rowNumber, column);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${ROW_FILL_COLORS[campaign.rowLabel] ?? "E5E7EB"}` }
      };
      cell.alignment = { wrapText: true, vertical: "top", horizontal };
      cell.font = { name: "Arial", size: 10 };
    }
  }

  addWorkbookAuditSheet(workbook, { ...auditInput, direction });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function buildBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } }
  };
}

async function extractTextFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".txt") || file.type.startsWith("text/")) {
    return buffer.toString("utf8");
  }

  if (lowerName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (lowerName.endsWith(".pdf")) {
    try {
      const runtimeRequire = new Function("moduleName", "return require(moduleName);") as (
        moduleName: string
      ) => { pdf: (input: Buffer) => Promise<{ text?: string }> };
      const pdfParseModule = runtimeRequire("pdf-parse");
      const result = await pdfParseModule.pdf(buffer);
      return result.text ?? "";
    } catch {
      throw new AppError("לא הצלחתי לקרוא את קובץ הPDF. אפשר להעלות DOCX או להדביק את הטקסט ידנית.", 400);
    }
  }

  throw new AppError("העלאת קבצים תומכת כרגע ב-.docx, .pdf או .txt.", 400);
}

function mergeSpecialDays(fromBrief: MarketingSpecialDay[], fromCalendar: MarketingSpecialDay[]) {
  const merged = new Map<string, MarketingSpecialDay>();
  for (const event of [...fromCalendar, ...fromBrief]) {
    const key = `${event.date}-${event.label}`;
    merged.set(key, event);
  }
  return Array.from(merged.values()).sort((left, right) => left.date.localeCompare(right.date));
}

export async function generateMarketingPlannerWorkbook(
  request: MarketingPlannerRequest,
  file?: File | null
): Promise<MarketingPlannerResult> {
  const { brand, planningMonth, focusChannels, sourceFileName, storeId } = request;
  const { start, end, year, month } = getMonthBounds(planningMonth);
  const plannerFocus = getPlannerFocus(request.focusMode);
  const executionMode = getPlannerExecutionMode(request.executionMode);

  const nonBlockingWarnings: string[] = [];
  let extractedFileText = "";
  let fallbackBriefText: string | null = null;
  if (file) {
    try {
      extractedFileText = await extractTextFromFile(file);
    } catch (error) {
      nonBlockingWarnings.push(`The uploaded brief file could not be parsed (${toErrorMessage(error)}). The GANT was still generated from pasted text, connected store data, and calendar context.`);
    }
  }
  let combinedBriefText = normalizeWhitespace([request.briefText, extractedFileText, focusChannels ?? ""].filter(Boolean).join("\n\n"));

  if (!combinedBriefText) {
    nonBlockingWarnings.push("No detailed brief text was provided. The GANT was generated as a store-data-led draft with calendar days, data-source evidence, and Growth Agent recommendations.");
    fallbackBriefText = "Store-data-led planning draft. No detailed brief text was provided. Use connected store data, previous month performance, calendar context, and Growth Agent recommendations.";
    combinedBriefText = fallbackBriefText;
  }

  if (!combinedBriefText) {
    throw new AppError("צריך להדביק בריף או להעלות קובץ לפני יצירת הגאנט.", 400);
  }

  const { campaigns, specialDays: briefSpecialDays, unplacedItems } = extractCampaigns(combinedBriefText, start, end);
  const parsedUnplacedItems = fallbackBriefText
    ? unplacedItems.filter((item) => item !== fallbackBriefText)
    : unplacedItems;
  const allUnplacedItems = Array.from(new Set([...nonBlockingWarnings, ...parsedUnplacedItems]));
  const calendarSpecialDays = buildCalendarEvents(year, month);
  const specialDays = mergeSpecialDays(briefSpecialDays, calendarSpecialDays);
  const rowLabels = getWorksheetRowLabels(campaigns);
  const monthDates = enumerateMonthDates(start, end);
  const planningDate = new Date(start);
  const sheetName = buildSheetName(planningDate);
  const storeScope = await buildStoreScope(storeId);
  const previousMonthBaseline = await buildPreviousMonthBaseline(storeScope, planningDate);
  let customerVoice: MarketingPlannerCustomerVoice | null = null;
  try {
    customerVoice = await buildMarketingPlannerCustomerVoice(storeScope);
  } catch {
    customerVoice = null;
  }
  let influencerIntelligence: MarketingPlannerInfluencerIntelligence | null = null;
  try {
    influencerIntelligence = await buildMarketingPlannerInfluencerIntelligence(storeScope, planningDate);
  } catch {
    influencerIntelligence = null;
  }
  let metaAds: MarketingPlannerMetaAds | null = null;
  try {
    metaAds = await buildMarketingPlannerMetaAds(storeScope);
  } catch {
    metaAds = null;
  }
  let activeDiscountRules: ShopifyPlannerDiscountRule[] = [];
  if (storeScope.connected && storeScope.storeId) {
    try {
      activeDiscountRules = await getActiveShopifyCodeDiscountRules(storeScope.storeId);
    } catch {
      activeDiscountRules = [];
    }
  }
  const discountDiagnostics = buildDiscountDiagnostics(campaigns, activeDiscountRules, plannerFocus, previousMonthBaseline);
  const discountProposals = buildDiscountProposals(campaigns, activeDiscountRules, plannerFocus);
  const localeProbe = [
    combinedBriefText,
    sheetName,
    rowLabels.join(" "),
    campaigns.map((campaign) => `${campaign.rowLabel} ${campaign.title} ${campaign.detailLines.join(" ")}`).join(" "),
    specialDays.map((event) => event.label).join(" ")
  ].join("\n");
  const contentLocale = detectPlannerLocale(localeProbe);
  const contentDirection = getPlannerDirection(contentLocale);
  const workbookBuffer = await buildWorkbook(
    sheetName,
    monthDates,
    rowLabels,
    campaigns,
    specialDays,
    contentDirection,
    {
      storeScope,
      previousMonthBaseline,
      customerVoice,
      influencerIntelligence,
      metaAds,
      activeDiscountRules
    }
  );
  const fileName = `${sheetName} - ${brand === "Incense" ? "אינסנס" : "אפטר"}.xlsx`;

  const result: MarketingPlannerResult = {
    ok: true,
    brand,
    planningMonth,
    sheetName,
    fileName,
    workbookBase64: workbookBuffer.toString("base64"),
    workbookMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    parserMode: "heuristic",
    contentDirection,
    contentLocale,
    plannerFocus,
    executionMode,
    storeScope,
    previousMonthBaseline,
    customerVoice,
    influencerIntelligence,
    metaAds,
    discountDiagnostics,
    discountProposals,
    campaigns,
    specialDays,
    insights: buildInsights(
      brand,
      planningDate,
      campaigns,
      specialDays,
      allUnplacedItems,
      combinedBriefText,
      plannerFocus,
      storeScope,
      previousMonthBaseline,
      customerVoice,
      influencerIntelligence,
      metaAds,
      discountDiagnostics
    ),
    unplacedItems: allUnplacedItems,
    rowLabels,
    extractedBriefText: combinedBriefText,
    sourceFileName: sourceFileName ?? file?.name ?? null
  };

  await saveMarketingPlannerLearnings(result).catch(() => undefined);

  return result;
}
