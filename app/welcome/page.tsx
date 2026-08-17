import { Frank_Ruhl_Libre, Assistant } from "next/font/google";
import { getAppLocale, isValidLocale, type AppLocale } from "@/lib/i18n";
import { PLANS } from "@/lib/billing/plans";
import { HiloomyLogo, HiloomyMark } from "@/components/ui/logo";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck
} from "lucide-react";

// Public marketing landing at /welcome.
// Bilingual (he default, ?lang= override), works without auth, links to /signup.
// Brand system: "the ledger" — cream paper, deep forest-green ink, orange
// up-arrow accents (mirrors the Hiloomy logomark). Server-rendered, no client JS.

const displayFont = Frank_Ruhl_Libre({
  subsets: ["latin", "hebrew"],
  weight: ["500", "700", "900"],
  variable: "--font-hl-display"
});

const bodyFont = Assistant({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hl-body"
});

// Brand tokens (from the logo): forest ink, leaf green, signal orange, paper.
const INK = "#1B4332";
const INK_DEEP = "#122E22";
const LEAF = "#16A34A";
const ORANGE = "#F97316";
const PAPER = "#FAF6EC";

export const metadata = {
  title: "Hiloomy — Profit analytics & growth reports for Shopify",
  description:
    "True profit after costs, proactive alerts with recommended actions, weekly growth reports, affiliate management and marketing planning — one command center for Shopify brands. ניתוח רווח, התראות ודוחות שבועיים למותגי Shopify."
};

type Copy = ReturnType<typeof getCopy>;

