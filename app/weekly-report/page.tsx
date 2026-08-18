import { Suez_One, Alef } from "next/font/google";
import { getAppLocale, isValidLocale, type AppLocale } from "@/lib/i18n";
import { HiloomyLogo } from "@/components/ui/logo";
import { MobileNav } from "@/components/marketing/home-interactive";
import { ReportSheets, type ReportCopy, type ReportData } from "@/components/marketing/report-sample";

// Public sample of the weekly report — the flagship deliverable, shown
// page-by-page as stacked "PDF sheets" (broadsheet redesign). Linked from
// the landing nav; no auth required (whitelisted in middleware).

const displayFont = Suez_One({ subsets: ["latin", "hebrew"], weight: "400", variable: "--font-hl-display" });
const bodyFont = Alef({ subsets: ["latin", "hebrew"], weight: ["400", "700"], variable: "--font-hl-body" });

const INK = "#201E1D";
const GREEN = "#14512C";
const GREEN_DARK = "#12341F";
const ORANGE = "#D1731F";
const PAPER = "#F7F7F6";
const DIM = "#605D5D";
const HAIR = "rgba(32,30,29,.12)";

export const metadata = {
  title: "Hiloomy — The weekly report, page by page",
  description:
    "A real sample of Hiloomy's weekly growth report: what changed, red flags with actions, Meta Ads verdicts, and the week's to-do list. הדוח השבועי של Hiloomy — דוגמה אמיתית."
};

function getCopy(isHe: boolean) {
  return isHe
    ? {
        nav: { features: "יכולות", report: "הדוח השבועי", pricing: "מחירים", security: "אבטחה", login: "התחברות", cta: "צרו משתמש", ctaFree: "התחילו בחינם", switchLabel: "EN", switchLong: "Switch to English" },
        kicker: "Hiloomy · הדוח השבועי",
        kickerMeta: "נשלח כל ראשון ב־08:00",
        title: "הדוח שמגיע לפני שהשבוע מתחיל.",
        subtitle: "כל ראשון בשמונה בבוקר נכנס למייל PDF אחד: מה השתנה, אילו דגלים אדומים נפתחו, ומה לעשות עד יום חמישי. זה דוח אמיתי לדוגמה — גללו עמוד־עמוד.",
        scrollHint: "שש עמודות. שתי דקות קריאה.",
        finalTitle: "רוצים את הדוח הזה על הנתונים שלכם?",
        finalBody: "מחברים את Shopify, ובראשון הראשון שאחרי החיבור הדוח נכנס למייל.",
        backHome: "לעמוד הבית",
        legal: "© 2026 Brandzp Ltd."
      }
    : {
        nav: { features: "Features", report: "Weekly report", pricing: "Pricing", security: "Security", login: "Log in", cta: "Create account", ctaFree: "Get started free", switchLabel: "עב", switchLong: "עברו לעברית" },
        kicker: "Hiloomy · The weekly report",
        kickerMeta: "Sent every Sunday, 08:00",
        title: "The report that lands before the week starts.",
        subtitle: "Every Sunday at eight, one PDF arrives: what changed, which red flags opened, and what to do before Thursday. This is a real sample — scroll it page by page.",
        scrollHint: "Six pages. A two-minute read.",
        finalTitle: "Want this report on your own numbers?",
        finalBody: "Connect Shopify and it lands in your inbox the first Sunday after.",
        backHome: "Back to home",
        legal: "© 2026 Brandzp Ltd."
      };
}

