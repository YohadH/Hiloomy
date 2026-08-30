// Bilingual strings for the PUBLIC, affiliate-facing surfaces (HLA-12):
//   /join/{slug}        — signup page + form
//   /my/{slug}          — login page + magic-link form
//   /my/{slug}/dashboard — the affiliate's own sales dashboard
//
// These are the pages a prospective/active affiliate sees — NOT the
// merchant portal (that one uses the app dictionary + per-user locale).
// Inlined here, next to those routes, for the same reasons auth-strings.ts
// is: they render before any user/session/dictionary exists.
//
// Language selection (see resolveAffiliateLocale): a `?lang=he|en` URL
// override wins first, then the program's configured default
// (AffiliateProgram.signupLocale — "according to the user in Hiloomy"),
// then Hebrew. The merchant can therefore hand out either an EN or an HE
// link, and the affiliate can flip languages on the page itself.

export type AffiliateLocale = "he" | "en";

/** URL `?lang` override → program default → "he". Anything unrecognized falls through. */
export function resolveAffiliateLocale(
  langParam: string | null | undefined,
  programDefault: string | null | undefined
): AffiliateLocale {
  const normalize = (v: string | null | undefined): AffiliateLocale | null => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "en" || s === "he" ? s : null;
  };
  return normalize(langParam) ?? normalize(programDefault) ?? "he";
}

