// Command Center report generator — the real-data version of the skeleton.
//
// For each section it (1) gathers REAL data from the store via the same
// services the app uses, (2) asks Hiloma (the BI, via the OpenAI JSON client
// the app is wired to) to write that section's summary + actions from those
// facts, and (3) assembles one standalone Hebrew report.html you can open and
// Save as PDF (A4).
//
// Runs where the data and keys live — your machine / prod — NOT from the
// assistant session (which can't reach the prod DB or the BI keys). Same
// pattern as the diag scripts.
//
// Usage (PowerShell, against production):
//   $env:DATABASE_URL = "postgresql://postgres.<project>:<pw>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"
//   # Hiloma narration needs the same OpenAI key the app uses:
//   $env:OPENAI_API_KEY = "sk-..."         # (or whatever OPENAI_* your app reads)
//   node --import tsx scripts/command-center-report.mjs <storeId> [--out report.html] [--days 28]
//
// Notes:
//   • Run with `node --import tsx` (NOT plain node) so it can import the app's
//     TypeScript services — same as the unit tests.
//   • If the OpenAI key is absent the report still generates: each section
//     falls back to the raw numbers with no Hiloma narration (and says so).
//   • Sections that need competitor PER-SKU data we don't hold yet (stockout
//     interception, trend radar) render an honest "pending" state.

import { getDb } from "../lib/server/db";
import { buildHomepageMerchandiser } from "../lib/services/homepage-merchandiser-service";
import { buildIdeaEngine } from "../lib/services/idea-engine-service";
import { listProductCosts } from "../lib/services/product-cost-service";
import { buildContributionMargin } from "../lib/services/contribution-margin-service";
import { getMetaCampaignsOverview } from "../lib/services/meta-campaigns-overview-service";
import { buildDiscountScorecards } from "../lib/services/discount-scorecard-service";
import { getCompetitorBrief } from "../lib/services/competitor-brief-service";
import { buildCompetitorWeekSection, listCompetitors } from "../lib/services/competitor-intel-service";
import { getStoreTimeZone, lastNDaysRange } from "../lib/server/reporting-date-range";
import { askOpenAiJson, isOpenAiConfigured } from "../lib/clients/openai-json-client";

// ── args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const storeId = argv.find((a) => !a.startsWith("--"));
const outPath = argIdx("--out") ?? "report.html";
const days = Number(argIdx("--days") ?? 28) || 28;
function argIdx(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}
if (!storeId) {
  console.error("Usage: node --import tsx scripts/command-center-report.mjs <storeId> [--out report.html] [--days 28]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the store's database.");
  process.exit(1);
}

const now = new Date();
const start = new Date(now.getTime() - days * 86_400_000);
const nis = (v) => `₪${Math.round(Number(v) || 0).toLocaleString("he-IL")}`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const log = (m) => console.log(`[command-center] ${m}`);

// ── Hiloma per-section narration ─────────────────────────────────────────
// One structured OpenAI call per section: real facts in, a short Hebrew
// summary + 2-4 action bullets out. This is the "ask the BI for each section"
// step. Degrades to null (data-only render) when the key is absent or the
// call fails, so the report always produces.
const biAvailable = isOpenAiConfigured();
async function askHiloma(sectionTitle, facts) {
  if (!biAvailable || !facts.trim()) return null;
  const question =
    `את הילומה, אנליסטית BI למותג איקומרס. לפנייך נתוני אמת מהחנות עבור הסעיף "${sectionTitle}" בדוח מרכז השליטה. ` +
    `כתבי בעברית בלבד: (א) summary — סיכום מנהלים של 2-3 משפטים שמסביר מה קורה ולמה זה חשוב, עם המספרים מהנתונים. ` +
    `(ב) bullets — 2 עד 4 המלצות פעולה קונקרטיות, כל אחת משפט פקודה קצר שנשען על מוצר/מספר ספציפי מהנתונים. ` +
    `אל תמציאי מספרים, מתחרים או תאריכים שאינם בנתונים. אם חסר מידע, אמרי זאת בקצרה.\n\nהנתונים:\n${facts}`;
  const jsonHint = `{"summary":"...","bullets":["...","..."]}`;
  try {
    const ans = await askOpenAiJson({ question, jsonHint, timeoutMs: 60_000, maxOutputTokens: 900 });
    if (ans && typeof ans.summary === "string") {
      return { summary: ans.summary, bullets: Array.isArray(ans.bullets) ? ans.bullets.slice(0, 4) : [] };
    }
  } catch (err) {
    log(`BI narration failed for "${sectionTitle}": ${err instanceof Error ? err.message : err}`);
  }
  return null;
}

