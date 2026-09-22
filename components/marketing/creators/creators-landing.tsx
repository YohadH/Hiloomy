import Link from "next/link";
import "./creators-landing.css";
import { HiloomyLogo } from "@/components/ui/logo";
import { CreatorsNav } from "./creators-nav";
import { LeadForm } from "./lead-form";
import { RevealOnScroll } from "./reveal";
import { StickyCta } from "./sticky-cta";

// Hiloomy Creator — public landing (Hebrew, RTL). Server component; the
// interactive bits (nav sheet, form, reveal, sticky CTA) are client islands.
//
// Seventh pass (owner brief, 22 Sep 2026): reduce, clarify, show the
// product. One idea per section, no repeated capabilities, fewer icons and
// borders. Sections: hero · the problem · code → fee · two sides · one
// creator's performance · onboarding · 0% · price · FAQ · final CTA.
// Copy is the owner's, verbatim. Only Shopify is integrated today, so
// WooCommerce and Wix carry a visible "בקרוב" tag. Hiloomy does not move
// money, so the page says "מעקב תשלום", never "תשלום למשפיען".
// Sample figures are consistent: Maya 73 orders (61 via code MAYA15 =
// 15,870 ₪), 18,430 ₪ sales, fee 1,843 ₪ = 10%, 67% new customers.

const CTA = "בואו נראה איך Hiloomy תעבוד אצלכם";
const CTA_FORM = "בואו נראה איך Hiloomy תעבוד אצלנו";
const CONTACT_EMAIL = "yoadhakimv@gmail.com";

function N({ children }: { children: string }) {
  return <span className="cr-num">{children}</span>;
}

const HERO_ROWS = [
  { initial: "מ", tone: "", name: "מאיה כהן", code: "MAYA15", sales: "18,430 ₪", orders: "73", fee: "1,843 ₪", status: "מאושר", pill: "ok" },
  { initial: "נ", tone: "b", name: "נועה לוי", code: "NOA10", sales: "14,120 ₪", orders: "52", fee: "1,412 ₪", status: "ממתין", pill: "wait" },
  { initial: "ד", tone: "c", name: "דניאל ברק", code: "DANI", sales: "9,870 ₪", orders: "36", fee: "987 ₪", status: "שולם", pill: "paid" }
];

const PRODUCTS = [
  { name: "סט מתנה", orders: "31" },
  { name: "בושם 50 מ״ל", orders: "24" },
  { name: "קרם ידיים", orders: "18" }
];

const CHAIN = [
  "המשפיען מפרסם",
  "הלקוח משתמש בקוד או בלינק",
  "ההזמנה נכנסת לחנות",
  "Hiloomy משייכת את המכירה",
  "העמלה מחושבת",
  "המותג מאשר ועוקב אחרי התשלום"
];

