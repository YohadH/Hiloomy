import Link from "next/link";
import "./creators-landing.css";
import { HiloomyLogo } from "@/components/ui/logo";
import { CreatorsNav } from "./creators-nav";
import { LeadForm } from "./lead-form";
import { RevealOnScroll } from "./reveal";

// Hiloomy Creator — public landing (Hebrew, RTL). Server component; the
// interactive bits (nav sheet, form, reveal) are small client islands.
//
// Third pass (owner copy, 20 Sep 2026): the page now tells a two-sided
// story. The brand manages creators, codes, sales and fees; every creator
// gets a personal area with their own numbers. Sections: hero, two sides,
// attribution chain, four capabilities, performance, creator portal,
// the mess → one system (dark band), not a marketplace, rollout, price,
// CTA + form. Screens are HTML recreations of the real portal views with
// sample figures. No FAQ: its answers now live in the sections themselves.

const CTA = "בואו נראה איך זה עובד אצלכם";
const CTA_FINAL = "בואו נבדוק את מערך המשפיענים שלכם";
const CONTACT_EMAIL = "yoadhakimv@gmail.com";

function N({ children }: { children: string }) {
  return <span className="cr-num">{children}</span>;
}

// Straight quotes around a spoken line, without tripping react/no-unescaped-entities.
function Q({ children }: { children: string }) {
  return (
    <>
      {'"'}
      {children}
      {'"'}
    </>
  );
}