export function affiliateDir(locale: AffiliateLocale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Number/date locale tag for toLocaleString on these pages. */
export function affiliateIntlLocale(locale: AffiliateLocale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

export const affiliatePublicStrings = {
  he: {
    // shared
    poweredBy: "מופעל על ידי Hiloomy",
    copy: "העתקה",
    copied: "הועתק!",
    logout: "יציאה",
    languageToggle: "English",

    join: {
      metaTitle: (brand: string) => `הצטרפות לתוכנית השותפים של ${brand}`,
      metaTitleFallback: "הצטרפות לתוכנית שותפים",
      headline: (brand: string) => `הצטרפו לתוכנית השותפים של ${brand}`,
      defaultCopy: (pct: number) =>
        `מרוויחים ${pct}% עמלה על כל הזמנה שמגיעה דרככם — עם קישור אישי, קוד קופון, ודשבורד שמראה בדיוק כמה מכרתם.`,
      commissionBadge: (pct: number) => `${pct}% עמלה על כל הזמנה`,
      termsSummary: "תנאי התוכנית",
      alreadyMember: "כבר רשומים?",
      loginLink: "כניסה לדשבורד שלכם"
    },

    signupForm: {
      fullName: "שם מלא",
      email: "אימייל",
      instagram: "@ שם המשתמש באינסטגרם או קישור לפרופיל",
      submit: "הצטרפות לתוכנית",
      finePrint: "בלחיצה על הכפתור מאשרים את תנאי התוכנית. תקבלו קישור אישי וגישה לדשבורד עם המכירות והעמלות שלכם.",
      existingLine1: "הכתובת הזו כבר רשומה בתוכנית 🎉",
      existingLine2: "שלחנו לה עכשיו קישור כניסה לדשבורד — בדקו את המייל (גם בספאם).",
      errorFallback: "ההרשמה נכשלה — נסו שוב."
    },

    login: {
      title: "הדשבורד שלך",
      subtitle: "הכניסו את האימייל שנרשמתם איתו — נשלח לכם קישור כניסה. בלי סיסמאות.",
      notMember: "עוד לא בתוכנית?",
      joinLink: "הצטרפו כאן",
      emailPlaceholder: "האימייל שנרשמתם איתו",
      submit: "שלחו לי קישור כניסה",
      sent: "אם הכתובת רשומה בתוכנית — קישור כניסה בדרך אליה עכשיו (תקף ל־15 דקות; בדקו גם בספאם).",
      errorFallback: "השליחה נכשלה — נסו שוב."
    },

    dashboard: {
      metaTitle: (brand: string) => `הדשבורד שלי · ${brand}`,
      metaTitleFallback: "הדשבורד שלי",
      greeting: (name: string) => `היי ${name} 👋`,
      pendingBadge: "ההרשמה ממתינה לאישור המותג — הקישור שלך כבר עובד ונספר",
      referralLabel: "הקישור האישי שלך",
      couponLabel: "קוד הקופון שלך",
      ranges: { month: "החודש", "30d": "30 יום", all: "מאז ומעולם" },
      kpiSales: "מכירות שהבאת",
      kpiOrders: "הזמנות",
      kpiCommission: "העמלה שלך",
      kpiClicks: "קליקים על הקישור",
      conversionSuffix: "% המרה",
      statusUnpaid: "ממתין לאישור",
      statusApproved: "מאושר לתשלום",
      statusPaid: "שולם",
      conversionsTitle: "ההזמנות שהגיעו דרכך",
      conversionsEmpty: "עדיין אין הזמנות בטווח הזה — שתפו את הקישור או את הקופון שלכם והן יופיעו כאן.",
      thDate: "תאריך",
      thOrder: "הזמנה",
      thSale: "מכירה",
      thCommission: "העמלה שלך",
      thStatus: "סטטוס",
      statusLabels: {
        unpaid: "ממתין לאישור",
        approved: "מאושר לתשלום",
        paid: "שולם",
        cancelled: "בוטל",
        refunded: "הוחזר"
      } as Record<string, string>
    }
  },

  en: {
    poweredBy: "Powered by Hiloomy",
    copy: "Copy",
    copied: "Copied!",
    logout: "Sign out",
    languageToggle: "עברית",

    join: {
      metaTitle: (brand: string) => `Join ${brand}'s affiliate program`,
      metaTitleFallback: "Join the affiliate program",
      headline: (brand: string) => `Join ${brand}'s affiliate program`,
      defaultCopy: (pct: number) =>
        `Earn ${pct}% commission on every order that comes through you — with a personal link, a coupon code, and a dashboard that shows exactly how much you've sold.`,
      commissionBadge: (pct: number) => `${pct}% commission on every order`,
      termsSummary: "Program terms",
      alreadyMember: "Already registered?",
      loginLink: "Sign in to your dashboard"
    },

    signupForm: {
      fullName: "Full name",
      email: "Email",
      instagram: "@ Instagram username or profile link",
      submit: "Join the program",
      finePrint: "By clicking you accept the program terms. You'll get a personal link and access to a dashboard with your sales and commissions.",
      existingLine1: "This address is already in the program 🎉",
      existingLine2: "We've just emailed it a login link to the dashboard — check your inbox (and spam).",
      errorFallback: "Signup failed — please try again."
    },

    login: {
      title: "Your dashboard",
      subtitle: "Enter the email you signed up with — we'll send you a login link. No passwords.",
      notMember: "Not in the program yet?",
      joinLink: "Join here",
      emailPlaceholder: "The email you signed up with",
      submit: "Send me a login link",
      sent: "If that address is in the program, a login link is on its way now (valid for 15 minutes; check spam too).",
      errorFallback: "Couldn't send — please try again."
    },

    dashboard: {
      metaTitle: (brand: string) => `My dashboard · ${brand}`,
      metaTitleFallback: "My dashboard",
      greeting: (name: string) => `Hi ${name} 👋`,
      pendingBadge: "Your signup is pending the brand's approval — your link already works and is being counted",
      referralLabel: "Your personal link",
      couponLabel: "Your coupon code",
      ranges: { month: "This month", "30d": "30 days", all: "All time" },
      kpiSales: "Sales you drove",
      kpiOrders: "Orders",
      kpiCommission: "Your commission",
      kpiClicks: "Link clicks",
      conversionSuffix: "% conversion",
      statusUnpaid: "Pending approval",
      statusApproved: "Approved for payout",
      statusPaid: "Paid",
      conversionsTitle: "Orders that came through you",
      conversionsEmpty: "No orders in this range yet — share your link or coupon and they'll show up here.",
      thDate: "Date",
      thOrder: "Order",
      thSale: "Sale",
      thCommission: "Your commission",
      thStatus: "Status",
      statusLabels: {
        unpaid: "Pending approval",
        approved: "Approved for payout",
        paid: "Paid",
        cancelled: "Cancelled",
        refunded: "Refunded"
      } as Record<string, string>
    }
  }
} as const;

export function affiliateStrings(locale: AffiliateLocale) {
  return affiliatePublicStrings[locale];
}
