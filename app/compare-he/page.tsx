// Public marketing comparison page — Hebrew only, RTL.
// Route: /compare-he
// Task: HEB-CONTENT-DEV-01
// No auth required — added to PUBLIC_PATHS in middleware.ts.
// Content source: docs/COMPARE-HE-DRAFT.md (HEB-CONTENT-MC-01)
// Draft note: marked as internal draft pending owner approval.

import { ArrowRight, Check, X, HelpCircle } from "lucide-react";
import { HiloomyLogo } from "@/components/ui/logo";

export const metadata = {
  title: "Hiloomy מול המתחרים — השוואה לחנויות Shopify ישראליות",
  description:
    "השוואה ישרה בין Hiloomy לGoProfit, BeProfit, Triple Whale וPolar Analytics — בעברית, עם ILS ותמיכה ישראלית."
};

// -----------------------------------------------------------------------
// Comparison table data
// -----------------------------------------------------------------------

type CellValue = "yes" | "no" | "partial" | string;

interface ComparisonRow {
  feature: string;
  brandzp: CellValue;
  goprofit: CellValue;
  beprofit: CellValue;
  tripleWhale: CellValue;
  polar: CellValue;
}

const rows: ComparisonRow[] = [
  {
    feature: "שפת ממשק",
    brandzp: "עברית ראשית + אנגלית",
    goprofit: "עברית (מוצר ישראלי)",
    beprofit: "אנגלית בלבד",
    tripleWhale: "אנגלית בלבד",
    polar: "אנגלית בלבד"
  },
  {
    feature: "מטבע ברירת מחדל",
    brandzp: "ILS (שקל)",
    goprofit: "ILS",
    beprofit: "USD (המרה ידנית)",
    tripleWhale: "USD",
    polar: "USD"
  },
  {
    feature: "מחיר כניסה",
    brandzp: "Starter / Growth",
    goprofit: "לא פורסם",
    beprofit: "מ-$25/חודש",
    tripleWhale: "מ-$129/חודש",
    polar: "מ-$300/חודש"
  },
  {
    feature: "גרסת ניסיון",
    brandzp: "14 יום חינם",
    goprofit: "לא פורסם",
    beprofit: "7 ימים",
    tripleWhale: "7 ימים",
    polar: "14 ימים"
  },
  {
    feature: "רווח אמיתי לפי SKU",
    brandzp: "yes",
    goprofit: "partial",
    beprofit: "partial",
    tripleWhale: "partial",
    polar: "yes"
  },
  {
    feature: "מעקב אפיל / משפיענים",
    brandzp: "yes",
    goprofit: "partial",
    beprofit: "no",
    tripleWhale: "no",
    polar: "no"
  },
  {
    feature: "התראות מלאי בעברית",
    brandzp: "yes",
    goprofit: "partial",
    beprofit: "no",
    tripleWhale: "no",
    polar: "no"
  },
  {
    feature: "סיכום שבועי AI בעברית",
    brandzp: "yes",
    goprofit: "no",
    beprofit: "no",
    tripleWhale: "no",
    polar: "no"
  },
  {
    feature: "Native לShopify",
    brandzp: "yes",
    goprofit: "yes",
    beprofit: "yes",
    tripleWhale: "yes",
    polar: "yes"
  },
  {
    feature: "Cohorts / שימור לקוחות",
    brandzp: "yes",
    goprofit: "partial",
    beprofit: "partial",
    tripleWhale: "yes",
    polar: "yes"
  },
  {
    feature: "Meta Ads attribution",
    brandzp: "yes",
    goprofit: "yes",
    beprofit: "yes",
    tripleWhale: "yes",
    polar: "yes"
  },
  {
    feature: "תמיכה ישראלית",
    brandzp: "מייסד ישראלי",
    goprofit: "ישראלי",
    beprofit: "US / EN",
    tripleWhale: "US",
    polar: "EU"
  }
];

// -----------------------------------------------------------------------
// Cell renderer
// -----------------------------------------------------------------------

