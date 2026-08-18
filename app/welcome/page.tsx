import { Suez_One, Alef } from "next/font/google";
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

// Public marketing landing. Served at "/" for anonymous visitors (middleware
// rewrite) and directly at /welcome. Bilingual (he default, ?lang= override).
// Design: "the financial broadsheet" — off-white paper, deep green ink,
// terracotta accents, Suez One display + Alef body, a dateline strip, a
// sticky three-layer scroll story, an accordion feature grid, a marquee,
// pricing with a currency toggle, and a dark-green closing band.

const displayFont = Suez_One({
  subsets: ["latin", "hebrew"],
  weight: "400",
  variable: "--font-hl-display"
});

const bodyFont = Alef({
  subsets: ["latin", "hebrew"],
  weight: ["400", "700"],
  variable: "--font-hl-body"
});

const INK = "#201E1D";
const GREEN = "#14512C";
const GREEN_DARK = "#12341F";
const ORANGE = "#D1731F";
const PAPER = "#F7F7F6";
const DIM = "#605D5D";
const HAIR = "rgba(32,30,29,.12)";

const BARS = [38, 46, 41, 55, 49, 62, 58, 71, 66, 78, 74, 88, 82, 96];

export const metadata = {
  title: "Hiloomy — Profit command center for Shopify brands",
  description:
    "Revenue is the headline. Profit is the story. Hiloomy joins Shopify, Meta Ads, Instagram and your affiliates into one database and hands back the number that stays in the bank. ההכנסות זה כותרת. הרווח זה הסיפור."
};

