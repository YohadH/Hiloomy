// Latest competitor-intelligence snapshot — the machine-readable version of
// docs/competitor-intel-incense-2026-08-13.pdf. Produced from a manual
// research sweep (brand sites + public search, 13/08/2026).
//
// Consumed by lib/services/competitor-brief-service.ts, which feeds it to
// the BI agent for "what should I do today / this week" recommendations and
// falls back to `suggestedActions` below when the agent is unreachable.
//
// To refresh: rerun the research, update this file, bump `version`.

export interface CompetitorIntelEntry {
  name: string;
  tier: "luxury-import" | "mid-niche" | "budget-dupe";
  // What they are doing right now (Hebrew, one line).
  move: string;
  // What it means for Incense Parfums (Hebrew, one line).
  implication: string;
}

export interface CompetitorIntel {
  version: string;
  generatedAt: string; // ISO date of the research sweep
  storeContext: string;
  competitors: CompetitorIntelEntry[];
  influencerNote: string;
  suggestedActions: { today: string[]; thisWeek: string[] };
}

export const COMPETITOR_INTEL_LATEST: CompetitorIntel = {
  version: "2026-08-14.2",
  generatedAt: "2026-08-14",
  storeContext:
    "Incense Parfums — מותג בשמי נישה ישראלי, טווח מחירים ₪150–450. " +
    "30 ימים אחרונים: הכנסה ₪449,580 (+11.9%), הזמנות +27.8%, סל ממוצע ‑14.6%. " +
    "מנוע: Base parfume (+₪34,608). משקולת: מארז LA FLAMME (‑₪145,152, כנראה סוף מבצע).",
  competitors: [
    {
      name: "Byredo",
      tier: "luxury-import",
      move:
        "השיקו בושם דגל חדש (Future Memories, תחילת אוגוסט) עם קמפיין סיפורי; מהדורות מוגבלות; אפס הנחות. עוגן: ‎€170 ל50 מ\"ל.",
      implication:
        "היוקרה מוכרת סיפור והשקות, לא מחיר — לוח השקות עם נרטיב הוא המודל לחיקוי."
    },
    {
      name: "Le Labo",
      tier: "luxury-import",
      move:
        "קמפיין City Exclusives בשיאו: כל אוגוסט דוגמיות ב$13, רק בספטמבר בקבוקים מלאים לכל העולם. חריטה אישית ומילוי חוזר במקום הנחות.",
      implication:
        "מכניקת ניסיון זול + חלון קנייה מוגבל היא הרעיון הכי שווה לגניבה, בלי לגעת במחיר."
    },
    {
      name: "MySpring",
      tier: "mid-niche",
      move:
        "מבצע חיסול חריג על קו הבשמים: ₪69–99 ל100 מ\"ל (עד ‑67%), כולל בושם FRANKINCENSE & PEONY שנכנס לטריטוריה שלנו. בלי תאריך סיום.",
      implication:
        "איום ישיר על רצפת המחיר — אבל חיסול במרווח שלילי הוא בעיה שלהם. לא להגיב במחיר; לעקוב אם זה הופך לקבוע."
    },
    {
      name: "Sacara",
      tier: "budget-dupe",
      move:
        "קו דיופים ב₪69 ל100 מ\"ל, משלוח חינם מ₪99, ו14 יום ניסיון על בושם. השבוע כל תקציב הפרסום (כולל CPC) על השקת מסקרות — לא על בשמים.",
      implication:
        "המיקוד השיווקי שלהם החודש הוא איפור, לא בישום — פחות רעש תחרותי מקומי על בשמים. הזדמנות לבלוט במסר, בלי הנחות על מחירי מדיה. ואת מנגנון '14 יום ניסיון' — לאמץ."
    }
  ],
  influencerNote:
    "מהמשפיעניות שנבדקו: אנה זק (מותג בשמים משלה בSPRING), יעל שלביה (פרזנטורית April) וספיר אביסרור (שגרירת Yves Rocher) — בניגוד עניינים. " +
    "מועמדות לבדיקה: טל תמם (113K, קהילת בנות סגורה, קומרס מוכח) ונועה סולומון (מאפרת כלות, ערוץ UGC). " +
    "חשוב: שיתוף פעולה עם משפיענית הוא תהליך של שבועות — בדיקת בלעדיות מול מותגים קיימים, הסכם וקוד — לא פעולה מיידית. נסח המלצות בנושא כ'לפתוח שיחה/בדיקה', לא כתוצאה מהירה.",
  suggestedActions: {
    today: [
      "לחדד בדף הבית את מיצוב הביניים: 'נישה אמיתית בהישג יד' — מול דיופים של ₪69 ומול יבוא של ₪680+. לא יורדים במחיר.",
      "להרים קמפיין בישום עכשיו — Sacara שמה את התקציב על מסקרות וMySpring שורפת מרווחים: תשומת הלב זולה החודש.",
      "לקבוע סף משלוח חינם ברור של ₪199 ולהציג אותו בכל עמוד מוצר."
    ],
    thisWeek: [
      "להשיק ערכת היכרות (Discovery) ב₪99–129 שמגלמת קופון באותו סכום על בקבוק מלא — התשובה גם ל₪69 וגם לירידת הסל הממוצע.",
      "להחזיר את מארז LA FLAMME כחלון מוגבל של 10 ימים ('חוזר עד תאריך X') במקום הנחה קבועה, ולמדוד את התוצאה בלוח ההחלטות.",
      "להוסיף מדיניות '14 יום ניסיון' על כל בושם, ולהתחיל בדיקת התקשרות עם טל תמם (בלעדיות, תנאים) לקראת קוד שותפות — תהליך, לא ספרינט."
    ]
  }
};