function Cell({ value, highlight }: { value: CellValue; highlight?: boolean }) {
  const base = "flex items-center justify-center py-3 px-2 text-xs sm:text-sm";

  if (value === "yes") {
    return (
      <div className={`${base} ${highlight ? "text-emerald-700" : "text-emerald-600"}`}>
        <Check className="h-4 w-4" aria-label="כן" />
      </div>
    );
  }
  if (value === "no") {
    return (
      <div className={`${base} text-slate-300`}>
        <X className="h-4 w-4" aria-label="לא" />
      </div>
    );
  }
  if (value === "partial") {
    return (
      <div className={`${base} text-amber-500`}>
        <HelpCircle className="h-4 w-4" aria-label="חלקי" />
      </div>
    );
  }
  // Text value
  return (
    <div
      className={`${base} text-center leading-tight ${
        highlight ? "font-semibold text-slate-900" : "text-muted-foreground"
      }`}
    >
      {value}
    </div>
  );
}

// -----------------------------------------------------------------------
// Competitor detail sections
// -----------------------------------------------------------------------

interface CompetitorSection {
  name: string;
  subtitle: string;
  strengths: string[];
  differentiators: string[];
}

const competitors: CompetitorSection[] = [
  {
    name: "GoProfit — מתחרה ישראלי",
    subtitle:
      "GoProfit הוא כלי ישראלי לניתוח רווחיות בחנויות Shopify. הממשק זמין בעברית והצוות ישראלי — יתרון אמיתי.",
    strengths: ["ממשק בעברית", "הבנת שוק מקומי", "אינטגרציה עם Shopify"],
    differentiators: [
      "מעקב אפיל/משפיענים ייעודי דרך BixGrow (GoProfit: לא אומת)",
      "סיכום AI שבועי בעברית שנשלח אוטומטית לאימייל — ללא צורך להיכנס לדשבורד",
      "התראות מלאי עם עדיפות לפי הכנסות המוצר ב90 הימים האחרונים"
    ]
  },
  {
    name: "BeProfit — כלי אטריבוציה ורווחיות",
    subtitle:
      "BeProfit (חברה ישראלית, ממשק אנגלי) הוא אחד הכלים הנפוצים יותר בחנויות Shopify בינוניות. מחיר הכניסה ~$25/חודש.",
    strengths: [
      "מחיר כניסה נגיש",
      "מוצר ישראלי בבסיסו (ממשק אנגלי)",
      "קהילת משתמשים גדולה"
    ],
    differentiators: [
      "כל הממשק בעברית ראשית — לא צריך לנווט בממשק אנגלי כדי להבין את המספרים שלכם",
      "סיכום שבועי בעברית שנשלח פרואקטיבית לאימייל — BeProfit לא מציע מקביל",
      "COGS לפי SKU זמין בכל התוכניות, לא רק בגבוהות"
    ]
  },
  {
    name: "Triple Whale — הסטנדרט האמריקאי",
    subtitle:
      "Triple Whale מוביל את שוק האטריבוציה הDTC האמריקאי. חזק מאוד — אבל מיועד לחנויות גדולות עם תקציב דולרי ($129+/חודש).",
    strengths: [
      "attribution מתקדם ורב-ערוצי",
      "ecosystem רחב ואינטגרציות רבות",
      "brand recognition גבוה"
    ],
    differentiators: [
      "מחיר בסדר גודל שונה לחלוטין — Triple Whale לא נגיש לרוב החנויות הישראליות בשלב הגדילה",
      "כל הממשק, ההתראות והסיכום השבועי — בעברית. Triple Whale: אנגלית בלבד",
      "מעקב אפיל ישראלי (BixGrow) — Triple Whale לא בנוי סביב מודל האפיל הישראלי"
    ]
  },
  {
    name: "Polar Analytics — הכלי האירופי",
    subtitle:
      "Polar Analytics מכוון לחנויות Shopify בינוניות-גדולות בשוק האירופי ($300+/חודש). ידוע בdata blending ובממשק נקי.",
    strengths: [
      "data blending ממקורות מרובים",
      "ממשק אנליטי עמוק",
      "retention וcohort analysis מוקפד"
    ],
    differentiators: [
      "תמחור — Polar ב-$300+ היא קטגוריה שונה לחלוטין",
      "הכלי מיועד לקהל ישראלי, לא לקהל EU שתורגם לישראל",
      "Weekly Digest בעברית: לא קיים בPolar Analytics"
    ]
  }
];

