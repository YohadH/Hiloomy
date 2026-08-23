// Source for the animated hero banner on /welcome.
//
// Why a separate module of HTML strings rather than JSX:
//
//   1. The banner is rendered inside an <iframe srcdoc>, because its CSS uses
//      short generic selectors (.card, .frame, .app, .tabs, .legend) that would
//      collide head-on with globals.css and Tailwind's preflight if inlined
//      into the page. The iframe is a hard style boundary.
//   2. Building the document as a template literal keeps it readable. The same
//      markup written directly into a JSX srcdoc attribute needs every quote
//      escaped as &quot;, which is unreviewable and unmaintainable.
//
// Bilingual: buildHeroBannerDoc("he") returns an RTL document with Hebrew copy
// and Hebrew-capable fonts. Product names, ROAS figures and the wordmark stay
// LTR-isolated so the bidi algorithm can't reorder them.

export type BannerLocale = "he" | "en";

// Palette. --green-deep and --orange are pulled from the /welcome page tokens
// (GREEN #14512C, ORANGE #D1731F) so the banner reads as part of the page and
// its CTA matches the page's real CTA button. --green stays the brighter
// chart/accent green and --leak the warmer alert tone; both only ever appear
// inside the banner, where nothing sits next to them to clash.
const PALETTE = `
    --green:#15A34A;
    --green-deep:#14512C;
    --orange:#D1731F;
    --leak:#C4551F;
    --ink:#201E1D;
    --muted:#5E7267;
    --paper:#FFFFFF;
    --line:rgba(20,81,44,.10);
    --line-soft:rgba(20,81,44,.06);
    --canvas-a:#EAF5EE;
    --canvas-b:#FBFDFB;
    --shadow:0 14px 40px rgba(20,81,44,.10);
    --shadow-sm:0 6px 18px rgba(20,81,44,.07);`;

// The Hiloomy monogram, inlined per use (an iframe can't reach the parent's
// sprite sheet). viewBox is cropped to the glyph so it baseline-aligns next to
// the wordmark.
const MARK = `<svg viewBox="14 4 78 100" aria-hidden="true"><rect x="16" y="40" width="22" height="64" rx="7" fill="#2E9E4F"/><rect x="32" y="62" width="32" height="18" rx="5" fill="#2E9E4F"/><rect x="52" y="40" width="26" height="64" rx="7" fill="#F5821F"/><path d="M40 43 L65 8 L90 43 Z" fill="#F5821F"/></svg>`;

const ICON_META = `<svg viewBox="0 0 64 64"><path d="M16 32C16 24 24 24 32 32 40 40 48 40 48 32 48 24 40 24 32 32 24 40 16 40 16 32Z" fill="none" stroke="#0866FF" stroke-width="5.4" stroke-linejoin="round"/></svg>`;
const ICON_GADS = `<svg viewBox="0 0 48 48"><rect x="13" y="9" width="8.5" height="28" rx="4.25" fill="#FBBC04" transform="rotate(21 17.25 23)"/><rect x="26" y="9" width="8.5" height="28" rx="4.25" fill="#4285F4" transform="rotate(-21 30.25 23)"/><circle cx="14" cy="34" r="4.6" fill="#34A853"/></svg>`;
const ICON_TIKTOK = `<svg viewBox="0 0 48 48"><path d="M30 12c1 3 3 5.2 6 5.6V22c-2.1 0-4.1-.6-6-1.8V29a8 8 0 1 1-8-8c.5 0 1 .05 1.5.13v4.3A3.8 3.8 0 1 0 26 29V12h4z" fill="#25F4EE" transform="translate(-1.6 1.4)"/><path d="M30 12c1 3 3 5.2 6 5.6V22c-2.1 0-4.1-.6-6-1.8V29a8 8 0 1 1-8-8c.5 0 1 .05 1.5.13v4.3A3.8 3.8 0 1 0 26 29V12h4z" fill="#FE2C55" transform="translate(1.6 -1.4)"/><path d="M30 12c1 3 3 5.2 6 5.6V22c-2.1 0-4.1-.6-6-1.8V29a8 8 0 1 1-8-8c.5 0 1 .05 1.5.13v4.3A3.8 3.8 0 1 0 26 29V12h4z" fill="#111"/></svg>`;
const ICON_IG = `<svg viewBox="0 0 48 48"><rect x="14" y="14" width="20" height="20" rx="6" fill="none" stroke="#fff" stroke-width="2.8"/><circle cx="24" cy="24" r="5" fill="none" stroke="#fff" stroke-width="2.8"/><circle cx="33" cy="15" r="2" fill="#fff"/></svg>`;
const ICON_GA4 = `<svg viewBox="0 0 48 48"><circle cx="15" cy="34" r="4.6" fill="#F9AB00"/><rect x="21" y="19" width="8" height="17" rx="4" fill="#F9AB00"/><rect x="31" y="12" width="8" height="24" rx="4" fill="#E8710A"/></svg>`;
const ICON_SHEETS = `<svg viewBox="0 0 48 48"><path d="M17 8h10l9 9v20a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" fill="#0F9D58"/><path d="M27 8l9 9h-9z" fill="#0C8043"/><rect x="19" y="23" width="14" height="12.5" fill="#fff"/><path d="M19 27.2h14M19 31.4h14M24 23v12.5M28.5 23v12.5" stroke="#0F9D58" stroke-width="1.5"/></svg>`;
const ICON_SHOPIFY = `<svg viewBox="0 0 48 48"><path d="M19.5 15.5v-1.6a4.5 4.5 0 0 1 9 0v1.6" fill="none" stroke="#6FAE4B" stroke-width="2.3" stroke-linecap="round"/><path d="M14.5 15.5h19l1.7 21a2.2 2.2 0 0 1-2.2 2.4H15a2.2 2.2 0 0 1-2.2-2.4z" fill="#95BF47"/><text x="24" y="34.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-style="italic" font-size="19" fill="#fff">S</text></svg>`;
const ICON_WOO = `<svg viewBox="5 15 38 19"><text x="24" y="30" text-anchor="middle" font-family="'Baloo 2',Arial,sans-serif" font-weight="800" font-size="16" fill="#fff">Woo</text></svg>`;

const ICON_ALERT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3v10M12 21a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z" stroke-linecap="round"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12.5 10 17 19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

interface Copy {
  fonts: string;
  display: string;
  sans: string;
  tabs: [string, string, string, string];
  period: string;
  kpis: { label: string; sub: string }[];
  chartTitle: string;
  legendRevenue: string;
  legendProfit: string;
  tipDay: string;
  tipRevenue: string;
  tipProfit: string;
  tipProducts: string;
  tipCampaigns: string;
  leakEyebrow: string;
  leakHeadBefore: string;
  leakHeadAfter: string;
  leakRows: { title: string; sub: string }[];
  // Portrait drops the "· potential +₪X/mo" tail — at 390px the full line
  // wraps to three rows and pushes the second card off the frame.
  leakRowsShort: { title: string; sub: string }[];
  leakClearTitle: string;
  leakClearSub: string;
  leakClear: string;
  fragSessions: string;
  fragRoas: string;
  fragRefund: string;
  fragRefundShort: string;
  caps: { eb: string; h: string }[];
  ctaTag: string;
  ctaBtn: string;
}

