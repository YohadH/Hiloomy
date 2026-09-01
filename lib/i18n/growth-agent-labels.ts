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

// ── Generated text (findings / proposals) ───────────────────────────────
//
// The anomaly service and the action engine compose their summaries, titles
// and recommended actions from a FINITE set of English templates, and the
// rows are stored as written. Localize at render time like everything else
// here: exact-match dictionary for fixed phrases, regex templates for the
// ones that carry a number or a metric name. Unknown text passes through
// unchanged (never blank a row because a template was added).

const GROWTH_METRIC_HE: Record<string, string> = {
  sessions: "ביקורים",
  orders: "הזמנות",
  conversion_rate: "יחס ההמרה",
  inventory: "מלאי",
  tracking_confidence: "אמינות המעקב",
  revenue: "הכנסות",
  aov: "סל ממוצע"
};

const GROWTH_PHRASE_HE: Record<string, string> = {
  "Audit paid and organic traffic sources first": "לבדוק קודם את מקורות התנועה הממומנים והאורגניים",
  "Avoid budget increases until tracking is confirmed": "לא להגדיל תקציבים עד שהמעקב מאומת",
  "Block paid scale actions for low-inventory products": "לחסום הגדלת תקציב למוצרים במלאי נמוך",
  "Campaign delivery weakened": "האספקה של הקמפיינים נחלשה",
  "Check acquisition channel health before changing site conversion elements": "לבדוק את בריאות ערוצי הרכישה לפני שינויים באלמנטים של ההמרה באתר",
  "Connect an analytics source or validate UTM/pixel coverage": "לחבר מקור אנליטיקס או לאמת את כיסוי ה-UTM/פיקסל",
  "Cross-source attribution is only partially connected": "שיוך בין המקורות מחובר חלקית בלבד",
  "Do not auto-execute paid actions": "לא להריץ אוטומטית פעולות ממומנות",
  "Inspect this channel before changing other levers": "לבדוק את הערוץ הזה לפני שמזיזים מנופים אחרים",
  "Inventory or merchandising issues may be impacting purchase intent": "ייתכן שבעיות מלאי או מרצ'נדייזינג פוגעות בכוונת הרכישה",
  "Keep monitoring active and review the next scheduled scan": "להמשיך במעקב ולבדוק את הסריקה המתוזמנת הבאה",
  "Merchandising or checkout friction increased": "החיכוך במרצ'נדייזינג או בקופה גדל",
  "No material growth issues crossed the configured thresholds in the latest scan.": "בסריקה האחרונה לא חצו בעיות צמיחה מהותיות את הספים שהוגדרו.",
  "Only draft paid recovery actions if confidence remains high": "להכין פעולות שיקום ממומנות רק אם רמת הביטחון נשארת גבוהה",
  "Pause any scale-up action until conversion normalizes": "להשהות כל הגדלת תקציב עד שההמרה מתייצבת",
  "Product demand is stable but reach is down": "הביקוש למוצרים יציב, אבל החשיפה ירדה",
  "Product page, offer, or checkout friction likely increased": "כנראה גדל החיכוך בעמוד המוצר, בהצעה או בקופה",
  "Restock timing may lag demand recovery": "תזמון החידוש עלול לפגר אחרי התאוששות הביקוש",
  "Review checkout behavior, PDP changes, and in-stock availability": "לבדוק את התנהגות הקופה, שינויים בעמודי מוצר וזמינות במלאי",
  "Review checkout funnel and hero SKU inventory": "לבדוק את משפך הקופה ואת מלאי המוצרים המובילים",
  "Review replenishment timing before traffic expansion": "לבדוק את תזמון החידוש לפני הרחבת התנועה",
  "Source-specific tracking or content cadence changed": "המעקב או קצב התוכן במקור הזה השתנו",
  "Store conversion may be weaker": "ייתכן שההמרה בחנות נחלשה",
  "Store performance is within the current baseline window": "ביצועי החנות בתוך חלון הבסיס הנוכחי",
  "Strong demand depleted inventory": "ביקוש חזק רוקן את המלאי",
  "Tracking coverage may have changed across channels": "ייתכן שכיסוי המעקב השתנה בין הערוצים",
  "Traffic decline is the larger factor": "ירידת התנועה היא הגורם הגדול יותר",
  "Traffic source coverage is incomplete": "כיסוי מקורות התנועה חלקי",
  "Traffic source delivery is softer than normal": "האספקה ממקור התנועה חלשה מהרגיל",
  "Verify analytics and pixel coverage": "לאמת את כיסוי האנליטיקס והפיקסל",
  "Review issue": "לבדוק את הממצא"
};

function growthMetricHe(name: string): string {
  return GROWTH_METRIC_HE[name] ?? name;
}

/**
 * Localize agent-generated text (finding summaries, proposal titles/reasons,
 * recommended actions) for display. English passes through untouched.
 */
export function localizeGrowthText(text: string | null | undefined, locale: GrowthLabelLocale = "he"): string {
  if (!text) return "";
  if (locale !== "he") return text;
  const exact = GROWTH_PHRASE_HE[text.trim()];
  if (exact) return exact;

  let m: RegExpMatchArray | null;
  // Action titles (engine) — recurse on the embedded summary / metric.
  if ((m = text.match(/^Notify team: (.+)$/))) return `עדכון הצוות: ${localizeGrowthText(m[1], "he")}`;
  if ((m = text.match(/^Create recommendation for (.+)$/))) return `יצירת המלצה עבור ${growthMetricHe(m[1])}`;
  if ((m = text.match(/^Pause risky spend around low inventory: (.+)$/))) return `השהיית הוצאה מסוכנת סביב מלאי נמוך: ${growthMetricHe(m[1])}`;
  if ((m = text.match(/^Generate a creative recovery brief for (.+)$/))) return `הכנת בריף קריאייטיב לשיקום ${growthMetricHe(m[1])}`;
  if ((m = text.match(/^Review sourced product idea: (.+)$/))) return `בדיקת רעיון מוצר: ${m[1]}`;
  // Finding summaries (anomaly service).
  if ((m = text.match(/^Sessions down ([\d.]+)% versus the 7-day baseline\.?$/))) return `הביקורים ירדו ב-${m[1]}% לעומת ממוצע 7 הימים.`;
  if ((m = text.match(/^Orders down ([\d.]+)% versus the 7-day baseline\.?$/))) return `ההזמנות ירדו ב-${m[1]}% לעומת ממוצע 7 הימים.`;
  if ((m = text.match(/^Conversion rate dropped ([\d.]+)% while sessions were relatively stable\.?$/))) return `יחס ההמרה ירד ב-${m[1]}% בעוד הביקורים נשארו יציבים יחסית.`;
  if ((m = text.match(/^(.+) traffic is down ([\d.]+)%\.?$/))) return `התנועה מ-${m[1]} ירדה ב-${m[2]}%.`;
  if ((m = text.match(/^Top product inventory is under the guardrail threshold for (.+?)\.?$/))) return `המלאי של ${m[1]} מתחת לסף הבטיחות.`;
  if ((m = text.match(/^Tracking confidence is (\d+)%, below the configured action threshold\.?$/))) return `אמינות המעקב היא ${m[1]}%, מתחת לסף שהוגדר לפעולות.`;
  if ((m = text.match(/^Potential product opportunity found: (.+?)\.?$/))) return `נמצאה הזדמנות מוצר אפשרית: ${m[1]}.`;
  return text;
}
