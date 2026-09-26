import type { CSSProperties, ReactNode } from "react";
import "./creators-landing.css";
import {
  BadgeCheck,
  Calculator,
  ChevronDown,
  FolderInput,
  Megaphone,
  Plug,
  Rocket,
  ShoppingBag,
  SlidersHorizontal,
  TicketPercent
} from "lucide-react";
import { HiloomyLogo, HiloomyMark } from "@/components/ui/logo";
import { CreatorsNav } from "./creators-nav";
import { HeroDashboard } from "./hero-dashboard";
import { LeadForm } from "./lead-form";
import { RevealOnScroll } from "./reveal";
import { SourceFlow } from "./source-flow";
import { StickyCta } from "./sticky-cta";

// Hiloomy Creator — public landing (Hebrew, RTL). Server component; the
// interactive bits (nav sheet, form, reveal, sticky CTA) are client islands.
//
// Eighth pass (23 Sep 2026): visual redesign on Emil Kowalski's design-
// engineering rules — neutral paper canvas, ink headings with a brand-green
// second line, size-specific tracking, hairline + layered shadows, translucent
// nav, press feedback on every pressable, custom ease-out curves, short
// staggers, hover gated to fine pointers, reduced-motion fallbacks. Copy
// follows the owner-approved review of 23 Sep 2026, de-duplicated on 24 Sep
// 2026 so each claim has one home: "start from what you have" in the hero
// bullet, the #how heading and step 2; 0% in the #pricing heading, and once
// more as the closing line of the bill under it. Headings trimmed the same day so
// every two-line h2 stays two lines from 360 to 1440px; the h1 balances to
// four phrase-aligned lines below ~520px. The #problem heading opens on the
// codes, not "influencers are routine", so it no longer restates the h1's
// "באופן קבוע". Shopify, WooCommerce and Wix are shown as equals (owner's
// call, 23 Sep 2026).
// Hiloomy does not move money, so the page says "מעקב תשלום", never
// "תשלום למשפיען".
// Sample figures are consistent: Maya 73 orders (61 via code MAYA15 =
// 15,870 ₪), 18,430 ₪ sales, fee 1,843 ₪ = 10%, 67% new customers.

const CTA = "בואו נדבר על המשפיענים שלכם";
const CTA_FORM = "בקשו שיחת היכרות";
const CONTACT_EMAIL = "yoadhakimv@gmail.com";

function N({ children }: { children: ReactNode }) {
  return <span className="cr-num">{children}</span>;
}

// Stagger index for [data-reveal] / .cr-enter children (CSS multiplies it).
const at = (i: number) => ({ "--i": i }) as CSSProperties;