const EN: Copy = {
  fonts:
    "family=Baloo+2:wght@500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700;800",
  display: '"Bricolage Grotesque",Georgia,serif',
  sans: '"Manrope",system-ui,-apple-system,sans-serif',
  tabs: ["Dashboard", "Profit", "Traffic", "Leaks"],
  period: "Last 30 days",
  kpis: [
    { label: "Total Sales", sub: "before refunds &amp; fees" },
    { label: "Contribution Profit", sub: "42.9% margin kept" },
    { label: "Returning Rate", sub: "stickier brand" },
    { label: "Avg Order Value", sub: "per checkout" }
  ],
  chartTitle: "Revenue vs estimated profit",
  legendRevenue: "Revenue",
  legendProfit: "Profit",
  tipDay: "Aug 12",
  tipRevenue: "Revenue",
  tipProfit: "Profit",
  tipProducts: "Top products",
  tipCampaigns: "Meta Ads campaigns",
  leakEyebrow: "Hiloomy Leak Scan · Last 30 days",
  leakHeadBefore: "We found ",
  leakHeadAfter: " in profit leaks",
  leakRows: [
    {
      title: "Commissions paid on customers you already owned",
      sub: "Action: <b>set a reduced returning-customer policy</b> · potential +₪1,958/mo"
    },
    {
      title: "Discount codes selling at a loss after product cost",
      sub: "Action: <b>stop or shrink the flagged codes</b> · potential +₪1,901/mo"
    }
  ],
  leakRowsShort: [
    { title: "Commissions on customers you already owned", sub: "<b>Set a reduced returning-customer policy</b>" },
    { title: "Discount codes selling at a loss", sub: "<b>Stop or shrink the flagged codes</b>" }
  ],
  leakClearTitle: "Ad spend pushing high-return products",
  leakClearSub: "5 campaigns checked — none is pushing a high-return product.",
  leakClear: "Clear",
  fragSessions: "Sessions",
  fragRoas: "ROAS",
  fragRefund: "Refund rate",
  fragRefundShort: "Refund",
  caps: [
    { eb: "Meta · Google Ads · GA4 · Shopify · TikTok", h: "When your vision is blurred<br>by all the <em>data</em>…" },
    { eb: "One clear picture", h: "…the full picture comes into <em>focus</em>." },
    { eb: "Revenue vs profit", h: "Every number, finally <em>in focus</em>." },
    { eb: "Hiloomy Leak Scan", h: "See exactly where it <em>leaks</em>." }
  ],
  ctaTag: "Hiloomy makes your vision <em>clear</em>.",
  ctaBtn: "Start free →"
};

const HE: Copy = {
  // Suez One matches the /welcome display face; Heebo carries the 600–800
  // weights the design leans on, which Alef (400/700 only) can't.
  fonts: "family=Baloo+2:wght@500;600;700;800&family=Suez+One&family=Heebo:wght@400;500;600;700;800;900",
  display: '"Suez One",Georgia,serif',
  sans: '"Heebo",system-ui,-apple-system,sans-serif',
  tabs: ["לוח בקרה", "רווח", "תנועה", "דליפות"],
  period: "30 הימים האחרונים",
  kpis: [
    { label: "סה״כ מכירות", sub: "לפני החזרים ועמלות" },
    { label: "רווח תרומה", sub: "42.9% מרווח נשמר" },
    { label: "שיעור לקוחות חוזרים", sub: "מותג דביק יותר" },
    { label: "ערך הזמנה ממוצע", sub: "לכל רכישה" }
  ],
  chartTitle: "הכנסות מול רווח משוער",
  legendRevenue: "הכנסות",
  legendProfit: "רווח",
  tipDay: "12 באוגוסט",
  tipRevenue: "הכנסות",
  tipProfit: "רווח",
  tipProducts: "מוצרים מובילים",
  tipCampaigns: "קמפיינים ב־Meta Ads",
  leakEyebrow: "סריקת דליפות · 30 הימים האחרונים",
  leakHeadBefore: "מצאנו ",
  leakHeadAfter: " של דליפות רווח",
  leakRows: [
    {
      title: "עמלות ששולמו על לקוחות שכבר היו שלכם",
      sub: 'פעולה: <b>הגדירו מדיניות מופחתת ללקוחות חוזרים</b> · פוטנציאל <span class="ltr">+₪1,958</span> לחודש'
    },
    {
      title: "קודי הנחה שמוכרים בהפסד אחרי עלות המוצר",
      sub: 'פעולה: <b>עצרו או צמצמו את הקודים המסומנים</b> · פוטנציאל <span class="ltr">+₪1,901</span> לחודש'
    }
  ],
  leakRowsShort: [
    { title: "עמלות על לקוחות שכבר היו שלכם", sub: "<b>הגדירו מדיניות מופחתת ללקוחות חוזרים</b>" },
    { title: "קודי הנחה שמוכרים בהפסד", sub: "<b>עצרו או צמצמו את הקודים המסומנים</b>" }
  ],
  leakClearTitle: "תקציב פרסום שמקדם מוצרים עם אחוז החזרות גבוה",
  leakClearSub: "נבדקו 5 קמפיינים — אף אחד לא מקדם מוצר עם החזרות גבוהות.",
  leakClear: "נקי",
  fragSessions: "כניסות",
  fragRoas: "ROAS",
  fragRefund: "אחוז החזרות",
  fragRefundShort: "החזרות",
  caps: [
    { eb: "Meta · Google Ads · GA4 · Shopify · TikTok", h: "כשכל ה<em>דאטה</em><br>מטשטשת את התמונה…" },
    { eb: "תמונה אחת ברורה", h: "…התמונה המלאה נכנסת ל<em>פוקוס</em>." },
    { eb: "הכנסות מול רווח", h: "כל מספר, סוף סוף <em>בפוקוס</em>." },
    { eb: "סריקת דליפות", h: "רואים בדיוק איפה זה <em>דולף</em>." }
  ],
  ctaTag: "Hiloomy הופך את התמונה שלכם ל<em>ברורה</em>.",
  ctaBtn: "מתחילים בחינם ←"
};

const copyFor = (locale: BannerLocale) => (locale === "he" ? HE : EN);

// Count-up + stage timeline. Identical for both breakpoints apart from the
// selectors it drives and the beat durations, so it's generated once.
function script(frameId: string, kpiSel: string, leakSel: string, capSel: string, tickId: string, reducedStage: string, reducedBeat: number, durations: number[]) {
  return `
(function(){
  var f=document.getElementById(${JSON.stringify(frameId)});
  var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  var caps=[].slice.call(document.querySelectorAll(${JSON.stringify(capSel)}));
  function showCap(s){
    var t=null;
    caps.forEach(function(c){c.classList.remove("show");if(+c.getAttribute("data-cap")===s)t=c;});
    if(t)t.classList.add("show");
  }
  function fmt(n,d){return d?n.toFixed(d):Math.round(n).toLocaleString("en-US");}
  function countUp(el){
    var to=+el.getAttribute("data-to"),pre=el.getAttribute("data-prefix")||"",
        suf=el.getAttribute("data-suffix")||"",dec=+(el.getAttribute("data-dec")||0),dur=1100,s=null;
    function step(t){
      if(!s)s=t;
      var p=Math.min((t-s)/dur,1),e=1-Math.pow(1-p,3);
      el.textContent=pre+fmt(to*e,dec)+suf;
      if(p<1)requestAnimationFrame(step);else el.textContent=pre+fmt(to,dec)+suf;
    }
    requestAnimationFrame(step);
  }
  function group(sel){document.querySelectorAll(sel).forEach(countUp);}
  function settle(sel){
    document.querySelectorAll(sel).forEach(function(el){
      var pre=el.getAttribute("data-prefix")||"",suf=el.getAttribute("data-suffix")||"",
          dec=+(el.getAttribute("data-dec")||0);
      el.textContent=pre+fmt(+el.getAttribute("data-to"),dec)+suf;
    });
  }

  var ticks=document.getElementById(${JSON.stringify(tickId)});
  for(var i=0;i<5;i++)ticks.appendChild(document.createElement("i"));
  var tks=[].slice.call(ticks.children);
  function mark(b){tks.forEach(function(t,i){t.classList.toggle("on",i<=b);});}
  var s2b={0:0,1:0,2:1,3:2,4:3,5:4};
  var D=${JSON.stringify(durations)};

  var tl=[
    {stage:0,dur:D[0],cap:0},
    {stage:1,dur:D[1]},
    {stage:2,dur:D[2],cap:2,onEnter:function(){group(${JSON.stringify(kpiSel)});}},
    {stage:3,dur:D[3],cap:3},
    {stage:4,dur:D[4],cap:4,onEnter:function(){group(${JSON.stringify(leakSel)});}},
    {stage:5,dur:D[5]}
  ];

  if(reduce){
    f.setAttribute("data-stage",${JSON.stringify(reducedStage)});
    showCap(2);
    settle(${JSON.stringify(kpiSel)});
    settle(${JSON.stringify(leakSel)});
    mark(${reducedBeat});
    return;
  }

  // Pause the loop while the banner is scrolled out of view — it's an
  // iframe on a long marketing page and there's no reason to keep
  // repainting it behind the fold.
  var idx=0,timer=null,visible=true;
  function run(){
    var st=tl[idx];
    f.setAttribute("data-stage",String(st.stage));
    mark(s2b[st.stage]);
    showCap(st.cap!==undefined?st.cap:-1);
    if(st.onEnter)st.onEnter();
    timer=setTimeout(function(){idx=(idx+1)%tl.length;if(visible)run();},st.dur);
  }
  // Reading frameElement across an opaque origin throws rather than
  // returning null, so this has to be guarded, not just null-checked.
  var host=null;
  try{host=window.frameElement;}catch(err){host=null;}
  if(host&&window.IntersectionObserver){
    new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(e.isIntersecting&&!visible){visible=true;run();}
        else if(!e.isIntersecting){visible=false;clearTimeout(timer);}
      });
    },{threshold:0.05}).observe(host);
  }
  run();
})();`;
}

