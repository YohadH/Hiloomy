// Bilingual strings for the SaaS surfaces (Phase 1-4). Inlined separately
// from the main dictionary because:
//   1. These components mount under multiple route trees; importing the
//      dictionary in a Client Component pulls a big bundle
//   2. Bilingual lookups are tiny enough that one helper file scales fine
//
// Pattern: `useSaasStrings(locale)` → object with all section strings.

export type UiLocale = "he" | "en";

export const saasStrings = {
  he: {
    syncNow: {
      idle: "סנכרון עכשיו",
      running: "מסנכרן…",
      done: "סונכרן",
      error: "סנכרון נכשל",
      tooltip: "משוך נתונים טריים מShopify, Meta Ads וInstagram עכשיו (הסנכרון האוטומטי רץ ברקע כל שעתיים)."
    },
    shopifyOauth: {
      headline: "התקנה דרך Shopify (OAuth — מומלץ)",
      subline: "קבלו טוקן Shopify אוטומטית בלי להעתיק ולהדביק. נדרשת אפליקציית Partner של Shopify (Client ID + Secret) מוגדרת למטה או במשתני סביבה.",
      credsReady: "פרטי האפליקציה מוגדרים",
      credsMissing: "פרטי האפליקציה חסרים",
      credsMissingBody: "הגדירו אותם למטה לפני שתוכלו להשתמש בOAuth, או הדביקו טוקן Admin בטופס שלמטה.",
      install: "התקינו דרך Shopify",
      domainPlaceholder: "yourstore.myshopify.com",
      domainRequired: "הזינו את כתובת החנות (לדוגמה: yourstore.myshopify.com).",
      credsCardTitle: "פרטי אפליקציית Shopify Partner",
      credsCardTitleHidden: "פרטי אפליקציית Shopify Partner — Client ID + Secret",
      credsFormSubtitle: "מהPartner Dashboard של Shopify (לוח הבקרה של שותפי Shopify) ← האפליקציה שלכם ← Client credentials. הClient Secret מתחיל ב-",
      stored: "מוצפן בבסיס הנתונים.",
      clientIdLabel: "Client ID",
      clientIdPlaceholder: "מחרוזת hex של 32 תווים מהPartner Dashboard",
      clientSecretLabel: "Client Secret",
      clientSecretLabelSet: "Client Secret (מוגדר כעת — הדביקו שוב להחלפה)",
      save: "שמרו פרטים",
      saving: "שומר…",
      savedMsg: "הפרטים נשמרו. עכשיו תוכלו ללחוץ על 'התקינו דרך Shopify' למעלה.",
      openPartner: "פתחו את הPartner Dashboard",
      callbackHint: "ודאו שלאפליקציית הPartner יש את הכתובת הזו ברשימת הAllowed redirection URLs:"
    },
    bixgrow: {
      title: "Webhook של BixGrow עבור",
      subtitle: "הדביקו את כתובת הURL הזו בBixGrow ← Webhooks ← New conversion כדי לדחוף כל הזמנה משויכת למותג הזה בזמן אמת.",
      slugLabel: "מזהה URL",
      slugPlaceholder: "לדוגמה: aftershower, incense, oliere",
      slugHint: "אותיות קטנות, ספרות וקווים מפרידים. ייחודי גלובלי בין כל המותגים.",
      saveButton: "שמרו",
      savingButton: "שומר…",
      webhookUrl: "כתובת Webhook",
      copy: "העתיקו",
      copied: "הועתק",
      saveSlugFirst: "שמרו מזהה תחילה, ואז תופיע כאן כתובת הWebhook.",
      payloadDetails: "איזה תוכן BixGrow צריך לשלוח?",
      payloadAfter: "כל קריאה יוצרת/מעדכנת שורת AffiliateAttribution. שליחות חוזרות מטופלות אוטומטית."
    },
    enrichedChart: {
      revenue: "הכנסה",
      profit: "רווח",
      topProducts: "מוצרים מובילים",
      campaigns: "קמפיינים בMeta Ads",
      spend: "הוצאה",
      campaignRevenue: "הכנסה מהקמפיין",
      campaignRoas: "ROAS",
      posts: "פוסטים בInstagram",
      eng: "מעורבות",
      discounts: "קופונים שנוצלו",
      noEvents: "אין אירועים מתועדים ביום הזה.",
      legendCampaigns: "🎯 Meta Ads פעיל",
      legendPosts: "📸 פוסט באינסטגרם",
      legendDiscounts: "🏷 שימוש בקופון",
      legendHint: "— העבירו עכבר על יום כלשהו לפרטים מלאים"
    },
    conversions: {
      order: "הזמנה",
      date: "תאריך",
      affiliate: "שותף",
      affiliateId: "מזהה שותף",
      coupon: "קופון",
      total: "סכום",
      commission: "עמלה",
      status: "סטטוס",
      tracking: "מעקב",
      content: "תוכן"
    },
    common: {
      unexpectedError: "שגיאה לא צפויה.",
      saved: "נשמר.",
      cancel: "ביטול",
      save: "שמרו",
      back: "חזרה"
    }
  },
  en: {
    syncNow: {
      idle: "Sync now",
      running: "Syncing…",
      done: "Synced",
      error: "Sync failed",
      tooltip: "Pull fresh data from Shopify, Meta Ads, and Instagram right now (the 2h cron also runs in the background)."
    },
    shopifyOauth: {
      headline: "Install via Shopify (OAuth — recommended)",
      subline: "Get an Admin API token automatically without copy-pasting. Requires a Shopify Partner app (Client ID + Secret) configured below or in env vars.",
      credsReady: "Partner app credentials are set",
      credsMissing: "Partner app credentials are missing",
      credsMissingBody: "Configure them below before OAuth can work, or paste an Admin token in the form further down as a fallback.",
      install: "Install via Shopify",
      domainPlaceholder: "yourstore.myshopify.com",
      domainRequired: "Enter your Shopify store domain first (e.g. yourstore.myshopify.com).",
      credsCardTitle: "Shopify Partner app credentials",
      credsCardTitleHidden: "Shopify Partner app credentials — Client ID + Secret",
      credsFormSubtitle: "From your Shopify Partner Dashboard → your app → Client credentials. The Client Secret starts with ",
      stored: "Stored encrypted at rest.",
      clientIdLabel: "Client ID",
      clientIdPlaceholder: "32-char hex string from Partner Dashboard",
      clientSecretLabel: "Client Secret",
      clientSecretLabelSet: "Client Secret (currently set — paste again to replace)",
      save: "Save credentials",
      saving: "Saving…",
      savedMsg: "Credentials saved. You can now click 'Install via Shopify' above.",
      openPartner: "Open Partner Dashboard",
      callbackHint: "Make sure your Partner app has this in its Allowed redirection URLs:"
    },
    bixgrow: {
      title: "BixGrow webhook for",
      subtitle: "Paste this URL into BixGrow → Webhooks → New conversion to push every attributed order to this brand in real time.",
      slugLabel: "URL slug",
      slugPlaceholder: "e.g. aftershower, incense, oliere",
      slugHint: "Lowercase letters, digits, and hyphens. Globally unique across all brands.",
      saveButton: "Save",
      savingButton: "Saving…",
      webhookUrl: "Webhook URL",
      copy: "Copy",
      copied: "Copied",
      saveSlugFirst: "Save a slug first, then the webhook URL appears below.",
      payloadDetails: "What payload should BixGrow send?",
      payloadAfter: "Each delivery upserts an AffiliateAttribution row. Re-deliveries of the same order are deduplicated."
    },
    enrichedChart: {
      revenue: "Revenue",
      profit: "Profit",
      topProducts: "Top products",
      campaigns: "Meta Ads campaigns",
      spend: "spend",
      campaignRevenue: "revenue",
      campaignRoas: "ROAS",
      posts: "Instagram posts",
      eng: "eng",
      discounts: "Discounts redeemed",
      noEvents: "No events tracked on this day.",
      legendCampaigns: "🎯 Meta Ads active",
      legendPosts: "📸 Instagram post",
      legendDiscounts: "🏷 Discount redeemed",
      legendHint: "— hover any day for the full story"
    },
    conversions: {
      order: "Order",
      date: "Date",
      affiliate: "Affiliate",
      affiliateId: "Affiliate ID",
      coupon: "Coupon",
      total: "Total",
      commission: "Commission",
      status: "Status",
      tracking: "Tracking",
      content: "Content"
    },
    common: {
      unexpectedError: "Unexpected error.",
      saved: "Saved.",
      cancel: "Cancel",
      save: "Save",
      back: "Back"
    }
  }
} as const;

export function useSaasStrings(locale: UiLocale) {
  return saasStrings[locale];
}

// Server-side helper — read locale cookie or fall back to "he".
export async function getSaasStrings(): Promise<(typeof saasStrings)["he"]> {
  const { cookies } = await import("next/headers");
  const c = await cookies();
  const locale = c.get("app_locale")?.value === "en" ? "en" : "he";
  // Cast because TS treats the literal types as incompatible across
  // languages even though the structure is identical.
  return saasStrings[locale] as (typeof saasStrings)["he"];
}
