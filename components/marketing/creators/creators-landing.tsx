import Link from "next/link";
import "./creators-landing.css";
import { HiloomyLogo } from "@/components/ui/logo";
import { CreatorsNav } from "./creators-nav";
import { LeadForm } from "./lead-form";
import { RevealOnScroll } from "./reveal";

// Hiloomy Creator — public landing (Hebrew, RTL). Server component; the
// interactive bits (nav sheet, form, reveal) are small client islands.
//
// Fourth pass (owner copy + UI brief, 20 Sep 2026): six short sections,
// each doing one job, none a full screen tall. The page leans on one line —
// "לא רק מי פרסם. מי באמת מכר." — and proves it through
// creator → code → product → sale → fee. One dashboard only (section 3);
// section 4 is a small flow, section 5 four short benefits, section 6
// rollout + price, then the form. The dropped "not a marketplace" /
// "yours stays yours" / "the mess" sections survive as single lines.
// Sample figures are consistent: Maya's 73 orders = 61 via code + 12 via
// link; 18,430 ₪ = 15,870 via code + 2,560 via link.

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

const CREATOR_RANK = [
  { name: "מאיה כהן", sales: "18,430 ₪", pct: 100 },
  { name: "נועה לוי", sales: "14,120 ₪", pct: 77 },
  { name: "דניאל ברק", sales: "9,870 ₪", pct: 54 }
];

const CODES = [
  { code: "MAYA15", who: "מאיה כהן", orders: "61", sales: "15,870 ₪", lead: true },
  { code: "NOA10", who: "נועה לוי", orders: "52", sales: "14,120 ₪", lead: false },
  { code: "DANI", who: "דניאל ברק", orders: "36", sales: "9,870 ₪", lead: false }
];

const PRODUCTS = [
  { name: "סט מתנה", orders: "31", pct: 100 },
  { name: "בושם 50 מ״ל", orders: "24", pct: 77 },
  { name: "קרם ידיים", orders: "18", pct: 58 }
];

const FLOW = ["יוצרת", "קוד / לינק", "רכישה ב־Shopify", "מכירה משויכת", "ביצועים", "עמלה"];

