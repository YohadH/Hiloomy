import Link from "next/link";
import "./creators-landing.css";
import { CreatorsNav } from "./creators-nav";
import { LeadForm } from "./lead-form";
import { RevealOnScroll } from "./reveal";

// Hiloomy Creator — public landing (Hebrew, RTL). Server component; the
// interactive bits (nav sheet, form, reveal) are small client islands.
//
// Every screen below is an HTML recreation of a real affiliate-portal view
// (dashboard KPI tiles, שותפות directory, קופונים, המרות, תשלומים, per-affiliate
// deep dive). Figures are illustrative and the page says so. Capabilities
// that do not exist yet — campaign/brief management, per-creator discounts
// and returns — are labelled "בקרוב" and never shown as live.

const CTA = "בואו נבדוק את מערך היוצרים שלכם";
const CONTACT_EMAIL = "yoadhakimv@gmail.com";

function N({ children }: { children: string }) {
  return <span className="cr-num">{children}</span>;
}

export function CreatorsLanding() {
  return (
    <div className="cr-root" dir="rtl" lang="he">
      <RevealOnScroll />
      <CreatorsNav />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="cr-hero" id="top">
        <div className="cr-wrap cr-hero-grid">
          <div>
            <span className="cr-eyebrow">מערכת לניהול פעילות יוצרים ואפיליאייט למותגי איקומרס</span>
            <h1 className="cr-h1">
              <span>נהלו את מערך היוצרים שלכם.</span>
              <span className="accent">בלי לוותר על אחוז מכל מכירה.</span>
            </h1>
            <div className="cr-hero-copy">
              <p className="cr-lead">
                <strong>Hiloomy מרכזת במקום אחד את ניהול היוצרים, הקודים, הלינקים, העמלות והביצועים של המותג שלכם.</strong>
              </p>
              <p className="cr-lead">אנחנו מטמיעים את המערכת אצלכם. אתם מנהלים את הפעילות ונשארים הבעלים שלה.</p>
            </div>
            <div className="cr-hero-actions">
              <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
                {CTA}
              </a>
              <a href="#how" className="cr-btn cr-btn-ghost cr-btn-lg">
                ראו איך זה עובד
              </a>
            </div>
            <p className="cr-qual">מיועד למותגים שכבר עובדים עם יוצרים או Affiliates.</p>
          </div>

          <div className="cr-hero-visual" data-reveal>
            <div className="cr-ui cr-hero-main" aria-label="דשבורד מערך היוצרים ב־Hiloomy">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">מערך היוצרים</div>
                  <div className="cr-ui-sub">30 הימים האחרונים · כל התוכניות</div>
                </div>
                <span className="cr-pill ok">מסונכרן עם Shopify</span>
              </div>
              <div className="cr-ui-tabs" aria-hidden="true">
                <span className="on">דשבורד</span>
                <span>תוכניות</span>
                <span>שותפות</span>
                <span>קופונים</span>
                <span>המרות</span>
                <span>תשלומים</span>
                <span>תוכן</span>
              </div>
              <div className="cr-kpis">
                <div className="cr-kpi">
                  <div className="cr-kpi-label">סה״כ מכירות</div>
                  <div className="cr-kpi-value">
                    <N>312,400 ₪</N>
                  </div>
                  <div className="cr-kpi-delta">
                    <N>+18%</N> מול התקופה הקודמת
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">סה״כ הזמנות</div>
                  <div className="cr-kpi-value">
                    <N>1,184</N>
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">סה״כ קליקים</div>
                  <div className="cr-kpi-value">
                    <N>9,730</N>
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">שותפים פעילים</div>
                  <div className="cr-kpi-value">
                    <N>38</N>
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">עמלה לתשלום</div>
                  <div className="cr-kpi-value pos">
                    <N>27,915 ₪</N>
                  </div>
                </div>
              </div>
              <div className="cr-table-scroll">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>יוצר/ת</th>
                      <th>קוד</th>
                      <th>מכירות</th>
                      <th>עמלה</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar">מ</span>מאיה כהן
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">MAYA15</span>
                      </td>
                      <td>
                        <N>18,430 ₪</N>
                      </td>
                      <td>
                        <N>1,843 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill ok">מאושר לתשלום</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar b">נ</span>נועה לוי
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">NOA10</span>
                      </td>
                      <td>
                        <N>14,120 ₪</N>
                      </td>
                      <td>
                        <N>1,412 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill wait">ממתין לאישור</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar c">ד</span>דניאל ברק
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">DANI</span>
                      </td>
                      <td>
                        <N>9,870 ₪</N>
                      </td>
                      <td>
                        <N>987 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill paid">שולם</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar d">ש</span>שירה אדלר
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">SHIRA20</span>
                      </td>
                      <td>
                        <N>2,140 ₪</N>
                      </td>
                      <td>
                        <N>214 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill wait">ממתין לאישור</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="cr-hero-side">
              <div className="cr-mini">
                <div className="cr-mini-head">
                  <span className="cr-who">
                    <span className="cr-avatar">מ</span>
                    <span>
                      מאיה כהן <span className="cr-handle">@maya.cohen</span>
                    </span>
                  </span>
                  <span className="cr-pill ok">פעילה</span>
                </div>
                <div className="cr-mini-grid">
                  <div>
                    <span>מכירות</span>
                    <b>
                      <N>18,430 ₪</N>
                    </b>
                  </div>
                  <div>
                    <span>הזמנות</span>
                    <b>
                      <N>73</N>
                    </b>
                  </div>
                  <div>
                    <span>עמלה</span>
                    <b>
                      <N>1,843 ₪</N>
                    </b>
                  </div>
                  <div>
                    <span>לקוחות חדשים</span>
                    <b>
                      <N>41</N>
                    </b>
                  </div>
                </div>
              </div>
              <div className="cr-mini">
                <div className="cr-mini-head">
                  <span className="cr-mini-title">תוכנית שגרירות</span>
                  <span className="cr-pill ok">
                    עמלה <N>10%</N>
                  </span>
                </div>
                <div className="cr-mini-grid">
                  <div>
                    <span>שותפים</span>
                    <b>
                      <N>24</N>
                    </b>
                  </div>
                  <div>
                    <span>פעילים</span>
                    <b>
                      <N>18</N>
                    </b>
                  </div>
                  <div>
                    <span>מכירות משויכות</span>
                    <b>
                      <N>84,200 ₪</N>
                    </b>
                  </div>
                  <div>
                    <span>לקוח חוזר</span>
                    <b>עמלה מופחתת</b>
                  </div>
                </div>
              </div>
            </div>
            <p className="cr-sample">מסכי המערכת. הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Problem */}
      <section className="cr-section" id="problem">
        <div className="cr-wrap">
          <div data-reveal>
            <h2 className="cr-h2">מערך היוצרים שלכם לא צריך להתנהל ב־WhatsApp וב־Excel.</h2>
            <p className="cr-lead" style={{ marginTop: 18 }}>
              ככל שכמות היוצרים גדלה, כך קשה יותר לנהל את הפעילות: פרטי יוצרים בגיליונות, שיחות ב־WhatsApp, קודים ב־Shopify,
              עמלות בחישוב ידני ונתוני ביצועים שמפוזרים בין כמה מערכות. ובסוף החודש קשה לענות אפילו על השאלות הפשוטות: מי
              פעיל, מי מכר, למי מגיעה עמלה, ואילו יוצרים באמת מייצרים ערך.
            </p>
          </div>
          <div className="cr-frag" data-reveal>
            <div className="cr-frag-sources" aria-label="איפה המידע נמצא היום">
              <div className="cr-src">
                <b>WhatsApp</b>
                <span>סיכומים עם יוצרים, קודים שנשלחו בהודעה, תזכורות לתשלום.</span>
              </div>
              <div className="cr-src">
                <b>Instagram</b>
                <span>מי פרסם, מתי, ומה קרה עם זה. בדרך כלל אף אחד לא זוכר.</span>
              </div>
              <div className="cr-src">
                <b>Google Sheets</b>
                <span>רשימת היוצרים, אחוזי העמלה, מה שולם ומה לא.</span>
              </div>
              <div className="cr-src">
                <b>Shopify</b>
                <span>קודי הקופון וההזמנות. בלי לדעת איזה קוד שייך למי.</span>
              </div>
              <div className="cr-src">
                <b>Excel</b>
                <span>חישוב העמלות בסוף החודש, ידני, כל פעם מחדש.</span>
              </div>
              <div className="cr-src">
                <b>Analytics</b>
                <span>תנועה ומכירות, בלי חיבור ליוצר שהביא אותן.</span>
              </div>
            </div>
            <div className="cr-frag-arrow" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M30 20H8M16 11l-9 9 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="cr-frag-target">
              <span className="cr-logo" aria-hidden="true">
                <svg viewBox="11 9.7 27 27.3" fill="none" width="22" height="22">
                  <rect x="11.5" y="17" width="6.2" height="19.5" rx="2.8" fill="#15A34A" />
                  <rect x="16.5" y="24.5" width="11.5" height="4.4" fill="#15A34A" />
                  <rect x="27.5" y="18.2" width="6.2" height="18.3" rx="2.6" fill="#F97316" />
                  <path d="M30.6 10.2L37.6 18.8H23.6L30.6 10.2Z" fill="#F97316" />
                </svg>
                Hiloomy
              </span>
              <h3>מערך אחד מסודר.</h3>
              <ul>
                <li>כל היוצרים, הסטטוס והקודים שלהם במקום אחד</li>
                <li>כל הזמנה משויכת ליוצר שהביא אותה, אוטומטית</li>
                <li>עמלות מחושבות לפי המדיניות שלכם, מוכנות לאישור ולתשלום</li>
                <li>ביצועים אמיתיים לכל יוצר: מכירות, לקוחות חדשים, עמלה</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Product */}
      <section className="cr-section" id="product" style={{ background: "var(--cr-white)", paddingBottom: 40 }}>
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <span className="cr-eyebrow">המוצר</span>
            <h2 className="cr-h2">מקום אחד לניהול כל רשת היוצרים שלכם.</h2>
          </div>

          {/* Creators */}
          <div className="cr-feature" data-reveal>
            <div className="cr-feature-text">
              <h3 className="cr-h3">ניהול יוצרים</h3>
              <p className="cr-lead">
                שמרו במקום אחד את פרטי היוצרים, הסטטוס שלהם, הקודים והלינקים, חשבון האינסטגרם וההיסטוריה של העבודה מול
                המותג.
              </p>
              <ul className="cr-feature-points">
                <li>אישור או דחייה של יוצרים חדשים בלחיצה, עם מייל אוטומטי</li>
                <li>ייבוא הרשימה הקיימת מ־Excel או מ־BixGrow בבת אחת</li>
                <li>עמוד הרשמה ממותג לכל תוכנית, כדי שיוצרים חדשים ייכנסו לבד</li>
                <li>לכל יוצר אזור אישי משלו: המכירות, העמלות והסטטוס של התשלום</li>
              </ul>
            </div>
            <div className="cr-ui" aria-label="רשימת היוצרים">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">שותפות</div>
                  <div className="cr-ui-sub">
                    <N>42</N> יוצרים · <N>38</N> פעילים · <N>3</N> ממתינים לאישור
                  </div>
                </div>
                <span className="cr-ui-btn primary">+ הוספת יוצר/ת</span>
              </div>
              <div className="cr-table-scroll">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>יוצר/ת</th>
                      <th>קוד</th>
                      <th>מכירות</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar">מ</span>
                          <span className="stack">
                            <span>מאיה כהן</span>
                            <span className="cr-handle">@maya.cohen</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">MAYA15</span>
                      </td>
                      <td>
                        <N>18,430 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill ok">מאושרת</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar b">נ</span>
                          <span className="stack">
                            <span>נועה לוי</span>
                            <span className="cr-handle">@noa.levi</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">NOA10</span>
                      </td>
                      <td>
                        <N>14,120 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill ok">מאושרת</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar c">ד</span>
                          <span className="stack">
                            <span>דניאל ברק</span>
                            <span className="cr-handle">@daniel.barak</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="cr-code">DANI</span>
                      </td>
                      <td>
                        <N>9,870 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill ok">מאושר</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="cr-who">
                          <span className="cr-avatar d">ר</span>
                          <span className="stack">
                            <span>רוני שגב</span>
                            <span className="cr-handle">@roni.segev</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="cr-ui-sub">—</span>
                      </td>
                      <td>
                        <N>0 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill wait">ממתינה לאישור</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="cr-ui-foot">
                <span className="cr-ui-btn">ייבוא מ־CSV</span>
                <span className="cr-ui-btn">ייבוא מ־BixGrow</span>
                <span className="cr-ui-btn">ייצוא</span>
                <span className="cr-ui-btn">
                  עמוד הרשמה: <span className="cr-code">hiloomy.com/join/brand</span>
                </span>
              </div>
            </div>
          </div>

          {/* Codes & links */}
          <div className="cr-feature flip" data-reveal>
            <div className="cr-feature-text">
              <h3 className="cr-h3">קודים, לינקים ומעקב</h3>
              <p className="cr-lead">
                יוצרים קוד קופון ישירות ב־Shopify מתוך Hiloomy, מצמידים אותו ליוצר, ומקבלים לינק מעקב קצר. מרגע זה כל
                הזמנה עם הקוד או דרך הלינק משויכת ליוצר הנכון.
              </p>
              <ul className="cr-feature-points">
                <li>יצירת קודים ליוצר אחד או לעשרות יוצרים בבת אחת</li>
                <li>חיבור קודים שכבר קיימים ב־Shopify, בלי ליצור מחדש</li>
                <li>לינק קצר לכל יוצר, עם ספירת קליקים ומעקב עד ההזמנה</li>
                <li>סנכרון אוטומטי של ההזמנות מ־Shopify, כולל ביטולים והחזרים</li>
              </ul>
            </div>
            <div className="cr-ui" aria-label="ניהול קופונים ולינקים">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">קופונים</div>
                  <div className="cr-ui-sub">
                    <N>39</N> קודים מחוברים · נוצרים ומתעדכנים ב־Shopify
                  </div>
                </div>
                <span className="cr-pill ok">Shopify מחובר</span>
              </div>
              <div className="cr-ui-pad" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="cr-kpi-label">קוד</div>
                    <div className="cr-code" style={{ display: "inline-block", marginTop: 4, fontSize: 13 }}>
                      SHIRA20
                    </div>
                  </div>
                  <div>
                    <div className="cr-kpi-label">הנחה</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      <N>20%</N> · פעם אחת ללקוח
                    </div>
                  </div>
                  <div>
                    <div className="cr-kpi-label">משויך ל־</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="cr-who">
                        <span className="cr-avatar d">ש</span>שירה אדלר
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="cr-kpi-label">לינק מעקב</div>
                    <div className="cr-code" style={{ display: "inline-block", marginTop: 4 }}>
                      hiloomy.com/l/s4dw
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="cr-ui-btn primary">יצירת הקוד ב־Shopify</span>
                  <span className="cr-ui-btn">חיבור קוד קיים</span>
                  <span className="cr-ui-btn">יצירה לכל היוצרים בבת אחת</span>
                </div>
              </div>
              <ul className="cr-ui-list">
                <li>
                  <span>
                    <span className="cr-code">MAYA15</span> · מאיה כהן
                  </span>
                  <span className="val">
                    <N>1,204</N> קליקים · <N>73</N> הזמנות
                  </span>
                </li>
                <li>
                  <span>
                    <span className="cr-code">NOA10</span> · נועה לוי
                  </span>
                  <span className="val">
                    <N>962</N> קליקים · <N>58</N> הזמנות
                  </span>
                </li>
                <li>
                  <span>
                    <span className="cr-code">DANI</span> · דניאל ברק
                  </span>
                  <span className="val">
                    <N>511</N> קליקים · <N>41</N> הזמנות
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Sales, commissions, payouts */}
          <div className="cr-feature" data-reveal>
            <div className="cr-feature-text">
              <h3 className="cr-h3">מכירות, עמלות ותשלומים</h3>
              <p className="cr-lead">
                כל הזמנה שהגיעה מיוצר נרשמת בספר המכירות עם הקוד, הסכום והעמלה שמגיעה. בסוף החודש מאשרים, מסמנים כשולם,
                ומייצאים. בלי Excel.
              </p>
              <ul className="cr-feature-points">
                <li>מדיניות עמלה לתוכנית: אחוז קבוע, אחוז שונה ליוצר מסוים, ועמלה מופחתת או אפס על לקוח חוזר</li>
                <li>עמלות מתעדכנות אוטומטית כשהזמנה מבוטלת או מוחזרת</li>
                <li>הזמנה שהגיעה מחוץ ל־Shopify? מוסיפים ידנית או מייבאים מקובץ</li>
                <li>סטטוס לכל עמלה: ממתין לאישור, מאושר לתשלום, שולם</li>
              </ul>
            </div>
            <div className="cr-ui" aria-label="ספר המכירות והעמלות">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">המרות</div>
                  <div className="cr-ui-sub">ספטמבר 2026 · לפי הזמנה</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className="cr-ui-btn">ייצוא</span>
                  <span className="cr-ui-btn primary">אישור לתשלום</span>
                </div>
              </div>
              <div className="cr-table-scroll">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>הזמנה</th>
                      <th>יוצר/ת</th>
                      <th>סכום</th>
                      <th>לקוח</th>
                      <th>עמלה</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <N>#4821</N>
                      </td>
                      <td>נועה לוי</td>
                      <td>
                        <N>420 ₪</N>
                      </td>
                      <td>חדש</td>
                      <td>
                        <N>42 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill wait">ממתין לאישור</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <N>#4819</N>
                      </td>
                      <td>מאיה כהן</td>
                      <td>
                        <N>310 ₪</N>
                      </td>
                      <td>חוזר</td>
                      <td>
                        <N>15.5 ₪</N> <span className="cr-ui-sub">(מופחתת)</span>
                      </td>
                      <td>
                        <span className="cr-pill ok">מאושר לתשלום</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <N>#4812</N>
                      </td>
                      <td>דניאל ברק</td>
                      <td>
                        <N>690 ₪</N>
                      </td>
                      <td>חדש</td>
                      <td>
                        <N>69 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill paid">שולם</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <N>#4808</N>
                      </td>
                      <td>מאיה כהן</td>
                      <td>
                        <N>0 ₪</N> <span className="cr-ui-sub">(הוחזרה)</span>
                      </td>
                      <td>חדש</td>
                      <td>
                        <N>0 ₪</N>
                      </td>
                      <td>
                        <span className="cr-pill paid">הוחזר</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul className="cr-ui-list">
                <li>
                  <span className="lbl">ממתין לאישור</span>
                  <span className="val">
                    <N>27,915 ₪</N>
                  </span>
                </li>
                <li>
                  <span className="lbl">מאושר לתשלום</span>
                  <span className="val">
                    <N>12,300 ₪</N>
                  </span>
                </li>
                <li>
                  <span className="lbl">שולם החודש</span>
                  <span className="val">
                    <N>31,060 ₪</N>
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Performance */}
          <div className="cr-feature flip" data-reveal>
            <div className="cr-feature-text">
              <h3 className="cr-h3">ביצועי יוצרים</h3>
              <p className="cr-lead">
                אל תסתפקו בצפיות ולייקים. ראו לכל יוצר כמה מכר, כמה עלה, כמה לקוחות חדשים הביא, ומה נשאר למותג אחרי
                העמלה.
              </p>
              <ul className="cr-feature-points">
                <li>פיצול ללקוחות חדשים מול חוזרים לכל יוצר</li>
                <li>קופון מול לינק: מאיפה באמת מגיעות המכירות</li>
                <li>המוצרים שכל יוצר מוכר הכי טוב</li>
                <li>יוצרים שקיבלו מוצרים או תשלום ולא פרסמו כבר 30 יום</li>
              </ul>
            </div>
            <div className="cr-ui" aria-label="ביצועי יוצרת">
              <div className="cr-ui-head">
                <div>
                  <span className="cr-who">
                    <span className="cr-avatar">מ</span>
                    <span>
                      מאיה כהן <span className="cr-handle">@maya.cohen</span>
                    </span>
                  </span>
                </div>
                <span className="cr-ui-sub">90 הימים האחרונים</span>
              </div>
              <div className="cr-kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">מכירות</div>
                  <div className="cr-kpi-value">
                    <N>48,900 ₪</N>
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">עמלה</div>
                  <div className="cr-kpi-value">
                    <N>4,890 ₪</N>
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">נטו למותג אחרי עמלה</div>
                  <div className="cr-kpi-value pos">
                    <N>44,010 ₪</N>
                  </div>
                </div>
                <div className="cr-kpi">
                  <div className="cr-kpi-label">ערך הזמנה ממוצע</div>
                  <div className="cr-kpi-value">
                    <N>252 ₪</N>
                  </div>
                </div>
              </div>
              <div className="cr-ui-pad">
                <div className="cr-kpi-label" style={{ marginBottom: 8 }}>
                  לקוחות
                </div>
                <div className="cr-bar" aria-hidden="true">
                  <span className="a" style={{ width: "67%" }} />
                  <span className="b" style={{ width: "33%" }} />
                </div>
                <div className="cr-legend">
                  <span>
                    <i className="cr-dot a" />
                    חדשים <b>
                      <N>67%</N>
                    </b>
                  </span>
                  <span>
                    <i className="cr-dot b" />
                    חוזרים <b>
                      <N>33%</N>
                    </b>
                  </span>
                </div>
                <div className="cr-kpi-label" style={{ margin: "14px 0 8px" }}>
                  מקור המכירות
                </div>
                <div className="cr-bar" aria-hidden="true">
                  <span className="a" style={{ width: "81%" }} />
                  <span className="b" style={{ width: "19%" }} />
                </div>
                <div className="cr-legend">
                  <span>
                    <i className="cr-dot a" />
                    קופון <b>
                      <N>81%</N>
                    </b>
                  </span>
                  <span>
                    <i className="cr-dot b" />
                    לינק <b>
                      <N>19%</N>
                    </b>
                  </span>
                </div>
              </div>
              <ul className="cr-ui-list">
                <li>
                  <span className="lbl">מוצרים מובילים</span>
                  <span className="val">סט טיפוח לילה · סרום ויטמין C · קרם ידיים</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Coming soon: campaigns */}
          <div className="cr-soon" data-reveal style={{ marginTop: 24 }}>
            <div>
              <span className="cr-pill soon">בקרוב</span>
              <h3 className="cr-h3" style={{ marginTop: 10 }}>
                ניהול קמפיינים ובריפים
              </h3>
              <p style={{ marginTop: 8 }}>
                פתיחת קמפיין, שיוך יוצרים, בריף ומשימות עם תאריכים, ומעקב אחרי ההתקדמות מתוך המערכת. היכולת הזו בפיתוח ועדיין
                לא חלק מהמוצר. היום קמפיינים מנוהלים דרך התוכניות והקודים.
              </p>
            </div>
            <a href="#contact" className="cr-btn cr-btn-ghost cr-btn-md">
              רוצים להשפיע על מה שנבנה? דברו איתנו
            </a>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Model */}
      <section className="cr-section cr-dark" id="model">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <span className="cr-eyebrow on-dark">המודל של Hiloomy</span>
            <h2 className="cr-h2">מערך היוצרים שלכם נשאר שלכם.</h2>
          </div>
          <div className="cr-principles" data-reveal>
            <div className="cr-principle">
              <h3>היוצרים שלכם</h3>
              <p>הקשר עם היוצרים נשאר ישירות מול המותג. אין פלטפורמה באמצע, ואף אחד לא מציע אותם למותג אחר.</p>
            </div>
            <div className="cr-principle">
              <h3>הדאטה שלכם</h3>
              <p>המידע על היוצרים, הקודים והביצועים הוא חלק מהפעילות שלכם. מייצאים אותו מתי שרוצים, בקובץ.</p>
            </div>
            <div className="cr-principle">
              <h3>הצמיחה שלכם</h3>
              <p>Hiloomy לא לוקחת אחוז בכל פעם שיוצר מייצר מכירה. ככל שהמערך גדל, המחיר שלכם לא משתנה.</p>
            </div>
          </div>
          <p className="cr-zero" data-reveal>
            <N>0%</N> עמלת פלטפורמה על מכירות היוצרים.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- Performance */}
      <section className="cr-section" id="performance">
        <div className="cr-wrap">
          <div data-reveal>
            <span className="cr-eyebrow">ביצועים</span>
            <h2 className="cr-h2">מחזור מכירות לא מספר את כל הסיפור.</h2>
            <p className="cr-lead" style={{ marginTop: 18 }}>
              יוצר שהכניס <N>40,000 ₪</N> במכירות לא בהכרח ייצר לעסק ערך של <N>40,000 ₪</N>. חלק מהלקוחות היו קונים גם בלי
              הקוד, וחלק מהעמלה שולם עליהם. Hiloomy מראה את זה, ומאפשרת לקבוע מדיניות בהתאם.
            </p>
          </div>
          <div className="cr-perf-grid" data-reveal>
            <div className="cr-perf-stack">
              <div className="cr-ui" aria-label="מה נשאר למותג">
                <div className="cr-ui-head">
                  <div className="cr-ui-title">מה נשאר למותג · יוצרת לדוגמה</div>
                  <span className="cr-ui-sub">90 יום</span>
                </div>
                <ul className="cr-ui-list">
                  <li>
                    <span className="lbl">מכירות</span>
                    <span className="val">
                      <N>40,000 ₪</N>
                    </span>
                  </li>
                  <li>
                    <span className="lbl">עמלה ששולמה</span>
                    <span className="val neg">
                      <N>−4,000 ₪</N>
                    </span>
                  </li>
                  <li className="total">
                    <span>נטו למותג אחרי עמלה</span>
                    <span className="val">
                      <N>36,000 ₪</N>
                    </span>
                  </li>
                  <li>
                    <span className="lbl">לקוחות חדשים · חוזרים</span>
                    <span className="val">
                      <N>67%</N> · <N>33%</N>
                    </span>
                  </li>
                  <li>
                    <span className="lbl">עמלה ששולמה על לקוחות חוזרים</span>
                    <span className="val neg">
                      <N>1,320 ₪</N>
                    </span>
                  </li>
                </ul>
                <div className="cr-ui-note">
                  דליפת עמלות: הסכום ששולם על לקוחות שכבר קנו אצלכם. מדיניות ״לקוח חוזר״ מקטינה אותו אוטומטית.
                </div>
              </div>
              <div className="cr-ui" aria-label="מדיניות עמלה ללקוח חוזר">
                <div className="cr-ui-head">
                  <div className="cr-ui-title">מדיניות עמלה ללקוח חוזר</div>
                  <span className="cr-pill ok">פעילה</span>
                </div>
                <ul className="cr-ui-list">
                  <li>
                    <span className="lbl">לקוח חדש</span>
                    <span className="val">
                      עמלה מלאה · <N>10%</N>
                    </span>
                  </li>
                  <li>
                    <span className="lbl">לקוח חוזר</span>
                    <span className="val">
                      עמלה מופחתת · <N>5%</N>
                    </span>
                  </li>
                  <li>
                    <span className="lbl">לקוח שלא קנה מעל 180 יום</span>
                    <span className="val">נחשב חדש</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="cr-ui muted" aria-label="תובנות ביצועים מתקדמות, בקרוב">
              <div className="cr-ui-head">
                <div className="cr-ui-title">תרומה אמיתית לעסק</div>
                <span className="cr-pill soon">בקרוב</span>
              </div>
              <ul className="cr-ui-list">
                <li>
                  <span className="lbl">מכירות</span>
                  <span className="val">
                    <N>40,000 ₪</N>
                  </span>
                </li>
                <li>
                  <span className="lbl">הנחות שניתנו בקוד</span>
                  <span className="val">
                    <N>−3,200 ₪</N>
                  </span>
                </li>
                <li>
                  <span className="lbl">החזרות</span>
                  <span className="val">
                    <N>−2,300 ₪</N>
                  </span>
                </li>
                <li>
                  <span className="lbl">עמלה</span>
                  <span className="val">
                    <N>−4,000 ₪</N>
                  </span>
                </li>
                <li>
                  <span className="lbl">לקוחות שהיו קונים גם בלי הקוד</span>
                  <span className="val">
                    <N>−12,000 ₪</N>
                  </span>
                </li>
                <li className="total">
                  <span>תרומה משוערת</span>
                  <span className="val">
                    <N>18,500 ₪</N>
                  </span>
                </li>
              </ul>
              <div className="cr-ui-note warn">
                תובנות ביצועים מתקדמות — בקרוב. פירוק ההנחות, ההחזרות והתרומה לכל יוצר עדיין לא חלק מהמוצר. היום מוצגים
                מכירות, עמלה, נטו אחרי עמלה ופיצול חדשים/חוזרים.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- How */}
      <section className="cr-section" id="how" style={{ background: "var(--cr-white)" }}>
        <div className="cr-wrap">
          <div data-reveal>
            <span className="cr-eyebrow">ההטמעה</span>
            <h2 className="cr-h2">לא תקבלו מאיתנו מערכת וקישור להתחיל לבד.</h2>
            <p className="cr-lead" style={{ marginTop: 18 }}>
              אנחנו מטמיעים את Hiloomy בהתאם לאופן שבו מערך היוצרים שלכם באמת עובד. ארבעה שלבים, בדרך כלל בתוך שבועיים.
            </p>
          </div>
          <ol className="cr-timeline" data-reveal style={{ listStyle: "none", padding: 0 }}>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">01</div>
              <h3>מכירים את הפעילות שלכם</h3>
              <p>ממפים את היוצרים, הקודים, מודל העמלות, מי מקבל כמה ומתי, ואיך התהליך מתנהל היום.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">02</div>
              <h3>מגדירים את Hiloomy</h3>
              <p>מחברים את חנות ה־Shopify, מגדירים את התוכניות ומדיניות העמלה, ומתקינים את מעקב הלינקים.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">03</div>
              <h3>מסדרים ומייבאים</h3>
              <p>מייבאים את היוצרים הקיימים מהגיליון או מ־BixGrow, מחברים את הקודים שכבר קיימים ב־Shopify, ומסדרים סטטוסים.</p>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">04</div>
              <h3>עולים לאוויר</h3>
              <p>הצוות שלכם מנהל את היוצרים מתוך מערכת אחת, וכל יוצר מקבל קישור לאזור האישי שלו.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- Pricing */}
      <section className="cr-section" id="pricing">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <span className="cr-eyebrow">מחירים</span>
            <h2 className="cr-h2">מחיר פשוט. בלי אחוז מהמכירות שלכם.</h2>
          </div>
          <div className="cr-price-grid" data-reveal>
            <div className="cr-price">
              <h3>הקמה והטמעה</h3>
              <div className="cr-price-amount">
                <N>2,500–3,500 ₪</N>
              </div>
              <div className="cr-price-kind">חד־פעמי · לפי גודל המערך</div>
              <p className="desc">
                כולל מיפוי הפעילות, הגדרת התוכניות ומדיניות העמלה, חיבור Shopify והמעקב, ייבוא היוצרים והקודים הקיימים,
                והעלאה לאוויר עם הצוות שלכם.
              </p>
            </div>
            <div className="cr-price">
              <h3>מערכת ותחזוקה טכנית</h3>
              <div className="cr-price-amount">
                <N>250 ₪</N>
                <small>לחודש</small>
              </div>
              <div className="cr-price-kind">ללא התחייבות · ללא הגבלת יוצרים</div>
              <p className="desc">
                עבור השימוש ב־Hiloomy, הסנכרון השוטף מול Shopify, האזור האישי של היוצרים והמשך התחזוקה הטכנית של סביבת
                המערכת.
              </p>
            </div>
          </div>
          <div className="cr-price-zero" data-reveal>
            <div className="big">
              <N>0%</N> עמלה על מכירות היוצרים.
            </div>
            <p className="small">
              שירותי ניהול קמפיינים, ניהול יוצרים שוטף או פיתוחים מיוחדים אינם כלולים, אלא אם סוכם אחרת.
            </p>
          </div>
          <div className="cr-price-cta" data-reveal>
            <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
              {CTA}
            </a>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Fit */}
      <section className="cr-section" id="fit" style={{ background: "var(--cr-white)" }}>
        <div className="cr-wrap">
          <div className="cr-fit">
            <div className="cr-fit-box" data-reveal>
              <h3>Hiloomy כנראה מתאימה לכם אם…</h3>
              <ul className="cr-checks">
                <li>אתם כבר עובדים עם יוצרים, שגרירים או Affiliates.</li>
                <li>אתם רוצים לבנות רשת יוצרים ששייכת למותג שלכם, לא לפלטפורמה.</li>
                <li>המידע על היוצרים מפוזר בין גיליונות, הודעות וכמה מערכות.</li>
                <li>אתם עדיין מחשבים חלק מהעמלות, הקודים או הסטטוסים ידנית.</li>
                <li>אתם רוצים להבין אילו יוצרים באמת מביאים לקוחות חדשים.</li>
                <li>החנות שלכם על Shopify.</li>
              </ul>
            </div>
            <div className="cr-fit-box alt" data-reveal>
              <h3>Hiloomy פחות מתאימה לכם אם…</h3>
              <p>
                המטרה המרכזית שלכם היא להיכנס לזירת משפיענים ולקבל רשימה גדולה של יוצרים שהפלטפורמה תמצא עבורכם. Hiloomy לא
                מחפשת לכם יוצרים. היא מסדרת ומנהלת את אלה שכבר עובדים איתכם, ואת אלה שתגייסו בעצמכם.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- FAQ */}
      <section className="cr-section" id="faq">
        <div className="cr-wrap">
          <div className="cr-center" data-reveal>
            <span className="cr-eyebrow">שאלות נפוצות</span>
            <h2 className="cr-h2">מה בדרך כלל שואלים אותנו</h2>
          </div>
          <div className="cr-faq" data-reveal>
            <details>
              <summary>זו זירת משפיענים?</summary>
              <p>
                לא. Hiloomy לא מחפשת ולא מציעה לכם יוצרים. היא מערכת לניהול היוצרים שכבר עובדים איתכם: הפרטים, הקודים,
                הלינקים, העמלות והביצועים. הגיוס נשאר אצלכם, והקשר עם היוצרים נשאר ישירות מולכם.
              </p>
            </details>
            <details>
              <summary>מה אנחנו צריכים כדי להתחיל?</summary>
              <p>
                חנות Shopify עם הרשאת התחברות, רשימת היוצרים שאיתם אתם עובדים (בכל פורמט שיש לכם), ומודל העמלות שלכם. את השאר
                אנחנו מסדרים בתהליך ההטמעה.
              </p>
            </details>
            <details>
              <summary>יש לנו כבר קודים ב־Shopify ויוצרים ב־Excel או ב־BixGrow. מה קורה איתם?</summary>
              <p>
                מייבאים. את רשימת היוצרים מעלים מקובץ CSV או ישירות מהייצוא של BixGrow, ואת הקודים הקיימים מחברים ליוצרים
                בלי ליצור אותם מחדש. ההיסטוריה של ההזמנות מ־Shopify נסרקת ומשויכת לקודים.
              </p>
            </details>
            <details>
              <summary>איך היוצרים רואים את הנתונים שלהם?</summary>
              <p>
                לכל יוצר יש אזור אישי משלו, עם המכירות, ההזמנות, העמלות והסטטוס של כל תשלום. הכניסה בקישור אישי שנשלח
                למייל, בלי סיסמה. אתם שולטים במה שהם רואים.
              </p>
            </details>
            <details>
              <summary>איך מטופל לקוח חוזר שמשתמש בקוד של יוצר?</summary>
              <p>
                Hiloomy מזהה אם הלקוח כבר קנה אצלכם בעבר, ומחשבת את העמלה לפי המדיניות שקבעתם: עמלה מלאה, מופחתת או אפס.
                לקוח שלא קנה תקופה ארוכה אפשר להחזיר להיחשב חדש. הכל מוגדר פעם אחת ברמת התוכנית.
              </p>
            </details>
            <details>
              <summary>כמה זמן לוקחת ההטמעה?</summary>
              <p>
                בדרך כלל עד שבועיים מרגע שיש לנו גישה לחנות ולרשימת היוצרים. רוב הזמן הולך על סידור המידע הקיים, לא על
                המערכת.
              </p>
            </details>
            <details>
              <summary>מה לא כלול במחיר?</summary>
              <p>
                ניהול שוטף של היוצרים או הקמפיינים בשמכם, גיוס יוצרים, ופיתוחים מיוחדים. אלה אפשריים בתיאום נפרד. המחיר
                החודשי מכסה את המערכת, הסנכרון והתחזוקה הטכנית.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Contact */}
      <section className="cr-section cr-contact" id="contact">
        <div className="cr-wrap cr-contact-grid">
          <div data-reveal>
            <span className="cr-eyebrow">בואו נדבר</span>
            <h2 className="cr-h2">הפכו פעילות יוצרים למערך שעובד כמו חלק אמיתי מהעסק.</h2>
            <p className="cr-lead" style={{ marginTop: 18 }}>
              נבחן יחד איך אתם מנהלים היום את היוצרים שלכם, ונראה איך הפעילות יכולה לעבוד בתוך Hiloomy. שיחה של חצי שעה,
              על התהליך שלכם, לא על מצגת.
            </p>
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
            <Link href="/security">אבטחה</Link>
          </nav>
          <span>
            © <N>2026</N> Hiloomy
          </span>
        </div>
      </footer>
    </div>
  );
}
