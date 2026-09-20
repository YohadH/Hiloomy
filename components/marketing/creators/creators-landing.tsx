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
// Fifth pass (owner brief, 20 Sep 2026): mobile-first, six sections, one
// visual per section, no section a full screen tall. The page leans on one
// line — "לא רק מי פרסם. מי באמת מכר." — and proves it with
// creator → code/link → sale → product → fee. Hero: one dashboard (KPIs +
// a table on wide screens, KPIs + two creator cards on phones). Section 3
// is the page's centrepiece: one creator's dashboard. Sample figures are
// consistent: Maya's 73 orders = 61 via code + 12 via link; 18,430 ₪ =
// 15,870 via code + 2,560 via link; fee 1,843 ₪ = 10%.

const CTA = "בואו נראה איך זה עובד";
const CTA_FINAL = "בואו נראה איך Hiloomy תעבוד אצלכם";
const CONTACT_EMAIL = "yoadhakimv@gmail.com";

function N({ children }: { children: string }) {
  return <span className="cr-num">{children}</span>;
}

// Arrow along the reading direction (RTL → points left), colored by context.
function Arrow() {
  return (
    <svg className="cr-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Small line icons for the four management features.
function Icon({ kind }: { kind: "users" | "tag" | "percent" | "check" }) {
  const paths = {
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15.5 13.5c2.8 0 5 2.2 5 5" />
      </>
    ),
    tag: (
      <>
        <path d="M20 12l-8 8-9-9V4h7l10 8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </>
    ),
    percent: (
      <>
        <path d="M19 5L5 19" />
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="17" cy="17" r="2.5" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </>
    )
  };
  return (
    <span className="cr-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </svg>
    </span>
  );
}

const HERO_ROWS = [
  { initial: "מ", tone: "", name: "מאיה כהן", code: "MAYA15", sales: "18,430 ₪", orders: "73", fee: "1,843 ₪", status: "מאושר לתשלום", pill: "ok" },
  { initial: "נ", tone: "b", name: "נועה לוי", code: "NOA10", sales: "14,120 ₪", orders: "52", fee: "1,412 ₪", status: "ממתין לאישור", pill: "wait" },
  { initial: "ד", tone: "c", name: "דניאל ברק", code: "DANI", sales: "9,870 ₪", orders: "36", fee: "987 ₪", status: "שולם", pill: "paid" }
];

const PRODUCTS = [
  { name: "סט מתנה", orders: "31" },
  { name: "בושם 50 מ״ל", orders: "24" },
  { name: "קרם ידיים", orders: "18" }
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
            <span className="cr-eyebrow">ניהול יוצרים ומשפיענים למותגי E-commerce</span>
            <h1 className="cr-h1">
              <span>לא רק מי פרסם.</span>
              <span className="accent">מי באמת מכר.</span>
            </h1>
            <p className="cr-hero-claim">
              Hiloomy מרכזת את כל מערך היוצרים שלכם במקום אחד — מניהול היוצרים וקודי הקופון ועד למכירות, ביצועים ועמלות.
            </p>
            <p className="cr-hero-sides">
              <span>העסק רואה ומנהל את כל הפעילות.</span>
              <span>היוצרים מקבלים אזור אישי עם הנתונים שלהם.</span>
            </p>
            <div className="cr-hero-actions">
              <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
                {CTA}
              </a>
            </div>
            <p className="cr-trust">
              <span>Shopify</span>
              <span>ללא הגבלת יוצרים</span>
              <span>
                <N>0%</N>&nbsp;עמלה על המכירות
              </span>
            </p>
          </div>

          <div className="cr-hero-visual" data-reveal>
            <div className="cr-ui" aria-label="מערך היוצרים ב־Hiloomy">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">מערך היוצרים</div>
                  <div className="cr-ui-sub">30 הימים האחרונים</div>
                </div>
                <span className="cr-pill ok">מחובר ל־Shopify</span>
              </div>
              <div className="cr-kpis">
                <div className="cr-kpi">
                  <div className="cr-kpi-value">
                    <N>38</N>
                  </div>
                  <div className="cr-kpi-label">יוצרים פעילים</div>
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
              {/* Wide screens: a compact table */}
              <table className="cr-table cr-wide-table">
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
              {/* Phones: two creator cards, no table */}
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
                          <N>{r.orders}</N>
                        </b>{" "}
                        הזמנות
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

      {/* ------------------------------------- 2 · One system, two sides */}
      <section className="cr-section cr-white" id="sides">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>מערכת אחת.</span>
              <span>שני צדדים.</span>
            </h2>
            <p className="cr-lead-strong cr-mt">
              <span>אתם מנהלים את מערך היוצרים.</span>
              <span>היוצרים רואים את הביצועים שלהם.</span>
            </p>
          </div>
          <div className="cr-sides" data-reveal>
            <div className="cr-side">
              <span className="cr-side-tag">העסק</span>
              <h3 className="cr-h3">כל מה שצריך כדי לנהל את הפעילות במקום אחד.</h3>
              <ul className="cr-checks">
                <li>יוצרים, קודים ולינקים</li>
                <li>מכירות וביצועים</li>
                <li>עמלות ותשלומים</li>
              </ul>
            </div>
            <div className="cr-side creator">
              <div>
                <span className="cr-side-tag alt">היוצרת / המשפיענית</span>
                <h3 className="cr-h3">אזור אישי עם כל מה שחשוב לה.</h3>
                <ul className="cr-checks">
                  <li>כמה מכרתי</li>
                  <li>כמה עמלה צברתי</li>
                  <li>מה סטטוס התשלום שלי</li>
                </ul>
              </div>
              <div className="cr-mini-phone" aria-label="האזור האישי של היוצרת">
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
            פחות הודעות. פחות שאלות. יותר שקיפות לשני הצדדים.
          </p>
        </div>
      </section>

      {/* ------------------------------------------- 3 · Who really sells */}
      <section className="cr-section" id="performance">
        <div className="cr-wrap cr-perf">
          <div data-reveal>
            <h2 className="cr-h2">תדעו מי באמת מוכר לכם.</h2>
            <p className="cr-lead cr-mt cr-strong">
              Hiloomy מחברת בין הפעילות של כל יוצר למכירות בפועל — כדי שתוכלו לראות מי מייצר הכנסות, איזה קוד עובד ואילו מוצרים הוא מצליח למכור.
            </p>
            <ul className="cr-three">
              <li>
                <h3>ביצועי יוצרים</h3>
                <p>ראו כמה מכירות והזמנות כל יוצר מייצר.</p>
              </li>
              <li>
                <h3>קודי קופון</h3>
                <p>ראו בדיוק כמה מכירות הגיעו מכל קוד.</p>
              </li>
              <li>
                <h3>מוצרים מובילים</h3>
                <p>גלו מה כל יוצר באמת מצליח למכור.</p>
              </li>
            </ul>
          </div>
          <div data-reveal>
            <div className="cr-ui cr-creator" aria-label="הדשבורד של יוצרת אחת">
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
                <div className="cr-tile code">
                  <b>
                    <span className="cr-code big">MAYA15</span>
                  </b>
                  <span>
                    קוד מוביל · <N>61</N> הזמנות · <N>15,870 ₪</N>
                  </span>
                </div>
                <div className="cr-tile">
                  <b>
                    <N>67%</N>
                  </b>
                  <span>לקוחות חדשים</span>
                </div>
              </div>
              <div className="cr-ui-sect">המוצרים שהכי נמכרו</div>
              <ol className="cr-top">
                {PRODUCTS.map((p, i) => (
                  <li key={p.name}>
                    <span className="n">{i + 1}</span>
                    <span className="name">{p.name}</span>
                    <span className="val">
                      <N>{p.orders}</N> הזמנות
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>
        </div>
        <div className="cr-wrap cr-center cr-perf-foot" data-reveal>
          <h2 className="cr-h2 cr-h2-flow">
            <span>מי מוכר</span>
            <Arrow />
            <span>מה מוכר</span>
            <Arrow />
            <span>כמה הכנסה הוא מייצר.</span>
          </h2>
          <p className="cr-chips" aria-label="יוצר, קוד או לינק, רכישה, מכירה משויכת">
            <span>יוצר</span>
            <Arrow />
            <span>קוד / לינק</span>
            <Arrow />
            <span>רכישה</span>
            <Arrow />
            <span>מכירה משויכת</span>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------- 4 · Management */}
      <section className="cr-section cr-white" id="product">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>כל מה שצריך לנהל.</span>
              <span>במקום אחד.</span>
            </h2>
            <p className="cr-lead cr-mt cr-strong">במקום לחבר מידע מ־Shopify, Excel ו־WhatsApp — הפעילות כולה נמצאת ב־Hiloomy.</p>
          </div>
          <div className="cr-features" data-reveal>
            <div className="cr-feature">
              <Icon kind="users" />
              <h3>יוצרים</h3>
              <p>פרטים, סטטוסים, תוכניות והיסטוריית פעילות.</p>
            </div>
            <div className="cr-feature">
              <Icon kind="tag" />
              <h3>קודים ולינקים</h3>
              <p>צרו חדשים או חברו את הקודים שכבר קיימים ב־Shopify.</p>
            </div>
            <div className="cr-feature">
              <Icon kind="percent" />
              <h3>עמלות</h3>
              <p>Hiloomy מחשבת כמה מגיע לכל יוצר לפי הכללים שלכם.</p>
            </div>
            <div className="cr-feature">
              <Icon kind="check" />
              <h3>תשלומים</h3>
              <div className="cr-status-flow" aria-label="ממתין, מאושר, שולם">
                <span className="cr-pill wait">ממתין</span>
                <Arrow />
                <span className="cr-pill ok">מאושר</span>
                <Arrow />
                <span className="cr-pill paid">שולם</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------ 5 · Rollout + price */}
      <section className="cr-section" id="pricing">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">מתחילים עם מה שכבר יש לכם.</h2>
            <p className="cr-lead cr-mt cr-strong">לא צריך להתחיל מחדש. אנחנו מחברים את הפעילות שכבר קיימת אצלכם ל־Hiloomy.</p>
          </div>
          <ol className="cr-steps" data-reveal>
            <li>
              <span className="cr-step-n">01</span>
              <h3>מחברים Shopify</h3>
            </li>
            <li>
              <span className="cr-step-n">02</span>
              <h3>מייבאים יוצרים וקודים</h3>
            </li>
            <li>
              <span className="cr-step-n">03</span>
              <h3>מגדירים עמלות ועולים לאוויר</h3>
            </li>
          </ol>
          <div className="cr-price-card" data-reveal>
            <div className="cr-offer">
              <h3>הקמה והטמעה</h3>
              <div className="cr-price-amount">
                <N>2,500–3,500 ₪</N>
              </div>
              <div className="cr-price-kind">חד־פעמי</div>
              <p className="desc">חיבור Shopify, ייבוא המידע והגדרת המערכת.</p>
            </div>
            <div className="cr-offer">
              <h3>מערכת ותחזוקה</h3>
              <div className="cr-price-amount">
                <N>250 ₪</N> <small>/ חודש</small>
              </div>
              <ul className="cr-price-lines">
                <li>ללא הגבלת יוצרים</li>
                <li>ללא התחייבות</li>
                <li className="strong">
                  <N>0%</N> עמלה על המכירות
                </li>
              </ul>
            </div>
          </div>
          <p className="cr-price-note cr-center" data-reveal>
            היוצרים, הקשר והדאטה נשארים שלכם.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------- 6 · Final CTA */}
      <section className="cr-section cr-contact" id="contact">
        <div className="cr-wrap cr-contact-grid">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>אתם כבר עובדים עם יוצרים.</span>
              <span>עכשיו תדעו מה הם באמת מייצרים.</span>
            </h2>
            <p className="cr-final-line">מי מוכר. מה נמכר. כמה נמכר. וכמה צריך לשלם.</p>
            <p className="cr-lead cr-mt-s">ובמקביל — לכל יוצר יש מקום משלו לראות את הביצועים והעמלות שלו.</p>
            <p className="cr-contact-alt">
              מעדיפים מייל? <a href={`mailto:${CONTACT_EMAIL}?subject=Hiloomy%20Creator`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
          <div data-reveal>
            <LeadForm cta={CTA_FINAL} />
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