// Arrow along the reading direction (RTL → points left), colored by context.
function Arrow() {
  return (
    <svg className="cr-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const HERO_ROWS = [
  { initial: "מ", tone: "", name: "מאיה כהן", code: "MAYA15", sales: "18,430 ₪", fee: "1,843 ₪", status: "מאושר לתשלום", pill: "ok" },
  { initial: "נ", tone: "b", name: "נועה לוי", code: "NOA10", sales: "14,120 ₪", fee: "1,412 ₪", status: "ממתין לאישור", pill: "wait" },
  { initial: "ד", tone: "c", name: "דניאל ברק", code: "DANI", sales: "9,870 ₪", fee: "987 ₪", status: "שולם", pill: "paid" }
];

const FEE_ROWS = [
  { name: "נועה לוי", sales: "14,120 ₪", fee: "1,412 ₪", status: "ממתין לאישור", pill: "wait" },
  { name: "מאיה כהן", sales: "18,430 ₪", fee: "1,843 ₪", status: "מאושר לתשלום", pill: "ok" },
  { name: "דניאל ברק", sales: "9,870 ₪", fee: "987 ₪", status: "שולם", pill: "paid" },
  { name: "שירה אדלר", sales: "2,140 ₪", fee: "214 ₪", status: "ממתין לאישור", pill: "wait" }
];

const CHAIN = [
  "משפיען",
  "קוד / לינק אישי",
  "לקוח נכנס לחנות",
  "מתבצעת הזמנה ב־Shopify",
  "המכירה משויכת למשפיען",
  "העמלה מחושבת לפי הכללים שלכם"
];

const METRICS = [
  { t: "מכירות", d: "כמה הכנסות שויכו למשפיען." },
  { t: "הזמנות", d: "כמה עסקאות הגיעו ממנו." },
  { t: "לקוחות חדשים מול חוזרים", d: "האם הוא מביא קהל חדש למותג או בעיקר קיים." },
  { t: "עמלה", d: "כמה אתם משלמים עבור הפעילות." },
  { t: "נטו לאחר עמלה", d: "כמה נשאר למותג לאחר עמלת המשפיען." },
  { t: "קוד מול לינק", d: "איך המכירות הגיעו בפועל." },
  { t: "מוצרים מובילים", d: "אילו מוצרים כל משפיען מצליח למכור." }
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
              <span>מערכת אחת לניהול</span>
              <span>כל מערך המשפיענים שלכם.</span>
            </h1>
            <p className="cr-h1-sub">משני הצדדים.</p>
            <div className="cr-hero-copy">
              <p className="cr-lead">העסק מנהל את המשפיענים, הקודים, המכירות והעמלות.</p>
              <p className="cr-lead">המשפיענים מקבלים אזור אישי שבו הם יכולים לראות את הביצועים שלהם.</p>
              <p className="cr-lead cr-strong">Hiloomy מחברת בין הפעילות של המשפיען לבין המכירות בפועל — כדי ששני הצדדים תמיד ידעו מה קרה.</p>
              <p className="cr-lead">כל קוד, לינק, הזמנה, מכירה ועמלה — במקום אחד.</p>
            </div>
            <div className="cr-hero-actions">
              <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
                {CTA}
              </a>
            </div>
            <p className="cr-trust">
              <span>מתחבר ל־Shopify</span>
              <span>ללא הגבלת משפיענים</span>
              <span>
                <N>0%</N>&nbsp;עמלה על המכירות שלכם
              </span>
            </p>
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

      {/* ----------------------------------------------------------- Two sides */}
      <section className="cr-section cr-white" id="sides">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">לא מספיק לנהל משפיענים. צריך לנהל מערכת יחסים שעובדת לשני הצדדים.</h2>
            <p className="cr-lead cr-mt">מערך משפיענים מורכב משני צדדים:</p>
          </div>
          <div className="cr-sides" data-reveal>
            <div className="cr-side">
              <span className="cr-side-tag">מצד העסק</span>
              <h3 className="cr-h3">אתם צריכים לדעת:</h3>
              <ul className="cr-checks">
                <li>עם מי אתם עובדים</li>
                <li>איזה קוד ולינק שייכים לכל משפיען</li>
                <li>מי באמת מייצר מכירות</li>
                <li>כמה הזמנות הגיעו מכל משפיען</li>
                <li>כמה לקוחות חדשים הוא הביא</li>
                <li>כמה עמלה צריך לשלם</li>
                <li>ומה כבר שולם ומה עדיין פתוח</li>
              </ul>
              <p className="cr-side-foot">במקום לעבור בין Shopify, Excel, WhatsApp ומערכות נוספות — הכול מנוהל מתוך Hiloomy.</p>
            </div>
            <div className="cr-side">
              <span className="cr-side-tag alt">מצד המשפיען</span>
              <h3 className="cr-h3">המשפיען לא צריך לשלוח הודעה ולשאול:</h3>
              <div className="cr-bubbles">
                <span className="cr-bubble">
                  <Q>כמה מכרתי החודש?</Q>
                </span>
                <span className="cr-bubble">
                  <Q>כמה עמלה מגיעה לי?</Q>
                </span>
                <span className="cr-bubble">
                  <Q>התשלום כבר יצא?</Q>
                </span>
              </div>
              <p className="cr-side-lead">לכל משפיען יש אזור אישי שבו הוא יכול לראות את הנתונים שלו:</p>
              <ul className="cr-checks">
                <li>מכירות</li>
                <li>הזמנות</li>
                <li>עמלה שנצברה</li>
                <li>קוד ולינק אישי</li>
                <li>סטטוס התשלום</li>
              </ul>
              <p className="cr-side-foot">
                <span>יותר שקיפות למשפיען.</span>
                <span>פחות עבודה ידנית למותג.</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Attribution */}
      <section className="cr-section" id="attribution">
        <div className="cr-wrap cr-attr">
          <div data-reveal>
            <h2 className="cr-h2">מהפרסום ועד המכירה.</h2>
            <p className="cr-h2-sub">לא רק לייקים וקליקים. מכירות בפועל.</p>
            <p className="cr-lead cr-mt">כל משפיען מקבל קוד קופון ו/או לינק מעקב אישי.</p>
            <p className="cr-lead cr-mt-s">כאשר לקוח מבצע רכישה, Hiloomy מחברת את ההזמנה למשפיען שהביא אותה ומעדכנת את הנתונים שלו ושל העסק.</p>
            <p className="cr-lead cr-mt">
              כך אפשר לדעת לא רק מי פרסם — אלא <strong className="cr-strong">מי מכר וכמה.</strong>
            </p>
            <p className="cr-detail">אם הזמנה בוטלה או הוחזרה, הנתונים והעמלה מתעדכנים בהתאם.</p>
          </div>
          <ol className="cr-chain" data-reveal aria-label="מהמשפיען ועד העמלה">
            {CHAIN.map((step, i) => (
              <li key={step} className={i === CHAIN.length - 1 ? "accent" : ""}>
                <span className="cr-chain-dot">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------- Product */}
      <section className="cr-section cr-white" id="product">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">כל מערך המשפיענים שלכם במסך אחד.</h2>
            <p className="cr-lead cr-mt">במקום לנסות לחבר את התמונה מכמה מערכות שונות, Hiloomy נותנת לכם תמונה אחת ברורה של הפעילות.</p>
          </div>

          <div className="cr-caps">
            {/* 01 */}
            <div className="cr-cap" data-reveal>
              <div className="cr-step-n">01</div>
              <h3 className="cr-h3">ניהול משפיענים</h3>
              <p className="cr-lead">כל המשפיענים במקום אחד: פרטי קשר, Instagram, סטטוס, תוכנית, קוד, לינק והיסטוריית הפעילות.</p>
              <p className="cr-detail">אפשר לאשר משפיענים חדשים, לייבא רשימות קיימות ולנהל כמה תוכניות במקביל.</p>
              <div className="cr-cap-ui">
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
            </div>

            {/* 02 */}
            <div className="cr-cap" data-reveal>
              <div className="cr-step-n">02</div>
              <h3 className="cr-h3">קודים ולינקים</h3>
              <p className="cr-lead">צרו קודי קופון ישירות ב־Shopify או חברו קודים שכבר קיימים.</p>
              <p className="cr-detail">לכל משפיען אפשר להצמיד גם לינק מעקב אישי כדי להבין מה הפעילות שהוא מייצר.</p>
              <div className="cr-cap-ui">
                <div className="cr-ui" aria-label="הקוד והלינק של משפיענית">
                  <div className="cr-ui-head">
                    <div className="cr-ui-title">מאיה כהן · קודים ולינקים</div>
                    <span className="cr-pill ok">מסונכרן עם Shopify</span>
                  </div>
                  <ul className="cr-mlist">
                    <li>
                      <span className="cr-who">
                        <span className="stack">
                          <span>קוד קופון</span>
                          <span className="cr-ui-sub">
                            נוצר ב־Shopify · <N>15%</N> הנחה
                          </span>
                        </span>
                      </span>
                      <span className="cr-mlist-right">
                        <span className="cr-code big">MAYA15</span>
                      </span>
                    </li>
                    <li>
                      <span className="cr-who">
                        <span className="stack">
                          <span>לינק מעקב אישי</span>
                          <span className="cr-ui-sub">כל כניסה דרך הלינק נספרת</span>
                        </span>
                      </span>
                      <span className="cr-mlist-right">
                        <span className="cr-code link">hiloomy.com/r/brand/MAYA15</span>
                      </span>
                    </li>
                    <li>
                      <span className="cr-who">
                        <span className="stack">
                          <span>קוד קיים</span>
                          <span className="cr-ui-sub">היה בחנות לפני Hiloomy</span>
                        </span>
                      </span>
                      <span className="cr-mlist-right">
                        <span className="cr-code">NOA10</span>
                        <span className="cr-pill ok">חובר</span>
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 03 */}
            <div className="cr-cap" data-reveal>
              <div className="cr-step-n">03</div>
              <h3 className="cr-h3">מעקב אחר מכירות</h3>
              <p className="cr-lead">
                ראו את ההזמנות שהגיעו דרך כל משפיען: <strong className="cr-strong">מי מכר, כמה מכר, כמה הזמנות יצר ומה מקור המכירה.</strong>
              </p>
              <p className="cr-detail">לא צריך לחכות לסוף החודש כדי להתחיל לחבר נתונים.</p>
              <div className="cr-cap-ui">
                <div className="cr-ui cr-flow" aria-label="ממשפיענית לקוד להזמנות למכירות">
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
                      דרך הקוד{" "}
                      <b>
                        <N>61</N>
                      </b>
                    </span>
                    <span>
                      דרך הלינק{" "}
                      <b>
                        <N>12</N>
                      </b>
                    </span>
                    <span>
                      לקוחות חדשים{" "}
                      <b>
                        <N>67%</N>
                      </b>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 04 */}
            <div className="cr-cap" data-reveal>
              <div className="cr-step-n">04</div>
              <h3 className="cr-h3">עמלות ותשלומים</h3>
              <p className="cr-lead">Hiloomy מחשבת את העמלה לפי המדיניות שלכם.</p>
              <p className="cr-detail">אפשר להגדיר אחוזי עמלה שונים, לטפל אחרת בלקוחות חדשים וחוזרים ולראות בדיוק:</p>
              <div className="cr-status-flow" aria-label="ממתין לאישור, מאושר לתשלום, שולם">
                <span className="cr-pill wait">ממתין לאישור</span>
                <Arrow />
                <span className="cr-pill ok">מאושר לתשלום</span>
                <Arrow />
                <span className="cr-pill paid">שולם</span>
              </div>
              <div className="cr-cap-ui">
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
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Performance */}
      <section className="cr-section" id="insights">
        <div className="cr-wrap cr-perf-grid">
          <div data-reveal>
            <h2 className="cr-h2">תראו מי באמת מניע את העסק.</h2>
            <p className="cr-lead cr-mt">מחזור מכירות הוא רק ההתחלה.</p>
            <p className="cr-lead cr-mt-s">Hiloomy מאפשרת להסתכל על הביצועים של כל משפיען ולראות:</p>
            <dl className="cr-metrics">
              {METRICS.map((m) => (
                <div className="cr-metric" key={m.t}>
                  <dt>{m.t}</dt>
                  <dd>{m.d}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div data-reveal>
            <div className="cr-ui" aria-label="ביצועי משפיענית אחת">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">מאיה כהן</div>
                  <div className="cr-ui-sub">30 הימים האחרונים</div>
                </div>
                <span className="cr-code">MAYA15</span>
              </div>
              <div className="cr-stats">
                <div className="cr-stat">
                  <span className="l">מכירות</span>
                  <span className="v">
                    <N>18,430 ₪</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">הזמנות</span>
                  <span className="v">
                    <N>73</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">לקוחות חדשים · חוזרים</span>
                  <span className="v">
                    <N>67%</N> · <N>33%</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">עמלה</span>
                  <span className="v">
                    <N>1,843 ₪</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">נטו לאחר עמלה</span>
                  <span className="v pos">
                    <N>16,587 ₪</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">קוד · לינק</span>
                  <span className="v">
                    <N>61</N> · <N>12</N>
                  </span>
                </div>
              </div>
              <div className="cr-ui-sect">מוצרים מובילים</div>
              <ul className="cr-mlist">
                <li>
                  <span>סט מתנה</span>
                  <span className="cr-mlist-right">
                    <span className="cr-ui-sub">
                      <N>31</N> הזמנות
                    </span>
                    <b>
                      <N>8,990 ₪</N>
                    </b>
                  </span>
                </li>
                <li>
                  <span>בושם 50 מ״ל</span>
                  <span className="cr-mlist-right">
                    <span className="cr-ui-sub">
                      <N>24</N> הזמנות
                    </span>
                    <b>
                      <N>6,240 ₪</N>
                    </b>
                  </span>
                </li>
                <li>
                  <span>קרם ידיים</span>
                  <span className="cr-mlist-right">
                    <span className="cr-ui-sub">
                      <N>18</N> הזמנות
                    </span>
                    <b>
                      <N>3,200 ₪</N>
                    </b>
                  </span>
                </li>
              </ul>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
        <div className="cr-wrap cr-center cr-question" data-reveal>
          <p className="q-old">
            כי השאלה היא כבר לא:{" "}
            <b>
              <Q>עם כמה משפיענים אנחנו עובדים?</Q>
            </b>
          </p>
          <p className="q-new">
            <small>אלא:</small>
            <Q>איזה משפיענים באמת מייצרים לנו עסק?</Q>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ Creator portal */}
      <section className="cr-section cr-white" id="portal">
        <div className="cr-wrap cr-portal">
          <div data-reveal>
            <h2 className="cr-h2">וגם המשפיענים שלכם מקבלים מערכת משלהם.</h2>
            <p className="cr-lead cr-mt">ניהול טוב של משפיענים לא צריך להיות שקוף רק לעסק.</p>
            <p className="cr-lead cr-mt-s">לכל משפיען ב־Hiloomy יש אזור אישי עם הנתונים שרלוונטיים אליו. הוא יכול להיכנס ולראות בעצמו:</p>
            <div className="cr-qa">
              <div>
                <h3>כמה מכרתי?</h3>
                <p>סה״כ המכירות וההזמנות שמשויכות אליי.</p>
              </div>
              <div>
                <h3>כמה הרווחתי?</h3>
                <p>העמלה שנצברה מהפעילות שלי.</p>
              </div>
              <div>
                <h3>מה סטטוס התשלום?</h3>
                <p>מה ממתין לאישור, מה אושר ומה כבר שולם.</p>
              </div>
              <div>
                <h3>מה הקוד והלינק שלי?</h3>
                <p>כל מה שצריך כדי להמשיך לעבוד עם המותג במקום אחד.</p>
              </div>
            </div>
          </div>
          <div className="cr-phone-wrap" data-reveal>
            <div className="cr-ui cr-phone" aria-label="האזור האישי של המשפיענית">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">היי מאיה</div>
                  <div className="cr-ui-sub">האזור האישי שלך · ספטמבר</div>
                </div>
                <span className="cr-pill ok">פעילה</span>
              </div>
              <div className="cr-stats">
                <div className="cr-stat">
                  <span className="l">מכירות</span>
                  <span className="v">
                    <N>18,430 ₪</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">הזמנות</span>
                  <span className="v">
                    <N>73</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">עמלה שנצברה</span>
                  <span className="v pos">
                    <N>1,843 ₪</N>
                  </span>
                </div>
                <div className="cr-stat">
                  <span className="l">לקוחות חדשים</span>
                  <span className="v">
                    <N>67%</N>
                  </span>
                </div>
              </div>
              <div className="cr-ui-sect">סטטוס התשלום</div>
              <ul className="cr-mlist">
                <li>
                  <span>ממתין לאישור</span>
                  <span className="cr-mlist-right">
                    <b>
                      <N>412 ₪</N>
                    </b>
                    <span className="cr-pill wait">ממתין</span>
                  </span>
                </li>
                <li>
                  <span>מאושר לתשלום</span>
                  <span className="cr-mlist-right">
                    <b>
                      <N>1,431 ₪</N>
                    </b>
                    <span className="cr-pill ok">מאושר</span>
                  </span>
                </li>
                <li>
                  <span>שולם · אוגוסט</span>
                  <span className="cr-mlist-right">
                    <b>
                      <N>1,650 ₪</N>
                    </b>
                    <span className="cr-pill paid">שולם</span>
                  </span>
                </li>
              </ul>
              <div className="cr-ui-sect">הקוד והלינק שלי</div>
              <ul className="cr-mlist">
                <li>
                  <span>קוד קופון</span>
                  <span className="cr-code big">MAYA15</span>
                </li>
                <li>
                  <span>לינק אישי</span>
                  <span className="cr-code link">hiloomy.com/r/brand/MAYA15</span>
                </li>
              </ul>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
        <div className="cr-wrap cr-center" data-reveal>
          <p className="cr-portal-foot">
            <span>פחות שאלות ב־WhatsApp.</span>
            <span>יותר שקיפות.</span>
            <span>מערכת יחסים מקצועית יותר בין המותג למשפיען.</span>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ The mess */}
      <section className="cr-section cr-mess-section" id="mess">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">במקום שהמערך שלכם ייראה ככה:</h2>
          </div>
          <div className="cr-mess" data-reveal>
            <div className="cr-mess-tile">
              <span className="cr-mess-src">WhatsApp</span>
              <div className="cr-bubbles">
                <span className="cr-bubble">
                  <Q>מה הקוד שלה?</Q>
                </span>
                <span className="cr-bubble">
                  <Q>כמה היא מכרה?</Q>
                </span>
                <span className="cr-bubble">
                  <Q>שילמנו לה כבר?</Q>
                </span>
              </div>
            </div>
            <div className="cr-mess-tile">
              <span className="cr-mess-src">Excel</span>
              <p>רשימות משפיענים, אחוזי עמלה וסטטוסים.</p>
            </div>
            <div className="cr-mess-tile">
              <span className="cr-mess-src">Shopify</span>
              <p>הזמנות וקופונים.</p>
            </div>
            <div className="cr-mess-tile">
              <span className="cr-mess-src">Instagram</span>
              <p>מי העלה ומה פורסם.</p>
            </div>
            <div className="cr-mess-tile">
              <span className="cr-mess-src">חישובים ידניים</span>
              <p>כמה צריך לשלם לכל אחד בסוף החודש.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- One system */}
      <section className="cr-section cr-dark" id="model">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">Hiloomy מחברת הכול למערך אחד.</h2>
            <div className="cr-chain-h" aria-label="משפיענים, קודים ולינקים, הזמנות, מכירות, עמלות, תשלומים">
              <span>משפיענים</span>
              <Arrow />
              <span>קודים ולינקים</span>
              <Arrow />
              <span>הזמנות</span>
              <Arrow />
              <span>מכירות</span>
              <Arrow />
              <span>עמלות</span>
              <Arrow />
              <span>תשלומים</span>
            </div>
          </div>
          <p className="cr-owns-intro cr-center" data-reveal>
            והכול נשאר בבעלות שלכם.
          </p>
          <div className="cr-principles four" data-reveal>
            <div className="cr-principle">
              <h3>המשפיענים שלכם.</h3>
            </div>
            <div className="cr-principle">
              <h3>הקשר שלכם.</h3>
            </div>
            <div className="cr-principle">
              <h3>הדאטה שלכם.</h3>
            </div>
            <div className="cr-principle">
              <h3>המכירות שלכם.</h3>
            </div>
          </div>
          <div className="cr-zero" data-reveal>
            <p className="cr-zero-big">Hiloomy לא לוקחת אחוז מההכנסות שאתם מייצרים.</p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Not a marketplace */}
      <section className="cr-section" id="not-marketplace">
        <div className="cr-wrap cr-narrow cr-center" data-reveal>
          <h2 className="cr-h2">אנחנו לא זירת משפיענים.</h2>
          <p className="cr-lead cr-mt">Hiloomy לא מוכרת לכם רשימה של משפיענים ולא מעבירה את המשפיענים שלכם בין מותגים.</p>
          <p className="cr-lead cr-mt-s">אנחנו נותנים למותג את התשתית לנהל את רשת המשפיענים שלו בעצמו.</p>
          <p className="cr-pair">
            <span>אתם ממשיכים לנהל את הקשר.</span>
            <span>Hiloomy מנהלת את התשתית שמאחוריו.</span>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- Rollout */}
      <section className="cr-section cr-white" id="how">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">לא מקבלים מערכת ונשארים להסתדר לבד.</h2>
            <p className="cr-lead cr-mt">אנחנו מטמיעים את Hiloomy בהתאם לאופן שבו מערך המשפיענים שלכם עובד היום.</p>
          </div>
          <ol className="cr-timeline" data-reveal>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">01</div>
              <h3>מבינים את הפעילות</h3>
              <p>ממפים את המשפיענים, הקודים, מודל העמלות ותהליך העבודה שלכם.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">02</div>
              <h3>מחברים את החנות</h3>
              <p>מחברים Shopify ומגדירים את תוכניות המשפיענים והעמלות.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">03</div>
              <h3>מעבירים את המידע</h3>
              <p>מייבאים את המשפיענים והקודים שכבר קיימים אצלכם.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">04</div>
              <h3>עולים לאוויר</h3>
              <p>הצוות שלכם מתחיל לנהל את הפעילות מתוך Hiloomy והמשפיענים מקבלים גישה לאזור האישי שלהם.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- Pricing */}
      <section className="cr-section" id="pricing">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <h2 className="cr-h2">מחיר פשוט. בלי לקחת חלק מהמכירות שלכם.</h2>
          </div>
          <div className="cr-price-grid" data-reveal>
            <div className="cr-price">
              <h3>הקמה והטמעה</h3>
              <div className="cr-price-amount">
                <N>2,500–3,500 ₪</N>
              </div>
              <div className="cr-price-kind">חד־פעמי</div>
              <p className="desc">כולל מיפוי הפעילות, חיבור Shopify, הגדרת תוכניות ועמלות, ייבוא המשפיענים והקודים והעלאה לאוויר.</p>
            </div>
            <div className="cr-plus" aria-hidden="true">
              +
            </div>
            <div className="cr-price">
              <h3>Hiloomy</h3>
              <div className="cr-price-amount">
                <N>250 ₪</N> <small>לחודש</small>
              </div>
              <ul className="cr-price-lines">
                <li>ללא הגבלת משפיענים.</li>
                <li>ללא התחייבות.</li>
                <li className="strong">
                  <N>0%</N> עמלה על מכירות המשפיענים.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Contact */}
      <section className="cr-section cr-contact" id="contact">
        <div className="cr-wrap cr-contact-grid">
          <div data-reveal>
            <h2 className="cr-h2">אם אתם כבר עובדים עם משפיענים — הגיע הזמן לדעת מה באמת קורה שם.</h2>
            <p className="cr-lead cr-mt">לא רק מי העלה סטורי.</p>
            <p className="cr-final-lines">
              <small>אלא:</small>
              <span>מי מכר.</span>
              <span>כמה מכר.</span>
              <span>כמה צריך לשלם לו.</span>
              <span>וכמה הפעילות הזו באמת מייצרת לעסק.</span>
            </p>
            <p className="cr-lead cr-mt">ובמקביל, לתת למשפיענים שלכם מקום אחד שבו גם הם יכולים לראות בדיוק איפה הם עומדים.</p>
            <p className="cr-contact-alt">
              מעדיפים מייל? <a href={`mailto:${CONTACT_EMAIL}?subject=Hiloomy%20Creator`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
          <div data-reveal>
            <LeadForm cta={CTA_FINAL} note="נראה איך אתם מנהלים את הפעילות היום ואיך אפשר להעביר אותה למערכת אחת." />
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
    </div>
  );
}