export function CreatorsLanding() {
  return (
    <div className="cr-root" dir="rtl" lang="he">
      <RevealOnScroll />
      <CreatorsNav />

      {/* ---------------------------------------------------------- 1 · Hero */}
      <section className="cr-hero" id="top">
        <div className="cr-wrap cr-hero-grid">
          <div className="cr-hero-text" data-reveal>
            <span className="cr-eyebrow">מערכת ניהול ומעקב משפיענים למותגי E-commerce</span>
            <h1 className="cr-h1">
              <span>מנהלים משפיענים באופן קבוע?</span>
              <span className="accent">תדעו בדיוק כמה כל אחד מכר.</span>
            </h1>
            <p className="cr-lead cr-mt">
              Hiloomy מחברת את החנות, קודי הקופון, הלינקים והמכירות — ומשייכת את הפעילות לכל משפיען, כדי שתוכלו לראות במקום אחד ביצועים,
              עמלות וסטטוסי תשלום.
            </p>
            <p className="cr-hero-claim">אנחנו מטמיעים את Hiloomy על הפעילות שכבר קיימת אצלכם.</p>
            <div className="cr-hero-actions">
              <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
                {CTA}
              </a>
            </div>
            <p className="cr-platforms" aria-label="פלטפורמות">
              <span>Shopify</span>
              <span>
                WooCommerce / WordPress <em>בקרוב</em>
              </span>
              <span>
                Wix <em>בקרוב</em>
              </span>
            </p>
            <ul className="cr-values">
              <li>הטמעה על הפעילות הקיימת</li>
              <li>
                <N>0%</N> עמלה ל־Hiloomy על מכירות המשפיענים
              </li>
              <li>אזור אישי לכל משפיען</li>
            </ul>
          </div>

          <div className="cr-hero-visual" data-reveal>
            <div className="cr-ui" aria-label="מערך המשפיענים ב־Hiloomy">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">מערך המשפיענים</div>
                  <div className="cr-ui-sub">30 הימים האחרונים</div>
                </div>
                <span className="cr-pill ok">מחובר ל־Shopify</span>
              </div>
              <div className="cr-kpis">
                <div className="cr-kpi">
                  <div className="cr-kpi-value">
                    <N>38</N>
                  </div>
                  <div className="cr-kpi-label">משפיענים פעילים</div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-value">
                    <span className="cr-wide">
                      <N>312,400 ₪</N>
                    </span>
                    <span className="cr-narrow">
                      <N>312K ₪</N>
                    </span>
                  </div>
                  <div className="cr-kpi-label">מכירות</div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-value pos">
                    <span className="cr-wide">
                      <N>27,915 ₪</N>
                    </span>
                    <span className="cr-narrow">
                      <N>27K ₪</N>
                    </span>
                  </div>
                  <div className="cr-kpi-label">עמלות</div>
                </div>
              </div>
              <table className="cr-table cr-wide-table">
                <thead>
                  <tr>
                    <th>משפיענית</th>
                    <th>קוד</th>
                    <th>מכירות</th>
                    <th>עמלה</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {HERO_ROWS.map((r) => (
                    <tr key={r.code}>
                      <td>
                        <span className="cr-who">
                          <span className={`cr-avatar ${r.tone}`}>{r.initial}</span>
                          {r.name}
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">{r.code}</span>
                      </td>
                      <td>
                        <N>{r.sales}</N>
                      </td>
                      <td>
                        <N>{r.fee}</N>
                      </td>
                      <td>
                        <span className={`cr-pill ${r.pill}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="cr-cards">
                {HERO_ROWS.map((r) => (
                  <li key={r.code} className="cr-card">
                    <div className="cr-card-top">
                      <span className="cr-who">
                        <span className={`cr-avatar ${r.tone}`}>{r.initial}</span>
                        {r.name}
                      </span>
                      <span className="cr-code">{r.code}</span>
                    </div>
                    <div className="cr-card-stats">
                      <span>
                        <b>
                          <N>{r.sales}</N>
                        </b>{" "}
                        מכירות
                      </span>
                      <span>
                        <b>
                          <N>{r.fee}</N>
                        </b>{" "}
                        עמלה
                      </span>
                    </div>
                    <span className={`cr-pill ${r.pill}`}>{r.status}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- 2 · The problem */}
      <section className="cr-section cr-white" id="problem">
        <div className="cr-wrap cr-problem">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>הפעילות כבר עובדת.</span>
              <span>הבעיה היא לשמור על שליטה.</span>
            </h2>
            <p className="cr-lead cr-mt cr-strong">המשפיענים ב־WhatsApp, הקודים בחנות, המעקב באקסל וההזמנות במערכת ה־E-commerce.</p>
            <p className="cr-lead cr-mt-s">בסוף החודש צריך להבין מי מכר, כמה הוא מכר, כמה עמלה מגיעה לו ומה כבר שולם.</p>
          </div>
          <div className="cr-hub" data-reveal aria-label="ממקורות מפוזרים ל־Hiloomy">
            <div className="cr-hub-sources">
              <span>WhatsApp</span>
              <span>Excel / Google Sheets</span>
              <span>Shopify / WooCommerce / Wix</span>
              <span>קודי קופון</span>
            </div>
            <svg className="cr-hub-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4v16M5 13l7 7 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="cr-hub-target">
              <span className="cr-logo">
                <HiloomyLogo />
              </span>
              <p>משפיענים · מכירות · עמלות · סטטוסי תשלום</p>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- 3 · Code → fee chain */}
      <section className="cr-section" id="flow">
        <div className="cr-wrap cr-perf">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>מהקוד ועד העמלה.</span>
              <span>הכול נשאר מחובר.</span>
            </h2>
            <p className="cr-lead cr-mt">Hiloomy עוקבת אחרי הפעילות בחנות ומשייכת את המכירות למשפיען הרלוונטי.</p>
            <p className="cr-closing cr-mt">בלי לחבר ידנית בין קודים, הזמנות וגיליונות.</p>
          </div>
          <ol className="cr-chain" data-reveal aria-label="מהפרסום ועד מעקב התשלום">
            {CHAIN.map((step, i) => (
              <li key={step} className={i === CHAIN.length - 1 ? "last" : undefined}>
                <span className="cr-chain-n">
                  <N>{String(i + 1).padStart(2, "0")}</N>
                </span>
                <h3>{step}</h3>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- 4 · Two sides */}
      <section className="cr-section cr-white" id="sides">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>שליטה למותג.</span>
              <span>שקיפות למשפיען.</span>
            </h2>
          </div>
          <div className="cr-sides" data-reveal>
            <div className="cr-side">
              <span className="cr-side-tag">מצד המותג</span>
              <ul className="cr-checks cr-checks-two">
                <li>משפיענים</li>
                <li>קודים ולינקים</li>
                <li>מכירות</li>
                <li>עמלות</li>
                <li>סטטוסי תשלום</li>
                <li>ביצועים</li>
              </ul>
            </div>
            <div className="cr-side creator">
              <div>
                <span className="cr-side-tag alt">מצד המשפיען</span>
                <ul className="cr-checks">
                  <li>כמה מכרתי</li>
                  <li>כמה הזמנות יצרתי</li>
                  <li>כמה עמלה צברתי</li>
                  <li>מה סטטוס התשלום שלי</li>
                </ul>
              </div>
              <div className="cr-mini-phone" aria-label="האזור האישי של המשפיענית">
                <div className="cr-mini-head">היי מאיה</div>
                <div className="cr-mini-stat">
                  <b>
                    <N>18,430 ₪</N>
                  </b>
                  <span>מכירות</span>
                </div>
                <div className="cr-mini-stat">
                  <b>
                    <N>73</N>
                  </b>
                  <span>הזמנות</span>
                </div>
                <div className="cr-mini-stat pos">
                  <b>
                    <N>1,843 ₪</N>
                  </b>
                  <span>עמלה</span>
                </div>
                <span className="cr-pill ok">מאושר לתשלום</span>
              </div>
            </div>
          </div>
          <p className="cr-closing cr-center" data-reveal>
            פחות הודעות של ״כמה מכרתי?״ ו״מתי משלמים לי?״ — יותר שקיפות לשני הצדדים.
          </p>
        </div>
      </section>

      {/* ------------------------------------ 5 · One creator's performance */}
      <section className="cr-section" id="performance">
        <div className="cr-wrap cr-perf">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>לא רק כמה נמכר.</span>
              <span>תראו מי מכר, מה נמכר ואיזה לקוחות הגיעו.</span>
            </h2>
            <dl className="cr-micro">
              <div>
                <dt>לקוחות חדשים מול חוזרים</dt>
                <dd>ראו איזה סוג לקוחות כל משפיען מביא.</dd>
              </div>
              <div>
                <dt>ביטולים והחזרות</dt>
                <dd>מכירה שבוטלה או הוחזרה מתעדכנת גם בחישוב.</dd>
              </div>
              <div>
                <dt>קוד מול לינק</dt>
                <dd>ראו מאיפה הגיעה ההמרה.</dd>
              </div>
            </dl>
          </div>
          <div data-reveal>
            <div className="cr-ui cr-creator" aria-label="ביצועי משפיענית אחת">
              <div className="cr-ui-head">
                <span className="cr-who">
                  <span className="cr-avatar">מ</span>
                  <span className="stack">
                    <span>מאיה כהן</span>
                    <span className="cr-handle">@maya.cohen</span>
                  </span>
                </span>
                <span className="cr-ui-sub">30 הימים האחרונים</span>
              </div>
              <div className="cr-tiles">
                <div className="cr-tile">
                  <b>
                    <N>18,430 ₪</N>
                  </b>
                  <span>מכירות</span>
                </div>
                <div className="cr-tile">
                  <b>
                    <N>73</N>
                  </b>
                  <span>הזמנות</span>
                </div>
                <div className="cr-tile">
                  <b>
                    <N>1,843 ₪</N>
                  </b>
                  <span>עמלה</span>
                </div>
                <div className="cr-tile">
                  <b>
                    <N>67%</N>
                  </b>
                  <span>לקוחות חדשים</span>
                </div>
              </div>
              <div className="cr-codebar">
                <span className="cr-code big">MAYA15</span>
                <span>
                  <N>61</N> הזמנות · <N>15,870 ₪</N> מכירות
                </span>
              </div>
              <div className="cr-ui-sect">המוצרים שהיא מוכרת הכי טוב</div>
              <ol className="cr-top">
                {PRODUCTS.map((p, i) => (
                  <li key={p.name}>
                    <span className="n">{i + 1}</span>
                    <span className="name">{p.name}</span>
                    <span className="val">
                      <N>{p.orders}</N>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- 6 · Onboarding */}
      <section className="cr-section cr-white" id="how">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>כבר יש לכם משפיענים?</span>
              <span>לא צריך להתחיל מחדש.</span>
            </h2>
            <p className="cr-lead cr-mt">אנחנו לוקחים את הפעילות שכבר קיימת אצלכם ומטמיעים אותה בתוך Hiloomy.</p>
          </div>
          <ol className="cr-steps cr-steps-desc cr-steps-four" data-reveal>
            <li>
              <span className="cr-step-n">01</span>
              <div>
                <h3>מחברים</h3>
                <p>את חנות האונליין.</p>
              </div>
            </li>
            <li>
              <span className="cr-step-n">02</span>
              <div>
                <h3>מייבאים</h3>
                <p>את המשפיענים, הקודים והמידע הקיים.</p>
              </div>
            </li>
            <li>
              <span className="cr-step-n">03</span>
              <div>
                <h3>מגדירים</h3>
                <p>את מודל העמלות ותהליך העבודה.</p>
              </div>
            </li>
            <li>
              <span className="cr-step-n">04</span>
              <div>
                <h3>עולים לאוויר</h3>
                <p>ומתחילים לנהל ולעקוב ממקום אחד.</p>
              </div>
            </li>
          </ol>
          <p className="cr-final-line cr-center" data-reveal>
            אותם משפיענים. אותם קודים. הרבה יותר שליטה.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ 7 · Zero */}
      <section className="cr-section cr-zero" id="zero">
        <div className="cr-wrap cr-center cr-narrow" data-reveal>
          <h2 className="cr-h2 cr-h2-lines">
            <span>המכירות גדלות.</span>
            <span>
              העמלה של Hiloomy נשארת <N>0%</N>.
            </span>
          </h2>
          <p className="cr-lead cr-mt">Hiloomy לא לוקחת אחוז מהמכירות שהמשפיענים שלכם מייצרים.</p>
          <p className="cr-zero-big">
            <N>0%</N>
          </p>
          <p className="cr-zero-label">עמלה ל־Hiloomy על מכירות המשפיענים</p>
          <p className="cr-zero-sub">המשפיענים שלכם. הדאטה שלכם. המכירות שלכם.</p>
        </div>
      </section>

      {/* ----------------------------------------------------- 8 · Price */}
      <section className="cr-section" id="pricing">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">מחיר פשוט וברור.</h2>
          </div>
          <div className="cr-price-card cr-price-three" data-reveal>
            <div className="cr-offer">
              <h3>הקמה והטמעה</h3>
              <div className="cr-price-amount">
                <N>2,500–3,500 ₪</N>
              </div>
              <div className="cr-price-kind">חד־פעמי</div>
              <p className="desc">חיבור החנות, ייבוא הפעילות הקיימת, חיבור המשפיענים והקודים והגדרת המערכת.</p>
            </div>
            <div className="cr-offer">
              <h3>מערכת ותחזוקה</h3>
              <div className="cr-price-amount">
                <N>250 ₪</N> <small>לחודש</small>
              </div>
              <div className="cr-price-kind">ללא הגבלת משפיענים</div>
              <p className="desc">שימוש ב־Hiloomy, סנכרון הנתונים ותחזוקה טכנית.</p>
            </div>
            <div className="cr-offer zero">
              <h3>עמלת Hiloomy על המכירות</h3>
              <div className="cr-price-amount">
                <N>0%</N>
              </div>
              <div className="cr-price-kind">תמיד</div>
            </div>
          </div>
          <p className="cr-price-note cr-center" data-reveal>
            ניהול שוטף, גיוס משפיענים וניהול קמפיינים אינם כלולים אלא אם סוכם אחרת.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- 9 · FAQ */}
      <section className="cr-section cr-white" id="faq">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">שאלות נפוצות</h2>
          </div>
          <div className="cr-faq" data-reveal>
            <details>
              <summary>האם Hiloomy מוצאת עבורנו משפיענים?</summary>
              <p>Hiloomy מיועדת בעיקר למותגים שכבר עובדים עם משפיענים ורוצים לעקוב ולנהל את הפעילות המסחרית שלהם בצורה מסודרת.</p>
            </details>
            <details>
              <summary>כבר יש לנו משפיענים וקודי קופון. צריך להתחיל מחדש?</summary>
              <p>לא. אנחנו מתחילים מהפעילות שכבר קיימת אצלכם ומחברים אותה ל־Hiloomy.</p>
            </details>
            <details>
              <summary>איך Hiloomy יודעת איזו מכירה שייכת לאיזה משפיען?</summary>
              <p>באמצעות קודי קופון ולינקים שמחוברים לחנות. Hiloomy משייכת את המכירות למשפיען הרלוונטי ומעדכנת את הנתונים שלו.</p>
            </details>
            <details>
              <summary>אפשר לראות איזה מוצרים כל משפיען מכר?</summary>
              <p>כן. אפשר לראות את ההזמנות והמוצרים המשויכים לכל משפיען.</p>
            </details>
            <details>
              <summary>מה קורה אם הזמנה בוטלה או הוחזרה?</summary>
              <p>הנתונים מתעדכנים בהתאם, כך שהמכירה והעמלה לא יישארו כאילו ההזמנה הושלמה.</p>
            </details>
            <details>
              <summary>האם Hiloomy משלמת את העמלה למשפיען?</summary>
              <p>כיום Hiloomy מחשבת ומרכזת את העמלות ומאפשרת לעקוב אחר סטטוס התשלום. העברת הכסף עצמה מתבצעת על ידי המותג.</p>
            </details>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ 10 · Final CTA */}
      <section className="cr-section cr-contact" id="contact">
        <div className="cr-wrap cr-contact-grid">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>כבר עובדים עם משפיענים?</span>
              <span>הגיע הזמן לראות בדיוק מה הפעילות הזאת מייצרת.</span>
            </h2>
            <p className="cr-lead cr-mt">נראה איך אתם עובדים היום ואיך Hiloomy יכולה לחבר את המשפיענים, המכירות והעמלות שלכם למקום אחד.</p>
            <p className="cr-contact-alt">
              מעדיפים מייל? <a href={`mailto:${CONTACT_EMAIL}?subject=Hiloomy%20Creator`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
          <div data-reveal>
            <LeadForm cta={CTA_FORM} />
          </div>
        </div>
      </section>

      <footer className="cr-footer">
        <div className="cr-wrap cr-footer-bar">
          <span className="cr-logo" style={{ fontSize: 17 }}>
            <HiloomyLogo />
            <span className="cr-logo-sub">Creator</span>
          </span>
          <nav className="cr-footer-links" aria-label="קישורים">
            <Link href="/welcome">Hiloomy למותגים</Link>
            <Link href="/privacy">פרטיות</Link>
            <Link href="/terms">תנאי שימוש</Link>
          </nav>
          <span>
            © <N>2026</N> Hiloomy
          </span>
        </div>
      </footer>

      <StickyCta />
    </div>
  );
}