function getCopy(isHe: boolean) {
  return isHe
    ? {
        nav: {
          features: "יכולות",
          how: "איך זה עובד",
          pricing: "מחירים",
          security: "אבטחה",
          signin: "התחברות",
          signup: "פתיחת חשבון",
          switchLabel: "English"
        },
        hero: {
          eyebrow: "מרכז הפיקוד למותגי Shopify",
          titleA: "לראות מה באמת מרוויח.",
          titleB: "לדעת בדיוק מה לעשות.",
          subtitle:
            "Hiloomy מסנכרן את Shopify, Meta Ads, אינסטגרם ותוכנית השותפים למסד נתונים אחד — ומחזיר לכם רווח אמיתי אחרי עלויות, התראות עם פעולה מומלצת, ודוח צמיחה שבועי שמגיע ישר למייל.",
          ctaPrimary: "התחילו 14 ימי ניסיון",
          ctaSecondary: "איך זה עובד",
          noCC: "ללא כרטיס אשראי · ביטול בכל רגע · חיבור ב־30 שניות"
        },
        mock: {
          cardLabel: "רווח תרומה · 30 ימים",
          accuracy: "דיוק גבוה",
          profit: "₪116,181",
          profitRate: "(62% מההכנסה)",
          kpis: [
            ["הכנסות", "₪187,118"],
            ["הנחות", "−₪12,404"],
            ["החזרים", "−₪3,720"]
          ],
          alertTag: "התראה · גבוהה",
          alertTitle: "מוצר הדגל ייגמר בעוד 6 ימים",
          alertAction: "פעולה: להזמין 120 יח׳ היום",
          reportChip: "דוח שבועי נשלח · ראשון 08:00"
        },
        proof: [
          ["6", "מקורות נתונים מסונכרנים"],
          ["2 שעות", "קצב רענון הנתונים"],
          ["7 ימים", "מדידת תוצאה לכל פעולה"],
          ["14 יום", "ניסיון חינם, בלי כרטיס"]
        ],
        featuresTitle: "מה Hiloomy עושה בפועל",
        featuresSubtitle:
          "לא עוד דשבורד שמתאר נתונים. כל מסך עונה על שתי שאלות: מה קורה — ומה עושים עם זה.",
        features: [
          {
            num: "01",
            title: "רווח אמיתי, לא הכנסות ראווה",
            body:
              "הכנסות − הנחות − החזרים − עלות מוצרים − עמלות שותפים = הרווח שנשאר בבנק. לכל מספר מוצמדת תווית דיוק, כדי שתדעו על מה אפשר לסמוך.",
            points: [
              "רווח תרומה חי לכל חלון זמן, עם פירוט לפי מוצר וקולקציה",
              "עלויות מוצר (COGS) לכל מוצר בנפרד או בהעלאת CSV אחת",
              "ייבוא מכירות אופליין מאקסל למיזוג הכנסות מחוץ לShopify"
            ]
          },
          {
            num: "02",
            title: "התראות שמגיעות עם פעולה",
            body:
              "המערכת סורקת את הנתונים כל סנכרון: ירידת מכירות, קפיצה בהחזרים, מלאי שנגמר למוצר מוביל, קמפיין שקרס. כל התראה כוללת פעולה מומלצת — וכמה ימים אחרי שביצעתם, המערכת מודדת אם זה עבד.",
            points: [
              "עדיפות גבוהה = לטפל היום, בינונית = לתכנון השבועי",
              "פעולה מומלצת קונקרטית על כל כרטיס התראה",
              "לולאה סגורה: ✅ מה עבד / ❌ מה לא — נמדד ומדווח חזרה"
            ]
          },
          {
            num: "03",
            title: "דוח צמיחה שבועי למייל",
            body:
              "כל שבוע נשלח PDF מעוצב: מה השתנה, אילו דגלים אדומים נפתחו, ומה לעשות בשבוע הקרוב. כולל פרשנות BI על המספרים וסיכום שבועי של קמפייני Meta.",
            points: [
              "סיכום מנהלים בעברית — קריא בשתי דקות",
              "דגלים אדומים עם פעולות מסודרות לפי סדר עדיפות",
              "נשלח אוטומטית במייל, בלי להיכנס לאף מערכת"
            ]
          },
          {
            num: "04",
            title: "ניהול תוכנית שותפים מלא",
            body:
              "מנהל השותפים יוצר קופונים ישירות בShopify, עוקב אחרי כל המרה בשלושה מסלולי ייחוס, ומנהל את כל מחזור התשלומים — בלי גיליונות אקסל צדדיים.",
            points: [
              "יצירת קופונים בודדים או בכמות ישירות בחנות",
              "ייחוס בשלוש שכבות: לינק ייעודי, קוד קופון וייבוא היסטוריה",
              "זרימת תשלומים: אישור → סומן כשולם, עם יתרה לכל שותף"
            ]
          },
          {
            num: "05",
            title: "מתכנן שיווק וברִיף חודשי",
            body:
              "מעלים את קובץ האקסל של לוח השיווק — והמערכת מזהה כל משימה, בונה גאנט, ומפיקה את הבריף החודשי של הצוות כPDF בעברית, כולל ביקורת הנחות אוטומטית.",
            points: [
              "זיהוי אוטומטי: הנחות, באנרים, סרטונים, אימיילים ופוסטים",
              "בריף חודשי PDF בפורמט של הצוות + גרסה לכל תפקיד",
              "ביקורת הנחות: קודים כפולים, התנגשויות עם קופוני שותפים"
            ]
          },
          {
            num: "06",
            title: "שימור לקוחות שמצטבר לרווח",
            body:
              "מי חוזר לקנות, כמה מהר, ובזכות איזה מוצר. שכבת השימור מפרקת את ההתנהגות של הזמנה ראשונה מול שנייה כדי שתדעו איפה ה־LTV באמת נבנה.",
            points: [
              "שיעור רכישה חוזרת ושיעור הזמנה שנייה לאורך זמן",
              "זמן ממוצע בין הזמנה ראשונה לשנייה",
              "המוצרים שמביאים לקוחות מול המוצרים שמחזירים אותם"
            ]
          }
        ],
        integrationsTitle: "מתחבר למה שכבר יש לכם",
        integrations: [
          "Shopify",
          "Meta Ads",
          "Instagram",
          "Google Search Console",
          "אימייל (דוחות)",
          "Excel / CSV"
        ],
        howTitle: "שלושה צעדים, בלי צוות דאטה",
        how: [
          {
            step: "1",
            title: "פותחים חשבון",
            body: "הרשמה עם אימייל — 30 שניות, בלי כרטיס אשראי."
          },
          {
            step: "2",
            title: "מחברים את Shopify",
            body: "חיבור מאובטח בלחיצה, בהרשאות קריאה בלבד. הנתונים נשארים שלכם."
          },
          {
            step: "3",
            title: "מקבלים החלטות",
            body: "הנתונים מתרעננים כל שעתיים, ההתראות עולות לבד, והדוח מגיע כל שבוע."
          }
        ],
        pricingTitle: "מחיר פשוט, בלי הפתעות",
        pricingSubtitle: "14 ימי ניסיון חינם על כל מסלול. ללא כרטיס אשראי. ביטול בכל רגע.",
        perMonth: "/ חודש",
        recommended: "הכי פופולרי",
        planCta: "התחילו ניסיון חינם",
        securityTitle: "הנתונים שלכם, בכספת",
        securityBody:
          "טוקנים של Shopify מוצפנים במנוחה (AES-256-GCM) ולא עוזבים את השרת. כל לקוח מבודד לחלוטין ברמת מסד הנתונים, ההרשאות לחנות הן קריאה בלבד, ואפשר להתנתק ולמחוק הכל בכל רגע.",
        securityCta: "לעמוד האבטחה המלא",
        finalTitle: "מוכנים לראות את המספרים האמיתיים?",
        finalSubtitle: "30 שניות להירשם · דקה לחבר את Shopify · 14 ימים לבדוק הכל",
        finalCta: "פתחו חשבון בחינם",
        footer: {
          rights: "© 2026 Brandzp Ltd. כל הזכויות שמורות.",
          privacy: "פרטיות",
          terms: "תנאי שימוש",
          security: "אבטחה"
        }
      }
    : {
        nav: {
          features: "Capabilities",
          how: "How it works",
          pricing: "Pricing",
          security: "Security",
          signin: "Sign in",
          signup: "Start free",
          switchLabel: "עברית"
        },
        hero: {
          eyebrow: "The command center for Shopify brands",
          titleA: "See what actually earns.",
          titleB: "Know exactly what to do.",
          subtitle:
            "Hiloomy syncs Shopify, Meta Ads, Instagram and your affiliate program into one database — and hands you back true profit after costs, alerts with a recommended action, and a weekly growth report straight to your inbox.",
          ctaPrimary: "Start 14-day free trial",
          ctaSecondary: "See how it works",
          noCC: "No credit card · Cancel anytime · Connects in 30 seconds"
        },
        mock: {
          cardLabel: "Contribution margin · 30 days",
          accuracy: "HIGH accuracy",
          profit: "₪116,181",
          profitRate: "(62% of revenue)",
          kpis: [
            ["Revenue", "₪187,118"],
            ["Discounts", "−₪12,404"],
            ["Refunds", "−₪3,720"]
          ],
          alertTag: "Alert · High",
          alertTitle: "Hero product out of stock in 6 days",
          alertAction: "Action: reorder 120 units today",
          reportChip: "Weekly report sent · Sun 08:00"
        },
        proof: [
          ["6", "data sources unified"],
          ["2 hrs", "data refresh cadence"],
          ["7 days", "outcome check on every action"],
          ["14 days", "free trial, no card"]
        ],
        featuresTitle: "What Hiloomy actually does",
        featuresSubtitle:
          "Not another dashboard that describes data. Every screen answers two questions: what's happening — and what to do about it.",
        features: [
          {
            num: "01",
            title: "True profit, not vanity revenue",
            body:
              "Revenue − discounts − refunds − product costs − affiliate commissions = the profit that reaches your bank. Every number carries an accuracy badge, so you know exactly what to trust.",
            points: [
              "Live contribution margin for any window, broken down by product and collection",
              "Product costs (COGS) per product or via a single CSV upload",
              "Offline sales import from Excel to blend non-Shopify revenue"
            ]
          },
          {
            num: "02",
            title: "Alerts that arrive with an action",
            body:
              "Every sync, the engine scans for trouble: revenue drops, refund spikes, hero products running out of stock, collapsing ad campaigns. Each alert ships with a recommended action — and days after you act, Hiloomy measures whether it worked.",
            points: [
              "High priority = handle today, medium = fold into weekly planning",
              "A concrete suggested action on every alert card",
              "Closed loop: ✅ what worked / ❌ what didn't — measured and reported back"
            ]
          },
          {
            num: "03",
            title: "A weekly growth report in your inbox",
            body:
              "Every week, a designed PDF lands in your email: what changed, which red flags opened, and what to do next week. Includes BI commentary on the numbers and a weekly Meta Ads summary.",
            points: [
              "An executive summary you can read in two minutes",
              "Red flags with actions, ordered by priority",
              "Delivered automatically by email — no logging into anything"
            ]
          },
          {
            num: "04",
            title: "Full affiliate program management",
            body:
              "The affiliate manager creates coupons directly in Shopify, tracks every conversion through three attribution paths, and runs the entire payout cycle — no side spreadsheets.",
            points: [
              "Create single or bulk coupons right inside your store",
              "Three-layer attribution: tracked links, coupon codes, and history imports",
              "Payout workflow: approve → mark paid, with a balance per affiliate"
            ]
          },
          {
            num: "05",
            title: "Marketing planner & monthly brief",
            body:
              "Upload your team's Excel marketing calendar — Hiloomy classifies every task, builds a Gantt view, and generates the team's monthly brief as a PDF, with an automatic discount audit included.",
            points: [
              "Auto-classifies discounts, banners, videos, emails and posts",
              "Monthly brief PDF in your team's exact format + per-role versions",
              "Discount audit: duplicate codes, collisions with affiliate coupons"
            ]
          },
          {
            num: "06",
            title: "Retention that compounds into profit",
            body:
              "Who comes back, how fast, and thanks to which product. The retention layer separates first-order from second-order behavior so you can see where lifetime value is really built.",
            points: [
              "Repeat purchase rate and second-order rate over time",
              "Average time between first and second order",
              "The products that acquire customers vs. the ones that bring them back"
            ]
          }
        ],
        integrationsTitle: "Connects to what you already run",
        integrations: [
          "Shopify",
          "Meta Ads",
          "Instagram",
          "Google Search Console",
          "Email (reports)",
          "Excel / CSV"
        ],
        howTitle: "Three steps, no data team",
        how: [
          {
            step: "1",
            title: "Open an account",
            body: "Sign up with your email — 30 seconds, no credit card."
          },
          {
            step: "2",
            title: "Connect Shopify",
            body: "One-click secure connection with read-only scopes. Your data stays yours."
          },
          {
            step: "3",
            title: "Make decisions",
            body: "Data refreshes every 2 hours, alerts surface themselves, the report arrives weekly."
          }
        ],
        pricingTitle: "Simple pricing, no surprises",
        pricingSubtitle: "14-day free trial on every plan. No credit card. Cancel anytime.",
        perMonth: "/ month",
        recommended: "Most popular",
        planCta: "Start free trial",
        securityTitle: "Your data, in a vault",
        securityBody:
          "Shopify tokens are encrypted at rest (AES-256-GCM) and never leave the server. Every customer is fully isolated at the database level, store permissions are read-only, and you can disconnect and delete everything at any time.",
        securityCta: "Read the full security page",
        finalTitle: "Ready to see your real numbers?",
        finalSubtitle: "30 seconds to sign up · a minute to connect Shopify · 14 days to test everything",
        finalCta: "Open a free account",
        footer: {
          rights: "© 2026 Brandzp Ltd. All rights reserved.",
          privacy: "Privacy",
          terms: "Terms",
          security: "Security"
        }
      };
}

