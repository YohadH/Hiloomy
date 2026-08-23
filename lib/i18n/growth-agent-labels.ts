// Bilingual display labels for the Growth Agent surfaces.
//
// Everything in here is DISPLAY ONLY. The underlying values (`connected`,
// `CREATE_RECOMMENDATION`, `aovDropPercent`, the stored `healthMessage` text,
// …) stay exactly as they are in the database and in the API payloads — we
// only map them to human copy at render time. That matters because connector
// health messages are persisted rows written by several different services
// (seed defaults, the Shopify/Meta/Instagram sync services, the product
// crawler, the Amazon supplier service), so localizing at write time would
// freeze whatever locale happened to be active when the row was first stored.

export type GrowthLabelLocale = "he" | "en";

function pick(locale: GrowthLabelLocale, he: string, en: string) {
  return locale === "he" ? he : en;
}

function humanizeRaw(value: string) {
  return value.replaceAll("_", " ");
}

// ---------------------------------------------------------------------------
// Status / severity / risk enums
// ---------------------------------------------------------------------------

const STATUS_LABELS_HE: Record<string, string> = {
  active: "פעיל",
  paused: "מושהה",
  normal: "תקין",
  warning: "אזהרה",
  critical: "קריטי",
  connected: "מחובר",
  not_connected: "לא מחובר",
  degraded: "מוגבל",
  stub: "מוכן לחיבור",
  needs_oauth: "דורש חיבור",
  recommended: "מומלץ",
  pending_approval: "ממתין לאישור",
  approved: "אושר",
  executed: "בוצע",
  rejected: "נדחה",
  blocked: "חסום",
  failed: "נכשל",
  info: "מידע",
  low: "נמוך",
  medium: "בינוני",
  high: "גבוה",
  error: "שגיאה",
  ready: "מוכן",
  missing: "חסר"
};

export function getGrowthStatusLabel(status: string, locale: GrowthLabelLocale = "he") {
  if (locale !== "he") return humanizeRaw(status);
  return STATUS_LABELS_HE[status] ?? humanizeRaw(status);
}

// ---------------------------------------------------------------------------
// Agent operating mode
// ---------------------------------------------------------------------------

const AGENT_MODE_LABELS_HE: Record<string, string> = {
  observe_only: "צפייה בלבד",
  recommend: "המלצה בלבד",
  approval_required: "אישור נדרש",
  auto_execute: "ביצוע אוטומטי"
};

export function getGrowthAgentModeLabel(mode: string, locale: GrowthLabelLocale = "he") {
  if (locale !== "he") return humanizeRaw(mode);
  return AGENT_MODE_LABELS_HE[mode] ?? humanizeRaw(mode);
}

// ---------------------------------------------------------------------------
// Action types (raw values are SCREAMING_SNAKE enums sent to the API)
// ---------------------------------------------------------------------------

const ACTION_TYPE_LABELS_HE: Record<string, string> = {
  SEND_ALERT: "שליחת התראה",
  CREATE_RECOMMENDATION: "יצירת המלצה",
  CREATE_CREATIVE_BRIEF: "יצירת בריף קריאייטיב",
  DRAFT_ORGANIC_POST: "טיוטת פוסט אורגני",
  PUBLISH_ORGANIC_POST: "פרסום פוסט אורגני",
  CREATE_AD_CAMPAIGN_DRAFT: "טיוטת קמפיין פרסום",
  LAUNCH_AD_CAMPAIGN: "השקת קמפיין פרסום",
  SCALE_EXISTING_CAMPAIGN: "הגדלת קמפיין קיים",
  PAUSE_CAMPAIGN: "השהיית קמפיין"
};

export function getGrowthActionTypeLabel(actionType: string, locale: GrowthLabelLocale = "he") {
  if (locale !== "he") return actionType.replaceAll("_", " ");
  return ACTION_TYPE_LABELS_HE[actionType] ?? actionType.replaceAll("_", " ");
}

// ---------------------------------------------------------------------------
// Connector display names
// ---------------------------------------------------------------------------

// Proper nouns (Shopify, Meta, Instagram, Facebook, TikTok, Google, Amazon)
// stay untranslated; only the descriptive half of a name is localized.
const CONNECTOR_NAMES_HE: Record<string, string> = {
  shopify: "Shopify",
  productCrawler: "קראולר מוצרים",
  amazon: "הזמנות ספק ב-Amazon",
  metaAds: "Meta Ads",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok Ads",
  googleAnalytics: "Google Analytics",
  googleSearchConsole: "Google Search Console"
};