function getReportCopy(isHe: boolean): ReportCopy {
  return isHe
    ? {
        indexLabel: "תוכן הדוח",
        p1Kicker: "דוח שבועי · Hiloomy",
        p1Week: "שבוע 33 · 10–16 באוגוסט 2026",
        p1Headline: "הרווח עלה 9% למרות שההכנסות ירדו 2%.",
        p1NumberLabel: "רווח תרומה, שבעה ימים",
        p2Kicker: "מה השתנה",
        p2Meta: "מול השבוע הקודם",
        p2Title: "הכנסות, הנחות והחזרים — לפני ואחרי.",
        p3Kicker: "דגלים אדומים",
        p3Meta: "לפי סדר עדיפות",
        p3Title: "שלושה דברים שדורשים החלטה השבוע.",
        p4Kicker: "Meta Ads",
        p4Meta: "שבעה ימים",
        p4Title: "סיכום קמפיינים, עם פרשנות ולא רק מספרים.",
        p4Cols: ["קמפיין", "הוצאה", "הכנסה", "ROAS", "מסקנה"],
        p4Note: "שני קמפיינים נשאו את השבוע ואחד שרף תקציב על קהל שכבר קנה. ההמלצה: להעביר 30% מהתקציב מקמפיין הרימרקטינג לקהל הרחב.",
        p5Kicker: "לעשות השבוע",
        p5Meta: "חמש פעולות, לפי סדר",
        p5Title: "רשימת הפעולות, כל אחת עם הסיבה שלה.",
        p6Kicker: "שותפים ושימור",
        p6Meta: "30 ימים",
        p6Title: "מי מביא לקוחות ומי מחזיר אותם.",
        p6Affiliates: "תוכנית שותפים",
        p6Retention: "שימור לקוחות",
        p6Note: "המוצר שמביא לקוחות חדשים אינו המוצר שמחזיר אותם. שווה לבנות עליו הצעת רכישה שנייה בתוך 21 ימים.",
        pages: [
          { num: "01", navTitle: "שער השבוע" },
          { num: "02", navTitle: "מה השתנה" },
          { num: "03", navTitle: "דגלים אדומים" },
          { num: "04", navTitle: "סיכום Meta" },
          { num: "05", navTitle: "לעשות השבוע" },
          { num: "06", navTitle: "שותפים ושימור" }
        ]
      }
    : {
        indexLabel: "Contents",
        p1Kicker: "Weekly report · Hiloomy",
        p1Week: "Week 33 · 10–16 August 2026",
        p1Headline: "Profit rose 9% even though revenue fell 2%.",
        p1NumberLabel: "Contribution profit, seven days",
        p2Kicker: "What changed",
        p2Meta: "Versus last week",
        p2Title: "Revenue, discounts and refunds — before and after.",
        p3Kicker: "Red flags",
        p3Meta: "Ordered by priority",
        p3Title: "Three things that need a decision this week.",
        p4Kicker: "Meta Ads",
        p4Meta: "Seven days",
        p4Title: "Campaign summary, with a read — not only numbers.",
        p4Cols: ["Campaign", "Spend", "Revenue", "ROAS", "Verdict"],
        p4Note: "Two campaigns carried the week and one burned budget on an audience that had already bought. Recommendation: move 30% of the remarketing budget to broad.",
        p5Kicker: "Do this week",
        p5Meta: "Five actions, in order",
        p5Title: "The action list, each with its reason attached.",
        p6Kicker: "Affiliates and retention",
        p6Meta: "30 days",
        p6Title: "Who brings customers, and who brings them back.",
        p6Affiliates: "Affiliate program",
        p6Retention: "Retention",
        p6Note: "The product that acquires new customers isn't the product that brings them back. Worth building a second-purchase offer around it inside 21 days.",
        pages: [
          { num: "01", navTitle: "Week cover" },
          { num: "02", navTitle: "What changed" },
          { num: "03", navTitle: "Red flags" },
          { num: "04", navTitle: "Meta summary" },
          { num: "05", navTitle: "Do this week" },
          { num: "06", navTitle: "Affiliates & retention" }
        ]
      };
}