export function CreatorsLanding() {
  return (
    <div className="cr-root" dir="rtl" lang="he">
      <RevealOnScroll />
      <CreatorsNav />

      {/* ---------------------------------------------------------- 1 · Hero */}
      <section className="cr-hero" id="top">
        <div className="cr-wrap cr-hero-inner" data-reveal>
          <span className="cr-eyebrow">ניהול יוצרים ומשפיענים למותגי E-commerce</span>
          <h1 className="cr-h1">
            <span>לא רק מי פרסם.</span>
            <span className="accent">מי באמת מכר.</span>
          </h1>
          <p className="cr-lead cr-hero-lead">
            Hiloomy מרכזת במקום אחד את ניהול היוצרים, קודי הקופון, המכירות, הביצועים והעמלות — ומאפשרת לכם לראות{" "}
            <strong className="cr-strong">מי מייצר הכנסות, מה הוא מוכר וכמה צריך לשלם לו.</strong>
          </p>
          <p className="cr-lead cr-hero-lead">ובצד השני, לכל יוצרת ומשפיענית יש אזור אישי שבו היא יכולה לעקוב אחרי המכירות, הביצועים והעמלות שלה.</p>
          <p className="cr-hero-claim">שני הצדדים. מערכת אחת. נתונים אמיתיים מהמכירה.</p>
          <div className="cr-hero-actions">
            <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
              {CTA}
            </a>
          </div>
          <p className="cr-trust">
            <span>מתחבר ל־Shopify</span>
            <span>ללא הגבלת יוצרים</span>
            <span>
              <N>0%</N>&nbsp;עמלה על המכירות
            </span>
          </p>
        </div>
      </section>

      {/* ----------------------------------------------- 2 · Two sides */}
      <section className="cr-section cr-white" id="sides">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>אתם מנהלים את העסק.</span>
              <span>היוצרים רואים את הצד שלהם.</span>
            </h2>
            <p className="cr-lead cr-mt">מערך יוצרים לא מורכב רק מדשבורד למותג.</p>
            <p className="cr-lead cr-mt-s">
              Hiloomy נותנת <strong className="cr-strong">לשני הצדדים</strong> את מה שהם צריכים כדי לעבוד בצורה מסודרת ושקופה.
            </p>
          </div>
          <div className="cr-sides" data-reveal>
            <div className="cr-side">
              <span className="cr-side-tag">לעסק</span>
              <h3 className="cr-h3">לנהל את כל מערך היוצרים במקום אחד:</h3>
              <dl className="cr-items">
                <div>
                  <dt>יוצרים ומשפיענים</dt>
                  <dd>פרטים, סטטוסים, קודים, לינקים והיסטוריית פעילות.</dd>
                </div>
                <div>
                  <dt>מכירות וביצועים</dt>
                  <dd>מי מוכר, כמה הוא מוכר ואילו מוצרים עובדים דרכו.</dd>
                </div>
                <div>
                  <dt>עמלות ותשלומים</dt>
                  <dd>כמה צריך לשלם, מה ממתין לאישור ומה כבר שולם.</dd>
                </div>
              </dl>
            </div>
            <div className="cr-side creator">
              <span className="cr-side-tag alt">ליוצרת</span>
              <h3 className="cr-h3">אזור אישי שבו היא יכולה לראות:</h3>
              <dl className="cr-items">
                <div>
                  <dt>כמה מכרתי?</dt>
                  <dd>המכירות וההזמנות שמשויכות אליי.</dd>
                </div>
                <div>
                  <dt>כמה הרווחתי?</dt>
                  <dd>העמלה שנצברה מהפעילות שלי.</dd>
                </div>
                <div>
                  <dt>מה סטטוס התשלום?</dt>
                  <dd>ממתין, אושר או שולם.</dd>
                </div>
                <div>
                  <dt>מה הקוד והלינק שלי?</dt>
                  <dd>כל מה שצריך כדי לעבוד עם המותג במקום אחד.</dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="cr-closing cr-center" data-reveal>
            פחות שאלות ב־WhatsApp. יותר שקיפות לשני הצדדים.
          </p>
        </div>
      </section>

      {/* ------------------------------------------- 3 · Who really sells */}
      <section className="cr-section" id="performance">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">תדעו מי באמת מוכר לכם.</h2>
            <p className="cr-lead cr-mt">לא עוד להסתכל רק על צפיות, לייקים או כמה תוכן עלה.</p>
            <p className="cr-lead cr-mt-s">
              Hiloomy מחברת בין הפעילות של כל יוצר לבין המכירות בפועל — כדי שתוכלו להבין{" "}
              <strong className="cr-strong">מי מייצר הכנסות, איזה קוד עובד ואילו מוצרים נמכרים דרכו.</strong>
            </p>
          </div>

          <div className="cr-three" data-reveal>
            <div>
              <h3>ביצועי יוצרים</h3>
              <p>ראו כמה מכירות והזמנות כל יוצר מייצר והשוו את הביצועים שלהם במקום אחד.</p>
            </div>
            <div>
              <h3>קודי קופון</h3>
              <p>כל קוד מחובר ליוצר שלו. ראו כמה פעמים השתמשו בו, כמה הזמנות הוא יצר וכמה הכנסות הגיעו דרכו.</p>
            </div>
            <div>
              <h3>מוצרים מובילים</h3>
              <p>
                גלו <strong className="cr-strong">מה כל יוצר מצליח למכור בפועל.</strong> לא רק כמה כסף נכנס — אלא איזה מוצר הניע את המכירה.
              </p>
            </div>
          </div>

          <div data-reveal>
            <div className="cr-ui cr-dash" aria-label="ביצועי יוצרים, קודי קופון ומוצרים מובילים">
              <div className="cr-ui-head">
                <div>
                  <div className="cr-ui-title">ביצועי יוצרים</div>
                  <div className="cr-ui-sub">
                    30 הימים האחרונים · <N>38</N> יוצרים פעילים
                  </div>
                </div>
                <span className="cr-pill ok">מחובר ל־Shopify</span>
              </div>
              <div className="cr-dash-grid">
                {/* Creator performance */}
                <div className="cr-dash-panel">
                  <div className="cr-dash-label">ביצועי יוצרים</div>
                  <div className="cr-dash-focus">
                    <span className="cr-who">
                      <span className="cr-avatar">מ</span>
                      <span className="stack">
                        <span>מאיה כהן</span>
                        <span className="cr-handle">@maya.cohen</span>
                      </span>
                    </span>
                    <span className="cr-pill ok">פעילה</span>
                  </div>
                  <div className="cr-stats3">
                    <div>
                      <span className="v">
                        <N>18,430 ₪</N>
                      </span>
                      <span className="l">מכירות</span>
                    </div>
                    <div>
                      <span className="v">
                        <N>73</N>
                      </span>
                      <span className="l">הזמנות</span>
                    </div>
                    <div>
                      <span className="v">
                        <N>67%</N>
                      </span>
                      <span className="l">לקוחות חדשים</span>
                    </div>
                  </div>
                  <div className="cr-dash-sub">השוואה בין יוצרים · מכירות</div>
                  <ul className="cr-rank">
                    {CREATOR_RANK.map((r) => (
                      <li key={r.name}>
                        <span className="cr-rank-row">
                          <span className="name">{r.name}</span>
                          <span className="val">
                            <N>{r.sales}</N>
                          </span>
                        </span>
                        <span className="cr-bar">
                          <span style={{ width: `${r.pct}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Coupon codes */}
                <div className="cr-dash-panel">
                  <div className="cr-dash-label">קודי קופון</div>
                  <ul className="cr-codes">
                    {CODES.map((c) => (
                      <li key={c.code} className={c.lead ? "lead" : ""}>
                        <span className="cr-codes-top">
                          <span className="cr-code big">{c.code}</span>
                          <span className="cr-ui-sub">{c.who}</span>
                        </span>
                        <span className="cr-codes-nums">
                          <b>
                            <N>{c.orders}</N> הזמנות
                          </b>
                          <span aria-hidden="true">·</span>
                          <b>
                            <N>{c.sales}</N> מכירות
                          </b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Top products */}
                <div className="cr-dash-panel">
                  <div className="cr-dash-label">מוצרים מובילים · מאיה כהן</div>
                  <ul className="cr-rank products">
                    {PRODUCTS.map((p) => (
                      <li key={p.name}>
                        <span className="cr-rank-row">
                          <span className="name">{p.name}</span>
                          <span className="val">
                            <N>{p.orders}</N> הזמנות
                          </span>
                        </span>
                        <span className="cr-bar">
                          <span style={{ width: `${p.pct}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <p className="cr-sample">הנתונים לדוגמה בלבד.</p>
          </div>

          <div className="cr-center cr-glance" data-reveal>
            <p className="cr-glance-intro">ממבט אחד אפשר להבין:</p>
            <p className="cr-glance-line">
              <span>מי מוכר</span>
              <Arrow />
              <span>כמה הוא מוכר</span>
              <Arrow />
              <span>מה הוא מוכר</span>
              <Arrow />
              <span>וכמה הפעילות שלו שווה לעסק.</span>
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------ 4 · From code to fee */}
      <section className="cr-section cr-white" id="flow">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>המכירה קרתה.</span>
              <span>מכאן Hiloomy מחברת את הנקודות.</span>
            </h2>
            <p className="cr-lead cr-mt">כל יוצרת יכולה לקבל קוד קופון ו/או לינק אישי.</p>
            <p className="cr-lead cr-mt-s">כאשר מתבצעת רכישה, Hiloomy משייכת את המכירה ליוצרת ומעדכנת את הביצועים שלה.</p>
          </div>
          <ol className="cr-flowline" data-reveal aria-label="מיוצרת ועד עמלה">
            {FLOW.map((step, i) => (
              <li key={step} className={i === FLOW.length - 1 ? "accent" : ""}>
                <span className="cr-flowline-dot" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="cr-flowline-label">{step}</span>
              </li>
            ))}
          </ol>
          <div className="cr-center cr-narrow cr-after" data-reveal>
            <p className="cr-strong-line">הכול מחובר לאותה פעילות.</p>
            <p className="cr-lead cr-mt-s">כך אתם לא צריכים להגיע לסוף החודש ולנסות להבין ידנית:</p>
            <p className="cr-questions">
              <span>מי מכר?</span>
              <span>כמה מכר?</span>
              <span>כמה עמלה מגיעה לו?</span>
              <span>והאם כבר שילמנו?</span>
            </p>
            <p className="cr-closing accent">הנתונים כבר שם.</p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- 5 · Management */}
      <section className="cr-section" id="product">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">כל מערך היוצרים שלכם במקום אחד.</h2>
            <p className="cr-lead cr-mt">Hiloomy לא נועדה רק להראות נתונים.</p>
            <p className="cr-lead cr-mt-s">היא נותנת לצוות שלכם מקום אחד שממנו מנהלים את הפעילות היומיומית.</p>
          </div>
          <div className="cr-benefits" data-reveal>
            <div className="cr-benefit">
              <h3>ניהול יוצרים</h3>
              <p>הוסיפו יוצרים חדשים, נהלו סטטוסים וחברו אותם לתוכניות השונות שלכם.</p>
            </div>
            <div className="cr-benefit">
              <h3>קודים ולינקים</h3>
              <p>צרו קודים חדשים או חברו קודים שכבר קיימים ב־Shopify.</p>
            </div>
            <div className="cr-benefit">
              <h3>עמלות</h3>
              <p>הגדירו את מודל העמלה שלכם וראו אוטומטית כמה מגיע לכל יוצר.</p>
            </div>
            <div className="cr-benefit">
              <h3>תשלומים</h3>
              <p>עברו בצורה מסודרת בין:</p>
              <div className="cr-status-flow" aria-label="ממתין לאישור, מאושר לתשלום, שולם">
                <span className="cr-pill wait">ממתין לאישור</span>
                <Arrow />
                <span className="cr-pill ok">מאושר לתשלום</span>
                <Arrow />
                <span className="cr-pill paid">שולם</span>
              </div>
            </div>
          </div>
          <div className="cr-center cr-after" data-reveal>
            <p className="cr-lead">במקום לחבר מידע מ־Shopify, Excel ו־WhatsApp —</p>
            <p className="cr-closing tight">כולם עובדים מול אותה מערכת.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------ 6 · Rollout + price */}
      <section className="cr-section cr-white" id="pricing">
        <div className="cr-wrap">
          <div className="cr-center cr-narrow" data-reveal>
            <h2 className="cr-h2">מתחילים עם המערך שכבר בניתם.</h2>
            <p className="cr-lead cr-mt">לא צריך להתחיל מחדש.</p>
            <p className="cr-lead cr-mt-s">אנחנו לוקחים את הפעילות הקיימת שלכם ומעבירים אותה ל־Hiloomy.</p>
          </div>
          <ol className="cr-timeline" data-reveal>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">01</div>
              <h3>מחברים את Shopify</h3>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">02</div>
              <h3>מייבאים את היוצרים והקודים הקיימים</h3>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">03</div>
              <h3>מגדירים את מודל העמלות</h3>
            </li>
            <li className="cr-step">
              <span className="cr-step-dot" aria-hidden="true" />
              <div className="cr-step-n">04</div>
              <h3>פותחים את האזור האישי ליוצרים</h3>
            </li>
          </ol>
          <p className="cr-strong-line cr-center cr-timeline-end" data-reveal>
            ומתחילים לעבוד.
          </p>
          <div className="cr-price-grid" data-reveal>
            <div className="cr-price">
              <h3>הקמה והטמעה</h3>
              <div className="cr-price-amount">
                <N>2,500–3,500 ₪</N>
              </div>
              <div className="cr-price-kind">חד־פעמי</div>
              <p className="desc">כולל חיבור Shopify, הגדרת המערכת, ייבוא היוצרים והקודים והגדרת מודל העמלות.</p>
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
                <li>ללא הגבלת יוצרים</li>
                <li>ללא התחייבות</li>
                <li className="strong">
                  <N>0%</N> עמלה על המכירות שלכם
                </li>
              </ul>
            </div>
          </div>
          <p className="cr-price-note cr-center" data-reveal>
            היוצרים, הקשר והדאטה נשארים שלכם. Hiloomy אינה זירת יוצרים ולא לוקחת אחוז מהמכירות.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------- Final CTA */}
      <section className="cr-section cr-contact" id="contact">
        <div className="cr-wrap cr-contact-grid">
          <div data-reveal>
            <h2 className="cr-h2 cr-h2-lines">
              <span>אתם כבר עובדים עם יוצרים.</span>
              <span>השאלה היא אם אתם באמת יודעים מה הם מייצרים.</span>
            </h2>
            <p className="cr-lead cr-mt">Hiloomy נותנת לכם תמונה אחת ברורה:</p>
            <p className="cr-final-lines">
              <span>מי מוכר.</span>
              <span>מה נמכר.</span>
              <span>כמה הוא מכר.</span>
              <span>כמה צריך לשלם.</span>
            </p>
            <p className="cr-lead cr-mt">ובמקביל — נותנת ליוצרים שלכם מקום משלהם לראות בדיוק איפה הם עומדים.</p>
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
    </div>
  );
}