// Render Hiloma's summary + bullets block (or a data-only note).
function biBlock(bi) {
  if (!bi) {
    return `<p class="bi-note">${biAvailable ? "הילומה לא החזירה ניתוח לסעיף זה — מוצגים הנתונים בלבד." : "מוצגים הנתונים בלבד (מפתח BI לא הוגדר בהרצה)."}</p>`;
  }
  const bullets = bi.bullets.length
    ? `<ul class="bi-bullets">${bi.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  return `<p class="bi-summary">${esc(bi.summary)}</p>${bullets}`;
}

const db = getDb();
const sections = [];
const kpi = { revenueAtRisk: 0, opportunities: 0, threats: 0, projectedLift: 0 };
let brandName = storeId;
let tz = "Asia/Jerusalem";
let competitorNames = [];

async function main() {
  // Store + competitor header facts.
  try {
    const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, domain: true } });
    if (store?.name) brandName = store.name;
    tz = await getStoreTimeZone(storeId);
    const comps = await listCompetitors(storeId);
    competitorNames = comps.filter((c) => c.status === "active").map((c) => c.name || c.domain);
  } catch (err) {
    log(`header facts failed: ${err instanceof Error ? err.message : err}`);
  }

  // ── 1 · Homepage merchandiser (real HSS) ──────────────────────────────
  await section("1", "מרצ'נדייזר עמוד הבית", "maker", async () => {
    const rep = await buildHomepageMerchandiser({ storeId, start, end: now });
    if (rep.scored.length === 0) return { html: pending("אין מספיק נתוני מכירות ועלות כדי לדרג את עמוד הבית."), facts: "" };
    const top = rep.scored.filter((p) => p.move !== "remove").slice(0, 8);
    const removes = rep.removeList.slice(0, 5);
    kpi.opportunities += top.filter((p) => p.move === "promote").length;
    const rows = rep.scored
      .slice(0, 10)
      .map(
        (p) =>
          `<tr><td class="prod">${esc(p.title)}</td><td class="n"><span class="hss ${hssClass(p.hss)}">${p.hss}</span></td><td>${movePill(p.move)}</td><td class="reason">${esc(p.reason.he)}</td></tr>`
      )
      .join("");
    const facts =
      `סדר מומלץ לפי HSS (${rep.windowDays} ימים):\n` +
      rep.scored
        .slice(0, 10)
        .map((p) => `- ${p.title}: HSS ${p.hss}, מהלך ${p.move}, ${p.reason.he}`)
        .join("\n") +
      (removes.length ? `\nלהסרה: ${removes.map((r) => r.title).join(", ")}` : "");
    const html =
      `<div class="tbl-wrap"><table><thead><tr><th>מוצר</th><th class="n">HSS</th><th>מהלך</th><th>סיבה</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return { html, facts };
  });

  // ── 2 · Stockout interception (pending competitor data) ───────────────
  await section("2", "יירוט חוסרי מלאי אצל מתחרים", "maker", async () => ({
    html: pending("דורש נתוני זמינות מלאי של מתחרים ברמת המוצר (RivalSweeper /signals/stock-events) — עדיין לא זורם. יופעל ברגע שהספק יספק התאמת מוצר-מול-מוצר."),
    facts: ""
  }));

  // ── 3 · Repricing (local margin floor; rival prices pending) ──────────
  await section("3", "תמחור בטוח-מרווח", "maker", async () => {
    const { rows } = await listProductCosts(storeId, { start, end: now });
    const sold = rows.filter((r) => r.unitsSold > 0 && (r.costOverrideAmount != null || r.estimatedCost > 0));
    if (sold.length === 0) return { html: pending("אין מוצרים שנמכרו עם עלות ידועה בחלון."), facts: "" };
    const floor = (r) => (r.effectiveUnitCost > 0 ? r.effectiveUnitCost / (1 - 0.35) : null);
    const cand = sold
      .map((r) => ({ ...r, floorPrice: floor(r), belowFloor: floor(r) != null && r.price < floor(r) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
    const rowsHtml = cand
      .map(
        (r) =>
          `<tr><td class="prod">${esc(r.title)}</td><td class="n">${nis(r.price)}</td><td class="n">${r.floorPrice != null ? nis(r.floorPrice) : "—"}</td><td class="n">${r.marginPct != null ? Math.round(r.marginPct) + "%" : "—"}</td><td>${r.belowFloor ? `<span class="pill remove">מתחת לרצפה</span>` : `<span class="pill hold">תקין</span>`}</td></tr>`
      )
      .join("");
    const facts =
      `רצפת מרווח 35%. מוצרים מובילים בהכנסה (מחיר · רצפת מחיר · מרווח%):\n` +
      cand.map((r) => `- ${r.title}: מחיר ${nis(r.price)}, רצפה ${r.floorPrice != null ? nis(r.floorPrice) : "?"}, מרווח ${r.marginPct != null ? Math.round(r.marginPct) + "%" : "?"}${r.belowFloor ? " (מתחת לרצפה!)" : ""}`).join("\n") +
      `\nהערה: מחירי מתחרים ברמת מוצר עדיין לא זמינים (RivalSweeper /signals/prices) — התייחסי רק לרצפת המרווח והזדמנויות קטיף.`;
    const html = `<div class="tbl-wrap"><table><thead><tr><th>מוצר</th><th class="n">מחיר</th><th class="n">רצפת מחיר (35%)</th><th class="n">מרווח</th><th>סטטוס</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    return { html, facts };
  });

  // ── 4 · Ad-spend reallocation (real Meta + breakeven) ─────────────────
  await section("4", "הקצאת תקציב פרסום", "helper", async () => {
    const overview = await getMetaCampaignsOverview(storeId, lastNDaysRange(7, tz)).catch(() => null);
    const margin = await buildContributionMargin({ storeId, start, end: now }).catch(() => null);
    const campaigns = (overview?.campaigns ?? []).filter((c) => c.activeRecently && c.spend >= 100).sort((a, b) => b.spend - a.spend);
    if (campaigns.length === 0) return { html: pending("אין קמפיינים פעילים במטא בחלון, או שחשבון המודעות לא מחובר."), facts: "" };
    const breakeven = margin && margin.totals.contributionMarginRate > 0 && (margin.quality.costCoverage ?? 0) >= 0.6
      ? 1 / margin.totals.contributionMarginRate
      : null;
    const rowsHtml = campaigns
      .slice(0, 6)
      .map((c) => {
        const roas = c.roas ?? 0;
        const losing = breakeven != null && roas < breakeven;
        return `<tr><td class="prod">${esc(c.campaignName)}</td><td class="n">${nis(c.spend)}</td><td class="n">${roas.toFixed(1)}</td><td>${losing ? `<span class="pill remove">מתחת לאיזון</span>` : `<span class="pill up">רווחי</span>`}</td></tr>`;
      })
      .join("");
    const facts =
      `ROAS איזון: ${breakeven != null ? "×" + breakeven.toFixed(1) : "לא ניתן לחשב (כיסוי עלויות נמוך)"}. קמפיינים פעילים (${overview.rangeStart}–${overview.rangeEnd}):\n` +
      campaigns.slice(0, 6).map((c) => `- ${c.campaignName}: הוצאה ${nis(c.spend)}, ROAS ${(c.roas ?? 0).toFixed(1)}`).join("\n");
    const html =
      (breakeven != null ? `<p class="lead">ROAS איזון של המותג: <b>×${breakeven.toFixed(1)}</b> — מתחת לזה הקמפיין מפסיד אחרי עלויות.</p>` : "") +
      `<div class="tbl-wrap"><table><thead><tr><th>קמפיין</th><th class="n">הוצאה (7 ימים)</th><th class="n">ROAS</th><th>מול איזון</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    return { html, facts };
  });

  // ── 5 · Best-seller defense (real top products + competitor week) ─────
  await section("5", "רדאר הגנה על רבי-המכר", "helper", async () => {
    const start90 = new Date(now.getTime() - 90 * 86_400_000);
    const { rows } = await listProductCosts(storeId, { start: start90, end: now });
    const sold = rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    if (sold.length === 0) return { html: pending("אין מכירות ב-90 הימים האחרונים."), facts: "" };
    const total = sold.reduce((s, r) => s + r.revenue, 0);
    const top = sold.slice(0, 8).map((r) => ({ ...r, share: total > 0 ? r.revenue / total : 0 }));
    kpi.revenueAtRisk += Math.round(top.slice(0, 3).reduce((s, r) => s + r.revenue, 0) / 3); // monthly-ish proxy
    let compCtx = "";
    try {
      const wk = await buildCompetitorWeekSection({ storeId, start, end: now });
      if (wk) compCtx = JSON.stringify(wk).slice(0, 1500);
    } catch { /* optional */ }
    const rowsHtml = top
      .map((r) => `<tr><td class="prod">${esc(r.title)}</td><td class="n">${Math.round(r.share * 100)}%</td><td class="n">${nis(r.revenue)}</td></tr>`)
      .join("");
    const facts =
      `רבי-המכר לפי הכנסה (90 ימים) ונתח מסך ההכנסה:\n` +
      top.map((r) => `- ${r.title}: ${nis(r.revenue)} (${Math.round(r.share * 100)}%)`).join("\n") +
      (compCtx ? `\nהקשר מתחרים (מודיעין השבוע): ${compCtx}` : `\nאין מודיעין מתחרים פעיל בחלון — סמני איזה מוצר לשמור ומדוע.`);
    const html = `<div class="tbl-wrap"><table><thead><tr><th>מוצר</th><th class="n">נתח הכנסה</th><th class="n">הכנסה (90 ימים)</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    return { html, facts };
  });

  // ── 6 · Coupon counter-play (real discounts + competitor promos) ──────
  await section("6", "מהלך נגד לקופון מתחרה", "maker", async () => {
    const scored = await buildDiscountScorecards({ storeId, start, end: now }).catch(() => null);
    const brief = await getCompetitorBrief(storeId, "he").catch(() => null);
    const cards = scored?.cards ?? [];
    const hasDiscounts = Array.isArray(cards) && cards.length > 0;
    if (!hasDiscounts && !brief) return { html: pending("אין קודי הנחה פעילים ואין מודיעין מתחרים על מבצעים."), facts: "" };
    const facts =
      (hasDiscounts
        ? `קודי ההנחה שלכם (חלון ${days} ימים) — קוד, עלות הנחה, מרווח אחרי הנחה, הכנסת ברוטו, פסיקה:\n` +
          cards
            .slice(0, 6)
            .map(
              (c) =>
                `- ${c.code}: עלות ${nis(c.discountCost)}, מרווח ${Math.round((c.marginRate ?? 0) * 100)}%, ברוטו ${nis(c.grossSales)}, פסיקה ${c.verdict}`
            )
            .join("\n")
        : "אין קודי הנחה פעילים כרגע.") +
      (brief?.competitors?.length
        ? `\nמבצעי מתחרים: ` + brief.competitors.map((c) => `${c.name}: ${c.move}`).join(" · ")
        : "\nאין מבצעי מתחרים פעילים בחלון.");
    const html = `<p class="lead">מבוסס על קודי ההנחה שלכם ועל מודיעין המתחרים הזמין. הילומה ממדלת תגובה ששומרת מרווח.</p>`;
    return { html, facts };
  });

  // ── 7 · Trend radar (pending launch data) ─────────────────────────────
  await section("7", "רדאר טרנדים ומגוון", "helper", async () => ({
    html: pending("דורש נתוני השקות מוצרים של מתחרים (RivalSweeper /signals/launches) — עדיין לא זורם."),
    facts: ""
  }));

  // ── 8 · AOV bundle builder (real co-occurrence) ───────────────────────
  await section("8", "בונה באנדלים להעלאת סל", "maker", async () => {
    const pairs = await coBoughtPairs(storeId, new Date(now.getTime() - 90 * 86_400_000), now);
    if (pairs.length === 0) return { html: pending("אין מספיק הזמנות מרובות-פריטים כדי לזהות רכישות משותפות."), facts: "" };
    const rowsHtml = pairs
      .slice(0, 6)
      .map((p) => `<tr><td class="prod">${esc(p.a)} + ${esc(p.b)}</td><td class="n">×${p.lift.toFixed(1)}</td><td class="n">${p.count}</td></tr>`)
      .join("");
    const facts =
      `זוגות מוצרים שנקנים יחד (90 ימים, מדד lift = כמה יותר ממקרי):\n` +
      pairs.slice(0, 6).map((p) => `- ${p.a} + ${p.b}: lift ×${p.lift.toFixed(1)}, ${p.count} הזמנות משותפות`).join("\n");
    const html = `<div class="tbl-wrap"><table><thead><tr><th>זוג מוצרים</th><th class="n">Lift</th><th class="n">הזמנות משותפות</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
    return { html, facts };
  });

  // KPI: opportunities + projected lift from the Idea Engine (money-ranked).
  try {
    const ideas = await buildIdeaEngine({ storeId, start, end: now });
    kpi.opportunities += ideas.ideas.length;
    kpi.projectedLift += Math.round(ideas.totalMonthlyImpact);
  } catch { /* optional */ }

  const html = assemble();
  const fs = await import("node:fs/promises");
  await fs.writeFile(outPath, html, "utf8");
  log(`wrote ${outPath} — open it and Save as PDF (A4). Brand: ${brandName}. BI narration: ${biAvailable ? "on" : "OFF (no OpenAI key)"}.`);
}

// Register + render one section: gather → ask Hiloma → capture HTML.
async function section(idx, title, kind, gather) {
  log(`section ${idx} — ${title}…`);
  let body = pending("שגיאה באיסוף הנתונים לסעיף זה.");
  let facts = "";
  try {
    const res = await gather();
    body = res.html;
    facts = res.facts;
  } catch (err) {
    log(`section ${idx} gather failed: ${err instanceof Error ? err.message : err}`);
  }
  const bi = await askHiloma(title, facts);
  sections.push({ idx, title, kind, body, bi });
}

// Order line-item co-occurrence → lift, for the bundle section.
async function coBoughtPairs(storeId, from, to) {
  const orders = await db.order.findMany({
    where: { storeId, cancelledAt: null, test: false, createdAt: { gte: from, lte: to } },
    select: { id: true, lineItems: { select: { title: true, productId: true } } }
  });
  const baskets = orders
    .map((o) => Array.from(new Set(o.lineItems.map((li) => (li.title ?? "").trim()).filter(Boolean))))
    .filter((b) => b.length >= 2);
  const N = orders.length || 1;
  const solo = new Map();
  const pair = new Map();
  for (const b of baskets) {
    for (const t of b) solo.set(t, (solo.get(t) ?? 0) + 1);
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++) {
        const [x, y] = [b[i], b[j]].sort();
        const k = `${x} ${y}`;
        pair.set(k, (pair.get(k) ?? 0) + 1);
      }
  }
  // Count solo occurrences across ALL orders (not just multi-item) for P(A).
  for (const o of orders) for (const t of new Set(o.lineItems.map((li) => (li.title ?? "").trim()).filter(Boolean))) {
    if (!solo.has(t)) solo.set(t, 0);
  }
  const out = [];
  for (const [k, count] of pair) {
    if (count < 2) continue;
    const [a, b] = k.split(" ");
    const pa = (solo.get(a) ?? 0) / N;
    const pb = (solo.get(b) ?? 0) / N;
    const pab = count / N;
    const lift = pa > 0 && pb > 0 ? pab / (pa * pb) : 0;
    if (lift > 1.3) out.push({ a, b, count, lift });
  }
  return out.sort((x, y) => y.lift * y.count - x.lift * x.count);
}

// ── render helpers ───────────────────────────────────────────────────────
const hssClass = (n) => (n >= 70 ? "a" : n >= 40 ? "b" : "c");
function movePill(m) {
  const map = {
    promote: `<span class="pill up">↑ לקדם</span>`,
    hold: `<span class="pill hold">= להשאיר</span>`,
    demote: `<span class="pill down">↓ להוריד</span>`,
    remove: `<span class="pill remove">✕ להסיר</span>`
  };
  return map[m] ?? m;
}
const pending = (msg) => `<p class="pending">⏳ ${esc(msg)}</p>`;
const tagHtml = (kind) =>
  kind === "maker" ? `<span class="tag maker">עושה</span>` : `<span class="tag helper">ממליצה</span>`;

function assemble() {
  const runDate = now.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
  const compLine = competitorNames.length ? `${competitorNames.length} — ${competitorNames.slice(0, 6).join(" · ")}` : "אין מתחרים מוגדרים";
  const sectionHtml = sections
    .map(
      (s) => `
      <section>
        <div class="sec-head">
          <div class="sec-idx">${s.idx}</div>
          <div><div class="sec-title">${esc(s.title)}${tagHtml(s.kind)}</div></div>
        </div>
        <div class="bi">${biBlock(s.bi)}</div>
        ${s.body}
      </section>`
    )
    .join("");

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>מרכז השליטה — ${esc(brandName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Rubik:wght@600;700;800&display=swap">
<style>${CSS}</style></head><body><div class="sheet">
  <header class="masthead">
    <div class="row">
      <div class="brand"><div class="mark">🕯️</div>
        <div><div class="name">${esc(brandName)}</div>
        <div class="sub">מרכז השליטה של הילומה — מודיעין תחרותי מול הנתונים שלכם</div></div></div>
    </div>
    <div class="meta-line">
      <span>📅 הופק: <b>${runDate}</b></span>
      <span>🎯 מתחרים במעקב: <b>${esc(compLine)}</b></span>
      <span>🤖 נכתב על ידי <b>הילומה</b>${biAvailable ? "" : " (ניתוח לא זמין בהרצה זו)"}</span>
      <span>🪟 חלון: <b>${days} ימים אחרונים</b></span>
    </div>
  </header>
  <div class="kpis">
    <div class="kpi"><div class="lab">הכנסה בסיכון (הערכה)</div><div class="val num">${nis(kpi.revenueAtRisk)}</div><div class="foot">לחודש · רבי-מכר חשופים</div></div>
    <div class="kpi"><div class="lab">הזדמנויות פתוחות</div><div class="val num">${kpi.opportunities}</div><div class="foot">מדורגות לפי כסף</div></div>
    <div class="kpi"><div class="lab">איומים חיים</div><div class="val num" style="color:var(--crit)">${kpi.threats}</div><div class="foot">על מוצרים מובילים</div></div>
    <div class="kpi"><div class="lab">רווח פוטנציאלי</div><div class="val pos num">+${nis(kpi.projectedLift)}</div><div class="foot">לחודש · ממנוע הרעיונות</div></div>
  </div>
  ${sectionHtml}
  <div class="foot-band">
    <span class="trust">🔒 המספרים הראשוניים שלכם — עלות, מרווח, הכנסה — לא עוזבים את החנות.</span>
    <div class="stamps"><span class="stamp">הופק: ${runDate}</span><span class="stamp">מקור: הנתונים החיים של החנות</span></div>
  </div>
  <p class="hint no-print">💡 לשמירה כ-PDF: Ctrl/⌘ + P ← «שמירה כ-PDF» ← A4.</p>
</div></body></html>`;
}

// CSS — light, print-first, RTL (mirrors the approved skeleton).
const CSS = `
*{box-sizing:border-box}
body{background:#f6f5f1;color:#1b201c;font-family:'Heebo',system-ui,sans-serif;line-height:1.55;direction:rtl;margin:0}
.sheet{max-width:900px;margin:0 auto;padding:28px 18px 60px}
h1,h2,h3{font-family:'Rubik','Heebo',sans-serif;margin:0}
.num{font-variant-numeric:tabular-nums}
.masthead{position:relative;overflow:hidden;border-radius:20px;color:#fff;background:linear-gradient(135deg,#155c3f,#1f7a54 62%,#2c9268);padding:26px 28px}
.masthead::after{content:"";position:absolute;inset-inline-start:-40px;top:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(232,131,58,.55),transparent 68%)}
.masthead .row{position:relative;display:flex;flex-wrap:wrap;justify-content:space-between;gap:14px}
.brand{display:flex;align-items:center;gap:11px}
.brand .mark{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.14);display:grid;place-items:center;font-size:22px;border:1px solid rgba(255,255,255,.28)}
.brand .name{font-family:'Rubik';font-weight:800;font-size:22px}
.brand .sub{font-size:12.5px;opacity:.85;margin-top:1px}
.meta-line{position:relative;margin-top:16px;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12.5px;opacity:.92}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.kpi{background:#fff;border:1px solid #e4e2da;border-radius:14px;padding:14px 15px}
.kpi .lab{font-size:11.5px;color:#5c645d;font-weight:600}
.kpi .val{font-family:'Rubik';font-weight:800;font-size:23px;margin-top:4px}
.kpi .val.pos{color:#1f7a54}
.kpi .foot{font-size:11px;color:#8b928b;margin-top:2px}
section{background:#fff;border:1px solid #e4e2da;border-radius:16px;padding:20px 22px;margin-top:18px;break-inside:avoid}
.sec-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
.sec-idx{width:30px;height:30px;border-radius:9px;background:#e8f3ec;color:#155c3f;font-family:'Rubik';font-weight:800;display:grid;place-items:center;font-size:15px}
.sec-title{font-family:'Rubik';font-weight:700;font-size:17px}
.tag{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-inline-start:8px;vertical-align:middle}
.tag.maker{background:#e8f3ec;color:#155c3f}.tag.helper{background:#eeece6;color:#5c645d}
.bi{margin-bottom:12px}
.bi-summary{font-size:13.5px;margin:0 0 8px}
.bi-bullets{margin:0;padding-inline-start:20px;font-size:13px;color:#33403a}
.bi-bullets li{margin:3px 0}
.bi-note,.pending{font-size:12.5px;color:#8b928b;background:#f6f5f1;border:1px dashed #e4e2da;border-radius:10px;padding:10px 12px;margin:0}
.lead{font-size:13px;color:#5c645d;margin:0 0 10px}
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:start;padding:9px 10px;border-bottom:1px solid #eeece6}
th{font-size:11px;font-weight:700;color:#8b928b}
tbody tr:last-child td{border-bottom:0}
td.n,th.n{text-align:end;font-variant-numeric:tabular-nums}
.prod{font-weight:600}.reason{color:#5c645d;font-size:12px}
.hss{display:inline-grid;place-items:center;min-width:34px;height:26px;border-radius:8px;font-weight:800;font-family:'Rubik';font-size:13px}
.hss.a{background:#e8f3ec;color:#1f7a54}.hss.b{background:#fbf1dc;color:#b7791f}.hss.c{background:#fae4e2;color:#b4362f}
.pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
.pill.up{background:#e8f3ec;color:#1f7a54}.pill.down{background:#fbf1dc;color:#b7791f}.pill.hold{background:#eeece6;color:#5c645d}.pill.remove{background:#fae4e2;color:#b4362f}
.foot-band{margin-top:20px;border-top:2px solid #1f7a54;padding-top:14px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;font-size:12px;color:#5c645d}
.foot-band .trust{font-weight:700;color:#155c3f}
.stamps{display:flex;flex-wrap:wrap;gap:6px}
.stamp{background:#eeece6;border-radius:999px;padding:3px 10px;font-size:11px}
.hint{max-width:900px;margin:14px auto 0;font-size:12px;color:#8b928b;text-align:center}
@media (max-width:640px){.kpis{grid-template-columns:repeat(2,1fr)}}
@media print{@page{size:A4;margin:12mm}body{background:#fff}.sheet{max-width:none;margin:0;padding:0}section,.kpi{box-shadow:none}.no-print{display:none!important}.masthead{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect?.().catch(() => {});
  });
