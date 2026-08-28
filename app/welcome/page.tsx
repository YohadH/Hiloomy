import { Rubik, Heebo } from "next/font/google";
import { getAppLocale, isValidLocale, type AppLocale } from "@/lib/i18n";
import { PLANS } from "@/lib/billing/plans";
import { HiloomyLogo, HiloomyMark } from "@/components/ui/logo";
import {
  LayersScroller,
  FeaturesGrid,
  PricingPlans,
  MobileNav,
  type LayerItem,
  type FeatureItem,
  type PlanItem
} from "@/components/marketing/home-interactive";
import { HeroBanner } from "@/components/marketing/hero-banner";
import { SectionHead } from "@/components/marketing/section-head";
import { Faq } from "@/components/marketing/faq";

// Public marketing landing. Served at "/" for anonymous visitors (middleware
// rewrite) and directly at /welcome. Bilingual (he default, ?lang= override).
//
// Design (Aug 2026): replaced the "financial broadsheet" treatment. Off-white
// paper ground with alternating white bands, oversized geometric-sans
// headlines at locale-aware tracking, a pill vocabulary for every button and
// eyebrow, and one repeated section rhythm — <SectionHead> gives every
// section an eyebrow pill, an H2 and a two-line subhead, which is what makes
// a long page read as designed rather than assembled.
//
// Positioning is "making your vision clear": many disconnected data sources
// resolved into one picture. The former leak-hunting framing and the ₪5,000
// guarantee are gone — deliberately, they were promises we couldn't keep.

// Rubik + Heebo replace Suez One + Alef here. The look this page is going
// for is oversized geometric-sans headlines at tight tracking, which a
// serif display can't do — and both families cover Latin AND Hebrew, so
// the two locales share one design instead of looking like two sites.
// Alef also topped out at 700, and this needs 800.
const displayFont = Rubik({
  subsets: ["latin", "hebrew"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-hl-display"
});

const bodyFont = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "700"],
  variable: "--font-hl-body"
});

const INK = "#201E1D";
const GREEN = "#14512C";
const GREEN_DARK = "#12341F";
const ORANGE = "#D1731F";
const PAPER = "#F7F7F6";
const DIM = "#605D5D";
const HAIR = "rgba(32,30,29,.12)";

export const metadata = {
  title: "Hiloomy — Making your vision clear",
  description:
    "Shopify, Meta Ads, Instagram, GA4 and your affiliates in one picture. See what revenue actually stays as profit — per product, per campaign, per discount code. הופכים את התמונה שלכם לברורה."
};

