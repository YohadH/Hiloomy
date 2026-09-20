import Link from "next/link";
import "./creators-landing.css";
import { CreatorsNav } from "./creators-nav";
import { LeadForm } from "./lead-form";
import { RevealOnScroll } from "./reveal";

// Hiloomy Creator — public landing (Hebrew, RTL). Server component; the
// interactive bits (nav sheet, form, reveal) are small client islands.
//
// Second pass (owner brief, 20 Sep 2026): simplified to eight sections —
// hero, the problem, three capabilities, the model (yours + 0%), rollout,
// price, four FAQs, CTA + form. One visual per section, three KPIs at most,
// no roadmap, no "coming soon", no comparison. Screens are HTML recreations
// of the real affiliate-portal views with sample figures.

const CTA = "בואו נראה איך זה יעבוד אצלכם";
const CONTACT_EMAIL = "yoadhakimv@gmail.com";

function N({ children }: { children: string }) {
  return <span className="cr-num">{children}</span>;
}

const FEE_ROWS = [
  { name: "נועה לוי", sales: "14,120 ₪", fee: "1,412 ₪", status: "ממתין לאישור", pill: "wait" },
  { name: "מאיה כהן", sales: "18,430 ₪", fee: "1,843 ₪", status: "מאושר לתשלום", pill: "ok" },
  { name: "דניאל ברק", sales: "9,870 ₪", fee: "987 ₪", status: "שולם", pill: "paid" },
  { name: "שירה אדלר", sales: "2,140 ₪", fee: "214 ₪", status: "ממתין לאישור", pill: "wait" }
];

const HERO_ROWS = [
  { initial: "מ", tone: "", name: "מאיה כהן", code: "MAYA15", sales: "18,430 ₪", fee: "1,843 ₪", status: "מוכן לתשלום", pill: "ok" },
  { initial: "נ", tone: "b", name: "נועה לוי", code: "NOA10", sales: "14,120 ₪", fee: "1,412 ₪", status: "ממתין", pill: "wait" },
  { initial: "ד", tone: "c", name: "דניאל ברק", code: "DANI", sales: "9,870 ₪", fee: "987 ₪", status: "שולם", pill: "paid" }
];