function getCopy(isHe: boolean) {
  return isHe
    ? {
        nav: { features: "יכולות", how: "איך זה עובד", pricing: "מחירים", security: "אבטחה", login: "התחברות", cta: "צרו משתמש", switchLabel: "EN" },
        dateline: { brand: "Hiloomy · מרכז הפיקוד למותגי Shopify", tag: "רענון כל שעתיים", meta: "גרסה 2026" },
        hero: {
          title: "ההכנסות זה כותרת. הרווח זה הסיפור.",
          body: "Hiloomy מחבר את Shopify, Meta Ads, אינסטגרם ותוכנית השותפים למסד נתונים אחד, מוריד את כל העלויות, ומחזיר לכם את המספר שנשאר בבנק — עם התראה שמגיעה עם פעולה ודוח שבועי שמסביר מה קרה.",
          fine: "ללא כרטיס אשראי · חיבור ב־30 שניות · הרשאות קריאה בלבד",
          ctaSecondary: "איך זה בנוי"
        },
        mock: {
          profitLabel: "רווח תרומה · 30 ימים",
          accuracy: "דיוק גבוה",
          profit: "₪116,181",
          share: "62% מההכנסה",
          rows: [
            ["הכנסות", "₪187,118"],
            ["הנחות", "−₪12,404"],
            ["החזרים", "−₪3,720"],
            ["עלות מוצרים", "−₪54,813"]
          ],
          alertLabel: "התראה",
          alertPriority: "עדיפות גבוהה",
          alertTitle: "מוצר הדגל ייגמר בעוד 6 ימים",
          alertAction: "פעולה: להזמין 120 יחידות היום",
          alertLoop: "התוצאה תימדד ותדווח בעוד 7 ימים"
        },
        layers: {
          kicker: "שלוש שכבות",
          title: "נתונים נכנסים. אותות עולים. צמיחה יוצאת."
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
          legal: "© 2026 Brandzp Ltd. כל הזכויות שמורות.",
          switchLong: "Switch to English"
        }
      }
    : {
        nav: { features: "Features", how: "How it works", pricing: "Pricing", security: "Security", login: "Log in", cta: "Create account", switchLabel: "עב" },
        dateline: { brand: "Hiloomy · Command center for Shopify brands", tag: "Refreshed every two hours", meta: "Edition 2026" },
        hero: {
          title: "Revenue is the headline. Profit is the story.",
          body: "Hiloomy joins Shopify, Meta Ads, Instagram and your affiliate program into one database, subtracts every real cost, and hands back the number that actually stays in the bank — with alerts that arrive carrying an action and a weekly report that explains the week.",
          fine: "No credit card · Connect in 30 seconds · Read-only scopes",
          ctaSecondary: "How it's built"
        },
        mock: {
          profitLabel: "Contribution profit · 30 days",
          accuracy: "High accuracy",
          profit: "₪116,181",
          share: "62% of revenue",
          rows: [
            ["Revenue", "₪187,118"],
            ["Discounts", "−₪12,404"],
            ["Refunds", "−₪3,720"],
            ["Cost of goods", "−₪54,813"]
          ],
          alertLabel: "Alert",
          alertPriority: "High priority",
          alertTitle: "Your flagship product runs out in 6 days",
          alertAction: "Action: order 120 units today",
          alertLoop: "Outcome measured and reported back in 7 days"
        },
        layers: { kicker: "Three layers", title: "Data in. Signals up. Growth out." },
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
          legal: "© 2026 Brandzp Ltd. All rights reserved.",
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
        @keyframes hl-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes hl-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .hl-rise { opacity: 0; animation: hl-rise .7s cubic-bezier(.2,.7,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .hl-rise { animation: none; opacity: 1; }
          .hl-marquee-track { animation: none !important; }
        }
      `}</style>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: HAIR, backgroundColor: "rgba(247,247,246,.88)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-10">
          <a href={`/welcome?lang=${locale}`} className="inline-flex items-center">
            <HiloomyLogo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-bold md:flex" style={{ color: DIM }}>
            <a href="#features" className="transition-colors hover:text-[#201E1D]">{t.nav.features}</a>
            <a href="#layers" className="transition-colors hover:text-[#201E1D]">{t.nav.how}</a>
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
              { href: "#layers", label: t.nav.how },
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
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 sm:px-10 sm:pt-16 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <h1
            className="hl-rise text-[2.6rem] font-normal leading-[0.98] tracking-tight [font-family:var(--font-hl-display)] [text-wrap:balance] sm:text-6xl"
            style={{ animationDelay: ".08s", letterSpacing: "-0.02em" }}
          >
            {t.hero.title}
          </h1>
          <p className="hl-rise mt-7 max-w-xl text-lg leading-relaxed [text-wrap:pretty]" style={{ color: "rgba(32,30,29,.8)", animationDelay: ".18s" }}>
            {t.hero.body}
          </p>
          <div className="hl-rise mt-9 flex flex-wrap items-center gap-3.5" style={{ animationDelay: ".28s" }}>
            <a
              href={signupHref}
              className="rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: GREEN, boxShadow: "0 14px 30px -12px rgba(20,81,44,.5)" }}
            >
              {t.nav.cta}
            </a>
            <a
              href="#layers"
              className="rounded-full border px-7 py-3.5 text-sm font-bold transition-colors hover:bg-white"
              style={{ borderColor: "rgba(32,30,29,.3)", color: INK }}
            >
              {t.hero.ctaSecondary}
            </a>
          </div>
          <p className="hl-rise mt-4 text-xs" style={{ color: DIM, animationDelay: ".38s" }}>
            {t.hero.fine}
          </p>
        </div>

        {/* Product mock */}
        <div className="hl-rise mx-auto w-full max-w-md space-y-4 lg:max-w-none" style={{ animationDelay: ".22s" }}>
          <div className="rounded-2xl border bg-white p-6 shadow-2xl" style={{ borderColor: HAIR, boxShadow: "0 30px 70px -28px rgba(18,52,31,.35)" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: DIM }}>
                {t.mock.profitLabel}
              </p>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "#D8EFE1", color: GREEN }}>
                {t.mock.accuracy}
              </span>
            </div>
            <p className="mt-3 text-4xl font-normal tabular-nums [font-family:var(--font-hl-display)]" style={{ color: INK }}>
              {t.mock.profit}{" "}
              <span className="text-sm" style={{ color: DIM }}>
                {t.mock.share}
              </span>
            </p>
            <div className="mt-5 flex h-20 items-end gap-1" aria-hidden>
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[3px]"
                  style={{ height: `${h}%`, backgroundColor: i === BARS.length - 3 ? ORANGE : "#7CC79A" }}
                />
              ))}
            </div>
            <div className="mt-5 space-y-2 border-t pt-4" style={{ borderColor: HAIR }}>
              {t.mock.rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span style={{ color: DIM }}>{k}</span>
                  <span className="font-bold tabular-nums" dir="ltr">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-lg" style={{ borderColor: "rgba(209,115,31,.4)" }}>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
              <span style={{ color: ORANGE }}>{t.mock.alertLabel}</span>
              <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#FBE3D0", color: "#A8521A" }}>
                {t.mock.alertPriority}
              </span>
            </div>
            <p className="mt-2 text-base font-bold" style={{ color: INK }}>
              {t.mock.alertTitle}
            </p>
            <p className="mt-2 rounded-lg px-3 py-2 text-sm font-bold" style={{ backgroundColor: "#FBE3D0", color: "#A8521A" }}>
              {t.mock.alertAction}
            </p>
            <p className="mt-2 text-xs" style={{ color: DIM }}>
              ↻ {t.mock.alertLoop}
            </p>
          </div>
        </div>
      </section>

      {/* ── Layers scroll story ──────────────────────────────────────── */}
      <section id="layers" className="scroll-mt-16 border-t pt-16 sm:pt-20" style={{ borderColor: HAIR }}>
        <div className="mx-auto max-w-6xl px-5 sm:px-10">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
            {t.layers.kicker}
          </p>
          <h2
            className="mt-3.5 max-w-2xl text-3xl font-normal leading-[1.04] [font-family:var(--font-hl-display)] sm:text-5xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.layers.title}
          </h2>
        </div>
        <LayersScroller layers={layers} />
      </section>

      {/* ── Features accordion grid ──────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-20 sm:px-10 sm:py-24">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
          {t.features.kicker}
        </p>
        <h2
          className="mt-3.5 max-w-2xl text-3xl font-normal leading-[1.04] [font-family:var(--font-hl-display)] sm:text-[2.6rem]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.features.title}
        </h2>
        <FeaturesGrid features={features} />
      </section>

      {/* ── Integrations marquee ─────────────────────────────────────── */}
      <section className="border-y py-14 text-center" style={{ borderColor: HAIR, backgroundColor: "#EEF6F1" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
          {t.integrations.kicker}
        </p>
        <h2 className="mx-auto mt-3.5 max-w-2xl px-5 text-2xl font-normal leading-tight [font-family:var(--font-hl-display)] sm:text-3xl">
          {t.integrations.title}
        </h2>
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
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-20 text-center sm:px-10 sm:py-24">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
          {t.pricing.kicker}
        </p>
        <h2 className="mt-3.5 text-3xl font-normal [font-family:var(--font-hl-display)] sm:text-5xl" style={{ letterSpacing: "-0.02em" }}>
          {t.pricing.title}
        </h2>
        <div className="text-start">
          <PricingPlans
            plans={plans}
            isHe={isHe}
            labels={{ popular: t.pricing.popular, perMonth: t.pricing.perMonth, cta: t.pricing.cta }}
            signupHref={signupHref}
          />
        </div>
      </section>

      {/* ── Security ─────────────────────────────────────────────────── */}
      <section className="border-t py-16 sm:py-20" style={{ borderColor: HAIR }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
              {t.security.kicker}
            </p>
            <h2 className="mt-3.5 text-3xl font-normal [font-family:var(--font-hl-display)] sm:text-4xl">{t.security.title}</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: DIM }}>
              {t.security.body}{" "}
              <a href="/security" className="font-bold underline underline-offset-2" style={{ color: GREEN }}>
                →
              </a>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: HAIR }}>
            {securityItems.map((item) => (
              <div key={item.title} className="p-6" style={{ backgroundColor: PAPER }}>
                <p className="text-base font-bold [font-family:var(--font-hl-display)]" style={{ color: GREEN }}>
                  {item.title}
                </p>
                <p className="mt-1.5 text-xs leading-5" style={{ color: DIM }}>
                  {item.body}
                </p>
              </div>
            ))}
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
      </footer>
    </div>
  );
}