function getCopy(isHe: boolean) {
  return isHe
    ? {
        nav: { features: "יכולות", how: "איך זה עובד", report: "הדוח השבועי", pricing: "מחירים", security: "אבטחה", login: "התחברות", cta: "צרו משתמש", switchLabel: "EN" },
        dateline: { brand: "Hiloomy · מודיעין רווח לאיקומרס", tag: "רענון כל שעתיים", meta: "גרסה 2026" },
        hero: {
          title: "הופכים את התמונה שלכם לברורה.",
          body: "Shopify, Meta Ads, Instagram, GA4 והשותפים שלכם מגיעים כחמישה סיפורים נפרדים. Hiloomy מחבר אותם לתמונה אחת ומראה כמה מההכנסות באמת נשאר כרווח — לכל מוצר, לכל קמפיין ולכל קוד הנחה.",
          // Was a ₪5,000 leak guarantee. Replaced with a statement of what we
          // compute — a promise we can actually keep.
          guarantee: "מספר אחד שאפשר לסמוך עליו — רווח אחרי עלות מוצר, פרסום, הנחות והחזרות.",
          fine: "ללא כרטיס אשראי · חיבור ב־30 שניות · הרשאות קריאה בלבד",
          ctaSecondary: "איך זה בנוי"
        },
        layers: {
          kicker: "שלוש שכבות",
          title: "נתונים נכנסים. אותות עולים. צמיחה יוצאת."
        },
        steps: {
          kicker: "איך זה עובד",
          title: "מהתקנה לתמונה מלאה, בשלושה צעדים.",
          sub: "בלי מיפוי דאטה, בלי צוות אינטגרציה. רוב החנויות מחוברות ורואות מספרים תוך דקה.",
          items: [
            {
              n: "01",
              t: "מחברים",
              d: "מתקינים מ־Shopify ומאשרים הרשאות קריאה בלבד. Meta Ads, Instagram ו־GA4 בקליק אחד כל אחד."
            },
            {
              n: "02",
              t: "מאחדים",
              d: "אנחנו מושכים הזמנות, עלויות, תקציבי פרסום, הנחות והחזרות למקום אחד — ומיישבים אותם מול המספרים של Shopify עצמה."
            },
            {
              n: "03",
              t: "מחליטים",
              d: "כל מסך עונה על שתי שאלות: מה קרה, ומה זה אומר על הרווח — לכל מוצר, לכל קמפיין ולכל קוד הנחה."
            }
          ]
        },
        faq: {
          kicker: "שאלות נפוצות",
          title: "מה שחשוב לדעת לפני שמתחברים.",
          items: [
            {
              q: "מה Hiloomy בעצם מחשב?",
              a: "רווח תרומה: מכירות נטו אחרי הנחות והחזרות, פחות עלות המוצר ופחות עמלות שותפים, מול תקציב הפרסום. כל מספר ניתן לפתיחה עד להזמנה הבודדת ב־Shopify."
            },
            {
              q: "אתם צריכים הרשאות כתיבה לחנות?",
              a: "לא. ההרשאות מול Shopify הן קריאה בלבד — Hiloomy לא יכול לשנות מוצרים, הזמנות או לקוחות."
            },
            {
              q: "כמה הנתונים מעודכנים?",
              a: "הזמנות מסתנכרנות דרך webhooks של Shopify, ויישוב מלא רץ כל שעתיים."
            },
            {
              q: "אילו פלטפורמות מתחברות?",
              a: "Shopify, Meta Ads, Instagram, Google Analytics 4 ו־Google Search Console. תוכניות שותפים נטענות מקובץ CSV או לפי מיפוי קודי קופון."
            },
            {
              q: "המוצר עובד בעברית?",
              a: "כן — כולו, כולל הדוח השבועי והמיילים. אפשר להחליף שפה בכל רגע."
            },
            {
              q: "מה קורה אם מבטלים?",
              a: "מתנתקים מההגדרות והנתונים נמחקים. בלי דמי ייצוא ובלי תקופת שמירה."
            }
          ]
        },
        features: {
          kicker: "מה זה עושה בפועל",
          title: "שש יכולות. כל אחת עונה על שתי שאלות: מה קורה, ומה עושים."
        },
        integrations: {
          kicker: "מתחבר למה שכבר יש לכם",
          title: "בלי מיפוי דאטה, בלי צוות אינטגרציה, בלי מחסן נתונים נפרד."
        },
        pricing: { kicker: "מחירים", title: "14 ימי ניסיון. בלי כרטיס.", popular: "הכי פופולרי", perMonth: "/ חודש", cta: "התחילו בחינם" },
        security: {
          kicker: "אבטחה",
          title: "הנתונים שלכם, בכספת.",
          body: "טוקנים של Shopify מוצפנים במנוחה ולא עוזבים את השרת. כל לקוח מבודד ברמת מסד הנתונים, ההרשאות לחנות הן קריאה בלבד, ואפשר להתנתק ולמחוק הכל בכל רגע."
        },
        final: {
          title: "תראו את המספרים האמיתיים תוך דקה.",
          body: "30 שניות להירשם, דקה לחבר את Shopify, 14 ימים לבדוק את הכל בלי התחייבות.",
          stats: [
            ["30 שנ׳", "להרשמה"],
            ["6", "מקורות מסונכרנים"],
            ["14 יום", "ניסיון חינם"]
          ] as Array<[string, string]>
        },
        footer: {
          product: "מוצר",
          company: "חברה",
          privacy: "פרטיות",
          terms: "תנאי שימוש",
          legal: "© 2026 Hiloomy. כל הזכויות שמורות.",
          switchLong: "Switch to English"
        }
      }
    : {
        nav: { features: "Features", how: "How it works", report: "Weekly report", pricing: "Pricing", security: "Security", login: "Log in", cta: "Create account", switchLabel: "עב" },
        dateline: { brand: "Hiloomy · Ecommerce Profit Intelligence", tag: "Refreshed every two hours", meta: "Edition 2026" },
        hero: {
          title: "Making your vision clear.",
          body: "Shopify, Meta Ads, Instagram, GA4 and your affiliates arrive as five separate stories. Hiloomy joins them into one picture and shows what revenue actually stays as profit — per product, per campaign, per discount code.",
          // Was a ₪5,000 leak guarantee. Replaced with a statement of what we
          // compute — a promise we can actually keep.
          guarantee: "One number you can trust — profit after cost of goods, ads, discounts and returns.",
          fine: "No credit card · Connect in 30 seconds · Read-only scopes",
          ctaSecondary: "How it's built"
        },
        layers: { kicker: "Three layers", title: "Data in. Signals up. Growth out." },
        steps: {
          kicker: "How it works",
          title: "From install to the full picture, in three steps.",
          sub: "No data mapping, no integration team. Most stores are connected and reading real numbers inside a minute.",
          items: [
            {
              n: "01",
              t: "Connect",
              d: "Install from Shopify and approve read-only access. Meta Ads, Instagram and GA4 are one click each."
            },
            {
              n: "02",
              t: "Unify",
              d: "We pull orders, costs, ad spend, discounts and returns into one place — and reconcile them against Shopify's own numbers."
            },
            {
              n: "03",
              t: "Decide",
              d: "Every screen answers two questions: what happened, and what it means for profit — per product, per campaign, per discount code."
            }
          ]
        },
        faq: {
          kicker: "FAQ",
          title: "What's worth knowing before you connect.",
          items: [
            {
              q: "What does Hiloomy actually calculate?",
              a: "Contribution profit: net sales after discounts and returns, minus cost of goods and affiliate commission, set against ad spend. Every figure drills down to the individual Shopify order behind it."
            },
            {
              q: "Do you need write access to my store?",
              a: "No. Shopify scopes are read-only — Hiloomy cannot change products, orders or customers."
            },
            {
              q: "How fresh is the data?",
              a: "Orders sync through Shopify webhooks, and a full reconciliation runs every two hours."
            },
            {
              q: "Which platforms connect?",
              a: "Shopify, Meta Ads, Instagram, Google Analytics 4 and Google Search Console. Affiliate programs load from CSV or by coupon-code mapping."
            },
            {
              q: "Does it work in Hebrew?",
              a: "Yes — the entire product, including the weekly report and the emails. Switch language at any time."
            },
            {
              q: "What happens if I cancel?",
              a: "Disconnect from Settings and your data is deleted. No export fee, no retention period."
            }
          ]
        },
        features: {
          kicker: "What it actually does",
          title: "Six capabilities. Each answers two questions: what happened, and what to do."
        },
        integrations: {
          kicker: "Connects to what you already run",
          title: "No data mapping, no integration team, no separate warehouse to pay for."
        },
        pricing: { kicker: "Pricing", title: "14-day trial. No card.", popular: "Most popular", perMonth: "/ month", cta: "Get started free" },
        security: {
          kicker: "Security",
          title: "Your data, in the vault.",
          body: "Shopify tokens are encrypted at rest and never leave the server. Every customer is isolated at the database level, store scopes are read-only, and you can disconnect and delete everything at any moment."
        },
        final: {
          title: "See your real numbers within the minute.",
          body: "30 seconds to sign up, a minute to connect Shopify, 14 days to test all of it with nothing committed.",
          stats: [
            ["30 sec", "to sign up"],
            ["6", "sources synced"],
            ["14 days", "free trial"]
          ] as Array<[string, string]>
        },
        footer: {
          product: "Product",
          company: "Company",
          privacy: "Privacy",
          terms: "Terms",
          legal: "© 2026 Hiloomy. All rights reserved.",
          switchLong: "עברו לעברית"
        }
      };
}