function getReportData(isHe: boolean): ReportData {
  return isHe
    ? {
        p1Number: "₪28,940",
        p1Delta: "+9.1% מול שבוע קודם",
        p1Meta: [
          { k: "הכנסות", v: "₪46,120" },
          { k: "הזמנות", v: "612" },
          { k: "דיוק הנתונים", v: "גבוה" }
        ],
        p2Rows: [
          { k: "הכנסות", now: "₪46,120", prev: "₪47,090", delta: "−2.1%", tone: "down" },
          { k: "רווח תרומה", now: "₪28,940", prev: "₪26,530", delta: "+9.1%", tone: "up" },
          { k: "הנחות", now: "−₪2,880", prev: "−₪4,410", delta: "−34.7%", tone: "up" },
          { k: "החזרים", now: "−₪910", prev: "−₪1,640", delta: "−44.5%", tone: "up" },
          { k: "עלות מוצרים", now: "−₪13,390", prev: "−₪14,510", delta: "−7.7%", tone: "flat" }
        ],
        p2Bars: [
          { h: "46%", label: "ב׳", color: "#7CC79A" },
          { h: "52%", label: "ג׳", color: "#7CC79A" },
          { h: "44%", label: "ד׳", color: "#7CC79A" },
          { h: "61%", label: "ה׳", color: "#7CC79A" },
          { h: "78%", label: "ו׳", color: "#4FA971" },
          { h: "92%", label: "ש׳", color: "#14512C" },
          { h: "67%", label: "א׳", color: "#7CC79A" }
        ],
        p3Flags: [
          { priority: "עדיפות גבוהה", source: "מלאי · מוצר דגל", tone: "high", title: "המוצר המוביל ייגמר בעוד 6 ימים", action: "פעולה: להזמין 120 יחידות היום; הספק בזמן אספקה של 9 ימים." },
          { priority: "עדיפות בינונית", source: "החזרים · קולקציית קיץ", tone: "medium", title: "שיעור ההחזרים בקולקציה עלה ל־7.4%", action: "פעולה: לבדוק שתי מדידות מידה בדף המוצר לפני סוף השבוע." },
          { priority: "עדיפות בינונית", source: "Meta Ads · רימרקטינג", tone: "medium", title: "קמפיין הרימרקטינג ירד מתחת ל־ROAS 1.4", action: "פעולה: להוריד 30% מהתקציב ולהעביר לקהל הרחב." }
        ],
        p4Campaigns: [
          { name: "Broad · Prospecting", spend: "₪6,400", revenue: "₪21,300", roas: "3.33", verdict: "להגדיל", tone: "up" },
          { name: "Advantage+ Shopping", spend: "₪4,900", revenue: "₪14,700", roas: "3.00", verdict: "להשאיר", tone: "flat" },
          { name: "Retargeting · 30d", spend: "₪3,100", revenue: "₪4,240", roas: "1.37", verdict: "לצמצם", tone: "down" },
          { name: "Lookalike 3%", spend: "₪2,200", revenue: "₪5,900", roas: "2.68", verdict: "להשאיר", tone: "flat" },
          { name: "Creative test · UGC", spend: "₪1,150", revenue: "₪2,980", roas: "2.59", verdict: "להרחיב", tone: "up" }
        ],
        p5Actions: [
          { num: "1", title: "להזמין 120 יחידות מהמוצר הדגל", why: "המלאי נגמר בעוד 6 ימים וזמן האספקה 9.", owner: "תפעול" },
          { num: "2", title: "להוריד 30% מתקציב הרימרקטינג", why: "ROAS 1.37, מתחת לרצפה שהגדרתם.", owner: "מדיה" },
          { num: "3", title: "לתקן את טבלת המידות בקולקציית קיץ", why: "ההחזרים עלו ל־7.4% ומרוכזים בשני מוצרים.", owner: "תוכן" },
          { num: "4", title: "לשלם ל־4 שותפים עם יתרה פתוחה", why: "₪9,340 ממתינים לאישור מעל 14 ימים.", owner: "פיננסים" },
          { num: "5", title: "לבנות הצעת רכישה שנייה ב־21 ימים", why: "הפער הממוצע להזמנה שנייה הוא 24 ימים.", owner: "CRM" }
        ],
        p6Affiliates: [
          { k: "שותפים פעילים", v: "18" },
          { k: "הזמנות משותפים", v: "143" },
          { k: "הכנסה משותפים", v: "₪38,410" },
          { k: "לתשלום", v: "₪9,340" }
        ],
        p6Retention: [
          { k: "רכישה חוזרת", v: "31%" },
          { k: "הזמנה שנייה", v: "19%" },
          { k: "זמן להזמנה שנייה", v: "24 ימים" },
          { k: "LTV ב־90 יום", v: "₪412" }
        ]
      }
    : {
        p1Number: "$7,940",
        p1Delta: "+9.1% vs last week",
        p1Meta: [
          { k: "Revenue", v: "$12,650" },
          { k: "Orders", v: "612" },
          { k: "Data accuracy", v: "High" }
        ],
        p2Rows: [
          { k: "Revenue", now: "$12,650", prev: "$12,920", delta: "−2.1%", tone: "down" },
          { k: "Contribution profit", now: "$7,940", prev: "$7,280", delta: "+9.1%", tone: "up" },
          { k: "Discounts", now: "−$790", prev: "−$1,210", delta: "−34.7%", tone: "up" },
          { k: "Refunds", now: "−$250", prev: "−$450", delta: "−44.5%", tone: "up" },
          { k: "Cost of goods", now: "−$3,670", prev: "−$3,980", delta: "−7.7%", tone: "flat" }
        ],
        p2Bars: [
          { h: "46%", label: "Mon", color: "#7CC79A" },
          { h: "52%", label: "Tue", color: "#7CC79A" },
          { h: "44%", label: "Wed", color: "#7CC79A" },
          { h: "61%", label: "Thu", color: "#7CC79A" },
          { h: "78%", label: "Fri", color: "#4FA971" },
          { h: "92%", label: "Sat", color: "#14512C" },
          { h: "67%", label: "Sun", color: "#7CC79A" }
        ],
        p3Flags: [
          { priority: "High priority", source: "Inventory · flagship", tone: "high", title: "Your best seller runs out in 6 days", action: "Action: order 120 units today; the supplier's lead time is 9 days." },
          { priority: "Medium priority", source: "Refunds · summer collection", tone: "medium", title: "Collection refund rate climbed to 7.4%", action: "Action: correct two size measurements on the product page before Friday." },
          { priority: "Medium priority", source: "Meta Ads · retargeting", tone: "medium", title: "Retargeting fell below 1.4 ROAS", action: "Action: cut 30% of its budget and move it to broad." }
        ],
        p4Campaigns: [
          { name: "Broad · Prospecting", spend: "$1,750", revenue: "$5,830", roas: "3.33", verdict: "Scale", tone: "up" },
          { name: "Advantage+ Shopping", spend: "$1,340", revenue: "$4,020", roas: "3.00", verdict: "Hold", tone: "flat" },
          { name: "Retargeting · 30d", spend: "$850", revenue: "$1,160", roas: "1.37", verdict: "Cut", tone: "down" },
          { name: "Lookalike 3%", spend: "$600", revenue: "$1,610", roas: "2.68", verdict: "Hold", tone: "flat" },
          { name: "Creative test · UGC", spend: "$315", revenue: "$815", roas: "2.59", verdict: "Expand", tone: "up" }
        ],
        p5Actions: [
          { num: "1", title: "Order 120 units of the flagship", why: "Stock runs out in 6 days; lead time is 9.", owner: "Ops" },
          { num: "2", title: "Cut retargeting budget by 30%", why: "ROAS 1.37, below the floor you set.", owner: "Media" },
          { num: "3", title: "Fix the summer size chart", why: "Refunds hit 7.4%, concentrated in two SKUs.", owner: "Content" },
          { num: "4", title: "Pay 4 affiliates with open balances", why: "$2,530 has been awaiting approval over 14 days.", owner: "Finance" },
          { num: "5", title: "Build a 21-day second-purchase offer", why: "The average gap to a second order is 24 days.", owner: "CRM" }
        ],
        p6Affiliates: [
          { k: "Active affiliates", v: "18" },
          { k: "Affiliate orders", v: "143" },
          { k: "Affiliate revenue", v: "$10,400" },
          { k: "Due to pay", v: "$2,530" }
        ],
        p6Retention: [
          { k: "Repeat purchase", v: "31%" },
          { k: "Second order rate", v: "19%" },
          { k: "Time to 2nd order", v: "24 days" },
          { k: "90-day LTV", v: "$112" }
        ]
      };
}