export function CreatorsLanding() {
  return (
    <div className="cr-root" dir="rtl" lang="he">
      <RevealOnScroll />
      <CreatorsNav />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="cr-hero" id="top">
        <div className="cr-wrap cr-hero-grid">
          <div>
            <span className="cr-eyebrow">ניהול משפיענים ויוצרי תוכן למותגי איקומרס</span>
            <h1 className="cr-h1">
              <span>כל מערך המשפיענים שלכם.</span>
              <span>במקום אחד.</span>
            </h1>
            <p className="cr-h1-sub">בלי עמלה על המכירות שלהם.</p>
            <div className="cr-hero-copy">
              <p className="cr-lead">Hiloomy מרכזת במקום אחד את המשפיענים, קודי הקופון, המכירות והעמלות של המותג שלכם.</p>
              <p className="cr-lead">אנחנו מטמיעים את המערכת עבורכם. אתם ממשיכים לנהל את הקשרים עם המשפיענים שלכם.</p>
            </div>
            <div className="cr-hero-actions">
              <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
                {CTA}
              </a>
              <a href="#how" className="cr-btn cr-btn-ghost cr-btn-lg">
                איך זה עובד
              </a>
            </div>
            <p className="cr-qual">למותגים שכבר עובדים עם משפיענים ויוצרי תוכן.</p>
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
                    <N>312,400 ₪</N>
                  </div>
                  <div className="cr-kpi-label">מכירות</div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-value pos">
                    <N>27,915 ₪</N>
                  </div>
                  <div className="cr-kpi-label">עמלות</div>
                </div>
              </div>
              {/* Desktop / tablet: a compact table */}
              <table className="cr-table cr-only-wide">
                <thead>
                  <tr>
                    <th>שם</th>
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
              {/* Phone: the same three people as a list, no table */}
              <ul className="cr-mlist cr-only-narrow">
                {HERO_ROWS.map((r) => (
                  <li key={r.code}>
                    <span className="cr-who">
                      <span className={`cr-avatar ${r.tone}`}>{r.initial}</span>
                      <span className="stack">
                        <span>{r.name}</span>
                        <span className="cr-code">{r.code}</span>
                      </span>
                    </span>
                    <span className="cr-mlist-right">
                      <b>
                        <N>{r.sales}</N>
                      </b>
                      <span className={`cr-pill ${r.pill}`}>{r.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Problem */}
      <section className="cr-section" id="problem">
        <div className="cr-wrap cr-narrow cr-center">
          <div data-reveal>
            <h2 className="cr-h2">עדיין מנהלים משפיענים ב־WhatsApp וב־Excel?</h2>
            <p className="cr-lead cr-mt">ככל שהמערך גדל, קשה יותר לזכור מי קיבל קוד, מי פרסם, מי מכר וכמה צריך לשלם בסוף החודש.</p>
          </div>
          <div className="cr-frag" data-reveal>
            <div className="cr-frag-sources" aria-label="איפה זה מתנהל היום">
              <span>WhatsApp</span>
              <span>Instagram</span>
              <span>Google Sheets</span>
              <span>Shopify</span>
              <span>קודי קופון</span>
              <span>עמלות</span>
            </div>
            <div className="cr-frag-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 4v16M5 13l7 7 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="cr-frag-target">
              <span className="cr-logo" aria-hidden="true">
                <svg viewBox="11 9.7 27 27.3" fill="none" width="24" height="24">
                  <rect x="11.5" y="17" width="6.2" height="19.5" rx="2.8" fill="#15A34A" />
                  <rect x="16.5" y="24.5" width="11.5" height="4.4" fill="#15A34A" />
                  <rect x="27.5" y="18.2" width="6.2" height="18.3" rx="2.6" fill="#F97316" />
                  <path d="M30.6 10.2L37.6 18.8H23.6L30.6 10.2Z" fill="#F97316" />
                </svg>
                Hiloomy
              </span>
              <ul className="cr-results">
                <li>כל המשפיענים והקודים במקום אחד</li>
                <li>כל מכירה משויכת למי שהביא אותה</li>
                <li>העמלות מחושבות ומוכנות לאישור</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Product */}
      <section className="cr-section cr-white" id="product">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">שלושה דברים שפשוט לא צריכים להתנהל ידנית.</h2>
          </div>

          {/* 01 */}
          <div className="cr-feature" data-reveal>
            <div className="cr-feature-text">
              <div className="cr-step-n">01</div>
              <h3 className="cr-h3">כל המשפיענים שלכם, מסודרים.</h3>
              <p className="cr-lead">פרטים, קודים, סטטוס והיסטוריית הפעילות. בלי לחפש בין WhatsApp, גיליונות ומיילים.</p>
            </div>
            <div className="cr-ui" aria-label="רשימת המשפיענים">
              <div className="cr-ui-head">
                <div className="cr-ui-title">משפיענים</div>
                <span className="cr-ui-sub">
                  <N>42</N> במערך · <N>38</N> פעילים
                </span>
              </div>
              <ul className="cr-mlist">
                <li>
                  <span className="cr-who">
                    <span className="cr-avatar">מ</span>
                    <span className="stack">
                      <span>מאיה כהן</span>
                      <span className="cr-handle">@maya.cohen</span>
                    </span>
                  </span>
                  <span className="cr-mlist-right">
                    <span className="cr-code">MAYA15</span>
                    <span className="cr-pill ok">פעילה</span>
                  </span>
                </li>
                <li>
                  <span className="cr-who">
                    <span className="cr-avatar b">נ</span>
                    <span className="stack">
                      <span>נועה לוי</span>
                      <span className="cr-handle">@noa.levi</span>
                    </span>
                  </span>
                  <span className="cr-mlist-right">
                    <span className="cr-code">NOA10</span>
                    <span className="cr-pill ok">פעילה</span>
                  </span>
                </li>
                <li>
                  <span className="cr-who">
                    <span className="cr-avatar c">ד</span>
                    <span className="stack">
                      <span>דניאל ברק</span>
                      <span className="cr-handle">@daniel.barak</span>
                    </span>
                  </span>
                  <span className="cr-mlist-right">
                    <span className="cr-code">DANI</span>
                    <span className="cr-pill ok">פעיל</span>
                  </span>
                </li>
                <li>
                  <span className="cr-who">
                    <span className="cr-avatar d">ר</span>
                    <span className="stack">
                      <span>רוני שגב</span>
                      <span className="cr-handle">@roni.segev</span>
                    </span>
                  </span>
                  <span className="cr-mlist-right">
                    <span className="cr-ui-sub">עדיין בלי קוד</span>
                    <span className="cr-pill wait">ממתינה לאישור</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* 02 */}
          <div className="cr-feature flip" data-reveal>
            <div className="cr-feature-text">
              <div className="cr-step-n">02</div>
              <h3 className="cr-h3">כל מכירה מגיעה עם שם.</h3>
              <p className="cr-lead">מחברים לכל משפיען קוד או לינק, ו־Hiloomy משייכת אליו את המכירות שהגיעו דרכו.</p>
              <p className="cr-detail">מחובר ישירות ל־Shopify. ורואים גם כמה לקוחות חדשים וחוזרים כל משפיען הביא.</p>
            </div>
            <div className="cr-ui cr-flow" aria-label="ממשפיען לקוד להזמנות למכירות">
              <div className="cr-flow-row">
                <div className="cr-flow-step">
                  <span className="cr-who">מאיה כהן</span>
                  <span className="cr-flow-label">משפיענית</span>
                </div>
                <div className="cr-flow-arrow" aria-hidden="true" />
                <div className="cr-flow-step">
                  <span className="cr-code big">MAYA15</span>
                  <span className="cr-flow-label">קוד קופון</span>
                </div>
                <div className="cr-flow-arrow" aria-hidden="true" />
                <div className="cr-flow-step">
                  <b>
                    <N>73</N>
                  </b>
                  <span className="cr-flow-label">הזמנות</span>
                </div>
                <div className="cr-flow-arrow" aria-hidden="true" />
                <div className="cr-flow-step accent">
                  <b>
                    <N>18,430 ₪</N>
                  </b>
                  <span className="cr-flow-label">מכירות</span>
                </div>
              </div>
              <div className="cr-flow-foot">
                <span>
                  לקוחות חדשים{" "}
                  <b>
                    <N>67%</N>
                  </b>
                </span>
                <span>
                  חוזרים{" "}
                  <b>
                    <N>33%</N>
                  </b>
                </span>
              </div>
            </div>
          </div>

          {/* 03 */}
          <div className="cr-feature" data-reveal>
            <div className="cr-feature-text">
              <div className="cr-step-n">03</div>
              <h3 className="cr-h3">בסוף החודש כבר לא פותחים Excel.</h3>
              <p className="cr-lead">Hiloomy מחשבת כמה עמלה מגיעה לכל משפיען, מעדכנת ביטולים והחזרים, ומראה מה ממתין, מה אושר ומה כבר שולם.</p>
              <p className="cr-detail">אפשר להגדיר עמלה שונה ללקוח חדש וללקוח חוזר.</p>
            </div>
            <div className="cr-ui" aria-label="עמלות החודש">
              <div className="cr-ui-head">
                <div className="cr-ui-title">עמלות · ספטמבר</div>
                <span className="cr-ui-btn primary">אישור לתשלום</span>
              </div>
              <table className="cr-table cr-only-wide">
                <thead>
                  <tr>
                    <th>משפיען/ת</th>
                    <th>מכירות</th>
                    <th>עמלה</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {FEE_ROWS.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
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
              <ul className="cr-mlist cr-only-narrow">
                {FEE_ROWS.map((r) => (
                  <li key={r.name}>
                    <span className="cr-who">
                      <span className="stack">
                        <span>{r.name}</span>
                        <span className="cr-ui-sub">
                          מכירות <N>{r.sales}</N>
                        </span>
                      </span>
                    </span>
                    <span className="cr-mlist-right">
                      <b>
                        <N>{r.fee}</N>
                      </b>
                      <span className={`cr-pill ${r.pill}`}>{r.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Model */}
      <section className="cr-section cr-dark" id="model">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">המשפיענים שלכם נשארים שלכם.</h2>
          </div>
          <div className="cr-principles" data-reveal>
            <div className="cr-principle">
              <h3>הקשר שלכם</h3>
              <p>אתם עובדים ישירות מול המשפיענים שלכם.</p>
            </div>
            <div className="cr-principle">
              <h3>הדאטה שלכם</h3>
              <p>הפעילות, המכירות והמידע נשארים אצלכם.</p>
            </div>
            <div className="cr-principle">
              <h3>המכירות שלכם</h3>
              <p>Hiloomy לא לוקחת אחוז מכל מכירה.</p>
            </div>
          </div>
          <div className="cr-zero" data-reveal>
            <p className="cr-zero-big">
              <N>0%</N> עמלה על מכירות המשפיענים.
            </p>
            <p className="cr-zero-sub">ככל שהמערך שלכם מוכר יותר, אתם לא משלמים לנו יותר.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- How */}
      <section className="cr-section cr-white" id="how">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">לא תקבלו מערכת וקישור להתחיל לבד.</h2>
            <p className="cr-lead cr-mt">אנחנו מחברים ומגדירים את Hiloomy יחד איתכם, כדי שתתחילו לעבוד עם המערך שכבר יש לכם.</p>
          </div>
          <ol className="cr-timeline" data-reveal>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">01</div>
              <h3>ממפים</h3>
              <p>את המשפיענים, הקודים ומודל העמלות הקיים.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">02</div>
              <h3>מחברים</h3>
              <p>את Shopify והמערכות הרלוונטיות.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">03</div>
              <h3>מייבאים</h3>
              <p>את המשפיענים והקודים שכבר קיימים.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">04</div>
              <h3>עולים לאוויר</h3>
              <p>ומתחילים לנהל הכול מ־Hiloomy.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- Pricing */}
      <section className="cr-section" id="pricing">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">תשלום קבוע. לא אחוז מהמכירות.</h2>
          </div>
          <div className="cr-price-grid" data-reveal>
            <div className="cr-price">
              <h3>הקמה והטמעה</h3>
              <div className="cr-price-amount">
                <N>2,500–3,500 ₪</N>
              </div>
              <div className="cr-price-kind">חד־פעמי</div>
              <p className="desc">מיפוי, חיבור Shopify, הגדרת המערכת, ייבוא המשפיענים והקודים והעלאה לאוויר.</p>
            </div>
            <div className="cr-plus" aria-hidden="true">
              +
            </div>
            <div className="cr-price">
              <h3>מערכת ותחזוקה</h3>
              <div className="cr-price-amount">
                <N>250 ₪</N> <small>לחודש</small>
              </div>
              <div className="cr-price-kind">ללא התחייבות</div>
              <p className="desc">שימוש במערכת, סנכרון Shopify ותחזוקה טכנית.</p>
            </div>
          </div>
          <div className="cr-price-zero" data-reveal>
            <p className="big">
              <N>0%</N> עמלה על המכירות.
            </p>
            <p className="small">ניהול שוטף של המשפיענים או גיוס משפיענים אינם כלולים.</p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- FAQ */}
      <section className="cr-section cr-white" id="faq">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">שאלות נפוצות</h2>
          </div>
          <div className="cr-faq" data-reveal>
            <details>
              <summary>האם Hiloomy גם מוצאת לנו משפיענים?</summary>
              <p>לא. Hiloomy מיועדת למותגים שכבר עובדים עם משפיענים או בונים בעצמם את הרשת שלהם. אנחנו נותנים לכם את המערכת לניהול הפעילות, המכירות והעמלות.</p>
            </details>
            <details>
              <summary>יש לנו כבר משפיענים וקודי קופון. צריך להתחיל מחדש?</summary>
              <p>לא. בתהליך ההטמעה אנחנו מייבאים את המידע הקיים ומחברים את הקודים שכבר עובדים אצלכם.</p>
            </details>
            <details>
              <summary>איך יודעים איזו מכירה שייכת לאיזה משפיען?</summary>
              <p>כל משפיען מקבל קוד ו/או לינק מעקב. Hiloomy מתחברת ל־Shopify ומשייכת את ההזמנות למשפיען הרלוונטי.</p>
            </details>
            <details>
              <summary>
                מה כלול ב־<N>250 ₪</N> בחודש?
              </summary>
              <p>השימוש במערכת, הסנכרון עם Shopify והתחזוקה הטכנית. ניהול המשפיענים או הקמפיינים עבורכם הוא שירות נפרד.</p>
            </details>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Contact */}
      <section className="cr-section cr-contact" id="contact">
        <div className="cr-wrap cr-contact-grid">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>יש לכם כבר משפיענים?</span>
              <span>בואו נעשה סדר.</span>
            </h2>
            <p className="cr-lead cr-mt">נראה איך אתם עובדים היום ואיך Hiloomy יכולה לרכז את הפעילות אצלכם במקום אחד.</p>
            <p className="cr-contact-alt">
              מעדיפים מייל? <a href={`mailto:${CONTACT_EMAIL}?subject=Hiloomy%20Creator`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
          <div data-reveal>
            <LeadForm />
          </div>
        </div>
      </section>

      <footer className="cr-footer">
        <div className="cr-wrap cr-footer-bar">
          <span className="cr-logo" style={{ fontSize: 17 }}>
            Hiloomy <span className="cr-logo-sub">Creator</span>
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
    </div>
  );
}