// ── Desktop / landscape (16:9) ──────────────────────────────────────────
function desktopDoc(locale: BannerLocale): string {
  const c = copyFor(locale);
  const rtl = locale === "he";
  const K = c.kpis;

  return `<!doctype html>
<html lang="${rtl ? "he" : "en"}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hiloomy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${c.fonts}&display=swap">
<style>
  :root{${PALETTE}
    --display:${c.display};
    --sans:${c.sans};
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  /* Transparent + unpadded: the parent page owns the radius, shadow and the
     surface this sits on. A background here would paint a slab on the paper. */
  body{font-family:var(--sans);background:transparent;color:var(--ink)}

  .frame{
    position:relative;width:100%;height:100%;overflow:hidden;
    background:
      radial-gradient(120% 120% at 82% 8%, rgba(21,163,74,.10), transparent 55%),
      radial-gradient(90% 90% at 12% 96%, rgba(209,115,31,.09), transparent 60%),
      linear-gradient(160deg, var(--canvas-a), var(--canvas-b) 60%);
    isolation:isolate;
  }
  .frame::after{
    content:"";position:absolute;inset:0;pointer-events:none;
    background-image:radial-gradient(rgba(20,81,44,.05) 1px, transparent 1px);
    background-size:26px 26px;opacity:.5;z-index:0;
  }

  /* ================= APP MOCK ================= */
  .app{
    position:absolute;inset:0;padding:5.4% 5.6%;
    display:flex;flex-direction:column;gap:2.6%;z-index:2;
    transition:filter 1.1s cubic-bezier(.2,.7,.2,1), opacity 1.1s ease, transform 1.1s ease;
    transform-origin:center 42%;
  }
  .frame[data-stage="0"] .app,
  .frame[data-stage="1"] .app{filter:blur(15px) saturate(.28) brightness(1.02);opacity:.55;transform:scale(1.04)}
  .frame[data-stage="5"] .app{filter:saturate(.9) brightness(.86);opacity:.5;transform:scale(.985)}

  .topbar{display:flex;align-items:center;gap:14px}
  .brand{display:flex;align-items:baseline;gap:1px;font-size:clamp(15px,1.9vw,22px)}
  .mono{height:1.5em;width:auto;flex:0 0 auto;align-self:baseline}
  .word{font-family:"Baloo 2",var(--sans);font-weight:700;font-size:1em;color:#0E4D2C;letter-spacing:-.005em;line-height:1}
  .word .dot{color:#F5821F}
  .tabs{display:flex;gap:7px;margin-inline-start:6px}
  .tab{font-size:clamp(8px,1.02vw,12px);font-weight:600;color:var(--muted);
    padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.6);white-space:nowrap}
  .tab.on{background:var(--green-deep);color:#EAF6EE;border-color:var(--green-deep)}
  .period{margin-inline-start:auto;font-size:clamp(8px,1vw,11.5px);font-weight:600;color:var(--muted);
    padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.7);
    display:flex;align-items:center;gap:6px;white-space:nowrap}
  .period .pdot{width:6px;height:6px;border-radius:50%;background:var(--green)}

  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:2.2%}
  .card{
    background:var(--paper);border:1px solid var(--line);border-radius:14px;
    padding:clamp(9px,1.5vw,18px);box-shadow:var(--shadow-sm);
    display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden;
    opacity:0;transform:translateY(14px);
    transition:opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1);
  }
  .frame[data-stage="2"] .kpis .card,.frame[data-stage="3"] .kpis .card,
  .frame[data-stage="4"] .kpis .card,.frame[data-stage="5"] .kpis .card{opacity:1;transform:none}
  .kpis .card:nth-child(2){transition-delay:.08s}
  .kpis .card:nth-child(3){transition-delay:.16s}
  .kpis .card:nth-child(4){transition-delay:.24s}
  .k-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .k-label{font-size:clamp(7px,.92vw,10.5px);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .k-ic{width:clamp(16px,2vw,24px);height:clamp(16px,2vw,24px);border-radius:8px;background:rgba(21,163,74,.12);
    display:flex;align-items:center;justify-content:center;color:var(--green);flex:0 0 auto}
  .k-ic svg{width:60%;height:60%}
  /* Numbers stay LTR in both locales: "₪247,667", not a bidi-reordered mess. */
  .k-val{font-family:var(--display);font-weight:800;font-size:clamp(16px,2.9vw,34px);color:var(--ink);
    line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;direction:ltr;text-align:start}
  .k-sub{font-size:clamp(6.5px,.86vw,10px);color:var(--muted);line-height:1.25}
  .delta{font-size:clamp(6.5px,.86vw,10px);font-weight:700;padding:2px 7px;border-radius:999px;
    display:inline-flex;align-items:center;gap:3px;unicode-bidi:isolate}
  .delta.up{color:#0E7A38;background:rgba(21,163,74,.13)}

  .lower{position:relative;flex:1;min-height:0}
  .chart-card{
    position:absolute;inset:0;background:var(--paper);border:1px solid var(--line);border-radius:14px;
    padding:clamp(10px,1.6vw,18px);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:8px;
    opacity:0;transform:translateY(14px);transition:opacity .7s ease, transform .7s ease;
  }
  .frame[data-stage="3"] .chart-card,.frame[data-stage="4"] .chart-card,
  .frame[data-stage="5"] .chart-card{opacity:1;transform:none}
  .cc-head{display:flex;align-items:center;gap:12px}
  .cc-title{font-size:clamp(9px,1.15vw,13.5px);font-weight:700;color:var(--ink)}
  .legend{display:flex;gap:12px;margin-inline-start:auto;font-size:clamp(7px,.92vw,10.5px);font-weight:600;color:var(--muted)}
  .legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
  .legend i{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
  /* The time series reads left-to-right in both locales — mirroring a
     date axis is not a convention Hebrew dashboards follow. Keeping the
     wrapper LTR also means the cursor/crosshair/tooltip offsets below are
     one set of numbers instead of two. */
  .chart-wrap{flex:1;min-height:0;position:relative;direction:ltr}
  .chart-wrap .cwsvg{position:absolute;inset:0;width:100%;height:100%}
  .rev-line,.prof-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
  .rev-line{stroke:var(--green)}
  .prof-line{stroke:var(--orange)}
  .draw{stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.5s cubic-bezier(.3,.6,.2,1)}
  .frame[data-stage="3"] .draw,.frame[data-stage="4"] .draw,.frame[data-stage="5"] .draw{stroke-dashoffset:0}
  .area{opacity:0;transition:opacity 1s ease .3s}
  .frame[data-stage="3"] .area,.frame[data-stage="4"] .area,.frame[data-stage="5"] .area{opacity:1}
  .peak{opacity:0;transition:opacity .5s ease .9s}
  .frame[data-stage="3"] .peak,.frame[data-stage="4"] .peak,.frame[data-stage="5"] .peak{opacity:1}

  .cross{position:absolute;left:28%;top:2%;bottom:6%;width:1.5px;
    background:linear-gradient(rgba(20,81,44,0),rgba(20,81,44,.22));opacity:0;transition:opacity .22s ease}
  .cursor{position:absolute;left:27.5%;top:22%;width:clamp(9px,1.1vw,14px);height:auto;z-index:6;pointer-events:none;
    opacity:0;transform:translate(-1px,-1px) scale(.7);transition:opacity .22s ease,transform .25s ease}
  .tip{position:absolute;left:31%;top:0;z-index:5;background:#fff;border:1px solid var(--line);
    border-radius:11px;box-shadow:var(--shadow);padding:clamp(7px,1vw,11px) clamp(9px,1.2vw,13px);
    width:min(46%,320px);opacity:0;transform:translateY(8px) scale(.98);transform-origin:left top;
    transition:opacity .22s ease,transform .25s ease;direction:${rtl ? "rtl" : "ltr"}}
  .frame[data-stage="3"] .cross{opacity:1;transition:opacity .5s ease .7s}
  .frame[data-stage="3"] .cursor{opacity:1;transform:translate(-1px,-1px) scale(1);
    transition:opacity .35s ease .55s,transform .45s cubic-bezier(.2,.7,.2,1) .55s}
  .frame[data-stage="3"] .tip{opacity:1;transform:none;
    transition:opacity .45s ease .8s,transform .45s cubic-bezier(.2,.7,.2,1) .8s}
  .tip-head{display:flex;flex-wrap:wrap;align-items:center;gap:3px 14px;padding-bottom:6px;
    border-bottom:1px solid var(--line-soft);margin-bottom:6px}
  .tip-day{font-family:var(--display);font-weight:800;font-size:clamp(9px,1.15vw,13.5px);color:var(--ink);letter-spacing:-.01em}
  .tip-kv{font-size:clamp(7px,.9vw,10.5px);color:var(--muted);font-weight:600;display:inline-flex;align-items:center;gap:5px}
  .tip-kv b{color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums;unicode-bidi:isolate;direction:ltr}
  .tip-kv i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
  .d-rev{background:var(--green)} .d-prof{background:var(--orange)}
  .tip-sec{margin-top:5px}
  .tip-lbl{font-size:clamp(6.4px,.8vw,9.5px);font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .tip-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
    font-size:clamp(7px,.9vw,10.5px);line-height:1.5}
  .tip-row span{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tip-row b{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;unicode-bidi:isolate;direction:ltr}
  .tip-row b.pos{color:#0E7A38}
  /* Product names are Latin brand strings — isolate so RTL can't shuffle them. */
  .ltr{direction:ltr;unicode-bidi:isolate;text-align:start;white-space:nowrap}

  .leak-card{
    position:absolute;inset:0;border-radius:14px;z-index:10;
    background:linear-gradient(180deg,#FFF9F4,#FFFFFF 40%);
    border:1px solid rgba(196,85,31,.28);box-shadow:var(--shadow);
    padding:clamp(11px,1.7vw,20px);display:flex;flex-direction:column;gap:clamp(7px,1vw,11px);
    opacity:0;transform:translateY(26px) scale(.985);
    transition:opacity .6s ease, transform .6s cubic-bezier(.2,.7,.2,1);
  }
  .frame[data-stage="4"] .leak-card,.frame[data-stage="5"] .leak-card{opacity:1;transform:none}
  .lk-eyebrow{font-size:clamp(7px,.9vw,10.5px);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--orange)}
  .lk-head{font-family:var(--display);font-weight:800;font-size:clamp(14px,2.5vw,28px);color:var(--ink);letter-spacing:-.02em;line-height:1.05}
  .lk-head .amt{color:var(--leak);unicode-bidi:isolate;direction:ltr}
  .lk-rows{display:flex;flex-direction:column;gap:clamp(5px,.75vw,8px);margin-top:2px}
  .lk-row{display:flex;align-items:center;gap:10px;padding:clamp(6px,.95vw,11px) clamp(8px,1.1vw,13px);
    border-radius:10px;background:rgba(196,85,31,.05);border:1px solid rgba(196,85,31,.14);
    opacity:0;transform:translateX(${rtl ? "10px" : "-10px"});transition:opacity .5s ease,transform .5s ease}
  .frame[data-stage="4"] .lk-row,.frame[data-stage="5"] .lk-row{opacity:1;transform:none}
  .frame[data-stage="4"] .lk-row:nth-child(2){transition-delay:.14s}
  .frame[data-stage="4"] .lk-row:nth-child(3){transition-delay:.28s}
  .lk-row.ok{background:rgba(21,163,74,.05);border-color:rgba(21,163,74,.18)}
  .lk-ic{width:clamp(16px,2vw,24px);height:clamp(16px,2vw,24px);flex:0 0 auto;border-radius:7px;
    display:flex;align-items:center;justify-content:center;background:rgba(196,85,31,.14);color:var(--leak)}
  .lk-row.ok .lk-ic{background:rgba(21,163,74,.14);color:var(--green)}
  .lk-ic svg{width:58%;height:58%}
  .lk-body{min-width:0}
  .lk-t{font-size:clamp(8.5px,1.08vw,13px);font-weight:700;color:var(--ink);line-height:1.15}
  .lk-s{font-size:clamp(6.8px,.85vw,10px);color:var(--muted);line-height:1.25;margin-top:2px}
  .lk-s b{color:var(--green-deep);font-weight:700}
  .lk-amt{margin-inline-start:auto;font-family:var(--display);font-weight:800;font-size:clamp(11px,1.7vw,20px);
    color:var(--leak);font-variant-numeric:tabular-nums;white-space:nowrap;unicode-bidi:isolate;direction:ltr}
  .lk-row.ok .lk-amt{color:var(--green);direction:${rtl ? "rtl" : "ltr"}}

  /* ================= CHAOS FRAGMENTS ================= */
  .chaos{position:absolute;inset:0;z-index:3;pointer-events:none;transition:opacity .9s ease}
  .frame[data-stage="0"] .chaos{opacity:1}
  .frame[data-stage="1"] .chaos{opacity:.15}
  .frame[data-stage="2"] .chaos,.frame[data-stage="3"] .chaos,
  .frame[data-stage="4"] .chaos,.frame[data-stage="5"] .chaos{opacity:0}
  .frag{position:absolute;border-radius:10px;background:rgba(255,255,255,.75);
    border:1px solid rgba(90,110,100,.25);box-shadow:0 8px 22px rgba(20,40,30,.14);
    filter:grayscale(.85);padding:9px 11px;font-size:10px;color:#5b6b63;font-weight:600;
    animation:drift 6s ease-in-out infinite alternate}
  .frag .n{font-family:var(--display);font-weight:800;font-size:17px;color:#41514a;letter-spacing:-.02em;direction:ltr}
  .frag svg{display:block;margin-top:5px;opacity:.7}
  @keyframes drift{from{transform:translateY(0) rotate(var(--r,0deg))}to{transform:translateY(-9px) rotate(var(--r,0deg))}}
  .intg{position:absolute;width:clamp(32px,3.9vw,50px);aspect-ratio:1;border-radius:26%;
    background:#fff;box-shadow:0 10px 24px rgba(20,40,30,.24);
    display:flex;align-items:center;justify-content:center;
    animation:drift 5.4s ease-in-out infinite alternate}
  .intg svg{width:74%;height:74%;display:block}

  /* ================= ORANGE FOCUS SWEEP ================= */
  .sweep{position:absolute;top:-30%;bottom:-30%;left:-40%;width:36%;z-index:4;pointer-events:none;
    transform:translateX(-60vw) rotate(9deg);opacity:0;
    background:linear-gradient(90deg,transparent, rgba(209,115,31,0) 10%, rgba(209,115,31,.55) 48%, rgba(255,208,150,.9) 52%, rgba(209,115,31,0) 90%, transparent);
    filter:blur(4px);mix-blend-mode:screen}
  .frame[data-stage="1"] .sweep{animation:sweep 1.5s cubic-bezier(.5,0,.3,1) forwards}
  @keyframes sweep{
    0%{transform:translateX(-70%) rotate(9deg);opacity:0}
    18%{opacity:1}82%{opacity:1}
    100%{transform:translateX(430%) rotate(9deg);opacity:0}
  }

  /* ================= CAPTION ================= */
  .caption{position:absolute;inset-inline-start:5.6%;bottom:6%;z-index:6;max-width:64%;
    display:flex;flex-direction:column;gap:7px;transition:opacity .5s ease}
  .cap{opacity:0;transform:translateY(8px);transition:opacity .28s ease,transform .28s ease;
    position:absolute;inset-inline-start:0;bottom:0;pointer-events:none}
  .cap.show{opacity:1;transform:none;position:relative;
    transition:opacity .5s ease .3s,transform .55s cubic-bezier(.2,.7,.2,1) .3s}
  .cap .eb{font-size:clamp(8px,1vw,12px);font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--orange);margin-bottom:8px}
  .cap h2{font-family:var(--display);font-weight:800;font-size:clamp(18px,3.4vw,42px);line-height:1.02;
    letter-spacing:-.025em;color:var(--green-deep);text-wrap:balance}
  .cap h2 em{font-style:normal;color:var(--orange)}
  .cap.cold h2{color:#41514a}
  .cap.cold .eb{color:#8a988f}
  .frame[data-stage="5"] .caption{opacity:0}

  /* ================= CTA ================= */
  .cta{position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:clamp(10px,1.8vw,20px);text-align:center;
    opacity:0;transform:scale(.985);pointer-events:none;
    transition:opacity .32s ease,transform .32s ease;
    background:radial-gradient(70% 70% at 50% 45%, rgba(255,255,255,.55), rgba(234,245,238,.2) 70%, transparent)}
  .frame[data-stage="5"] .cta{opacity:1;transform:none;
    transition:opacity .7s ease .12s,transform .8s cubic-bezier(.2,.7,.2,1) .12s}
  .cta .lock{display:flex;align-items:baseline;gap:1px;font-size:clamp(30px,6vw,66px)}
  .cta .lock svg{width:auto;height:1.32em;align-self:baseline}
  .cta .lw{font-family:"Baloo 2",var(--sans);font-weight:700;font-size:1em;color:#0E4D2C;letter-spacing:-.01em}
  .cta .lw .dot{color:#F5821F}
  .cta .tag{font-family:var(--display);font-weight:700;font-size:clamp(14px,2.3vw,26px);color:var(--ink);letter-spacing:-.02em}
  .cta .tag em{font-style:normal;color:var(--green-deep)}
  .cta .btn{margin-top:4px;font-weight:700;font-size:clamp(11px,1.5vw,16px);color:#fff;
    background:var(--green-deep);padding:clamp(9px,1.3vw,14px) clamp(18px,2.4vw,28px);border-radius:999px;
    box-shadow:0 10px 24px rgba(20,81,44,.35);display:inline-flex;align-items:center;gap:8px}

  .ticks{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:8;display:flex;gap:6px}
  .ticks i{width:22px;height:3px;border-radius:2px;background:rgba(20,81,44,.16);position:relative;overflow:hidden}
  .ticks i.on{background:var(--green)}

  @media (prefers-reduced-motion: reduce){
    .app{filter:none!important;opacity:1!important;transform:none!important}
    .chaos,.sweep{display:none!important}
    .card,.chart-card,.leak-card,.lk-row{opacity:1!important;transform:none!important}
    .draw{stroke-dashoffset:0!important}.area,.peak{opacity:1!important}
    .intg,.frag{animation:none!important}
  }
</style>
</head>
<body>
<div class="frame" data-stage="0" id="frame">
  <div class="ticks" id="ticks"></div>

  <div class="app">
    <div class="topbar">
      <div class="brand" dir="ltr">
        <span class="mono">${MARK}</span>
        <span class="word">iloomy<span class="dot">.</span></span>
      </div>
      <div class="tabs">
        <span class="tab on">${c.tabs[0]}</span>
        <span class="tab">${c.tabs[1]}</span>
        <span class="tab">${c.tabs[2]}</span>
        <span class="tab">${c.tabs[3]}</span>
      </div>
      <span class="period"><span class="pdot"></span>${c.period}</span>
    </div>

    <div class="kpis">
      <div class="card">
        <div class="k-top">
          <span class="k-label">${K[0].label}</span>
          <span class="k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 18 L10 12 L14 15 L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
        <div class="k-val" data-to="247667" data-prefix="₪">₪0</div>
        <div class="k-sub"><span class="delta up">▲ 20.2%</span>&nbsp; ${K[0].sub}</div>
      </div>
      <div class="card">
        <div class="k-top">
          <span class="k-label">${K[1].label}</span>
          <span class="k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3v18M7 8h7a3 3 0 0 1 0 6H8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
        <div class="k-val" data-to="135425" data-prefix="₪">₪0</div>
        <div class="k-sub"><span class="delta up">▲ 14.8%</span>&nbsp; ${K[1].sub}</div>
      </div>
      <div class="card">
        <div class="k-top">
          <span class="k-label">${K[2].label}</span>
          <span class="k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12a9 9 0 1 1 3 6.7M3 20v-4h4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
        <div class="k-val" data-to="40" data-suffix="%" data-dec="1">0.0%</div>
        <div class="k-sub"><span class="delta up">${K[2].sub}</span></div>
      </div>
      <div class="card">
        <div class="k-top">
          <span class="k-label">${K[3].label}</span>
          <span class="k-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 4h12l-1 4H7zM5 8h14l-1 12H6z" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </div>
        <div class="k-val" data-to="322" data-prefix="₪">₪0</div>
        <div class="k-sub"><span class="delta up">▲ 25.8%</span>&nbsp; ${K[3].sub}</div>
      </div>
    </div>

    <div class="lower">
      <div class="chart-card">
        <div class="cc-head">
          <span class="cc-title">${c.chartTitle}</span>
          <span class="legend">
            <span><i style="background:var(--green)"></i>${c.legendRevenue}</span>
            <span><i style="background:var(--orange)"></i>${c.legendProfit}</span>
          </span>
        </div>
        <div class="chart-wrap">
          <svg class="cwsvg" viewBox="0 0 600 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#15A34A" stop-opacity=".28"/>
                <stop offset="1" stop-color="#15A34A" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path class="area" d="M0,120 C60,70 110,52 170,55 C240,58 300,96 360,120 C420,140 480,150 600,150 L600,200 L0,200 Z" fill="url(#ga)"/>
            <path class="rev-line draw" pathLength="1" d="M0,120 C60,70 110,52 170,55 C240,58 300,96 360,120 C420,140 480,150 600,150"/>
            <path class="prof-line draw" pathLength="1" d="M0,158 C60,128 120,120 180,122 C250,124 300,150 360,160 C430,171 500,176 600,176"/>
            <circle class="peak" cx="170" cy="55" r="4.5" fill="#15A34A" stroke="#fff" stroke-width="2"/>
            <circle class="peak" cx="170" cy="122" r="4" fill="#D1731F" stroke="#fff" stroke-width="2"/>
          </svg>
          <div class="cross"></div>
          <svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2 L4 20 L9 15 L12.5 22.5 L15.5 21.2 L12 14 L19 14 Z" fill="#0A2E1E" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>
          <div class="tip">
            <div class="tip-head">
              <span class="tip-day">${c.tipDay}</span>
              <span class="tip-kv"><i class="d-rev"></i>${c.tipRevenue} <b>₪36,109</b></span>
              <span class="tip-kv"><i class="d-prof"></i>${c.tipProfit} <b>₪20,508</b></span>
            </div>
            <div class="tip-sec">
              <div class="tip-lbl">${c.tipProducts}</div>
              <div class="tip-row"><span class="ltr">Molecule — Base parfume</span><b>₪13,105</b></div>
              <div class="tip-row"><span class="ltr">Second Skin</span><b>₪8,035</b></div>
              <div class="tip-row"><span class="ltr">Molecule 50</span><b>₪6,908</b></div>
            </div>
            <div class="tip-sec">
              <div class="tip-lbl">${c.tipCampaigns}</div>
              <div class="tip-row"><span class="ltr">Advantage+</span><b class="pos">₪7,850 · 10.04× ROAS</b></div>
            </div>
          </div>
        </div>
      </div>

      <div class="leak-card">
        <div class="lk-eyebrow">${c.leakEyebrow}</div>
        <div class="lk-head">${c.leakHeadBefore}<span class="amt" data-to="4348" data-prefix="₪">₪0</span>${c.leakHeadAfter}</div>
        <div class="lk-rows">
          <div class="lk-row">
            <span class="lk-ic">${ICON_ALERT}</span>
            <div class="lk-body">
              <div class="lk-t">${c.leakRows[0].title}</div>
              <div class="lk-s">${c.leakRows[0].sub}</div>
            </div>
            <div class="lk-amt" data-to="2447" data-prefix="₪">₪0</div>
          </div>
          <div class="lk-row">
            <span class="lk-ic">${ICON_ALERT}</span>
            <div class="lk-body">
              <div class="lk-t">${c.leakRows[1].title}</div>
              <div class="lk-s">${c.leakRows[1].sub}</div>
            </div>
            <div class="lk-amt" data-to="1901" data-prefix="₪">₪0</div>
          </div>
          <div class="lk-row ok">
            <span class="lk-ic">${ICON_CHECK}</span>
            <div class="lk-body">
              <div class="lk-t">${c.leakClearTitle}</div>
              <div class="lk-s">${c.leakClearSub}</div>
            </div>
            <div class="lk-amt">${c.leakClear}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="chaos">
    <div class="frag" style="top:58%;left:9%;--r:-4deg">${c.fragSessions}<div class="n">28,493</div><svg width="70" height="18"><polyline points="0,14 12,9 24,12 36,5 48,10 60,3 70,7" fill="none" stroke="#8a988f" stroke-width="2"/></svg></div>
    <div class="frag" style="top:52%;left:47%;--r:3deg">${c.fragRoas}<div class="n">10.04×</div></div>
    <div class="frag" style="top:64%;left:84%;--r:6deg">${c.fragRefund}<div class="n">1.4%</div></div>

    <div class="intg" style="top:12%;left:15%;--r:-5deg">${ICON_META}</div>
    <div class="intg" style="top:10%;left:40%;--r:3deg">${ICON_GADS}</div>
    <div class="intg" style="top:12%;left:64%;--r:-4deg">${ICON_TIKTOK}</div>
    <div class="intg" style="top:24%;left:83%;--r:5deg;background:linear-gradient(45deg,#FEDA75,#FA7E1E 28%,#D62976 60%,#962FBF)">${ICON_IG}</div>
    <div class="intg" style="top:35%;left:10%;--r:6deg">${ICON_GA4}</div>
    <div class="intg" style="top:22%;left:56%;--r:-3deg">${ICON_SHEETS}</div>
    <div class="intg" style="top:42%;left:73%;--r:4deg">${ICON_SHOPIFY}</div>
    <div class="intg" style="top:40%;left:38%;--r:-4deg;background:#7F54B3">${ICON_WOO}</div>
  </div>

  <div class="sweep"></div>

  <div class="caption">
    <div class="cap cold" data-cap="0"><div class="eb">${c.caps[0].eb}</div><h2>${c.caps[0].h}</h2></div>
    <div class="cap" data-cap="2"><div class="eb">${c.caps[1].eb}</div><h2>${c.caps[1].h}</h2></div>
    <div class="cap" data-cap="3"><div class="eb">${c.caps[2].eb}</div><h2>${c.caps[2].h}</h2></div>
    <div class="cap" data-cap="4"><div class="eb">${c.caps[3].eb}</div><h2>${c.caps[3].h}</h2></div>
  </div>

  <div class="cta">
    <div class="lock" dir="ltr">${MARK}<span class="lw">iloomy<span class="dot">.</span></span></div>
    <div class="tag">${c.ctaTag}</div>
    <span class="btn">${c.ctaBtn}</span>
  </div>
</div>
<script>${script("frame", ".kpis .k-val", ".leak-card [data-to]", ".cap", "ticks", "3", 4, [2600, 1600, 2600, 2600, 3600, 3400])}<\/script>
</body>
</html>`;
}