export default async function WeeklyReportSamplePage({
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
  const reportCopy = getReportCopy(isHe);
  const reportData = getReportData(isHe);
  const otherLocale: AppLocale = isHe ? "en" : "he";
  const signupHref = `/signup?lang=${locale}`;

  return (
    <div
      dir={dir}
      lang={locale}
      className={`${displayFont.variable} ${bodyFont.variable} min-h-screen [font-family:var(--font-hl-body)]`}
      style={{ backgroundColor: PAPER, color: INK }}
    >
      {/* ── Nav (same as landing) ────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: HAIR, backgroundColor: "rgba(247,247,246,.88)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-10">
          <a href={`/welcome?lang=${locale}`} className="inline-flex items-center">
            <HiloomyLogo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-bold md:flex" style={{ color: DIM }}>
            <a href={`/welcome?lang=${locale}#features`} className="transition-colors hover:text-[#201E1D]">{t.nav.features}</a>
            <span style={{ color: GREEN }}>{t.nav.report}</span>
            <a href={`/welcome?lang=${locale}#pricing`} className="transition-colors hover:text-[#201E1D]">{t.nav.pricing}</a>
            <a href="/security" className="transition-colors hover:text-[#201E1D]">{t.nav.security}</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a
              href={`/weekly-report?lang=${otherLocale}`}
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
              { href: `/welcome?lang=${locale}#features`, label: t.nav.features },
              { href: `/weekly-report?lang=${locale}`, label: t.nav.report },
              { href: `/welcome?lang=${locale}#pricing`, label: t.nav.pricing },
              { href: "/security", label: t.nav.security }
            ]}
            switchHref={`/weekly-report?lang=${otherLocale}`}
            switchLabel={t.nav.switchLong}
            primaryHref={signupHref}
            primaryLabel={t.nav.ctaFree}
            secondaryHref={`/login?lang=${locale}`}
            secondaryLabel={t.nav.login}
            menuLabel={isHe ? "תפריט" : "Menu"}
            logo={<HiloomyLogo />}
            dir={dir}
          />
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-12 sm:px-10 sm:pt-16">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] font-bold uppercase tracking-widest">
          <span style={{ color: ORANGE }}>{t.kicker}</span>
          <span style={{ color: DIM }}>{t.kickerMeta}</span>
        </div>
        <h1
          className="mt-4 max-w-3xl text-4xl font-normal leading-[1.02] [font-family:var(--font-hl-display)] [text-wrap:balance] sm:text-6xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed [text-wrap:pretty]" style={{ color: "rgba(32,30,29,.8)" }}>
          {t.subtitle}
        </p>
        <p className="mt-4 text-sm font-bold" style={{ color: GREEN }}>
          ↓ {t.scrollHint}
        </p>
      </section>

      {/* ── The report sheets ────────────────────────────────────────── */}
      <ReportSheets t={reportCopy} d={reportData} />

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="px-5 py-16 text-center sm:px-10 sm:py-24" style={{ backgroundColor: GREEN_DARK }}>
        <h2 className="mx-auto max-w-2xl text-3xl font-normal leading-tight text-white [font-family:var(--font-hl-display)] sm:text-5xl">
          {t.finalTitle}
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed" style={{ color: "rgba(255,255,255,.78)" }}>
          {t.finalBody}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3.5">
          <a
            href={signupHref}
            className="rounded-full px-8 py-4 text-sm font-bold transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: "#fff", color: GREEN_DARK }}
          >
            {t.nav.ctaFree}
          </a>
          <a
            href={`/welcome?lang=${locale}`}
            className="rounded-full border px-8 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
            style={{ borderColor: "rgba(255,255,255,.35)" }}
          >
            {t.backHome}
          </a>
        </div>
        <p className="mt-12 text-xs" style={{ color: "rgba(255,255,255,.45)" }}>
          {t.legal}
        </p>
      </section>
    </div>
  );
}
