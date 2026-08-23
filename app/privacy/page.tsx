// Privacy Policy — Hiloomy.
//
// Written to satisfy Shopify App Store review, Meta app review, and Google
// OAuth verification (Google API Services User Data Policy / Limited Use).
// The competitor-intelligence section is deliberately explicit: competitor
// insights come ONLY from publicly available sources; merchant store data
// is never shared with the competitor-monitoring provider and never used
// as intelligence for anyone else.
//
// Bilingual: the page renders Hebrew (default app locale) or English based
// on the app-locale cookie. Both versions are the binding text of the same
// policy — keep them in sync clause-for-clause when editing.
//
// Have a lawyer review before scaling beyond pilot customers.

import { getAppLocale } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getAppLocale();
  if (locale === "he") {
    return {
      title: "Hiloomy — מדיניות פרטיות",
      description:
        "כיצד Hiloomy אוסף, משתמש, מאחסן ומגן על נתונים בעת השימוש באפליקציית ניתוח הרווחיות שלנו ל-Shopify."
    };
  }
  return {
    title: "Hiloomy — Privacy Policy",
    description:
      "How Hiloomy collects, uses, stores, and protects data when you use our Shopify profit analytics app."
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

export default async function PrivacyPolicyPage() {
  const lastUpdated = "2026-08-20";
  const locale = await getAppLocale();
  const isHe = locale === "he";

  const copy = isHe
    ? {
        pageTitle: "Hiloomy — מדיניות פרטיות",
        lastUpdatedLabel: "עודכן לאחרונה",
        sections: [
          {
            title: "1. מי אנחנו",
            body: (
              <>
                <p>
                  <strong>Hiloomy</strong> (להלן: &quot;השירות&quot;, זמין בכתובת{" "}
                  <a className="text-sky-700 underline" dir="ltr" href="https://www.hiloomy.com">
                    www.hiloomy.com
                  </a>
                  ) הוא יישום לניתוח רווחיות ולדיווח צמיחה עבור מותגי Shopify (להלן:
                  &quot;אנו&quot; או &quot;אנחנו&quot;). בעל חנות (להלן:
                  &quot;הסוחר&quot;) מחבר את חנות ה-Shopify שלו, ולפי בחירתו גם חשבונות
                  שיווק; Hiloomy מחשב מתוך נתונים אלה רווח, שימור לקוחות, התראות ודוח
                  שבועי, ומציג אותם לסוחר בלבד.
                </p>
                <p>
                  יצירת קשר:{" "}
                  <a
                    className="text-sky-700 underline"
                    dir="ltr"
                    href="mailto:yoadhakimv@gmail.com"
                  >
                    yoadhakimv@gmail.com
                  </a>
                </p>
              </>
            )
          },
          {
            title: "2. אילו נתונים אנו אוספים",
            body: (
              <>
                <p>כאשר סוחר מחבר את חשבונותיו, אנו מקבלים ושומרים:</p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    <strong>נתוני Shopify (קריאה בלבד):</strong> הזמנות, שורות הזמנה,
                    לקוחות, מוצרים, מלאי, החזרים כספיים ושימוש בקודי הנחה, וכן
                    מטא-נתונים של החנות. הרשאת הגישה שלנו ב-Shopify היא לקריאה בלבד,
                    למעט חריג אחד: מודול השותפים (affiliate) האופציונלי רשאי ליצור קודי
                    הנחה בחנות הסוחר כאשר הסוחר מבקש זאת במפורש (הרשאת write_discounts).
                  </li>
                  <li>
                    <strong>נתוני Meta Ads (אופציונלי):</strong> מדדי ביצועים ברמת
                    הקמפיין והמודעה ומטא-נתוני קריאייטיב, מתוך חשבון המודעות של הסוחר
                    עצמו. איננו אוספים נתונים אישיים של אנשים הצופים במודעות הסוחר.
                  </li>
                  <li>
                    <strong>נתוני Instagram (אופציונלי):</strong> המדיה ומדדי המעורבות
                    של חשבון ה-Professional של הסוחר עצמו.
                  </li>
                  <li>
                    <strong>נתוני Google Search Console (אופציונלי):</strong> נתוני
                    ביצועי חיפוש מצרפיים עבור האתר המאומת של הסוחר עצמו — שאילתות,
                    קליקים, חשיפות ומיקומים. ראו סעיף 4 להתחייבויותינו בנוגע לנתוני
                    Google.
                  </li>
                  <li>
                    <strong>נתוני שותפים (אופציונלי):</strong> שמות שותפים, פרטי קשר
                    שהסוחר מספק, קודי קופון, קליקים על קישורי מעקב והזמנות שיוחסו.
                  </li>
                  <li>
                    <strong>נתוני חשבון:</strong> כתובת הדוא&quot;ל לכניסה של הסוחר,
                    פרטי הארגון וחברי הצוות, והעדפות.
                  </li>
                </ul>
              </>
            )
          },
          {
            title: "3. כיצד אנו עושים שימוש בנתונים",
            body: (
              <>
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    לחישוב הניתוחים של הסוחר עצמו: רווח, רווח תרומה, שימור לקוחות,
                    התראות ודוחות.
                  </li>
                  <li>להפקת דוח הצמיחה השבועי של הסוחר ולשליחתו בדוא&quot;ל.</li>
                  <li>
                    להפעלת תוכנית השותפים של הסוחר (ייחוס, עמלות וניהול רישום תשלומים).
                  </li>
                  <li>למתן תמיכה ולשמירה על אבטחת השירות.</li>
                </ul>
                <p>
                  <strong>איננו מוכרים נתונים לעולם.</strong> איננו עושים שימוש בנתוניו
                  של סוחר אחד לטובת סוחר אחר, לבניית מדדי השוואה (benchmarks) בין
                  סוחרים, או לאימון מודלים. נתוניו של כל סוחר מבודדים ברמת מסד הנתונים
                  וגלויים לצוותו שלו בלבד.
                </p>
              </>
            )
          },
          {
            title: "4. נתוני משתמש של Google (Google API Services)",
            body: (
              <p>
                כאשר הסוחר מחבר את Google Search Console, Hiloomy ניגש אך ורק לנתוני
                ביצועי חיפוש, בקריאה בלבד, עבור הנכס המאומת של הסוחר עצמו. השימוש של
                Hiloomy במידע המתקבל מממשקי Google APIs מציית ל-{" "}
                <a
                  className="text-sky-700 underline"
                  dir="ltr"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , לרבות דרישות השימוש המוגבל (Limited Use). באופן ספציפי: נתוני Google
                משמשים אך ורק להצגת נתוני החיפוש של הסוחר עצמו בתוך Hiloomy ובדוח השבועי
                שלו; הם אינם מועברים לצדדים שלישיים לעולם, אינם משמשים לצורכי פרסום
                לעולם, ואינם נקראים על ידי בני אדם — למעט בהסכמתו המפורשת של הסוחר לצורך
                תמיכה, לצורכי אבטחה, או לשם עמידה בדרישות הדין. ניתוק Google במסך
                ההגדרות מבטל את גישתנו ומוחק את אסימוני Google השמורים.
              </p>
            )
          },
          {
            title: "5. תובנות על מתחרים — ממקורות ציבוריים בלבד",
            body: (
              <>
                <p>
                  Hiloomy יכול להציג לסוחר מה עושים מתחריו (מבצעים, הנחות, מסרים בעמוד
                  הבית). מידע זה נאסף{" "}
                  <strong>באופן בלעדי ממידע הזמין לציבור</strong> באתריהם הציבוריים של
                  המתחרים עצמם, באמצעות ספק הניטור שלנו (RivalSweeper).
                </p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    <strong>
                      איננו שולחים לעולם נתוני חנות כלשהם של סוחר לספק ניטור המתחרים.
                    </strong>{" "}
                    המידע היחיד הנמסר לו הוא רשימת הדומיינים הציבוריים של המתחרים שהסוחר
                    בחר לעקוב אחריהם.
                  </li>
                  <li>
                    <strong>
                      החנות שלך לעולם אינה מהווה &quot;מודיעין תחרותי&quot; עבור אף אחד
                      אחר.
                    </strong>{" "}
                    Hiloomy אינו עושה שימוש בנתוני החנות הפרטיים של סוחר אחד, אינו חושף
                    אותם ואינו מפיק מהם תובנות עבור לקוח אחר כלשהו — לעולם.
                  </li>
                  <li>
                    תובנות המתחרים המוצגות ב-Hiloomy אינן כוללות נתונים אישיים — אך ורק
                    אותות קידום מכירות פומביים.
                  </li>
                </ul>
              </>
            )
          },
          {
            title: "6. היכן הנתונים מאוחסנים וכיצד הם מוגנים",
            body: (
              <ul className="list-disc space-y-1 ps-6">
                <li>
                  הנתונים מאוחסנים באיחוד האירופי (מסד נתונים: Supabase, פרנקפורט;
                  אפליקציה: Render).
                </li>
                <li>
                  אסימוני גישה וסודות API מוצפנים במנוחה (AES-256-GCM) ואינם יוצאים
                  מהשרת.
                </li>
                <li>
                  כל לקוח מבודד ברמת מסד הנתונים; הגישה הפנימית מוגבלת ומתועדת ביומן.
                </li>
                <li>כל התעבורה מוצפנת במעבר (TLS).</li>
              </ul>
            )
          },
          {
            title: "7. שיתוף נתונים ומעבדי משנה",
            body: (
              <>
                <p>אנו משתפים נתונים אך ורק עם מעבדי המשנה הנדרשים להפעלת השירות:</p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>Supabase (מסד נתונים ואימות, האיחוד האירופי)</li>
                  <li>Render (אירוח האפליקציה)</li>
                  <li>Resend (דוא&quot;ל תפעולי — דוחות שבועיים והתראות)</li>
                  <li>
                    Shopify, Meta ו-Google — אך ורק כמקורות המחוברים של הסוחר, בכפוף
                    לתנאיהם שלהם
                  </li>
                  <li>
                    RivalSweeper — מקבל אך ורק דומיינים ציבוריים של מתחרים לצורך ניטור
                    (ראו סעיף 5)
                  </li>
                </ul>
                <p>איננו מוכרים או משכירים נתונים לאף גורם.</p>
              </>
            )
          },
          {
            title: "8. שמירת נתונים ומחיקתם",
            body: (
              <ul className="list-disc space-y-1 ps-6">
                <li>הנתונים נשמרים כל עוד חשבון הסוחר פעיל.</li>
                <li>
                  ניתוק מקור במסך ההגדרות מפסיק את האיסוף ומוחק את האסימונים השמורים
                  שלו. הסרת אפליקציית Shopify מבטלת לאלתר את גישתנו לחנות.
                </li>
                <li>
                  עם קבלת בקשה למחיקת חשבון (בפנייה אלינו בדוא&quot;ל), אנו מוחקים את
                  נתוני הסוחר בתוך 30 יום, למעט רשומות שאנו חייבים לשמור על פי דין.
                </li>
                <li>
                  אנו מכבדים באופן אוטומטי את ה-GDPR webhooks של Shopify (בקשת נתוני
                  לקוח, מחיקת נתוני לקוח, מחיקת נתוני חנות), וכן את קריאת מחיקת הנתונים
                  (data deletion callback) של Meta.
                </li>
              </ul>
            )
          },
          {
            title: "9. הזכויות שלך",
            body: (
              <p>
                בהתאם לדין החל עליך (לרבות GDPR ככל שהוא חל), באפשרותך לבקש גישה למידע
                האישי שלך, תיקונו, ייצואו או מחיקתו, בפנייה בדוא&quot;ל לכתובת{" "}
                <a className="text-sky-700 underline" dir="ltr" href="mailto:yoadhakimv@gmail.com">
                  yoadhakimv@gmail.com
                </a>
                . לקוחות קצה של חנות הסוחר מתבקשים להפנות בקשות אל הסוחר, השולט במידע
                זה; אנו מסייעים לסוחר בתפקידנו כמעבד מידע.
              </p>
            )
          },
          {
            title: "10. שינויים",
            body: (
              <p>
                אנו עשויים לעדכן מדיניות זו ככל שהשירות מתפתח. על שינויים מהותיים תימסר
                הודעה בתוך האפליקציה או בדוא&quot;ל, והתאריך המופיע לעיל יעודכן.
              </p>
            )
          }
        ]
      }
    : {
        pageTitle: "Hiloomy — Privacy Policy",
        lastUpdatedLabel: "Last updated",
        sections: [
          {
            title: "1. Who we are",
            body: (
              <>
                <p>
                  <strong>Hiloomy</strong> (the &quot;Service&quot;, available at{" "}
                  <a className="text-sky-700 underline" href="https://www.hiloomy.com">
                    www.hiloomy.com
                  </a>
                  ) is a profit-analytics and growth-reporting application for Shopify
                  brands (&quot;we&quot;, &quot;us&quot;). A merchant (the
                  &quot;Merchant&quot;) connects their Shopify store and, optionally,
                  marketing accounts; Hiloomy computes profit, retention, alerts, and a
                  weekly report from that data and shows it back to the Merchant only.
                </p>
                <p>
                  Contact:{" "}
                  <a className="text-sky-700 underline" href="mailto:yoadhakimv@gmail.com">
                    yoadhakimv@gmail.com
                  </a>
                </p>
              </>
            )
          },
          {
            title: "2. What data we collect",
            body: (
              <>
                <p>When a Merchant connects their accounts, we receive and store:</p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    <strong>Shopify data (read-only):</strong> orders, line items,
                    customers, products, inventory, refunds, and discount usage, plus
                    shop metadata. Our Shopify access is read-only, with one exception:
                    the optional affiliate module can create discount codes in the
                    Merchant&apos;s store when the Merchant explicitly requests it
                    (write_discounts scope).
                  </li>
                  <li>
                    <strong>Meta Ads data (optional):</strong> campaign- and ad-level
                    performance metrics and creative metadata from the Merchant&apos;s
                    own ad account. We do not collect personal data of people who see
                    the Merchant&apos;s ads.
                  </li>
                  <li>
                    <strong>Instagram data (optional):</strong> the Merchant&apos;s own
                    professional-account media and engagement metrics.
                  </li>
                  <li>
                    <strong>Google Search Console data (optional):</strong> aggregated
                    search performance for the Merchant&apos;s own verified site —
                    queries, clicks, impressions, and positions. See section 4 for our
                    Google data commitments.
                  </li>
                  <li>
                    <strong>Affiliate data (optional):</strong> affiliate names, contact
                    details the Merchant provides, coupon codes, tracked-link clicks,
                    and attributed orders.
                  </li>
                  <li>
                    <strong>Account data:</strong> the Merchant&apos;s login email,
                    organization and team-member details, and preferences.
                  </li>
                </ul>
              </>
            )
          },
          {
            title: "3. How we use data",
            body: (
              <>
                <ul className="list-disc space-y-1 ps-6">
                  <li>To compute the Merchant&apos;s own analytics: profit, contribution margin, retention, alerts, and reports.</li>
                  <li>To generate and email the Merchant&apos;s weekly growth report.</li>
                  <li>To operate the Merchant&apos;s affiliate program (attribution, commissions, payout bookkeeping).</li>
                  <li>To provide support and maintain the security of the Service.</li>
                </ul>
                <p>
                  <strong>We never sell data.</strong> We never use one Merchant&apos;s
                  data to benefit another Merchant, to build cross-merchant benchmarks,
                  or to train models. Each Merchant&apos;s data is isolated at the
                  database level and visible only to their own team.
                </p>
              </>
            )
          },
          {
            title: "4. Google user data (Google API Services)",
            body: (
              <p>
                When the Merchant connects Google Search Console, Hiloomy accesses
                only read-only search-performance data for the Merchant&apos;s own
                verified property. Hiloomy&apos;s use of information received from
                Google APIs adheres to the{" "}
                <a
                  className="text-sky-700 underline"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. Specifically: Google data is
                used only to display the Merchant&apos;s own search analytics inside
                Hiloomy and in their weekly report; it is never transferred to third
                parties, never used for advertising, and never read by humans except
                with the Merchant&apos;s explicit consent for support, for security, or
                to comply with law. Disconnecting Google in Settings revokes our
                access and deletes stored Google tokens.
              </p>
            )
          },
          {
            title: "5. Competitor insights — public sources only",
            body: (
              <>
                <p>
                  Hiloomy can show the Merchant what their competitors are doing
                  (promotions, discounts, homepage messages). This intelligence is
                  compiled <strong>exclusively from publicly available information</strong>{" "}
                  on the competitors&apos; own public websites, collected via our
                  monitoring provider (RivalSweeper).
                </p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>
                    <strong>We never send any Merchant store data to the competitor-monitoring
                    provider.</strong> The only information shared with it is the list of
                    public competitor domains the Merchant chose to track.
                  </li>
                  <li>
                    <strong>Your store is never anyone else&apos;s &quot;competitor
                    intelligence&quot;.</strong> Hiloomy does not use, expose, or derive
                    insights from one Merchant&apos;s private store data for any other
                    customer — ever.
                  </li>
                  <li>
                    Competitor insights shown in Hiloomy contain no personal data — only
                    public promotional signals.
                  </li>
                </ul>
              </>
            )
          },
          {
            title: "6. Where data is stored and how it is protected",
            body: (
              <ul className="list-disc space-y-1 ps-6">
                <li>Data is hosted in the EU (database: Supabase, Frankfurt; application: Render).</li>
                <li>Access tokens and API secrets are encrypted at rest (AES-256-GCM) and never leave the server.</li>
                <li>Every customer is isolated at the database level; internal access is restricted and logged.</li>
                <li>All traffic is encrypted in transit (TLS).</li>
              </ul>
            )
          },
          {
            title: "7. Sharing and subprocessors",
            body: (
              <>
                <p>We share data only with the processors needed to run the Service:</p>
                <ul className="list-disc space-y-1 ps-6">
                  <li>Supabase (database and authentication, EU)</li>
                  <li>Render (application hosting)</li>
                  <li>Resend (transactional email — weekly reports, notifications)</li>
                  <li>Shopify, Meta, and Google — only as the Merchant&apos;s connected sources, under their own terms</li>
                  <li>RivalSweeper — receives only public competitor domains to monitor (see section 5)</li>
                </ul>
                <p>We do not sell or rent data to anyone.</p>
              </>
            )
          },
          {
            title: "8. Retention and deletion",
            body: (
              <ul className="list-disc space-y-1 ps-6">
                <li>Data is retained while the Merchant&apos;s account is active.</li>
                <li>
                  Disconnecting a source in Settings stops collection and deletes its
                  stored tokens. Uninstalling the Shopify app revokes our store access
                  immediately.
                </li>
                <li>
                  On account deletion request (email us), we delete the
                  Merchant&apos;s data within 30 days, except records we must keep by
                  law.
                </li>
                <li>
                  We honor Shopify&apos;s GDPR webhooks (customer data request,
                  customer redact, shop redact) automatically, and Meta&apos;s data
                  deletion callback.
                </li>
              </ul>
            )
          },
          {
            title: "9. Your rights",
            body: (
              <p>
                Depending on your jurisdiction (including GDPR where applicable), you
                may request access, correction, export, or deletion of your personal
                data by emailing{" "}
                <a className="text-sky-700 underline" href="mailto:yoadhakimv@gmail.com">
                  yoadhakimv@gmail.com
                </a>
                . End customers of a Merchant&apos;s store should direct requests to
                the Merchant, who controls that data; we assist the Merchant as
                processor.
              </p>
            )
          },
          {
            title: "10. Changes",
            body: (
              <p>
                We may update this policy as the Service evolves. Material changes are
                announced in-app or by email, and the date above is updated.
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