// -----------------------------------------------------------------------
// Unique value features
// -----------------------------------------------------------------------

const uniqueFeatures = [
  {
    num: "1",
    title: "סיכום שבועי AI בעברית — ישירות לאימייל",
    body: "כל יום שני בבוקר מגיע לתיבת הדואר שלכם סיכום של מה שקרה בשבוע שעבר: אילו מוצרים נמכרו, מה השתנה בROAS ואיזו המלצה ראשונה כדאי לשקול. בעברית. ללא צורך להיכנס לדשבורד."
  },
  {
    num: "2",
    title: "מעקב אפיל ומשפיענים (BixGrow)",
    body: "מודל הפרסום הישראלי מבוסס חלק ניכר על משפיענים ואפיל. Hiloomy עוקב אחר קמפיינים של אפיל דרך BixGrow ומציג בדיוק כמה הכנסה כל שותף הביא."
  },
  {
    num: "3",
    title: "COGS לפי SKU — רווח אמיתי, לא מחזור",
    body: "הכנסות הן הסיפור. הרווח הוא המציאות. Hiloomy מאפשר הזנת עלות מוצר לפי יחידת מלאי (SKU) ומחשב אוטומטית את המרווח הגולמי האמיתי לכל מוצר ולכל תקופה."
  },
  {
    num: "4",
    title: "התראות מלאי חכמות",
    body: "כאשר מוצר עם פוטנציאל הכנסה גבוה עומד לאזול — תקבלו התראה בעברית, עם ההקשר של הכנסות 90 הימים האחרונים של אותו מוצר. לא עוד מוצר מוביל שנגמר בשקט."
  }
];

// -----------------------------------------------------------------------
// Page component
// -----------------------------------------------------------------------