function getLayers(isHe: boolean): LayerItem[] {
  return isHe
    ? [
        {
          num: "01",
          name: "שכבת הנתונים",
          blurb: "Shopify, Meta Ads, אינסטגרם ו־Search Console מסונכרנים למסד אחד, כל שעתיים.",
          panelKicker: "סנכרון · לפני 14 דקות",
          panelTitle: "שש מקורות, לוח זמנים אחד, בלי גיליונות באמצע.",
          rows: [
            { k: "מקורות מחוברים", v: "6" },
            { k: "קצב רענון", v: "2 שעות" },
            { k: "הזמנות מסונכרנות", v: "38,204" },
            { k: "פערי נתונים", v: "0" }
          ],
          panelNote: "מכירות אופליין נכנסות מאקסל ומתמזגות עם ההכנסות מהחנות."
        },
        {
          num: "02",
          name: "שכבת האותות",
          blurb: "כל סנכרון נסרק: ירידת מכירות, קפיצה בהחזרים, מלאי שנגמר, קמפיין שקרס.",
          panelKicker: "התראות · השבוע",
          panelTitle: "כל התראה מגיעה עם פעולה מומלצת אחת, לא עם גרף.",
          rows: [
            { k: "התראות פתוחות", v: "4" },
            { k: "עדיפות גבוהה", v: "1" },
            { k: "פעולות שבוצעו", v: "11" },
            { k: "עבדו בפועל", v: "8" }
          ],
          panelNote: "אחרי שביצעתם, המערכת מודדת שבעה ימים ומדווחת אם זה עבד."
        },
        {
          num: "03",
          name: "שכבת הצמיחה",
          blurb: "שותפים, שימור לקוחות ותכנון חודשי — במקום אחד, עם הרווח בקצה.",
          panelKicker: "צמיחה · 30 ימים",
          panelTitle: "מי מביא לקוחות, מי מחזיר אותם, ומה זה שווה בסוף.",
          rows: [
            { k: "רכישה חוזרת", v: "31%" },
            { k: "זמן להזמנה שנייה", v: "24 ימים" },
            { k: "שותפים פעילים", v: "18" },
            { k: "לתשלום", v: "₪9,340" }
          ],
          panelNote: "ייחוס בשלוש שכבות: לינק ייעודי, קוד קופון וייבוא היסטוריה."
        }
      ]
    : [
        {
          num: "01",
          name: "Data layer",
          blurb: "Shopify, Meta Ads, Instagram and Search Console synced into one database every two hours.",
          panelKicker: "Synced · 14 minutes ago",
          panelTitle: "Six sources, one clock, no spreadsheet in the middle.",
          rows: [
            { k: "Connected sources", v: "6" },
            { k: "Refresh rate", v: "2 hours" },
            { k: "Orders synced", v: "38,204" },
            { k: "Data gaps", v: "0" }
          ],
          panelNote: "Offline sales arrive from Excel and merge with store revenue."
        },
        {
          num: "02",
          name: "Signal layer",
          blurb: "Every sync is scanned: sales dips, refund spikes, stock running out, a campaign collapsing.",
          panelKicker: "Alerts · this week",
          panelTitle: "Every alert arrives with one recommended action, not a chart.",
          rows: [
            { k: "Open alerts", v: "4" },
            { k: "High priority", v: "1" },
            { k: "Actions taken", v: "11" },
            { k: "Actually worked", v: "8" }
          ],
          panelNote: "After you act, Hiloomy measures seven days and reports whether it worked."
        },
        {
          num: "03",
          name: "Growth layer",
          blurb: "Affiliates, retention and monthly planning in one place, with profit at the end of each.",
          panelKicker: "Growth · 30 days",
          panelTitle: "Who brings customers, who brings them back, what it's worth.",
          rows: [
            { k: "Repeat purchase", v: "31%" },
            { k: "Time to 2nd order", v: "24 days" },
            { k: "Active affiliates", v: "18" },
            { k: "Due to pay", v: "₪9,340" }
          ],
          panelNote: "Three-track attribution: dedicated link, coupon code, history import."
        }
      ];
}