export default async function WelcomePage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const cookieLocale = await getAppLocale();
  const locale: AppLocale =
    sp.lang && isValidLocale(sp.lang) ? sp.lang : cookieLocale;
  const isHe = locale === "he";
  const dir = isHe ? "rtl" : "ltr";
  const t = getCopy(isHe);
  const otherLocale: AppLocale = isHe ? "en" : "he";
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  const plans = [PLANS.starter, PLANS.growth, PLANS.agency];

  return (
    <div
      dir={dir}
      lang={locale}
      className={`${displayFont.variable} ${bodyFont.variable} min-h-screen [font-family:var(--font-hl-body)]`}
      style={{ backgroundColor: PAPER, color: INK }}
    >
      {/* Page-scoped motion + texture. CSS only, respects reduced motion. */}
      <style>{`
        @keyframes hl-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .hl-rise { opacity: 0; animation: hl-rise .7s cubic-bezier(.2,.7,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) { .hl-rise { animation: none; opacity: 1; } }
        .hl-paper { background-image: radial-gradient(circle at 15% 0%, rgba(22,163,74,.07), transparent 42%), radial-gradient(circle at 90% 12%, rgba(249,115,22,.06), transparent 38%); }
        .hl-rule { background-image: linear-gradient(to bottom, rgba(27,67,50,.14) 1px, transparent 1px); background-size: 100% 100%; }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ borderColor: "rgba(27,67,50,.12)", backgroundColor: "rgba(250,246,236,.85)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <a href={`/welcome?lang=${locale}`} className="inline-flex items-center">
            <HiloomyLogo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium md:flex" style={{ color: "rgba(27,67,50,.72)" }}>
            <a href="#features" className="transition-colors hover:text-[#1B4332]">{t.nav.features}</a>
            <a href="#how" className="transition-colors hover:text-[#1B4332]">{t.nav.how}</a>
            <a href="#pricing" className="transition-colors hover:text-[#1B4332]">{t.nav.pricing}</a>
            <a href="/security" className="transition-colors hover:text-[#1B4332]">{t.nav.security}</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={`/welcome?lang=${otherLocale}`}
              className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white"
              style={{ borderColor: "rgba(27,67,50,.25)", color: INK }}
              aria-label={t.nav.switchLabel}
            >
              {t.nav.switchLabel}
            </a>
            <a
              href={`/login?lang=${locale}`}
              className="hidden text-sm font-medium sm:block"
              style={{ color: "rgba(27,67,50,.72)" }}
            >
              {t.nav.signin}
            </a>
            <a
              href={`/signup?lang=${locale}`}
              className="rounded-full px-4 py-2 text-xs font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 sm:text-sm"
              style={{ backgroundColor: INK }}
            >
              {t.nav.signup}
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hl-paper relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-8">
          <div>
            <p
              className="hl-rise inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest"
              style={{ borderColor: "rgba(249,115,22,.4)", color: ORANGE, animationDelay: ".05s" }}
            >
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              {t.hero.eyebrow}
            </p>
            <h1
              className="hl-rise mt-5 text-4xl font-black leading-[1.08] tracking-tight [font-family:var(--font-hl-display)] [text-wrap:balance] sm:text-[3.4rem]"
              style={{ animationDelay: ".15s" }}
            >
              {t.hero.titleA}
              <br />
              <span style={{ color: LEAF }}>{t.hero.titleB}</span>
            </h1>
            <p
              className="hl-rise mt-6 max-w-xl text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(27,67,50,.78)", animationDelay: ".25s" }}
            >
              {t.hero.subtitle}
            </p>
            <div className="hl-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ animationDelay: ".35s" }}>
              <a
                href={`/signup?lang=${locale}`}
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: ORANGE, boxShadow: "0 10px 24px -8px rgba(249,115,22,.55)" }}
              >
                {t.hero.ctaPrimary}
                <Arrow className="h-4 w-4" aria-hidden />
              </a>
              <a
                href="#how"
                className="inline-flex items-center justify-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-white"
                style={{ borderColor: "rgba(27,67,50,.3)", color: INK }}
              >
                {t.hero.ctaSecondary}
              </a>
            </div>
            <p className="hl-rise mt-4 text-xs" style={{ color: "rgba(27,67,50,.55)", animationDelay: ".45s" }}>
              {t.hero.noCC}
            </p>
          </div>

          {/* Product mock — pure CSS, localized */}
          <div className="hl-rise relative mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: ".3s" }}>
            <div
              className="relative rounded-3xl border bg-white p-6 shadow-2xl"
              style={{ borderColor: "rgba(27,67,50,.12)", boxShadow: "0 30px 60px -20px rgba(27,67,50,.25)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(27,67,50,.55)" }}>
                  {t.mock.cardLabel}
                </p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: "rgba(22,163,74,.12)", color: "#15803D" }}
                >
                  {t.mock.accuracy}
                </span>
              </div>
              <p className="mt-3 text-4xl font-black [font-family:var(--font-hl-display)]" style={{ color: INK }}>
                {t.mock.profit}{" "}
                <span className="text-sm font-semibold" style={{ color: "rgba(27,67,50,.5)" }}>
                  {t.mock.profitRate}
                </span>
              </p>
              {/* mini bar chart */}
              <div className="mt-5 flex h-24 items-end gap-1.5" aria-hidden>
                {[38, 52, 44, 61, 47, 70, 58, 82, 66, 100, 74, 88].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      backgroundColor: i === 9 ? ORANGE : "rgba(22,163,74,.75)"
                    }}
                  />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4" style={{ borderColor: "rgba(27,67,50,.1)" }}>
                {t.mock.kpis.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(27,67,50,.5)" }}>
                      {label}
                    </p>
                    <p className="mt-0.5 text-sm font-bold" style={{ color: INK }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* floating alert card */}
            <div
              className="absolute -top-6 -end-3 w-56 rotate-2 rounded-2xl border bg-white p-4 shadow-xl sm:-end-8"
              style={{ borderColor: "rgba(249,115,22,.35)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ORANGE }}>
                {t.mock.alertTag}
              </p>
              <p className="mt-1 text-xs font-bold leading-snug" style={{ color: INK }}>
                {t.mock.alertTitle}
              </p>
              <p className="mt-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: "rgba(249,115,22,.1)", color: "#C2540A" }}>
                {t.mock.alertAction}
              </p>
            </div>

            {/* floating report chip */}
            <div
              className="absolute -bottom-5 start-6 -rotate-1 rounded-full border bg-white px-4 py-2 text-xs font-semibold shadow-lg"
              style={{ borderColor: "rgba(22,163,74,.35)", color: "#15803D" }}
            >
              ✓ {t.mock.reportChip}
            </div>
          </div>
        </div>

        {/* proof strip */}
        <div className="border-y" style={{ borderColor: "rgba(27,67,50,.12)", backgroundColor: "rgba(255,255,255,.5)" }}>
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4">
            {t.proof.map(([big, small], i) => (
              <div key={i} className="py-6 text-center md:py-7">
                <p className="text-2xl font-black [font-family:var(--font-hl-display)]" style={{ color: i % 2 ? LEAF : ORANGE }}>
                  {big}
                </p>
                <p className="mt-1 text-xs font-medium" style={{ color: "rgba(27,67,50,.6)" }}>
                  {small}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capabilities (the ledger) ────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-black tracking-tight [font-family:var(--font-hl-display)] sm:text-4xl">
            {t.featuresTitle}
          </h2>
          <p className="mt-3 text-base leading-relaxed" style={{ color: "rgba(27,67,50,.7)" }}>
            {t.featuresSubtitle}
          </p>
        </div>

        <div className="mt-12 border-t" style={{ borderColor: "rgba(27,67,50,.15)" }}>
          {t.features.map((f) => (
            <article
              key={f.num}
              className="group grid gap-4 border-b py-8 transition-colors hover:bg-white/60 sm:py-10 lg:grid-cols-[80px_1fr_1.1fr] lg:gap-10"
              style={{ borderColor: "rgba(27,67,50,.12)" }}
            >
              <p
                className="text-3xl font-black [font-family:var(--font-hl-display)] lg:pt-1"
                style={{ color: "rgba(249,115,22,.85)" }}
              >
                {f.num}
              </p>
              <div>
                <h3 className="text-xl font-bold tracking-tight [font-family:var(--font-hl-display)] sm:text-2xl">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed sm:text-[15px]" style={{ color: "rgba(27,67,50,.72)" }}>
                  {f.body}
                </p>
              </div>
              <ul className="space-y-2.5 lg:pt-1">
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm" style={{ color: "rgba(27,67,50,.85)" }}>
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: "rgba(22,163,74,.12)" }}
                    >
                      <Check className="h-3 w-3" style={{ color: "#15803D" }} aria-hidden />
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ── Integrations strip ───────────────────────────────────────── */}
      <section className="border-y" style={{ borderColor: "rgba(27,67,50,.12)", backgroundColor: "rgba(255,255,255,.55)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-8 sm:px-6">
          <p className="w-full text-center text-[11px] font-bold uppercase tracking-widest sm:w-auto" style={{ color: "rgba(27,67,50,.5)" }}>
            {t.integrationsTitle}
          </p>
          {t.integrations.map((name) => (
            <span key={name} className="text-sm font-bold" style={{ color: "rgba(27,67,50,.75)" }}>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="text-center text-3xl font-black tracking-tight [font-family:var(--font-hl-display)] sm:text-4xl">
          {t.howTitle}
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {t.how.map((s) => (
            <div
              key={s.step}
              className="relative rounded-3xl border bg-white p-7 shadow-sm transition-transform hover:-translate-y-1"
              style={{ borderColor: "rgba(27,67,50,.12)" }}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-base font-black text-white [font-family:var(--font-hl-display)]"
                style={{ backgroundColor: LEAF }}
              >
                {s.step}
              </span>
              <h3 className="mt-4 text-lg font-bold [font-family:var(--font-hl-display)]">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "rgba(27,67,50,.7)" }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 border-t px-4 py-20 sm:px-6 sm:py-24" style={{ borderColor: "rgba(27,67,50,.12)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight [font-family:var(--font-hl-display)] sm:text-4xl">
              {t.pricingTitle}
            </h2>
            <p className="mt-3 text-sm" style={{ color: "rgba(27,67,50,.65)" }}>
              {t.pricingSubtitle}
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3 md:items-stretch">
            {plans.map((plan, idx) => {
              const highlighted = idx === 1;
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-3xl border p-7 ${highlighted ? "shadow-2xl md:-my-3" : "bg-white shadow-sm"}`}
                  style={
                    highlighted
                      ? { backgroundColor: INK_DEEP, borderColor: INK_DEEP, color: "#F3F8F4" }
                      : { borderColor: "rgba(27,67,50,.14)" }
                  }
                >
                  {highlighted ? (
                    <span
                      className="absolute -top-3 start-7 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white"
                      style={{ backgroundColor: ORANGE }}
                    >
                      {t.recommended}
                    </span>
                  ) : null}
                  <h3 className="text-xl font-black [font-family:var(--font-hl-display)]">
                    {plan.name[isHe ? "he" : "en"]}
                  </h3>
                  <p className="mt-1 text-xs" style={{ color: highlighted ? "rgba(243,248,244,.65)" : "rgba(27,67,50,.6)" }}>
                    {plan.description[isHe ? "he" : "en"]}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-4xl font-black [font-family:var(--font-hl-display)]">
                      {isHe ? `₪${plan.display.monthly.ILS}` : `$${plan.display.monthly.USD}`}
                    </span>
                    <span className="text-xs" style={{ color: highlighted ? "rgba(243,248,244,.6)" : "rgba(27,67,50,.55)" }}>
                      {t.perMonth}
                    </span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features[isHe ? "he" : "en"].slice(0, 6).map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: highlighted ? "#4ADE80" : "#15803D" }}
                          aria-hidden
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`/signup?lang=${locale}`}
                    className="mt-7 block rounded-full py-3 text-center text-sm font-bold transition-transform hover:-translate-y-0.5"
                    style={
                      highlighted
                        ? { backgroundColor: ORANGE, color: "#fff", boxShadow: "0 10px 22px -8px rgba(249,115,22,.6)" }
                        : { backgroundColor: INK, color: "#fff" }
                    }
                  >
                    {t.planCta}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Security band ────────────────────────────────────────────── */}
      <section className="border-t px-4 py-14 sm:px-6" style={{ borderColor: "rgba(27,67,50,.12)", backgroundColor: "rgba(255,255,255,.55)" }}>
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center sm:flex-row sm:text-start">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(22,163,74,.12)" }}
          >
            <ShieldCheck className="h-7 w-7" style={{ color: "#15803D" }} aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-black [font-family:var(--font-hl-display)]">{t.securityTitle}</h2>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "rgba(27,67,50,.72)" }}>
              {t.securityBody}{" "}
              <a href="/security" className="font-bold underline underline-offset-2" style={{ color: "#15803D" }}>
                {t.securityCta}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6 sm:py-24" style={{ backgroundColor: INK_DEEP }}>
        <div className="mx-auto max-w-3xl text-center">
          <HiloomyMark className="mx-auto h-12 w-12" />
          <h2 className="mt-5 text-3xl font-black tracking-tight text-white [font-family:var(--font-hl-display)] sm:text-4xl">
            {t.finalTitle}
          </h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: "rgba(243,248,244,.7)" }}>
            {t.finalSubtitle}
          </p>
          <a
            href={`/signup?lang=${locale}`}
            className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold text-white shadow-xl transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: ORANGE, boxShadow: "0 14px 30px -10px rgba(249,115,22,.65)" }}
          >
            {t.finalCta}
            <Arrow className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: INK_DEEP, borderTop: "1px solid rgba(243,248,244,.12)" }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-7 text-xs sm:flex-row sm:px-6" style={{ color: "rgba(243,248,244,.55)" }}>
          <p>{t.footer.rights}</p>
          <nav className="flex items-center gap-5">
            <a href="/privacy" className="transition-colors hover:text-white">{t.footer.privacy}</a>
            <a href="/terms" className="transition-colors hover:text-white">{t.footer.terms}</a>
            <a href="/security" className="transition-colors hover:text-white">{t.footer.security}</a>
            <a href={`/welcome?lang=${otherLocale}`} className="font-semibold transition-colors hover:text-white">
              {t.nav.switchLabel}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