export function getConnectorDisplayLabel(
  platform: string,
  fallbackDisplayName: string | undefined,
  locale: GrowthLabelLocale = "he"
) {
  if (locale !== "he") return fallbackDisplayName ?? platform;
  return CONNECTOR_NAMES_HE[platform] ?? fallbackDisplayName ?? platform;
}

// ---------------------------------------------------------------------------
// Monitoring metric labels
// ---------------------------------------------------------------------------

const METRIC_LABELS_HE: Record<string, string> = {
  sessions: "ביקורים",
  orders: "הזמנות",
  conversionRate: "שיעור המרה",
  aov: "ערך הזמנה ממוצע",
  revenue: "הכנסות",
  returningCustomers: "לקוחות חוזרים"
};

export function getGrowthMetricLabel(
  key: string,
  fallbackLabel: string,
  locale: GrowthLabelLocale = "he"
) {
  if (locale !== "he") return fallbackLabel;
  return METRIC_LABELS_HE[key] ?? fallbackLabel;
}

// ---------------------------------------------------------------------------
// Settings keys shown as a user-facing table on /growth-agent/rules
// ---------------------------------------------------------------------------

const SETTINGS_KEY_LABELS: Record<string, { he: string; en: string }> = {
  // thresholds
  sessionsDropPercent: { he: "ירידה בביקורים", en: "Sessions drop" },
  ordersDropPercent: { he: "ירידה בהזמנות", en: "Orders drop" },
  conversionRateDropPercent: { he: "ירידה בשיעור ההמרה", en: "Conversion rate drop" },
  aovDropPercent: { he: "ירידה בערך הזמנה ממוצע", en: "AOV drop" },
  returningCustomerDropPercent: { he: "ירידה בלקוחות חוזרים", en: "Returning customers drop" },
  trafficSourceDropPercent: { he: "ירידה במקור תנועה", en: "Traffic source drop" },
  // allowed actions
  sendAlert: { he: "שליחת התראה", en: "Send alert" },
  createRecommendation: { he: "יצירת המלצה", en: "Create recommendation" },
  createCreativeBrief: { he: "יצירת בריף קריאייטיב", en: "Create creative brief" },
  draftOrganicPost: { he: "טיוטת פוסט אורגני", en: "Draft organic post" },
  publishOrganicPost: { he: "פרסום פוסט אורגני", en: "Publish organic post" },
  createAdCampaignDraft: { he: "טיוטת קמפיין פרסום", en: "Create ad campaign draft" },
  launchAdCampaign: { he: "השקת קמפיין פרסום", en: "Launch ad campaign" },
  scaleExistingCampaign: { he: "הגדלת קמפיין קיים", en: "Scale existing campaign" },
  pauseCampaign: { he: "השהיית קמפיין", en: "Pause campaign" },
  // approval rules
  requireApprovalAboveBudget: { he: "דרישת אישור מעל תקציב", en: "Require approval above budget" },
  requireApprovalForCampaignLaunch: { he: "דרישת אישור להשקת קמפיין", en: "Require approval for campaign launch" },
  requireApprovalForScaling: { he: "דרישת אישור להגדלת תקציב", en: "Require approval for scaling" },
  requireApprovalForPublishingPost: { he: "דרישת אישור לפרסום פוסט", en: "Require approval for publishing a post" },
  // guardrails (kept here so the same map can serve future tables)
  maxDailyAdBudget: { he: "תקציב פרסום יומי מקסימלי", en: "Max daily ad budget" },
  maxSingleActionBudget: { he: "תקציב מקסימלי לפעולה בודדת", en: "Max single action budget" },
  minConfidenceScore: { he: "ציון ביטחון מינימלי", en: "Minimum confidence score" },
  requireInventoryAvailable: { he: "דרישת מלאי זמין", en: "Require inventory available" },
  minimumInventoryThreshold: { he: "סף מלאי מינימלי", en: "Minimum inventory threshold" },
  blockIfTrackingConfidenceLow: { he: "חסימה כשביטחון המדידה נמוך", en: "Block if tracking confidence is low" },
  cooldownMinutesBetweenActions: { he: "זמן המתנה בין פעולות (דקות)", en: "Cooldown between actions (minutes)" }
};