function getFeatures(isHe: boolean): FeatureItem[] {
  return isHe
    ? [
        { num: "01", title: "רווח אמיתי, לא הכנסות ראווה", body: "הכנסות פחות הנחות, החזרים, עלות מוצרים ועמלות שותפים. לכל מספר תווית דיוק.", points: ["רווח תרומה חי לכל חלון זמן", "COGS לכל מוצר או בהעלאת CSV אחת", "ייבוא מכירות אופליין מאקסל"] },
        { num: "02", title: "התראות שמגיעות עם פעולה", body: "עדיפות גבוהה זה לטפל היום. בינונית זה לתכנון השבועי. בלי רשימת אזהרות שאף אחד לא קורא.", points: ["פעולה קונקרטית על כל כרטיס", "לולאה סגורה: מה עבד ומה לא", "מדידה שבעה ימים אחרי הביצוע"] },
        { num: "03", title: "דוח צמיחה שבועי למייל", body: "PDF מעוצב בעברית: מה השתנה, אילו דגלים אדומים נפתחו, ומה לעשות בשבוע הקרוב.", points: ["סיכום מנהלים קריא בשתי דקות", "דגלים אדומים לפי סדר עדיפות", "נשלח לבד, בלי להיכנס לאף מערכת"] },
        { num: "04", title: "ניהול תוכנית שותפים מלא", body: "קופונים נוצרים ישירות בShopify, ההמרות נספרות בשלושה מסלולי ייחוס, והתשלומים מנוהלים בפנים.", points: ["יצירת קופונים בודדים או בכמות", "ייחוס: לינק, קוד וייבוא היסטוריה", "אישור ← סומן כשולם, עם יתרה"] },
        { num: "05", title: "מתכנן שיווק וברִיף חודשי", body: "מעלים את לוח השיווק באקסל, המערכת מזהה כל משימה ובונה גאנט ובריף חודשי.", points: ["זיהוי הנחות, באנרים, סרטונים ואימיילים", "בריף PDF + גרסה לכל תפקיד", "ביקורת הנחות: קודים כפולים והתנגשויות"] },
        { num: "06", title: "שימור שמצטבר לרווח", body: "מי חוזר לקנות, כמה מהר, ובזכות איזה מוצר. שם ה־LTV נבנה באמת.", points: ["שיעור רכישה חוזרת לאורך זמן", "זמן ממוצע בין הזמנה ראשונה לשנייה", "מוצרים שמביאים מול מוצרים שמחזירים"] }
      ]
    : [
        { num: "01", title: "Real profit, not vanity revenue", body: "Revenue minus discounts, refunds, cost of goods and affiliate commission. Every figure carries an accuracy label.", points: ["Live contribution profit for any window", "COGS per product or one CSV upload", "Offline sales imported from Excel"] },
        { num: "02", title: "Alerts that arrive with an action", body: "High priority means handle it today. Medium goes to the weekly plan. No wall of warnings nobody reads.", points: ["A concrete action on every card", "Closed loop: what worked, what didn't", "Measured seven days after you act"] },
        { num: "03", title: "A weekly growth report by email", body: "A designed PDF: what changed, which red flags opened, and what to do in the coming week.", points: ["Executive summary readable in two minutes", "Red flags ordered by priority", "Sent automatically, no login needed"] },
        { num: "04", title: "Full affiliate program management", body: "Coupons created straight in Shopify, conversions counted across three attribution tracks, payouts handled inside.", points: ["Single or bulk coupon creation", "Link, code and history-import attribution", "Approve → marked paid, with balances"] },
        { num: "05", title: "Marketing planner and monthly brief", body: "Upload the marketing calendar as Excel; Hiloomy reads every task, builds the Gantt and produces the brief.", points: ["Detects discounts, banners, videos, emails", "PDF brief plus a version per role", "Discount audit: duplicates and clashes"] },
        { num: "06", title: "Retention that compounds into profit", body: "Who comes back, how fast, and because of which product. That's where LTV is really built.", points: ["Repeat purchase rate over time", "Average gap between 1st and 2nd order", "Products that acquire vs. products that return"] }
      ];
}

