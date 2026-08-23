// Terms of Service — Hiloomy.
//
// Satisfies Shopify App Store, Meta, and Google review URL checks. Have
// counsel review before customers beyond the pilot.
//
// Bilingual: renders Hebrew (default app locale) or English based on the
// app-locale cookie. Both versions are the binding text of the same
// agreement — keep them in sync clause-for-clause when editing.

import { getAppLocale } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getAppLocale();
  if (locale === "he") {
    return {
      title: "Hiloomy — תנאי שימוש",
      description: "התנאים החלים על השימוש שלך ב-Hiloomy, אפליקציית ניתוח הרווחיות ל-Shopify."
    };
  }
  return {
    title: "Hiloomy — Terms of Service",
    description: "Terms governing your use of Hiloomy, the Shopify profit analytics app."
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function TermsOfServicePage() {
  const lastUpdated = "2026-08-20";
  const locale = await getAppLocale();
  const isHe = locale === "he";

  const copy = isHe
    ? {
        pageTitle: "Hiloomy — תנאי שימוש",
        lastUpdatedLabel: "עודכן לאחרונה",
        sections: [
          {
            title: "1. הסכמה לתנאים",
            body: (
              <p>
                בעצם יצירת חשבון, התקנת אפליקציית Shopify או השימוש ב-
                <strong>Hiloomy</strong> (להלן: &quot;השירות&quot;, בכתובת{" "}
                <span dir="ltr">www.hiloomy.com</span>), הנך מסכים לתנאים אלה (המונחים
                &quot;אנו&quot; ו-&quot;אנחנו&quot; מתייחסים ל-Hiloomy).
              </p>
            )
          },
          {
            title: "2. מה Hiloomy מספק",
            body: (
              <>
                <p>
                  Hiloomy היא פלטפורמה לניתוח רווחיות ולדיווח צמיחה עבור מותגי Shopify.
                  בכפוף להרשאתך, היא מתחברת לחנות ה-Shopify שלך, ולפי בחירתך גם לחשבונות
                  Meta Ads, Instagram ו-Google Search Console שלך, ומחשבת רווח, שימור
                  לקוחות, התראות, דוחות שבועיים, מעקב אחר תוכנית שותפים ותובנות על
                  מתחרים (ממקורות ציבוריים בלבד — ראו את מדיניות הפרטיות שלנו).
                </p>
                <p>
                  הניתוחים, ההתראות וההמלצות מהווים תמיכה בקבלת החלטות ואינם מהווים ייעוץ
                  פיננסי. איננו מתחייבים כי מדד, המלצה או דוח כלשהו יניבו תוצאה עסקית
                  כלשהי, ונתונים כגון רווח משוער תלויים בנתוני העלויות שהגדרת.
                </p>
              </>
            )
          },
          {
            title: "3. האחריות שלך",
            body: (
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  שמור על סודיות פרטי הכניסה שלך; הנך אחראי לכל פעילות המתבצעת בחשבונך
                  ובחשבונות הצוות שלך.
                </li>
                <li>חבר אך ורק חשבונות ונכסים שבבעלותך או שהנך מורשה לחבר.</li>
                <li>עקוב אך ורק אחר דומיינים של מתחרים שהנך רשאי לנטר באופן פומבי.</li>
                <li>
                  השתמש בשירות באופן חוקי, לרבות עמידה בתנאי השימוש של Shopify, Meta
                  ו-Google החלים על החשבונות המחוברים שלך.
                </li>
                <li>
                  אין לנסות לגשת לנתונים של לקוחות אחרים, לבצע בדיקות חדירה או לשבש את
                  השירות.
                </li>
              </ul>
            )
          },
          {
            title: "4. הנתונים שלך",
            body: (
              <p>
                נתוני החנות ונתוני השיווק שלך הם בבעלותך. הנך מעניק לנו זכות מוגבלת לעבד
                אותם אך ורק לצורך אספקת השירות עבורך, כמתואר ב
                <a className="text-sky-700 underline" href="/privacy">
                  מדיניות הפרטיות
                </a>{" "}
                שלנו. איננו מוכרים את הנתונים שלך לעולם ואיננו עושים בהם שימוש כמודיעין
                תחרותי עבור אף גורם אחר. ניתוק מקור נתונים או הסרת האפליקציה מבטלים את
                גישתנו; באפשרותך לבקש מחיקה מלאה בכל עת.
              </p>
            )
          },
          {
            title: "5. תוכניות, תקופות ניסיון וחיוב",
            body: (
              <p>
                תוכניות בתשלום מחויבות כפי שמוצג בעת הרכישה. תקופת ניסיון תהפוך למנוי
                בתשלום רק אם תירשם למנוי באופן אקטיבי; באפשרותך לבטל בכל עת, והביטול
                ייכנס לתוקף בתום תקופת החיוב הנוכחית. אנו רשאים לשנות את המחירים בהודעה
                מראש; שינויים לא יחולו למפרע על תקופה ששולמה.
              </p>
            )
          },
          {
            title: "6. זמינות ושינויים",
            body: (
              <p>
                אנו שואפים לזמינות גבוהה, אך השירות ניתן &quot;כמות שהוא&quot; (AS IS)
                ו&quot;כפי שהוא זמין&quot; (AS AVAILABLE). אנו רשאים להוסיף תכונות,
                לשנותן או להסירן. סנכרון הנתונים תלוי בממשקי API של צדדים שלישיים
                (Shopify, Meta, Google), שזמינותם אינה בשליטתנו.
              </p>
            )
          },
          {
            title: "7. הגבלת אחריות",
            body: (
              <p>
                במידה המרבית המותרת על פי דין, אחריותנו המצטברת הנובעת מן השירות מוגבלת
                לסכומים ששילמת לנו בשנים-עשר החודשים שקדמו לעילת התביעה. איננו אחראים
                לנזקים עקיפים, מקריים או תוצאתיים, לרבות אובדן רווחים או החלטות עסקיות
                שהתקבלו על בסיס הניתוחים או ההמלצות.
              </p>
            )
          },
          {
            title: "8. סיום ההתקשרות",
            body: (
              <p>
                באפשרותך להפסיק את השימוש בשירות ולהסיר את האפליקציה בכל עת. אנו רשאים
                להשעות או לסגור חשבונות המפרים תנאים אלה הפרה מהותית, בהודעה מראש ככל
                שהדבר מעשי. סעיפים 4, 7 ו-9 יוסיפו לעמוד בתוקפם גם לאחר סיום ההתקשרות.
              </p>
            )
          },
          {
            title: "9. הדין החל וסמכות שיפוט",
            body: (
              <p>
                תנאים אלה כפופים לדיני מדינת ישראל, ולבתי המשפט המוסמכים בתל אביב תהא
                סמכות השיפוט הייחודית לדון בהם, וזאת מבלי לגרוע מהגנות צרכניות קוגנטיות
                החלות במקום מגוריך.
              </p>
            )
          },
          {
            title: "10. יצירת קשר",
            body: (
              <p>
                שאלות בנוגע לתנאים אלה:{" "}
                <a className="text-sky-700 underline" dir="ltr" href="mailto:yoadhakimv@gmail.com">
                  yoadhakimv@gmail.com
                </a>
              </p>
            )
          }
        ]
      }
    : {
        pageTitle: "Hiloomy — Terms of Service",
        lastUpdatedLabel: "Last updated",
        sections: [
          {
            title: "1. Acceptance",
            body: (
              <p>
                By creating an account, installing the Shopify app, or using{" "}
                <strong>Hiloomy</strong> (the &quot;Service&quot;, at www.hiloomy.com),
                you agree to these Terms (&quot;we&quot;, &quot;us&quot; refer to
                Hiloomy).
              </p>
            )
          },
          {
            title: "2. What Hiloomy provides",
            body: (
              <>
                <p>
                  Hiloomy is a profit-analytics and growth-reporting platform for
                  Shopify brands. With your authorization it connects to your Shopify
                  store and, optionally, your Meta Ads, Instagram, and Google Search
                  Console accounts, and computes profit, retention, alerts, weekly
                  reports, affiliate-program tracking, and competitor insights (from
                  public sources only — see our Privacy Policy).
                </p>
                <p>
                  Analytics, alerts, and recommendations are decision support, not
                  financial advice. We do not guarantee that any metric, recommendation,
                  or report will produce a particular business outcome, and figures such
                  as estimated profit depend on the cost inputs you configure.
                </p>
              </>
            )
          },
          {
            title: "3. Your responsibilities",
            body: (
              <ul className="list-disc space-y-1 ps-6">
                <li>Keep your login credentials secure; you are responsible for activity under your account and team.</li>
                <li>Connect only accounts and properties you own or are authorized to connect.</li>
                <li>Track only competitor domains you are entitled to monitor publicly.</li>
                <li>Use the Service lawfully, including compliance with Shopify&apos;s, Meta&apos;s, and Google&apos;s terms for your connected accounts.</li>
                <li>Do not attempt to access other customers&apos; data, probe, or disrupt the Service.</li>
              </ul>
            )
          },
          {
            title: "4. Your data",
            body: (
              <p>
                You own your store and marketing data. You grant us the limited right
                to process it solely to provide the Service to you, as described in
                our{" "}
                <a className="text-sky-700 underline" href="/privacy">
                  Privacy Policy
                </a>
                . We never sell your data and never use it as competitive intelligence
                for anyone else. Disconnecting a source or uninstalling the app
                revokes our access; you may request full deletion at any time.
              </p>
            )
          },
          {
            title: "5. Plans, trials, and billing",
            body: (
              <p>
                Paid plans are billed as presented at checkout. Trials convert only if
                you actively subscribe; you can cancel anytime, effective at the end
                of the current billing period. We may change pricing with advance
                notice; changes never apply retroactively to a paid period.
              </p>
            )
          },
          {
            title: "6. Availability and changes",
            body: (
              <p>
                We aim for high availability but the Service is provided &quot;as
                is&quot; and &quot;as available&quot;. We may add, change, or remove
                features. Data syncs depend on third-party APIs (Shopify, Meta,
                Google) whose availability we do not control.
              </p>
            )
          },
          {
            title: "7. Limitation of liability",
            body: (
              <p>
                To the maximum extent permitted by law, our aggregate liability
                arising out of the Service is limited to the amounts you paid us in
                the twelve months preceding the claim. We are not liable for indirect,
                incidental, or consequential damages, including lost profits or
                business decisions taken on the basis of analytics or
                recommendations.
              </p>
            )
          },
          {
            title: "8. Termination",
            body: (
              <p>
                You may stop using the Service and uninstall at any time. We may
                suspend or terminate accounts that materially breach these Terms,
                with notice where practicable. Sections 4, 7, and 9 survive
                termination.
              </p>
            )
          },
          {
            title: "9. Governing law",
            body: (
              <p>
                These Terms are governed by the laws of the State of Israel, and the
                competent courts of Tel Aviv have exclusive jurisdiction, without
                prejudice to mandatory consumer protections in your place of
                residence.
              </p>
            )
          },
          {
            title: "10. Contact",
            body: (
              <p>
                Questions about these Terms:{" "}
                <a className="text-sky-700 underline" href="mailto:yoadhakimv@gmail.com">
                  yoadhakimv@gmail.com
                </a>
              </p>
            )
          }
        ]
      };

  return (
    <main
      dir={isHe ? "rtl" : "ltr"}
      lang={isHe ? "he" : "en"}
      className="mx-auto max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800"
    >
      <h1 className="text-3xl font-bold tracking-tight">{copy.pageTitle}</h1>
      <p className="mt-1 text-xs text-slate-500">
        {copy.lastUpdatedLabel}: {lastUpdated}
      </p>

      {copy.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.body}
        </Section>
      ))}
    </main>
  );
}