function Check() {
  return (
    <svg className="cr-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const HERO_ROWS = [
  {
    initial: "מ",
    tone: "",
    name: "מאיה כהן",
    code: "MAYA15",
    sales: "18,430 ₪",
    orders: "73",
    fee: "1,843 ₪",
    status: "מאושר לתשלום",
    pill: "ok"
  },
  {
    initial: "נ",
    tone: "b",
    name: "נועה לוי",
    code: "NOA10",
    sales: "14,120 ₪",
    orders: "52",
    fee: "1,412 ₪",
    status: "ממתין לאישור",
    pill: "wait"
  },
  {
    initial: "ד",
    tone: "c",
    name: "דניאל ברק",
    code: "DANI",
    sales: "9,870 ₪",
    orders: "36",
    fee: "987 ₪",
    status: "שולם",
    pill: "paid"
  }
];

// 30 days of sample daily sales for Maya's card (shape only, no axis).
const SPARK = [8, 11, 9, 14, 12, 13, 17, 15, 14, 19, 18, 22, 19, 24, 23, 21, 26, 25, 29, 27, 31, 29, 33, 32, 34, 33, 37, 35, 39, 38];
const SPARK_LINE = SPARK.map((v, i) => `${i ? "L" : "M"}${((i * 120) / (SPARK.length - 1)).toFixed(1)} ${(42 - v).toFixed(1)}`).join(" ");
const SPARK_AREA = `${SPARK_LINE} L120 44 L0 44 Z`;

const PRODUCTS = [
  { name: "סט מתנה", orders: 31 },
  { name: "בושם 50 מ״ל", orders: 24 },
  { name: "קרם ידיים", orders: 18 }
];

// Each step carries an icon instead of a number: the sequence reads from the
// connecting line, and the icon says what happens at that point.
const ICON = { size: 19, strokeWidth: 1.8, "aria-hidden": true } as const;

// Colour code used across the page: orange = the influencer and their codes
// (the logo's arrow), green = the brand and Hiloomy (the logo's H).
const CHAIN: { text: string; icon: ReactNode; creator?: boolean }[] = [
  { text: "המשפיען מפרסם", icon: <Megaphone {...ICON} />, creator: true },
  { text: "הלקוח משתמש בקוד או בלינק", icon: <TicketPercent {...ICON} />, creator: true },
  { text: "ההזמנה נכנסת לחנות", icon: <ShoppingBag {...ICON} /> },
  { text: "Hiloomy משייכת את המכירה", icon: <HiloomyMark className="h-6 w-6" /> },
  { text: "העמלה מחושבת", icon: <Calculator {...ICON} /> },
  { text: "המותג מאשר את העמלה ועוקב אחרי סטטוס התשלום", icon: <BadgeCheck {...ICON} /> }
];

const STEPS: { title: string; text: string; icon: ReactNode }[] = [
  { title: "מחברים", text: "את חנות האונליין.", icon: <Plug {...ICON} /> },
  { title: "מייבאים", text: "את המשפיענים, הקודים והנתונים הקיימים.", icon: <FolderInput {...ICON} /> },
  { title: "מגדירים", text: "את מודל העמלות ותהליך העבודה.", icon: <SlidersHorizontal {...ICON} /> },
  { title: "עולים לאוויר", text: "ועוקבים אחרי מכירות, עמלות וסטטוסי תשלום.", icon: <Rocket {...ICON} /> }
];

const FAQ = [
  {
    q: "האם Hiloomy מוצאת עבורנו משפיענים?",
    a: "לא. Hiloomy מיועדת למותגים שכבר עובדים עם משפיענים."
  },
  {
    q: "האם המשפיענים שלנו יצטרכו קודים חדשים?",
    a: "לא. אנחנו מחברים למערכת את הקודים שכבר יש להם."
  },
  {
    q: "איך Hiloomy יודעת איזו מכירה שייכת לאיזה משפיען?",
    a: "אנחנו מגדירים במערכת את הקודים והלינקים של כל משפיען. Hiloomy משייכת אליו את המכירות שהגיעו דרכם."
  },
  {
    q: "מה קורה אם הזמנה בוטלה או הוחזרה?",
    a: "אם הזמנה בוטלה או הוחזרה, גם נתוני המכירה והעמלה מתעדכנים."
  },
  {
    q: "האם Hiloomy משלמת את העמלה למשפיען?",
    a: "לא. Hiloomy מחשבת את העמלות ומציגה את סטטוס התשלום. את הכסף למשפיענים אתם מעבירים בעצמכם."
  }
];

export function CreatorsLanding() {
  return (
    <div className="cr-root" dir="rtl" lang="he">
      <RevealOnScroll />
      <CreatorsNav cta={CTA} />

      {/* ---------------------------------------------------------- 1 · Hero */}
      <section className="cr-hero" id="top" data-nav-dark>
        <div className="cr-hero-glow" aria-hidden="true" />
        <div className="cr-dots cr-hero-dots" aria-hidden="true" />
        <div className="cr-wrap">
          {/* One viewport: the message, then the live dashboard right under the
              button, cropped by the hero's bottom edge (continues below the fold). */}
          <div className="cr-hero-first">
            <div className="cr-hero-text">
              <h1 className="cr-h1 cr-enter" style={at(0)}>
                <span>
                  נהלו את מערך המשפיענים <span className="cr-nw">בלי אקסלים</span>
                </span>
                <span className="accent">
                  ובלי לשלם לפלטפורמה <span className="cr-nw">אחוז מכל מכירה</span>
                </span>
              </h1>
              <p className="cr-lead cr-enter" style={at(1)}>
                Hiloomy משייכת מכירות לכל משפיען לפי הקודים והלינקים שלו, מחשבת עמלות ומרכזת סטטוסי תשלום.
              </p>
              <div className="cr-hero-actions cr-enter" style={at(2)}>
                <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg">
                  {CTA}
                </a>
              </div>
            </div>
          </div>
          <div className="cr-hero-stage cr-enter" style={at(3)}>
            <HeroDashboard />
          </div>
        </div>
        {/* Sits on the hero's bottom fade, over the cropped dashboard: says "there's more". */}
        <a href="#problem" className="cr-scroll-cue cr-enter" style={at(5)}>
          גללו להמשך
          <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
        </a>
      </section>

      {/* ------------------------------------------------- 2 · The problem */}
      <section className="cr-section" id="problem">
        <div className="cr-wrap cr-split">
          <div data-reveal>
            <h2 className="cr-h2">
              <span>המשפיענים כבר פעילים</span>
              <span className="dim">המעקב עדיין מפוזר</span>
            </h2>
            <p className="cr-lead">השיחות עם המשפיענים ב־WhatsApp, הקודים וההזמנות בחנות, והעמלות באקסל.</p>
            <p className="cr-lead">בסוף החודש אתם צריכים לברר מי מכר כמה, איזו עמלה מגיעה לכל אחד ומה כבר שולם.</p>
          </div>
          <div data-reveal style={at(1)}>
            <SourceFlow />
          </div>
        </div>
      </section>

      {/* -------------------------------------------- 3 · Code → fee chain */}
      <section className="cr-section cr-band" id="flow">
        <div className="cr-wrap cr-split">
          <div data-reveal>
            <h2 className="cr-h2">
              <span>מהקוד ועד העמלה</span>
              <span className="dim">המכירות משויכות אוטומטית</span>
            </h2>
            <p className="cr-lead">בלי להצליב ידנית קודים, הזמנות וגיליונות.</p>
          </div>
          <div className="cr-feed-wrap" data-reveal style={at(1)}>
            <div className="cr-feed">
              <span className="cr-feed-track" aria-hidden="true" />
              <ol aria-label="מהפרסום ועד מעקב התשלום">
                {CHAIN.map((step, i) => (
                  <li
                    key={step.text}
                    className={`cr-feed-item${step.creator ? " creator" : ""}${i === CHAIN.length - 1 ? " last" : ""}`}
                    style={at(i)}
                  >
                    <span className="cr-feed-icon">{step.icon}</span>
                    <h3>{step.text}</h3>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- 4 · Two sides */}
      <section className="cr-section" id="sides">
        <div className="cr-wrap">
          <div className="cr-head-center" data-reveal>
            <h2 className="cr-h2">
              <span>שליטה למותג</span>
              <span className="dim">שקיפות למשפיען</span>
            </h2>
          </div>
          <div className="cr-sides">
            <div className="cr-bento" data-reveal>
              <div className="cr-bento-visual dark cr-dark-ui" aria-hidden="true">
                <div className="cr-dots" />
                <ul className="cr-mini">
                  {HERO_ROWS.map((r) => (
                    <li key={r.code}>
                      <span className={`cr-avatar ${r.tone}`}>{r.initial}</span>
                      <span className="cr-mini-name">{r.name}</span>
                      <span className="cr-code">{r.code}</span>
                      <span className="cr-mini-fee">
                        <N>{r.fee}</N>
                      </span>
                      <span className={`cr-pill ${r.pill}`}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="cr-bento-body">
                <span className="cr-tag">מה המותג רואה</span>
                <ul className="cr-checks cr-checks-two">
                  {["מי מוביל במכירות", "כמה הזמנות הביא כל קוד", "כמה עמלה מגיעה לכל משפיען", "מה כבר שולם ומה עדיין פתוח"].map((t) => (
                    <li key={t}>
                      <Check />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="cr-bento" data-reveal style={at(1)}>
              <div className="cr-bento-visual warm">
                <div className="cr-dots" aria-hidden="true" />
                <div className="cr-phone" aria-label="האזור האישי של המשפיענית">
                  <div className="cr-phone-notch" aria-hidden="true" />
                  <div className="cr-phone-head">היי מאיה</div>
                  <div className="cr-phone-stat">
                    <span>מכירות</span>
                    <b>
                      <N>18,430 ₪</N>
                    </b>
                  </div>
                  <div className="cr-phone-stat">
                    <span>הזמנות</span>
                    <b>
                      <N>73</N>
                    </b>
                  </div>
                  <div className="cr-phone-stat pos">
                    <span>עמלה</span>
                    <b>
                      <N>1,843 ₪</N>
                    </b>
                  </div>
                  <span className="cr-pill ok">מאושר לתשלום</span>
                </div>
              </div>
              <div className="cr-bento-body">
                <span className="cr-tag alt">מה המשפיען רואה</span>
                <ul className="cr-checks cr-checks-two">
                  {["כמה מכרתי", "כמה הזמנות הגיעו דרכי", "כמה עמלה צברתי", "מה מצב התשלום שלי"].map((t) => (
                    <li key={t}>
                      <Check />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <p className="cr-quote" data-reveal>
            פחות הודעות של <span className="cr-nw">״כמה יצא לי?״</span> ו<span className="cr-nw">״כבר שילמתם?״</span> ב־WhatsApp. יותר תשובות באזור
            האישי.
          </p>
        </div>
      </section>

      {/* ------------------------------------ 5 · One creator's performance */}
      <section className="cr-section cr-band" id="performance">
        <div className="cr-wrap cr-split">
          <div data-reveal>
            <h2 className="cr-h2">
              <span>לא רק כמה נמכר</span>
              <span className="dim">גם מה נמכר ובאיזו דרך</span>
            </h2>
            <dl className="cr-micro">
              <div>
                <dt>לקוחות חדשים מול חוזרים</dt>
                <dd>תראו מי מביא לקוחות חדשים ומי מוכר בעיקר ללקוחות חוזרים.</dd>
              </div>
              <div>
                <dt>קוד מול לינק</dt>
                <dd>תראו כמה מכירות הגיעו מקוד וכמה מלינק.</dd>
              </div>
            </dl>
          </div>
          <div data-reveal style={at(1)}>
            <div className="cr-panel cr-creator" aria-label="ביצועי משפיענית אחת">
              <div className="cr-ui-head">
                <span className="cr-who">
                  <span className="cr-avatar lg">מ</span>
                  <span className="stack">
                    <span className="cr-who-name">מאיה כהן</span>
                    <span className="cr-handle">@maya.cohen</span>
                  </span>
                </span>
                <span className="cr-ui-sub">30 הימים האחרונים</span>
              </div>
              <div className="cr-tiles">
                <div className="cr-tile wide">
                  <div>
                    <span>מכירות</span>
                    <b>
                      <N>
                        18,430<span className="cur">₪</span>
                      </N>
                    </b>
                  </div>
                  <svg className="cr-spark" viewBox="0 0 120 44" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="cr-spark-stroke" x1="0" y1="0" x2="1" y2="0">
                        <stop className="s-brand" offset="0.62" />
                        <stop className="s-spark" offset="1" />
                      </linearGradient>
                      <linearGradient id="cr-spark-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop className="s-brand" offset="0" stopOpacity="0.28" />
                        <stop className="s-brand" offset="1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="area" d={SPARK_AREA} fill="url(#cr-spark-fill)" />
                    <path className="line" d={SPARK_LINE} pathLength={1} />
                  </svg>
                </div>
                <div className="cr-tile">
                  <span>הזמנות</span>
                  <b>
                    <N>73</N>
                  </b>
                </div>
                <div className="cr-tile">
                  <span>עמלה</span>
                  <b className="pos">
                    <N>
                      1,843<span className="cur">₪</span>
                    </N>
                  </b>
                </div>
                <div className="cr-tile">
                  <span>לקוחות חדשים</span>
                  <b>
                    <N>67%</N>
                  </b>
                  <i className="cr-meter" aria-hidden="true">
                    <i style={{ width: "67%" }} />
                  </i>
                </div>
              </div>
              <div className="cr-codebar">
                <span className="cr-code big">MAYA15</span>
                <span>
                  <N>61</N> הזמנות · <N>15,870 ₪</N> מכירות
                </span>
              </div>
              <div className="cr-ui-sect">המוצרים שמאיה מוכרת</div>
              <ol className="cr-top">
                {PRODUCTS.map((p, i) => (
                  <li key={p.name}>
                    <span className="n">{i + 1}</span>
                    <span className="name">{p.name}</span>
                    <span className="bar" aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.round((p.orders / PRODUCTS[0].orders) * 100)}%`
                        }}
                      />
                    </span>
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
      <section className="cr-section" id="how">
        <div className="cr-wrap">
          <div className="cr-head-center" data-reveal>
            <h2 className="cr-h2">
              <span>כבר יש לכם משפיענים?</span>
              <span className="dim">לא צריך להתחיל מחדש</span>
            </h2>
            <p className="cr-lead">אנחנו מחברים ל־Hiloomy את החנות, המשפיענים והקודים שכבר יש לכם.</p>
          </div>
          <div className="cr-steps-panel" data-reveal>
            <span className="cr-steps-track" aria-hidden="true" />
            <ol className="cr-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} style={at(i)}>
                  <span className="cr-step-icon">{s.icon}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- 7 · Price and 0% */}
      {/* One dark section, one offer. The heading states the promise (0%);
          the card is the bill that proves it: the monthly fee is the one hero
          figure, the one-time setup sits under it at half the size with what
          it pays for, and the 0% closes the bill as a single line (its old
          "מהמכירות של המשפיענים שלכם" detail only restated the heading and
          the line's own name), right above the CTA and the fine print.
          data-inline-cta hides the phone sticky bar while this button is on
          screen (sticky-cta.tsx). */}
      <section className="cr-section cr-zero" id="pricing" data-nav-dark>
        <div className="cr-dots" aria-hidden="true" />
        <div className="cr-wrap">
          <div className="cr-head-center" data-reveal>
            <h2 className="cr-h2">
              <span>מחיר ברור מראש</span>
              <span className="dim">
                <N>0%</N> עמלה ל־Hiloomy
              </span>
            </h2>
            <p className="cr-lead">המשפיענים שלכם. הנתונים שלכם. המכירות שלכם.</p>
          </div>
          <div className="cr-offer" data-reveal style={at(1)}>
            <div className="cr-offer-row is-hero" style={at(0)}>
              <h3>שימוש במערכת</h3>
              <p className="cr-offer-amt">
                <N>
                  250<span className="cur">₪</span>
                </N>
                <small>לחודש</small>
              </p>
              <p className="cr-offer-desc">סנכרון הנתונים ותחזוקה טכנית.</p>
              <p className="cr-offer-perk">
                <Check />
                ללא הגבלת משפיענים
              </p>
            </div>
            <div className="cr-offer-row" style={at(1)}>
              <h3>הקמה והטמעה</h3>
              <p className="cr-offer-amt">
                <N>
                  2,500–3,500<span className="cur">₪</span>
                </N>
                <small>חד־פעמי</small>
              </p>
              <p className="cr-offer-desc">חיבור החנות, ייבוא המשפיענים והקודים, והגדרת מודל העמלות.</p>
            </div>
            <div className="cr-offer-row" style={at(2)}>
              <h3>עמלת Hiloomy על המכירות</h3>
              <p className="cr-offer-amt">
                <N>0%</N>
                <small>תמיד</small>
              </p>
            </div>
            <a href="#contact" className="cr-btn cr-btn-primary cr-btn-lg cr-offer-cta" data-inline-cta>
              {CTA}
            </a>
            <p className="cr-offer-note">ניהול שוטף, גיוס משפיענים וניהול קמפיינים לא כלולים במחיר, אלא אם סוכם אחרת.</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- 9 · FAQ */}
      <section className="cr-section cr-band" id="faq">
        <div className="cr-wrap cr-split cr-faq-wrap">
          <div data-reveal>
            <h2 className="cr-h2">שאלות נפוצות</h2>
          </div>
          <div className="cr-faq" data-reveal style={at(1)}>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <span className="cr-plus" aria-hidden="true" />
                </summary>
                <div className="cr-faq-a">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ 10 · Final CTA */}
      <section className="cr-section cr-contact" id="contact" data-nav-dark>
        <div className="cr-dots cr-contact-dots" aria-hidden="true" />
        <div className="cr-wrap cr-split cr-contact-grid">
          <div data-reveal>
            <h2 className="cr-h2">
              <span>עובדים עם משפיענים?</span>
              <span className="dim">בואו נעשה סדר במכירות</span>
            </h2>
            <p className="cr-lead">השאירו פרטים לשיחת היכרות. נבין איך אתם עובדים היום ונראה איך Hiloomy יכולה להשתלב אצלכם.</p>
            <p className="cr-contact-alt">
              מעדיפים מייל? <a href={`mailto:${CONTACT_EMAIL}?subject=Hiloomy%20Creator`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
          <div className="cr-form-card" data-reveal style={at(1)}>
            <LeadForm cta={CTA_FORM} />
          </div>
        </div>
      </section>

      <footer className="cr-footer">
        <div className="cr-wrap cr-footer-bar">
          <span className="cr-logo">
            <HiloomyLogo textClassName="cr-wordmark" />
            <span className="cr-logo-sub">Creator</span>
          </span>
          <nav className="cr-footer-links" aria-label="קישורים">
            <a href="/welcome">Hiloomy למותגים</a>
            <a href="/privacy">פרטיות</a>
            <a href="/terms">תנאי שימוש</a>
          </nav>
          <span className="cr-copy">
            © <N>2026</N> Hiloomy
          </span>
        </div>
      </footer>

      <StickyCta />
    </div>
  );
}