/** Splits a camelCase key into spaced words as a last-resort English label. */
function humanizeCamelCase(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function getGrowthSettingKeyLabel(key: string, locale: GrowthLabelLocale = "he") {
  const entry = SETTINGS_KEY_LABELS[key];
  if (!entry) return humanizeCamelCase(key);
  return pick(locale, entry.he, entry.en);
}

// ---------------------------------------------------------------------------
// Connector health messages
// ---------------------------------------------------------------------------

export interface LocalizedHealthMessage {
  /** What the merchant reads. */
  text: string;
  /** Raw stored message, kept for a tooltip when it differs from `text`. */
  detail: string | null;
}

type HealthRule = { pattern: RegExp; he: (match: RegExpMatchArray) => string };

// Ordered — the first match wins, so put the "…failed: <raw provider error>"
// rules BEFORE the generic "…failed." ones.
const HEALTH_RULES: HealthRule[] = [
  // Shopify
  {
    pattern: /^Store data is available through the Shopify ingestion pipeline\.$/,
    he: () => "נתוני החנות זמינים דרך צינור הקליטה של Shopify."
  },
  {
    pattern: /^Shopify ingestion is available\.$/,
    he: () => "קליטת הנתונים מ-Shopify זמינה."
  },
  {
    pattern: /^Shopify sync is healthy and metrics were refreshed\.$/,
    he: () => "הסנכרון מ-Shopify תקין והמדדים רועננו."
  },
  {
    pattern: /^Connect Shopify to enable store monitoring\.$/,
    he: () => "חברו את Shopify כדי להפעיל ניטור של החנות."
  },
  {
    pattern: /^Shopify is not connected yet\.$/,
    he: () => "Shopify עדיין לא מחובר."
  },
  // Product crawler
  {
    pattern: /^Product crawler is ready\. Add supplier, catalog, or product-listing URLs to let AI discover products\.$/,
    he: () => "קראולר המוצרים מוכן. הוסיפו כתובות של ספקים, קטלוגים או דפי מוצר כדי לאפשר גילוי מוצרים אוטומטי."
  },
  {
    pattern: /^Crawler checked (\d+) sources? and found (\d+) candidate products?\.$/,
    he: (m) => `הקראולר בדק ${m[1]} מקורות ומצא ${m[2]} מוצרים מועמדים.`
  },
  {
    pattern: /^Crawler ran but did not find enough product candidates from the configured sources\.$/,
    he: () => "הקראולר רץ אבל לא מצא מספיק מוצרים מועמדים במקורות שהוגדרו."
  },
  {
    pattern: /^Add supplier, catalog, or product-listing URLs to enable product discovery\.$/,
    he: () => "הוסיפו כתובות של ספקים, קטלוגים או דפי מוצר כדי לאפשר גילוי מוצרים."
  },
  // Amazon supplier drafting
  {
    pattern: /^Amazon supplier drafting is ready\. Save ASINs or supplier URLs to prepare manual dropship order drafts\.$/,
    he: () => "הכנת הזמנות ספק ב-Amazon מוכנה. שמרו מזהי ASIN או כתובות ספק כדי להכין טיוטות הזמנה ידניות."
  },
  {
    pattern: /^Amazon supplier drafting has (\d+) draft orders? ready for review\.$/,
    he: (m) => `להזמנות הספק ב-Amazon יש ${m[1]} טיוטות הזמנה שממתינות לבדיקה.`
  },
  {
    pattern: /^Amazon supplier drafting has (\d+) mapped products? ready for order drafting\.$/,
    he: (m) => `להזמנות הספק ב-Amazon יש ${m[1]} מוצרים ממופים שמוכנים להכנת טיוטה.`
  },
  // Meta Ads — expired / failed first (these carry raw provider errors)
  {
    pattern: /^Meta Ads token for (.+) is expired\. Regenerate it at \/settings to resume paid-media monitoring\.$/,
    he: (m) => `הטוקן של Meta Ads עבור ${m[1]} פג. חדשו אותו במסך ההגדרות כדי לחדש את ניטור המדיה בתשלום.`
  },
  {
    pattern: /^Meta Ads \((.+)\) connected, but the last sync failed: /,
    he: (m) => `Meta Ads (${m[1]}) מחובר, אבל הסנכרון האחרון נכשל. ייתכן שהחיבור ל-Meta פג — התחברו מחדש במסך ההגדרות.`
  },
  {
    pattern: /^Meta Ads \((.+)\) connected, but the last sync failed\. Retry the sync from \/settings\.$/,
    he: (m) => `Meta Ads (${m[1]}) מחובר, אבל הסנכרון האחרון נכשל. הריצו סנכרון מחדש במסך ההגדרות.`
  },
  {
    pattern: /^Meta Ads connected to (.+)\.$/,
    he: (m) => `Meta Ads מחובר לחשבון ${m[1]}.`
  },
  {
    pattern: /^Meta Ads token regenerated for (.+)\.$/,
    he: (m) => `הטוקן של Meta Ads חודש עבור ${m[1]}.`
  },
  {
    pattern: /^Meta Ads synced (\d+) daily campaign rows?\(?s?\)? and (\d+) daily ad\/creative rows?\(?s?\)?\.$/,
    he: (m) => `Meta Ads סנכרן ${m[1]} שורות קמפיין יומיות ו-${m[2]} שורות מודעה/קריאייטיב יומיות.`
  },
  {
    pattern: /^Meta Ads is not connected yet\. Connect your Meta ad account at \/settings to enable paid-media monitoring\.$/,
    he: () => "Meta Ads עדיין לא מחובר. חברו את חשבון הפרסום שלכם ב-Meta במסך ההגדרות כדי להפעיל ניטור מדיה בתשלום."
  },
  // Instagram
  {
    pattern: /^Instagram \((.+)\) connected, but the last sync failed: /,
    he: (m) => `Instagram (${m[1]}) מחובר, אבל הסנכרון האחרון נכשל. ייתכן שהחיבור פג — התחברו מחדש במסך ההגדרות.`
  },
  {
    pattern: /^Instagram \((.+)\) connected, but the last sync failed\. Retry the sync from \/settings\.$/,
    he: (m) => `Instagram (${m[1]}) מחובר, אבל הסנכרון האחרון נכשל. הריצו סנכרון מחדש במסך ההגדרות.`
  },
  {
    pattern: /^Instagram connected as (.+)\.$/,
    he: (m) => `Instagram מחובר בתור ${m[1]}.`
  },
  {
    pattern: /^Instagram creator signals are available\.$/,
    he: () => "אותות היוצרים מ-Instagram זמינים."
  },
  {
    pattern: /^Instagram is not connected yet\. Connect Instagram at \/settings to monitor organic creator signals\.$/,
    he: () => "Instagram עדיין לא מחובר. חברו את Instagram במסך ההגדרות כדי לנטר אותות אורגניים של יוצרים."
  },
  // Facebook / TikTok / GA4
  {
    pattern: /^Facebook page\/traffic signals are not connected yet\. Connect Meta at \/settings\.$/,
    he: () => "אותות העמוד והתנועה מ-Facebook עדיין לא מחוברים. חברו את Meta במסך ההגדרות."
  },
  {
    pattern: /^TikTok Ads is not connected yet\. OAuth connection is not available in-app yet — contact support to connect TikTok\.$/,
    he: () => "TikTok Ads עדיין לא מחובר. חיבור OAuth אינו זמין באפליקציה כרגע — פנו לתמיכה כדי לחבר את TikTok."
  },
  {
    pattern: /^Google Analytics \(GA4\) is not connected yet\. OAuth connection is not available in-app yet — contact support to connect GA4\.$/,
    he: () => "Google Analytics (GA4) עדיין לא מחובר. חיבור OAuth אינו זמין באפליקציה כרגע — פנו לתמיכה כדי לחבר את GA4."
  }
];

// Raw provider errors that must never reach the merchant verbatim, whatever
// wrapper text they arrive in. English users get a friendly line too — the raw
// string is preserved in `detail` for the tooltip.
const RAW_PROVIDER_ERROR_PATTERNS: { pattern: RegExp; he: string; en: string }[] = [
  {
    pattern: /Error validating access token|Session has expired|OAuthException|invalid_grant|Invalid OAuth access token/i,
    he: "החיבור ל-Meta פג — התחברו מחדש במסך ההגדרות.",
    en: "Meta connection expired — reconnect in Settings."
  }
];

/**
 * Turns a stored connector `healthMessage` into merchant-facing copy.
 * Unknown messages pass through unchanged so a new service string is never
 * swallowed — it just stays in its original language until it gets a rule.
 */
export function localizeConnectorHealthMessage(
  message: string | null | undefined,
  locale: GrowthLabelLocale = "he"
): LocalizedHealthMessage {
  const raw = (message ?? "").trim();
  if (!raw) return { text: "", detail: null };

  // A raw provider error anywhere in the string wins: never render it verbatim.
  for (const rule of RAW_PROVIDER_ERROR_PATTERNS) {
    if (rule.pattern.test(raw)) {
      return { text: pick(locale, rule.he, rule.en), detail: raw };
    }
  }

  if (locale !== "he") return { text: raw, detail: null };

  for (const rule of HEALTH_RULES) {
    const match = raw.match(rule.pattern);
    if (match) {
      const text = rule.he(match);
      return { text, detail: text === raw ? null : raw };
    }
  }

  return { text: raw, detail: null };
}