const SECURITY_ITEMS = {
  he: [
    { title: "AES-256-GCM", body: "טוקנים מוצפנים במנוחה, לא עוזבים את השרת." },
    { title: "קריאה בלבד", body: "ההרשאות לחנות לא מאפשרות שינוי נתונים." },
    { title: "בידוד לקוחות", body: "הפרדה מלאה ברמת מסד הנתונים." },
    { title: "מחיקה מלאה", body: "התנתקות ומחיקת הכל בכל רגע." }
  ],
  en: [
    { title: "AES-256-GCM", body: "Tokens encrypted at rest, never leaving the server." },
    { title: "Read-only", body: "Store scopes cannot modify your data." },
    { title: "Tenant isolation", body: "Full separation at the database level." },
    { title: "Delete everything", body: "Disconnect and wipe at any moment." }
  ]
};

const MARQUEE = ["Shopify", "Meta Ads", "Instagram", "Google Search Console", "Excel / CSV", "Email reports"];

export default async function WelcomePage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const cookieLocale = await getAppLocale();
  const locale: AppLocale = sp.lang && isValidLocale(sp.lang) ? sp.lang : cookieLocale;
  const isHe = locale === "he";
  const dir = isHe ? "rtl" : "ltr";
  const t = getCopy(isHe);
  const layers = getLayers(isHe);
  const features = getFeatures(isHe);
  const securityItems = SECURITY_ITEMS[isHe ? "he" : "en"];
  const otherLocale: AppLocale = isHe ? "en" : "he";
  const signupHref = `/signup?lang=${locale}`;

  const plans: PlanItem[] = [PLANS.starter, PLANS.growth, PLANS.agency].map((plan) => ({
    name: plan.name[isHe ? "he" : "en"],
    blurb: plan.description[isHe ? "he" : "en"],
    points: plan.features[isHe ? "he" : "en"].slice(0, 4),
    priceIls: `₪${plan.display.monthly.ILS}`,
    priceUsd: `$${plan.display.monthly.USD}`
  }));

  return (
    <div
      dir={dir}
      lang={locale}
      className={`${displayFont.variable} ${bodyFont.variable} min-h-screen [font-family:var(--font-hl-body)]`}
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <style>{`
        /* Display tracking is locale-aware and set once, here. Latin display
           type wants it tight; Hebrew letterforms have no side bearings to
           spare and collide at anything below zero. Every headline on the
           page reads this variable rather than hardcoding a value. */
        :root { --hl-track: ${isHe ? "0" : "-0.045em"}; }
        @keyframes hl-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes hl-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .hl-rise { opacity: 0; animation: hl-rise .7s cubic-bezier(.2,.7,.3,1) forwards; }
        /* Warm wash behind the hero, fading into the page ground. */
        .hl-hero-wash {
          background:
            radial-gradient(110% 70% at 50% -10%, rgba(209,115,31,.13), transparent 62%),
            linear-gradient(180deg, #FCF7F2 0%, ${PAPER} 62%);
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-rise { animation: none; opacity: 1; }
          .hl-marquee-track { animation: none !important; }
        }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header className="hl-glass sticky top-0 z-40 border-b backdrop-blur-md [backdrop-filter:saturate(180%)_blur(16px)]" style={{ borderColor: HAIR, backgroundColor: "rgba(247,247,246,.82)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-10">
          <a href={`/welcome?lang=${locale}`} className="inline-flex items-center">
            <HiloomyLogo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-bold md:flex" style={{ color: DIM }}>
            <a href="#features" className="transition-colors hover:text-[#201E1D]">{t.nav.features}</a>
            <a href="#steps" className="transition-colors hover:text-[#201E1D]">{t.nav.how}</a>
            <a href={`/weekly-report?lang=${locale}`} className="transition-colors hover:text-[#201E1D]">{t.nav.report}</a>
            <a href="#pricing" className="transition-colors hover:text-[#201E1D]">{t.nav.pricing}</a>
            <a href="/security" className="transition-colors hover:text-[#201E1D]">{t.nav.security}</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a
              href={`/welcome?lang=${otherLocale}`}
              className="rounded-full border px-2.5 py-1 text-xs font-bold transition-colors hover:bg-white"
              style={{ borderColor: "rgba(32,30,29,.25)", color: INK }}
            >
              {t.nav.switchLabel}
            </a>
            <a href={`/login?lang=${locale}`} className="text-sm font-bold" style={{ color: DIM }}>
              {t.nav.login}
            </a>
            <a
              href={signupHref}
              className="rounded-full px-4 py-2 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: GREEN }}
            >
              {t.nav.cta}
            </a>
          </div>
          <MobileNav
            links={[
              { href: "#features", label: t.nav.features },
              { href: "#steps", label: t.nav.how },
              { href: `/weekly-report?lang=${locale}`, label: t.nav.report },
              { href: "#pricing", label: t.nav.pricing },
              { href: "/security", label: t.nav.security }
            ]}
            switchHref={`/welcome?lang=${otherLocale}`}
            switchLabel={t.footer.switchLong}
            primaryHref={signupHref}
            primaryLabel={t.pricing.cta}
            secondaryHref={`/login?lang=${locale}`}
            secondaryLabel={t.nav.login}
            menuLabel={isHe ? "תפריט" : "Menu"}
            logo={<HiloomyLogo />}
            dir={dir}
          />

        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* Stacked, not the old two-column split: the banner is a 16:9 cinematic
          that needs full width to stay legible. Copy keeps its own measure. */}
      {/* Centered rather than the reference's left-copy/right-visual split:
          our hero visual is a full-width 16:9 banner, and a centered column
          reads identically in LTR and RTL instead of needing two layouts. */}
      <section className="hl-hero-wash px-5 pb-16 pt-14 sm:px-10 sm:pt-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span
            className="hl-rise inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ borderColor: "rgba(209,115,31,.32)", color: ORANGE, backgroundColor: "rgba(209,115,31,.07)", animationDelay: ".04s" }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ORANGE }} />
            {t.dateline.brand}
          </span>
          <h1
            className="hl-rise mt-6 text-[2.9rem] font-extrabold leading-[1.02] [font-family:var(--font-hl-display)] [text-wrap:balance] sm:text-[4.4rem]"
            style={{ animationDelay: ".08s", letterSpacing: "var(--hl-track)" }}
          >
            {t.hero.title}
          </h1>
          <p
            className="hl-rise mt-6 max-w-2xl text-[1.0625rem] leading-relaxed [text-wrap:pretty] sm:text-lg"
            style={{ color: "rgba(32,30,29,.72)", animationDelay: ".18s" }}
          >
            {t.hero.body}
          </p>
          <div className="hl-rise mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center" style={{ animationDelay: ".28s" }}>
            <a
              href={signupHref}
              className="rounded-full px-8 py-4 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: GREEN, boxShadow: "0 16px 34px -14px rgba(20,81,44,.55)" }}
            >
              {t.nav.cta}
            </a>
            <a
              href="#steps"
              className="rounded-full border bg-white px-8 py-4 text-[15px] font-bold transition-colors hover:bg-[#F2F2F0]"
              style={{ borderColor: "rgba(32,30,29,.16)", color: INK }}
            >
              {t.hero.ctaSecondary}
            </a>
          </div>
          <p className="hl-rise mt-6 text-[13px] font-medium" style={{ color: ORANGE, animationDelay: ".33s" }}>
            {t.hero.guarantee}
          </p>
          <p className="hl-rise mt-2 text-xs" style={{ color: DIM, animationDelay: ".38s" }}>
            {t.hero.fine}
          </p>
        </div>

        {/* Animated product banner, tilted and lifted off the page the way the
            reference floats its hero cards. */}
        <div
          className="hl-rise mx-auto mt-14 max-w-6xl [transform:perspective(1800px)_rotateX(2.2deg)]"
          style={{ animationDelay: ".44s" }}
        >
          <HeroBanner locale={isHe ? "he" : "en"} />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="steps" className="scroll-mt-16 bg-white px-5 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow={t.steps.kicker} title={t.steps.title} sub={t.steps.sub} />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {t.steps.items.map((step) => (
              <div
                key={step.n}
                className="rounded-3xl border p-7"
                style={{ borderColor: HAIR, backgroundColor: PAPER }}
              >
                <span
                  className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-bold tabular-nums text-white"
                  style={{ backgroundColor: ORANGE }}
                  dir="ltr"
                >
                  {step.n}
                </span>
                <h3
                  className="mt-5 text-xl font-bold [font-family:var(--font-hl-display)]"
                  style={{ letterSpacing: "var(--hl-track)" }}
                >
                  {step.t}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed" style={{ color: DIM }}>
                  {step.d}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-11 flex flex-col items-center gap-3">
            <a
              href={signupHref}
              className="rounded-full px-8 py-4 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: GREEN, boxShadow: "0 16px 34px -14px rgba(20,81,44,.55)" }}
            >
              {t.nav.cta}
            </a>
            <p className="text-xs" style={{ color: DIM }}>
              {t.hero.fine}
            </p>
          </div>
        </div>
      </section>

      {/* ── Layers scroll story ──────────────────────────────────────── */}
      <section id="layers" className="scroll-mt-16 pt-20 sm:pt-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-10">
          <SectionHead eyebrow={t.layers.kicker} title={t.layers.title} />
        </div>
        <LayersScroller layers={layers} isHe={isHe} />
      </section>

      {/* ── Features accordion grid ──────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 bg-white px-5 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow={t.features.kicker} title={t.features.title} />
          <FeaturesGrid features={features} />
        </div>
      </section>

      {/* ── Integrations marquee ─────────────────────────────────────── */}
      <section className="py-16 text-center sm:py-20" style={{ backgroundColor: "#EEF6F1" }}>
        <div className="mx-auto max-w-6xl px-5 sm:px-10">
          <SectionHead eyebrow={t.integrations.kicker} title={t.integrations.title} />
        </div>
        <div
          dir="ltr"
          className="mt-10 overflow-hidden"
          style={{
            maskImage: "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
            WebkitMaskImage: "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)"
          }}
        >
          <div className="hl-marquee-track flex w-max gap-3" style={{ animation: "hl-marquee 26s linear infinite" }}>
            {[...MARQUEE, ...MARQUEE].map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="rounded-full border bg-white px-6 py-3 text-sm font-bold"
                style={{ borderColor: HAIR, color: INK }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-16 bg-white px-5 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow={t.pricing.kicker} title={t.pricing.title} />
          <div className="text-start">
            <PricingPlans
              plans={plans}
              isHe={isHe}
              labels={{ popular: t.pricing.popular, perMonth: t.pricing.perMonth, cta: t.pricing.cta }}
              signupHref={signupHref}
            />
          </div>
        </div>
      </section>

      {/* ── Security bento ───────────────────────────────────────────── */}
      <section className="px-5 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow={t.security.kicker} title={t.security.title} sub={t.security.body} />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {securityItems.map((item) => (
              <div key={item.title} className="rounded-3xl border bg-white p-6" style={{ borderColor: HAIR }}>
                <p
                  className="text-[15px] font-bold [font-family:var(--font-hl-display)]"
                  style={{ color: GREEN, letterSpacing: "var(--hl-track)" }}
                >
                  {item.title}
                </p>
                <p className="mt-2 text-[13px] leading-5" style={{ color: DIM }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <a
              href="/security"
              className="rounded-full border bg-white px-7 py-3.5 text-sm font-bold transition-colors hover:bg-[#F2F2F0]"
              style={{ borderColor: "rgba(32,30,29,.16)", color: INK }}
            >
              {t.nav.security}
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-16 bg-white px-5 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow={t.faq.kicker} title={t.faq.title} />
          <div className="mt-12">
            <Faq items={t.faq.items} />
          </div>
        </div>
      </section>

      {/* ── Final CTA band ───────────────────────────────────────────── */}
      <section className="px-5 py-20 sm:px-10 sm:py-28" style={{ backgroundColor: GREEN_DARK }}>
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <h2
              className="max-w-xl text-4xl font-normal leading-[1.0] text-white [font-family:var(--font-hl-display)] sm:text-6xl"
              style={{ letterSpacing: "-0.025em" }}
            >
              {t.final.title}
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed" style={{ color: "rgba(255,255,255,.78)" }}>
              {t.final.body}
            </p>
            <div className="mt-9 flex flex-wrap gap-3.5">
              <a
                href={signupHref}
                className="rounded-full px-8 py-4 text-sm font-bold transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: "#fff", color: GREEN_DARK }}
              >
                {t.nav.cta}
              </a>
              <a
                href={`/login?lang=${locale}`}
                className="rounded-full border px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
                style={{ borderColor: "rgba(255,255,255,.35)" }}
              >
                {t.nav.login}
              </a>
            </div>
          </div>
          <div className="space-y-6 border-s ps-10 max-lg:border-s-0 max-lg:ps-0" style={{ borderColor: "rgba(255,255,255,.15)" }}>
            {t.final.stats.map(([v, k]) => (
              <div key={k}>
                <p className="text-4xl font-normal text-white [font-family:var(--font-hl-display)]">{v}</p>
                <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,.6)" }}>
                  {k}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: GREEN_DARK, borderTop: "1px solid rgba(255,255,255,.12)" }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-10">
          <div>
            <HiloomyLogo textClassName="text-white" />
            <p className="mt-3 max-w-xs text-xs leading-5" style={{ color: "rgba(255,255,255,.55)" }}>
              {t.dateline.brand}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,.45)" }}>
              {t.footer.product}
            </p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: "rgba(255,255,255,.75)" }}>
              <a href="#features" className="block hover:text-white">{t.nav.features}</a>
              <a href={`/weekly-report?lang=${locale}`} className="block hover:text-white">{t.nav.report}</a>
              <a href="#pricing" className="block hover:text-white">{t.nav.pricing}</a>
              <a href="/security" className="block hover:text-white">{t.nav.security}</a>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,.45)" }}>
              {t.footer.company}
            </p>
            <div className="mt-3 space-y-2 text-sm" style={{ color: "rgba(255,255,255,.75)" }}>
              <a href="/privacy" className="block hover:text-white">{t.footer.privacy}</a>
              <a href="/terms" className="block hover:text-white">{t.footer.terms}</a>
              <a href={`/login?lang=${locale}`} className="block hover:text-white">{t.nav.login}</a>
            </div>
          </div>
        </div>
        <div className="border-t" style={{ borderColor: "rgba(255,255,255,.12)" }}>
          <div
            className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs sm:flex-row sm:px-10"
            style={{ color: "rgba(255,255,255,.5)" }}
          >
            <p>{t.footer.legal}</p>
            <a href={`/welcome?lang=${otherLocale}`} className="font-bold hover:text-white">
              {t.footer.switchLong}
            </a>
          </div>
        </div>

        {/* Oversized wordmark closing the page. Always LTR — the brand is a
            Latin word — and aria-hidden since the logo above already names us. */}
        <div className="overflow-hidden px-5 pb-6 pt-2 sm:px-10" dir="ltr" aria-hidden>
          <p
            className="select-none text-center text-[15vw] font-extrabold leading-[0.82] [font-family:var(--font-hl-display)] sm:text-[13vw]"
            style={{
              letterSpacing: "-0.045em",
              color: "transparent",
              backgroundImage: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(209,115,31,.30))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text"
            }}
          >
            Hiloomy
          </p>
        </div>
      </footer>
    </div>
  );
}