export default function CompareHePage() {
  const columns = [
    { key: "brandzp", label: "Hiloomy", highlight: true },
    { key: "goprofit", label: "GoProfit", highlight: false },
    { key: "beprofit", label: "BeProfit", highlight: false },
    { key: "tripleWhale", label: "Triple Whale", highlight: false },
    { key: "polar", label: "Polar Analytics", highlight: false }
  ] as const;

  return (
    <div
      dir="rtl"
      lang="he"
      className="min-h-screen bg-gradient-to-br from-violet-50/30 via-background to-indigo-50/30"
    >
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/welcome" className="inline-flex items-center">
            <HiloomyLogo />
          </a>
          <a
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
          >
            ניסיון 14 יום חינם
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-14 sm:pt-20 pb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          כלי אנליטיקס לחנויות Shopify ישראליות
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight">
          לא כל כלי אנליטיקס נבנה בשבילכם
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-7 max-w-2xl mx-auto">
          רוב הכלים נבנו עבור חנויות אמריקאיות — ממשק באנגלית, מחיר בדולרים, תמיכה באזור זמן אחר.
          אם אתם מנהלים חנות Shopify ישראלית, הנה השוואה ישרה שתעזור לכם להחליט.
        </p>
      </section>

      {/* Comparison Table — full viewport width for readability */}
      <section className="w-full px-4 sm:px-6 py-8">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-6 text-center">
          טבלת השוואה מהירה
        </h2>

        {/* Scrollable wrapper for mobile */}
        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="py-3 px-4 text-end font-semibold text-slate-700 w-56">
                  מאפיין
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-3 px-2 text-center font-semibold text-xs sm:text-sm ${
                      col.highlight
                        ? "text-violet-700 bg-violet-50/60"
                        : "text-slate-600"
                    }`}
                  >
                    {col.label}
                    {col.highlight && (
                      <span className="ms-1 inline-block rounded-full bg-violet-700 text-white text-[10px] px-1.5 py-0.5 font-bold align-middle">
                        ★
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.feature}
                  className={`border-b border-border/60 ${
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="py-1 px-4 font-medium text-slate-800 text-xs sm:text-sm">
                    {row.feature}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={col.highlight ? "bg-violet-50/40" : ""}
                    >
                      <Cell value={row[col.key]} highlight={col.highlight} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 justify-center text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> כן
          </span>
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden /> חלקי / לא אומת
          </span>
          <span className="flex items-center gap-1">
            <X className="h-3.5 w-3.5 text-slate-300" aria-hidden /> לא
          </span>
        </div>

        {/* Disclaimer */}
        <p className="mt-4 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          נתוני מחירים למתחרים עודכנו נכון לסריקה ציבורית של יוני 2026. מחירים עשויים להשתנות — בדקו תמיד
          מול האתר הרשמי של כל כלי. נתונים שסומנו &quot;חלקי&quot; לא אומתו ממקורות ראשוניים.
        </p>
      </section>

      {/* Competitor deep-dives */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-8 text-center">
          ניתוח מפורט לפי כלי
        </h2>
        <div className="space-y-6">
          {competitors.map((comp) => (
            <div
              key={comp.name}
              className="rounded-2xl border border-border bg-card p-5 sm:p-7"
            >
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {comp.name}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-6">
                {comp.subtitle}
              </p>

              <div className="mt-5 grid sm:grid-cols-2 gap-5">
                {/* Strengths */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    היכן הכלי חזק
                  </p>
                  <ul className="space-y-1.5">
                    {comp.strengths.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-sm text-slate-700">
                        <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" aria-hidden />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Differentiators */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 mb-2">
                    היכן Hiloomy שונה
                  </p>
                  <ul className="space-y-1.5">
                    {comp.differentiators.map((d) => (
                      <li key={d} className="flex items-start gap-2 text-sm text-violet-900">
                        <span
                          className="mt-1 h-2 w-2 rounded-full bg-violet-500 shrink-0"
                          aria-hidden
                        />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Unique features */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2 text-center">
          מה מייחד את Hiloomy לחנויות ישראליות
        </h2>
        <p className="text-center text-sm text-muted-foreground mb-8">
          ארבעה דברים שרק Hiloomy מציע לחנות ישראלית הפועלת בShopify
        </p>
        <div className="grid sm:grid-cols-2 gap-5">
          {uniqueFeatures.map((feat) => (
            <div
              key={feat.num}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 font-bold text-base">
                  {feat.num}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base">
                    {feat.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-6">
                    {feat.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Target audience */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-3">
            למי Hiloomy מתאים?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-7">
            Hiloomy מתאים לחנות Shopify ישראלית שמייצרת מאות הזמנות לחודש, מנהלת קמפיינים
            בMeta ו/או עם אפיל, ורוצה תמונה שבועית ברורה של הרווחיות — בלי להיות אנליסט ובלי לשלם
            על כלי שנבנה עבור מישהו אחר.
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-7">
            אם החנות שלכם עוד בשלב של 0–50 הזמנות לחודש, Hiloomy עדיין רלוונטי — אבל הסיכום
            השבועי יהיה שימושי יותר כשיש נפח נתונים לנתח.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <div className="rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 p-10 sm:p-14 text-center text-white shadow-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            נסו 14 יום בחינם — ללא כרטיס אשראי
          </h2>
          <p className="mt-3 text-sm sm:text-base text-violet-100 leading-7">
            חיבור הShopify לוקח פחות מ10 דקות. הסיכום הראשון בעברית מגיע תוך שבוע.
            שאלות? המייסד זמין לשיחה ישירה — לא תמיכה דרך טיקטים.
          </p>
          <a
            href="https://shopifyappanalytics.onrender.com/signup"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-violet-700 shadow-md hover:bg-violet-50"
          >
            התחילו ניסיון חינם
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
          </a>
          <p className="mt-3 text-xs text-violet-200">
            ללא כרטיס אשראי · ביטול בכל רגע
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© 2026 Brandzp Ltd. כל הזכויות שמורות.</p>
          <nav className="flex items-center gap-4">
            <a href="/privacy" className="hover:text-foreground">פרטיות</a>
            <a href="/terms" className="hover:text-foreground">תנאי שימוש</a>
            <a href="/security" className="hover:text-foreground">אבטחה</a>
            <a href="/welcome" className="hover:text-foreground">דף הבית</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