// ── Mobile / portrait (3:4) ─────────────────────────────────────────────
// A genuinely different composition, not the desktop one squeezed: a fixed
// headline band on top and a single swapping content layer beneath, so type
// never has to shrink to fit next to a chart.
function mobileDoc(locale: BannerLocale): string {
  const c = copyFor(locale);
  const rtl = locale === "he";
  const K = c.kpis;

  return `<!doctype html>
<html lang="${rtl ? "he" : "en"}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hiloomy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${c.fonts}&display=swap">
<style>
  :root{${PALETTE}
    --display:${c.display};
    --sans:${c.sans};
    --round:"Baloo 2",${c.sans};
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:var(--sans);background:transparent;color:var(--ink)}

  .mframe{position:relative;width:100%;height:100%;overflow:hidden;
    background:
      radial-gradient(120% 90% at 85% 6%, rgba(21,163,74,.12), transparent 55%),
      radial-gradient(90% 80% at 10% 98%, rgba(209,115,31,.10), transparent 60%),
      linear-gradient(165deg, var(--canvas-a), var(--canvas-b) 62%);
    isolation:isolate;display:flex;flex-direction:column}
  .mframe::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
    background-image:radial-gradient(rgba(20,81,44,.05) 1px,transparent 1px);background-size:22px 22px;opacity:.5}

  .mticks{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:9;display:flex;gap:6px}
  .mticks i{width:20px;height:3px;border-radius:2px;background:rgba(20,81,44,.16)}
  .mticks i.on{background:var(--green)}

  .mhead{position:relative;z-index:6;padding:18px 18px 0;flex:0 0 auto}
  .mbrand{display:flex;align-items:baseline;gap:1px;font-size:20px;margin-bottom:10px}
  .mbrand svg{height:1.5em;width:auto;align-self:baseline}
  .mbrand .w{font-family:var(--round);font-weight:700;color:#0E4D2C}
  .mbrand .w .dot{color:#F5821F}
  .mstage{position:relative;flex:1;min-height:0;margin:12px 18px 18px}
  .layer{position:absolute;inset:0;opacity:0;transition:opacity .28s ease;pointer-events:none}
  .mframe[data-stage="0"] .l-chaos{opacity:1}
  .mframe[data-stage="1"] .l-chaos{opacity:.18}
  .mframe[data-stage="2"] .l-kpis{opacity:1;transition:opacity .5s ease .28s}
  .mframe[data-stage="3"] .l-graph{opacity:1;transition:opacity .5s ease .28s}
  .mframe[data-stage="4"] .l-leak{opacity:1;transition:opacity .5s ease .28s}
  .mframe[data-stage="5"] .l-cta{opacity:1;transition:opacity .55s ease .25s}

  .intg{position:absolute;width:44px;aspect-ratio:1;border-radius:26%;background:#fff;
    box-shadow:0 8px 20px rgba(20,40,30,.2);display:flex;align-items:center;justify-content:center;
    animation:drift 5.4s ease-in-out infinite alternate}
  .intg svg{width:72%;height:72%;display:block}
  @keyframes drift{from{transform:translateY(0) rotate(var(--r,0deg))}to{transform:translateY(-8px) rotate(var(--r,0deg))}}
  .frag{position:absolute;background:rgba(255,255,255,.75);border:1px solid rgba(90,110,100,.25);
    border-radius:10px;box-shadow:0 8px 20px rgba(20,40,30,.14);filter:grayscale(.85);
    padding:8px 11px;font-size:10px;color:#5b6b63;font-weight:600;animation:drift 6s ease-in-out infinite alternate}
  .frag .n{font-family:var(--display);font-weight:800;font-size:17px;color:#41514a;direction:ltr}

  .l-kpis{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:12px}
  .card{background:var(--paper);border:1px solid var(--line);border-radius:15px;padding:14px 13px;
    box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:7px;justify-content:center;
    transform:translateY(12px);transition:transform .5s cubic-bezier(.2,.7,.2,1)}
  .mframe[data-stage="2"] .card{transform:none}
  .mframe[data-stage="2"] .card:nth-child(2){transition-delay:.06s}
  .mframe[data-stage="2"] .card:nth-child(3){transition-delay:.12s}
  .mframe[data-stage="2"] .card:nth-child(4){transition-delay:.18s}
  .k-label{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
  .k-val{font-family:var(--display);font-weight:800;font-size:clamp(21px,6.7vw,30px);color:var(--ink);
    line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;direction:ltr;text-align:start}
  .delta{font-size:11px;font-weight:700;color:#0E7A38;unicode-bidi:isolate}

  .l-graph .gcard{position:absolute;inset:0;background:var(--paper);border:1px solid var(--line);
    border-radius:16px;box-shadow:var(--shadow-sm);padding:15px 14px;display:flex;flex-direction:column;gap:9px}
  .gc-head{display:flex;align-items:center;gap:8px}
  .gc-title{font-size:12px;font-weight:700;color:var(--ink)}
  .glegend{margin-inline-start:auto;display:flex;gap:10px;font-size:10px;font-weight:600;color:var(--muted)}
  .glegend span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
  .glegend i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
  .gwrap{position:relative;flex:1;min-height:0;direction:ltr}
  .gsvg{position:absolute;inset:0;width:100%;height:100%}
  .grev,.gprof{fill:none;stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round}
  .grev{stroke:var(--green)} .gprof{stroke:var(--orange)}
  .gdraw{stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.4s cubic-bezier(.3,.6,.2,1) .3s}
  .mframe[data-stage="3"] .gdraw{stroke-dashoffset:0}
  .garea{opacity:0;transition:opacity .8s ease .5s}
  .mframe[data-stage="3"] .garea{opacity:1}
  .gtip{position:absolute;left:5%;top:1%;background:#fff;border:1px solid var(--line);border-radius:11px;
    box-shadow:var(--shadow);padding:9px 11px;width:min(86%,270px);direction:${rtl ? "rtl" : "ltr"};
    opacity:0;transform:translateY(6px);transition:opacity .22s ease,transform .22s ease}
  .mframe[data-stage="3"] .gtip{opacity:1;transform:none;transition:opacity .4s ease .85s,transform .4s ease .85s}
  .gtip-head{display:flex;flex-wrap:wrap;align-items:center;gap:2px 12px;padding-bottom:5px;
    border-bottom:1px solid var(--line-soft);margin-bottom:5px}
  .gtip-day{font-family:var(--display);font-weight:800;font-size:12.5px;color:var(--ink)}
  .gtip-kv{font-size:9.5px;color:var(--muted);font-weight:600;display:inline-flex;align-items:center;gap:4px}
  .gtip-kv b{color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
  .gtip-kv i{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
  .gtip-lbl{font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .gtip-row{display:flex;justify-content:space-between;gap:10px;font-size:10px;line-height:1.55}
  .gtip-row span{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gtip-row b{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr;unicode-bidi:isolate}
  .ltr{direction:ltr;unicode-bidi:isolate;text-align:start;white-space:nowrap}

  /* overflow:hidden is the backstop, but the real guard is min-height:0 on
     the flex children — without it a text block refuses to shrink below its
     content and pushes the last row straight out of the card. */
  .leakcard{position:absolute;inset:0;border-radius:16px;background:linear-gradient(180deg,#FFF9F4,#fff 42%);
    border:1px solid rgba(196,85,31,.28);box-shadow:var(--shadow);padding:15px 14px;
    display:flex;flex-direction:column;gap:9px;overflow:hidden}
  .lk-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--orange)}
  .lk-head{font-family:var(--display);font-weight:800;font-size:clamp(19px,5.8vw,26px);color:var(--ink);
    letter-spacing:-.02em;line-height:1.06}
  .lk-head .amt{color:var(--leak);direction:ltr;unicode-bidi:isolate}
  .lk-rows{display:flex;flex-direction:column;gap:9px;margin-top:1px;flex:1;min-height:0;justify-content:center}
  .lk-body{min-width:0}
  .lk-row{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;
    background:rgba(196,85,31,.05);border:1px solid rgba(196,85,31,.14);
    transform:translateX(${rtl ? "10px" : "-10px"});opacity:0;transition:opacity .45s ease,transform .45s ease}
  .mframe[data-stage="4"] .lk-row{opacity:1;transform:none}
  .mframe[data-stage="4"] .lk-row:nth-child(1){transition-delay:.34s}
  .mframe[data-stage="4"] .lk-row:nth-child(2){transition-delay:.46s}
  .lk-ic{width:26px;height:26px;flex:0 0 auto;border-radius:8px;background:rgba(196,85,31,.14);color:var(--leak);
    display:flex;align-items:center;justify-content:center}
  .lk-ic svg{width:58%;height:58%}
  .lk-t{font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.18}
  .lk-s{font-size:10px;color:var(--muted);line-height:1.28;margin-top:2px}
  .lk-s b{color:var(--green-deep);font-weight:700}
  .lk-amt{margin-inline-start:auto;font-family:var(--display);font-weight:800;font-size:19px;color:var(--leak);
    font-variant-numeric:tabular-nums;white-space:nowrap;direction:ltr;unicode-bidi:isolate}

  .l-cta{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px;
    transform:scale(.98);transition:transform .55s cubic-bezier(.2,.7,.2,1) .25s}
  .mframe[data-stage="5"] .l-cta{transform:none}
  .l-cta .lock{display:flex;align-items:baseline;gap:1px;font-size:clamp(40px,13vw,58px)}
  .l-cta .lock svg{height:1.32em;width:auto;align-self:baseline}
  .l-cta .lw{font-family:var(--round);font-weight:700;color:#0E4D2C;letter-spacing:-.01em}
  .l-cta .lw .dot{color:#F5821F}
  .l-cta .tag{font-family:var(--display);font-weight:700;font-size:clamp(16px,5vw,22px);color:var(--ink);
    letter-spacing:-.01em;padding:0 6px;text-wrap:balance}
  .l-cta .tag em{font-style:normal;color:var(--green-deep)}
  .l-cta .btn{font-weight:700;font-size:16px;color:#fff;background:var(--green-deep);
    padding:13px 26px;border-radius:999px;box-shadow:0 10px 24px rgba(20,81,44,.35)}
  .mframe[data-stage="5"] .mhead{opacity:0;transition:opacity .28s ease}
  .mframe[data-stage="5"] .l-cta{position:absolute;inset:-100px 0 0}

  .sweep{position:absolute;top:-20%;bottom:-20%;left:-40%;width:52%;z-index:7;pointer-events:none;
    transform:translateX(-60vw) rotate(9deg);opacity:0;filter:blur(5px);mix-blend-mode:screen;
    background:linear-gradient(90deg,transparent, rgba(209,115,31,.5) 48%, rgba(255,208,150,.9) 52%, transparent 90%)}
  .mframe[data-stage="1"] .sweep{animation:sweep 1.4s cubic-bezier(.5,0,.3,1) forwards}
  @keyframes sweep{0%{transform:translateX(-70%) rotate(9deg);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translateX(320%) rotate(9deg);opacity:0}}

  @media (prefers-reduced-motion:reduce){
    .layer{transition:none}.sweep{display:none}
    .card,.lk-row,.l-cta{transform:none!important;opacity:1!important}
    .gdraw{stroke-dashoffset:0!important}.garea{opacity:1!important}
    .intg,.frag{animation:none!important}
  }
</style>
</head>
<body>
<div class="mframe" data-stage="0" id="mframe">
  <div class="mticks" id="mticks"></div>

  <div class="mhead">
    <div class="mbrand" dir="ltr">${MARK}<span class="w">iloomy<span class="dot">.</span></span></div>
    ${""/* No caption band in portrait: it repeated the page's own h1 sitting
           directly above, and ate ~a third of a 3:4 frame — which is what
           pushed the leak card past its own bottom edge. Desktop keeps it. */}
  </div>

  <div class="mstage">
    <div class="layer l-chaos">
      <div class="frag" style="top:2%;left:3%;--r:-4deg">${c.fragSessions}<div class="n">28,493</div></div>
      <div class="frag" style="bottom:5%;right:5%;--r:5deg">${c.fragRefundShort}<div class="n">1.4%</div></div>
      <div class="intg" style="top:4%;right:8%;--r:5deg">${ICON_META}</div>
      <div class="intg" style="top:20%;left:6%;--r:-5deg">${ICON_GADS}</div>
      <div class="intg" style="top:16%;right:10%;--r:4deg">${ICON_TIKTOK}</div>
      <div class="intg" style="top:40%;left:8%;--r:6deg;background:linear-gradient(45deg,#FEDA75,#FA7E1E 28%,#D62976 60%,#962FBF)">${ICON_IG}</div>
      <div class="intg" style="top:44%;right:20%;--r:-4deg">${ICON_GA4}</div>
      <div class="intg" style="top:38%;left:44%;--r:3deg">${ICON_SHEETS}</div>
      <div class="intg" style="bottom:19%;left:6%;--r:-4deg">${ICON_SHOPIFY}</div>
      <div class="intg" style="bottom:15%;right:9%;--r:5deg;background:#7F54B3">${ICON_WOO}</div>
    </div>

    <div class="layer l-kpis">
      <div class="card"><span class="k-label">${K[0].label}</span><span class="k-val" data-to="247667" data-prefix="₪">₪0</span><span class="delta">▲ 20.2%</span></div>
      <div class="card"><span class="k-label">${K[1].label}</span><span class="k-val" data-to="135425" data-prefix="₪">₪0</span><span class="delta">▲ 14.8% · 42.9%</span></div>
      <div class="card"><span class="k-label">${K[2].label}</span><span class="k-val" data-to="40" data-suffix="%" data-dec="1">0.0%</span><span class="delta">${K[2].sub}</span></div>
      <div class="card"><span class="k-label">${K[3].label}</span><span class="k-val" data-to="322" data-prefix="₪">₪0</span><span class="delta">▲ 25.8%</span></div>
    </div>

    <div class="layer l-graph">
      <div class="gcard">
        <div class="gc-head"><span class="gc-title">${c.chartTitle}</span>
          <span class="glegend"><span><i style="background:var(--green)"></i>${c.legendRevenue}</span><span><i style="background:var(--orange)"></i>${c.legendProfit}</span></span></div>
        <div class="gwrap">
          <svg class="gsvg" viewBox="0 0 600 200" preserveAspectRatio="none">
            <defs><linearGradient id="mga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15A34A" stop-opacity=".26"/><stop offset="1" stop-color="#15A34A" stop-opacity="0"/></linearGradient></defs>
            <path class="garea" d="M0,120 C60,70 110,52 170,55 C240,58 300,96 360,120 C420,140 480,150 600,150 L600,200 L0,200 Z" fill="url(#mga)"/>
            <path class="grev gdraw" pathLength="1" d="M0,120 C60,70 110,52 170,55 C240,58 300,96 360,120 C420,140 480,150 600,150"/>
            <path class="gprof gdraw" pathLength="1" d="M0,158 C60,128 120,120 180,122 C250,124 300,150 360,160 C430,171 500,176 600,176"/>
          </svg>
          <div class="gtip">
            <div class="gtip-head"><span class="gtip-day">${c.tipDay}</span><span class="gtip-kv"><i style="background:var(--green)"></i>${c.legendRevenue} <b>₪36,109</b></span><span class="gtip-kv"><i style="background:var(--orange)"></i>${c.legendProfit} <b>₪20,508</b></span></div>
            <div class="gtip-lbl">${c.tipProducts}</div>
            <div class="gtip-row"><span class="ltr">Molecule — Base parfume</span><b>₪13,105</b></div>
            <div class="gtip-row"><span class="ltr">Second Skin</span><b>₪8,035</b></div>
            <div class="gtip-row"><span class="ltr">Advantage+ · Meta Ads</span><b style="color:#0E7A38">10.04× ROAS</b></div>
          </div>
        </div>
      </div>
    </div>

    <div class="layer l-leak">
      <div class="leakcard">
        <div class="lk-eyebrow">${c.leakEyebrow}</div>
        <div class="lk-head">${c.leakHeadBefore}<span class="amt" data-to="4348" data-prefix="₪">₪0</span>${c.leakHeadAfter}</div>
        <div class="lk-rows">
          <div class="lk-row">
            <span class="lk-ic">${ICON_ALERT}</span>
            <div class="lk-body"><div class="lk-t">${c.leakRowsShort[0].title}</div><div class="lk-s">${c.leakRowsShort[0].sub}</div></div>
            <div class="lk-amt" data-to="2447" data-prefix="₪">₪0</div>
          </div>
          <div class="lk-row">
            <span class="lk-ic">${ICON_ALERT}</span>
            <div class="lk-body"><div class="lk-t">${c.leakRowsShort[1].title}</div><div class="lk-s">${c.leakRowsShort[1].sub}</div></div>
            <div class="lk-amt" data-to="1901" data-prefix="₪">₪0</div>
          </div>
        </div>
      </div>
    </div>

    <div class="layer l-cta">
      <div class="lock" dir="ltr">${MARK}<span class="lw">iloomy<span class="dot">.</span></span></div>
      <div class="tag">${c.ctaTag}</div>
      <span class="btn">${c.ctaBtn}</span>
    </div>

    <div class="sweep"></div>
  </div>
</div>
<script>${script("mframe", ".l-kpis .k-val", ".l-leak [data-to]", ".mcap", "mticks", "2", 1, [2600, 1400, 3000, 3200, 3600, 3400])}<\/script>
</body>
</html>`;
}

export function buildHeroBannerDoc(locale: BannerLocale): { desktop: string; mobile: string } {
  return { desktop: desktopDoc(locale), mobile: mobileDoc(locale) };
}
