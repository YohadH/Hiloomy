// Deterministic creative reasoning for Meta accounts (owner spec, 2026-09-24).
//
//   DATA → DERIVED METRICS → DETERMINISTIC SIGNALS → INSIGHT CANDIDATES → RANKING
//
// The LLM must never DISCOVER that one creative carries 62% of a campaign's
// sales — this module knows it mathematically. The model only phrases what
// comes out of here. Everything is compared INSIDE its context: a creative
// against its campaign siblings, a campaign against the account, the account
// against the store's breakeven.
//
// Metric hierarchy (CTR is a diagnostic, never a ranking metric):
//   1 purchases / revenue · 2 ROAS vs breakeven · 3 CPA · 4 sample size ·
//   5 funnel conversion · 6 CTR (explains WHY, does not decide WHO is good)
//
// Pure; tested in tests/unit/meta-creative-signals.test.ts.

export interface PeriodMetrics {
  spend: number;
  revenue: number;
  purchases: number;
  clicks: number;
  impressions: number;
}

export interface CreativeInput extends PeriodMetrics {
  creativeId: string;
  name: string;
  campaignId: string;
  previous?: PeriodMetrics | null;
}

export interface CampaignInput extends PeriodMetrics {
  campaignId: string;
  name: string;
  funnel?: { linkClicks: number; landingPageViews: number; addToCart: number; initiateCheckout: number } | null;
  previous?: PeriodMetrics | null;
}

export interface SignalsInput {
  account: PeriodMetrics;
  // 1 / contribution-margin rate, when the store's costs are trusted. Null = unknown.
  breakevenRoas: number | null;
  campaigns: CampaignInput[];
  creatives: CreativeInput[];
}

// One record per creative — the owner's CreativePerformance.
export interface CreativePerformance {
  campaignId: string;
  campaignName: string;
  creativeId: string;
  name: string;
  spend: number;
  revenue: number;
  purchases: number;
  clicks: number;
  impressions: number;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
  campaignRevenueShare: number | null;
  campaignPurchaseShare: number | null;
  campaignSpendShare: number | null;
  accountRoas: number | null;
  campaignRoas: number | null;
  breakevenRoas: number | null;
  previous: (PeriodMetrics & { roas: number | null; cpa: number | null; ctr: number | null }) | null;
}

export type CandidateType =
  | "ACCOUNT_HEALTH"
  | "CREATIVE_CONCENTRATION"
  | "ESTABLISHED_WINNER"
  | "EMERGING_WINNER"
  | "UNDERPERFORMER"
  | "ZERO_CONVERSION_SPEND"
  | "CREATIVE_FATIGUE"
  | "CAMPAIGN_DEPENDENCY"
  | "FUNNEL_BREAK";

// What the manager should do with it. "context" is background, never a card
// that asks for attention on its own.
export type CandidateStatus = "context" | "winner" | "watch" | "test" | "review";
export type Confidence = "high" | "medium" | "low";

export interface InsightCandidate {
  type: CandidateType;
  status: CandidateStatus;
  // 0–100; higher = more of the manager's attention. Used for ranking only.
  severity: number;
  campaignId: string | null;
  campaignName: string | null;
  creativeIds: string[];
  creativeNames: string[];
  // Every number the sentence relies on, so the phrasing layer cannot invent.
  evidence: Record<string, number | string | null>;
  sampleSize: number;
  confidence: Confidence;
  // Deterministic Hebrew / English rendering — usable with no LLM at all.
  title: { he: string; en: string };
  body: { he: string; en: string };
  // "Management implication", one line.
  recommendation: { he: string; en: string };
}

export interface CreativeSignalsResult {
  performance: CreativePerformance[];
  candidates: InsightCandidate[];
  mediaHealth: "strong" | "ok" | "weak" | "unverified";
  // What is already fine vs what deserves attention — the attention layer.
  attention: { okay: { he: string; en: string }[]; needs: InsightCandidate[] };
  headline: { he: string; en: string };
}

// ── V0 thresholds ──────────────────────────────────────────────────────────
export const THRESHOLDS = {
  minWinnerPurchases: 8,
  winnerRoasOverBreakeven: 1.3,
  minEmergingPurchases: 2,
  emergingRoasLift: 1.2,
  emergingCpaCut: 0.8,
  concentrationHigh: 0.5,
  concentrationVeryHigh: 0.7,
  minCampaignPurchasesForConcentration: 5,
  // With two creatives one of them dominating is the norm, not a signal.
  minCreativesForConcentration: 3,
  meaningfulSpendFloor: 150,
  // A "100% from one creative" read needs some volume; 1 purchase is noise.
  minCampaignPurchasesForDependency: 3,
  underperformerMinPurchases: 3,
  underperformerSpendShare: 0.15,
  fatigueRoasDrop: 0.7, // current < 70% of previous
  fatigueCtrDrop: 0.8, // current CTR < 80% of previous
  fatigueMinPreviousPurchases: 5,
  healthyRatio: 1.5,
  funnelBreakRatio: 0.5, // a stage converting at < 50% of the account median
  // Funnel breaks are a secondary diagnostic: only campaigns that matter
  // (≥5% of account spend) and at most the two largest per account.
  funnelBreakMinSpendShare: 0.05,
  funnelBreakMaxCandidates: 2
} as const;

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const confidenceFor = (purchases: number): Confidence => (purchases >= 20 ? "high" : purchases >= THRESHOLDS.minWinnerPurchases ? "medium" : "low");
const money = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
const roasStr = (v: number | null) => (v == null ? "—" : `×${v.toFixed(2)}`);

function derive(input: SignalsInput): CreativePerformance[] {
  const accountRoas = r2(safeDiv(input.account.revenue, input.account.spend));
  const byCampaign = new Map(input.campaigns.map((c) => [c.campaignId, c]));
  return input.creatives.map((c) => {
    const camp = byCampaign.get(c.campaignId);
    const prev = c.previous
      ? { ...c.previous, roas: r2(safeDiv(c.previous.revenue, c.previous.spend)), cpa: r2(safeDiv(c.previous.spend, c.previous.purchases)), ctr: r2(safeDiv(c.previous.clicks * 100, c.previous.impressions)) }
      : null;
    return {
      campaignId: c.campaignId,
      campaignName: camp?.name ?? c.campaignId,
      creativeId: c.creativeId,
      name: c.name,
      spend: c.spend,
      revenue: c.revenue,
      purchases: c.purchases,
      clicks: c.clicks,
      impressions: c.impressions,
      roas: r2(safeDiv(c.revenue, c.spend)),
      cpa: r2(safeDiv(c.spend, c.purchases)),
      ctr: r2(safeDiv(c.clicks * 100, c.impressions)),
      campaignRevenueShare: camp ? safeDiv(c.revenue, camp.revenue) : null,
      campaignPurchaseShare: camp ? safeDiv(c.purchases, camp.purchases) : null,
      campaignSpendShare: camp ? safeDiv(c.spend, camp.spend) : null,
      accountRoas,
      campaignRoas: camp ? r2(safeDiv(camp.revenue, camp.spend)) : null,
      breakevenRoas: input.breakevenRoas,
      previous: prev
    };
  });
}

// CTR as a diagnostic sentence, attached to a creative when it says something.
function ctrDiagnostic(p: CreativePerformance, siblings: CreativePerformance[]): { he: string; en: string } | null {
  const others = siblings.filter((s) => s.creativeId !== p.creativeId && s.ctr != null);
  if (p.ctr == null || others.length === 0) return null;
  const median = [...others].map((s) => s.ctr as number).sort((a, b) => a - b)[Math.floor(others.length / 2)];
  const highCtr = p.ctr >= median * 1.3;
  const lowRoas = p.roas != null && p.campaignRoas != null && p.roas < p.campaignRoas * 0.8;
  const highRoas = p.roas != null && p.campaignRoas != null && p.roas > p.campaignRoas * 1.2;
  if (highCtr && lowRoas) return { he: `CTR גבוה (${p.ctr}%) עם ROAS נמוך — הקליקים לא מתורגמים למכירות`, en: `high CTR (${p.ctr}%) with low ROAS — clicks are not commercially valuable` };
  if (!highCtr && highRoas) return { he: `CTR רגיל (${p.ctr}%) עם ROAS גבוה — איכות התנועה וההמרה חזקות`, en: `average CTR (${p.ctr}%) with high ROAS — traffic quality and conversion are strong` };
  return null;
}

export function buildCreativeSignals(input: SignalsInput): CreativeSignalsResult {
  const performance = derive(input);
  const candidates: InsightCandidate[] = [];
  const accountRoas = r2(safeDiv(input.account.revenue, input.account.spend));
  const be = input.breakevenRoas;

  // ── 1. Account health (context, never a card that demands attention) ─────
  let mediaHealth: CreativeSignalsResult["mediaHealth"] = "unverified";
  if (accountRoas != null && be != null && be > 0) {
    const ratio = accountRoas / be;
    mediaHealth = ratio >= THRESHOLDS.healthyRatio ? "strong" : ratio >= 1 ? "ok" : "weak";
    candidates.push({
      type: "ACCOUNT_HEALTH",
      status: mediaHealth === "weak" ? "review" : "context",
      severity: mediaHealth === "weak" ? 95 : 5,
      campaignId: null,
      campaignName: null,
      creativeIds: [],
      creativeNames: [],
      evidence: { accountRoas, breakevenRoas: be, ratio: r2(ratio), spend: input.account.spend, purchases: input.account.purchases },
      sampleSize: input.account.purchases,
      confidence: confidenceFor(input.account.purchases),
      title: mediaHealth === "weak" ? { he: "המדיה מתחת לנקודת האיזון", en: "Media is below breakeven" } : { he: "המדיה רווחית מעל נקודת האיזון", en: "Media is profitable above breakeven" },
      body: {
        he: `ROAS חשבוני ${roasStr(accountRoas)} מול נקודת איזון ${roasStr(be)} — ${ratio.toFixed(2)}× מעל${mediaHealth === "weak" ? "/מתחת" : ""}.`,
        en: `Account ROAS ${roasStr(accountRoas)} vs breakeven ${roasStr(be)} — ${ratio.toFixed(2)}× the line.`
      },
      recommendation:
        mediaHealth === "weak"
          ? { he: "קודם לעצור את הדימום: לזהות את הקמפיינים שמתחת לנקודת האיזון.", en: "Stop the bleeding first: find the campaigns below breakeven." }
          : { he: "אין בעיה במדיה. תשומת הלב צריכה ללכת לאופטימיזציה בתוך מערכת שעובדת.", en: "No media problem. Attention belongs to optimisation inside a working system." }
    });
  } else if (accountRoas != null) {
    mediaHealth = "unverified";
    candidates.push({
      type: "ACCOUNT_HEALTH",
      status: "context",
      severity: 5,
      campaignId: null,
      campaignName: null,
      creativeIds: [],
      creativeNames: [],
      evidence: { accountRoas, breakevenRoas: null, spend: input.account.spend, purchases: input.account.purchases },
      sampleSize: input.account.purchases,
      confidence: "low",
      title: { he: "ביצועי המדיה נמדדים בלי נקודת איזון", en: "Media performance measured without a breakeven" },
      body: { he: `ROAS חשבוני ${roasStr(accountRoas)}. בלי עלויות מוצר אי אפשר לומר רווחי/מפסיד.`, en: `Account ROAS ${roasStr(accountRoas)}. Without product costs, profitable/losing cannot be stated.` },
      recommendation: { he: "להשלים עלויות מוצר כדי שהשוואות יהיו מול נקודת האיזון.", en: "Complete product costs so comparisons run against breakeven." }
    });
  }

  // ── per-campaign rules ────────────────────────────────────────────────────
  for (const camp of input.campaigns) {
    const siblings = performance.filter((p) => p.campaignId === camp.campaignId && p.spend > 0);
    if (!siblings.length) continue;
    const campaignRoas = r2(safeDiv(camp.revenue, camp.spend));
    const campaignCpa = r2(safeDiv(camp.spend, camp.purchases));
    const byRevenue = [...siblings].sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases);
    const top = byRevenue[0];
    const activeCount = siblings.length;

    // 2. Concentration — only meaningful with ≥2 active creatives and some volume.
    if (activeCount >= THRESHOLDS.minCreativesForConcentration && camp.purchases >= THRESHOLDS.minCampaignPurchasesForConcentration && top.campaignRevenueShare != null && top.campaignRevenueShare >= THRESHOLDS.concentrationHigh && (top.campaignPurchaseShare ?? 0) < 0.999) {
      const veryHigh = top.campaignRevenueShare >= THRESHOLDS.concentrationVeryHigh;
      candidates.push({
        type: "CREATIVE_CONCENTRATION",
        status: "watch",
        severity: veryHigh ? 60 : 45,
        campaignId: camp.campaignId,
        campaignName: camp.name,
        creativeIds: [top.creativeId],
        creativeNames: [top.name],
        evidence: { revenueShare: r2(top.campaignRevenueShare), purchaseShare: r2(top.campaignPurchaseShare), purchases: top.purchases, revenue: top.revenue, roas: top.roas, cpa: top.cpa, activeCreatives: activeCount },
        sampleSize: top.purchases,
        confidence: confidenceFor(top.purchases),
        title: { he: `${camp.name} תלוי בקריאייטיב אחד`, en: `${camp.name} depends on one creative` },
        body: {
          he: `"${top.name}" מייצר ${pct(top.campaignRevenueShare)} ממכירות הקמפיין (${top.purchases} רכישות, ROAS ${roasStr(top.roas)}) מתוך ${activeCount} קריאייטיבים פעילים.`,
          en: `"${top.name}" produces ${pct(top.campaignRevenueShare)} of the campaign's sales (${top.purchases} purchases, ROAS ${roasStr(top.roas)}) out of ${activeCount} active creatives.`
        },
        recommendation: { he: "מנצח ברור — להגן עליו ולעקוב אחר שחיקה; להכין יורש לפני שהוא נשחק.", en: "A clear winner — protect it, watch for fatigue, and prepare a successor before it fades." }
      });
    }

    // 3. Established winner.
    const median = [...siblings].map((s) => s.roas ?? 0).sort((a, b) => a - b)[Math.floor(siblings.length / 2)] ?? 0;
    const winner = siblings.find(
      (p) =>
        p.purchases >= THRESHOLDS.minWinnerPurchases &&
        p.roas != null &&
        (be == null ? p.roas >= Math.max(median, accountRoas ?? 1, 1) : p.roas > be * THRESHOLDS.winnerRoasOverBreakeven) &&
        p.roas >= median
    );
    if (winner) {
      const diag = ctrDiagnostic(winner, siblings);
      candidates.push({
        type: "ESTABLISHED_WINNER",
        status: "winner",
        severity: 30,
        campaignId: camp.campaignId,
        campaignName: camp.name,
        creativeIds: [winner.creativeId],
        creativeNames: [winner.name],
        evidence: { purchases: winner.purchases, roas: winner.roas, cpa: winner.cpa, revenueShare: r2(winner.campaignRevenueShare), breakevenRoas: be, campaignMedianRoas: r2(median), ctr: winner.ctr },
        sampleSize: winner.purchases,
        confidence: confidenceFor(winner.purchases),
        title: { he: `"${winner.name}" הוא המנצח של ${camp.name}`, en: `"${winner.name}" is the winner of ${camp.name}` },
        body: {
          he: `${winner.purchases} רכישות, ROAS ${roasStr(winner.roas)}, CPA ${winner.cpa != null ? money(winner.cpa) : "—"}${be != null ? ` — ${(winner.roas! / be).toFixed(1)}× מעל נקודת האיזון` : ""}.${diag ? ` ${diag.he}.` : ""}`,
          en: `${winner.purchases} purchases, ROAS ${roasStr(winner.roas)}, CPA ${winner.cpa != null ? money(winner.cpa) : "—"}${be != null ? ` — ${(winner.roas! / be).toFixed(1)}× breakeven` : ""}.${diag ? ` ${diag.en}.` : ""}`
        },
        recommendation: { he: "בסיס להשוואה לכל קריאייטיב אחר בקמפיין.", en: "The baseline every other creative in this campaign is compared to." }
      });
    }

    // 4. Emerging winner — compared to the campaign's baseline creative (the
    //    winner above, else the top-revenue creative with ≥5 purchases).
    const baseline = winner ?? byRevenue.find((p) => p.purchases >= 5) ?? null;
    if (baseline) {
      for (const p of siblings) {
        if (p.creativeId === baseline.creativeId || p.roas == null || p.cpa == null || baseline.roas == null || baseline.cpa == null) continue;
        if (p.purchases < THRESHOLDS.minEmergingPurchases || p.purchases >= THRESHOLDS.minWinnerPurchases) continue;
        if (p.roas > baseline.roas * THRESHOLDS.emergingRoasLift && p.cpa < baseline.cpa * THRESHOLDS.emergingCpaCut) {
          const cpaCut = 1 - p.cpa / baseline.cpa;
          const roasLift = p.roas / baseline.roas - 1;
          candidates.push({
            type: "EMERGING_WINNER",
            status: "test",
            severity: 55,
            campaignId: camp.campaignId,
            campaignName: camp.name,
            creativeIds: [p.creativeId, baseline.creativeId],
            creativeNames: [p.name, baseline.name],
            evidence: { roas: p.roas, baselineRoas: baseline.roas, cpa: p.cpa, baselineCpa: baseline.cpa, cpaImprovement: r2(cpaCut), roasImprovement: r2(roasLift), purchases: p.purchases, baselinePurchases: baseline.purchases, spend: p.spend },
            sampleSize: p.purchases,
            confidence: "low",
            title: { he: `ב־${camp.name} יש מנצח פוטנציאלי עם מדגם קטן`, en: `${camp.name} has a potential winner on a small sample` },
            body: {
              he: `"${p.name}": CPA ${money(p.cpa)} מול ${money(baseline.cpa)} (${pct(cpaCut)} נמוך יותר), ROAS ${roasStr(p.roas)} מול ${roasStr(baseline.roas)} — אבל רק ${p.purchases} רכישות מול ${baseline.purchases}.`,
              en: `"${p.name}": CPA ${money(p.cpa)} vs ${money(baseline.cpa)} (${pct(cpaCut)} lower), ROAS ${roasStr(p.roas)} vs ${roasStr(baseline.roas)} — but only ${p.purchases} purchases vs ${baseline.purchases}.`
            },
            recommendation: { he: "TEST, לא SCALE: לתת לו יותר delivery ולבדוק אם היעילות מחזיקה מעל 8 רכישות.", en: "TEST, not SCALE: give it more delivery and check the efficiency holds past 8 purchases." }
          });
        }
      }
    }

    // 5. Dependency: one creative = 100% of sales while others spend.
    if (activeCount >= 2 && camp.purchases >= THRESHOLDS.minCampaignPurchasesForDependency && top.campaignPurchaseShare != null && top.campaignPurchaseShare >= 0.999) {
      const meaningful = Math.max(THRESHOLDS.meaningfulSpendFloor, campaignCpa ?? 0);
      const idle = siblings.filter((p) => p.creativeId !== top.creativeId && p.purchases === 0);
      const wasted = idle.filter((p) => p.spend >= meaningful);
      const idleSpend = idle.reduce((s, p) => s + p.spend, 0);
      candidates.push({
        type: wasted.length ? "ZERO_CONVERSION_SPEND" : "CAMPAIGN_DEPENDENCY",
        status: wasted.length ? "review" : "watch",
        severity: wasted.length ? 70 : 40,
        campaignId: camp.campaignId,
        campaignName: camp.name,
        creativeIds: [top.creativeId, ...idle.map((p) => p.creativeId)],
        creativeNames: [top.name, ...idle.map((p) => p.name)],
        evidence: { topPurchases: top.purchases, topRevenue: top.revenue, idleCreatives: idle.length, idleSpend: r2(idleSpend), meaningfulSpend: meaningful, wastedCreatives: wasted.length },
        sampleSize: top.purchases,
        confidence: wasted.length ? confidenceFor(top.purchases) : "low",
        title: { he: `ב־${camp.name} כל המכירות מגיעות מקריאייטיב אחד`, en: `In ${camp.name} every sale comes from one creative` },
        body: wasted.length
          ? {
              he: `"${top.name}" מייצר 100% מהמכירות (${top.purchases} רכישות). ${wasted.length} קריאייטיבים אחרים הוציאו ${money(idleSpend)} בלי רכישה.`,
              en: `"${top.name}" produces 100% of sales (${top.purchases} purchases). ${wasted.length} other creatives spent ${money(idleSpend)} with no purchase.`
            }
          : {
              he: `"${top.name}" מייצר 100% מהמכירות (${top.purchases} רכישות). יתר הקריאייטיבים הוציאו ${money(idleSpend)} — מעט מדי כדי לקבוע שזה בזבוז.`,
              en: `"${top.name}" produces 100% of sales (${top.purchases} purchases). The other creatives spent ${money(idleSpend)} — too little to call it waste.`
            },
        recommendation: wasted.length
          ? { he: "לבדוק האם יתר הקריאייטיבים צורכים תקציב ללא תרומה — מועמדים להשהיה, לא לעצירה אוטומטית.", en: "Check whether the other creatives consume budget without contributing — pause candidates, not an automatic stop." }
          : { he: "לעקוב: אם ההוצאה על היתר תעלה בלי רכישות, זה הופך לבזבוז.", en: "Watch: if spend on the rest grows with no purchases, this becomes waste." }
      });
    }

    // 6. Underperformer — enough volume to judge, clearly below the line.
    for (const p of siblings) {
      if (p.purchases < THRESHOLDS.underperformerMinPurchases || p.roas == null || p.campaignSpendShare == null || p.campaignSpendShare < THRESHOLDS.underperformerSpendShare) continue;
      const belowBreakeven = be != null && p.roas < be;
      const farBelowCampaign = campaignRoas != null && p.roas < campaignRoas * 0.5;
      if (!belowBreakeven && !farBelowCampaign) continue;
      const diag = ctrDiagnostic(p, siblings);
      candidates.push({
        type: "UNDERPERFORMER",
        status: "review",
        severity: belowBreakeven ? 75 : 50,
        campaignId: camp.campaignId,
        campaignName: camp.name,
        creativeIds: [p.creativeId],
        creativeNames: [p.name],
        evidence: { roas: p.roas, campaignRoas, breakevenRoas: be, cpa: p.cpa, purchases: p.purchases, spend: p.spend, spendShare: r2(p.campaignSpendShare), ctr: p.ctr },
        sampleSize: p.purchases,
        confidence: confidenceFor(p.purchases),
        title: { he: `"${p.name}" מושך את ${camp.name} למטה`, en: `"${p.name}" drags ${camp.name} down` },
        body: {
          he: `${pct(p.campaignSpendShare)} מהוצאת הקמפיין ב־ROAS ${roasStr(p.roas)}${belowBreakeven ? ` — מתחת לנקודת האיזון ${roasStr(be)}` : ` מול ${roasStr(campaignRoas)} של הקמפיין`} (${p.purchases} רכישות).${diag ? ` ${diag.he}.` : ""}`,
          en: `${pct(p.campaignSpendShare)} of campaign spend at ROAS ${roasStr(p.roas)}${belowBreakeven ? ` — below breakeven ${roasStr(be)}` : ` vs the campaign's ${roasStr(campaignRoas)}`} (${p.purchases} purchases).${diag ? ` ${diag.en}.` : ""}`
        },
        recommendation: { he: "להעביר תקציב למנצח של הקמפיין, או להחליף את הקריאייטיב.", en: "Shift budget to the campaign's winner, or replace the creative." }
      });
    }

    // 7. Fatigue — same creative, comparable spend, ROAS and CTR both down.
    for (const p of siblings) {
      const prev = p.previous;
      if (!prev || prev.purchases < THRESHOLDS.fatigueMinPreviousPurchases || prev.roas == null || p.roas == null || prev.ctr == null || p.ctr == null) continue;
      const spendComparable = prev.spend > 0 && p.spend / prev.spend >= 0.7 && p.spend / prev.spend <= 1.3;
      if (!spendComparable) continue;
      if (p.roas < prev.roas * THRESHOLDS.fatigueRoasDrop && p.ctr < prev.ctr * THRESHOLDS.fatigueCtrDrop) {
        candidates.push({
          type: "CREATIVE_FATIGUE",
          status: "watch",
          severity: 50,
          campaignId: camp.campaignId,
          campaignName: camp.name,
          creativeIds: [p.creativeId],
          creativeNames: [p.name],
          evidence: { roas: p.roas, previousRoas: prev.roas, ctr: p.ctr, previousCtr: prev.ctr, spend: p.spend, previousSpend: prev.spend, purchases: p.purchases, previousPurchases: prev.purchases },
          sampleSize: p.purchases + prev.purchases,
          confidence: confidenceFor(prev.purchases),
          title: { he: `"${p.name}" נשחק`, en: `"${p.name}" is fatiguing` },
          body: {
            he: `ROAS ירד מ־${roasStr(prev.roas)} ל־${roasStr(p.roas)} ו־CTR מ־${prev.ctr}% ל־${p.ctr}% על הוצאה דומה.`,
            en: `ROAS fell from ${roasStr(prev.roas)} to ${roasStr(p.roas)} and CTR from ${prev.ctr}% to ${p.ctr}% on similar spend.`
          },
          recommendation: { he: "להכין קריאייטיב חלופי לפני שההוצאה עליו ממשיכה.", en: "Prepare a replacement creative before spend on it continues." }
        });
      }
    }
  }

  // 8. Funnel break — a campaign stage converting far below the account median.
  const stages = [
    { key: "lpv", he: "צפיות בדף נחיתה מתוך קליקים", en: "landing views per click", num: (f: NonNullable<CampaignInput["funnel"]>) => f.landingPageViews, den: (f: NonNullable<CampaignInput["funnel"]>) => f.linkClicks },
    { key: "atc", he: "הוספות לעגלה מתוך צפיות", en: "add-to-cart per landing view", num: (f: NonNullable<CampaignInput["funnel"]>) => f.addToCart, den: (f: NonNullable<CampaignInput["funnel"]>) => f.landingPageViews },
    { key: "ic", he: "תשלומים שהתחילו מתוך עגלות", en: "checkouts per add-to-cart", num: (f: NonNullable<CampaignInput["funnel"]>) => f.initiateCheckout, den: (f: NonNullable<CampaignInput["funnel"]>) => f.addToCart }
  ];
  const withFunnel = input.campaigns.filter((c) => c.funnel && c.spend > 0 && (input.account.spend <= 0 || c.spend / input.account.spend >= THRESHOLDS.funnelBreakMinSpendShare));
  const funnelBreaks: InsightCandidate[] = [];
  for (const st of stages) {
    const rates = withFunnel.map((c) => ({ c, rate: safeDiv(st.num(c.funnel!), st.den(c.funnel!)) })).filter((x) => x.rate != null && st.den(x.c.funnel!) >= 50) as Array<{ c: CampaignInput; rate: number }>;
    if (rates.length < 3) continue;
    const med = [...rates].map((x) => x.rate).sort((a, b) => a - b)[Math.floor(rates.length / 2)];
    for (const x of rates) {
      if (med > 0 && x.rate < med * THRESHOLDS.funnelBreakRatio) {
        funnelBreaks.push({
          type: "FUNNEL_BREAK",
          status: "watch",
          severity: 35,
          campaignId: x.c.campaignId,
          campaignName: x.c.name,
          creativeIds: [],
          creativeNames: [],
          evidence: { stage: st.key, rate: r2(x.rate), accountMedianRate: r2(med), denominator: st.den(x.c.funnel!) },
          sampleSize: st.den(x.c.funnel!),
          confidence: st.den(x.c.funnel!) >= 300 ? "medium" : "low",
          title: { he: `${x.c.name}: נפילה בשלב "${st.he}"`, en: `${x.c.name}: drop at "${st.en}"` },
          body: { he: `${pct(x.rate)} מול חציון חשבוני ${pct(med)}. ייתכן גם אירוע פיקסל חסר — לבדוק מדידה לפני סיפור.`, en: `${pct(x.rate)} vs account median ${pct(med)}. A missing pixel event is also possible — verify tracking before the story.` },
          recommendation: { he: "לבדוק את הדף/השלב הזה בקמפיין הזה בלבד, לא לשנות קריאייטיב.", en: "Inspect this page/stage for this campaign only; do not touch the creative." }
        });
      }
    }
  }

  funnelBreaks.sort((a, b) => b.sampleSize - a.sampleSize);
  candidates.push(...funnelBreaks.slice(0, THRESHOLDS.funnelBreakMaxCandidates));

  // ── Ranking: attention first, then money at stake ──────────────────────
  const order: Record<CandidateStatus, number> = { review: 0, test: 1, watch: 2, winner: 3, context: 4 };
  candidates.sort((a, b) => order[a.status] - order[b.status] || b.severity - a.severity || b.sampleSize - a.sampleSize);

  const needs = candidates.filter((c) => c.status !== "context" && c.status !== "winner");
  const okay: { he: string; en: string }[] = [];
  if (mediaHealth === "strong" || mediaHealth === "ok") okay.push({ he: "רווחיות המדיה", en: "Media profitability" });
  for (const w of candidates.filter((c) => c.type === "ESTABLISHED_WINNER")) okay.push({ he: `יש מנצח ב־${w.campaignName}`, en: `${w.campaignName} has a winner` });

  const headline =
    mediaHealth === "weak"
      ? { he: "המדיה מתחת לנקודת האיזון — קודם לעצור את ההפסד", en: "Media is below breakeven — stop the loss first" }
      : needs.length
        ? { he: "המדיה עובדת — עכשיו צריך לשפר את חלוקת הביצועים בין הקריאייטיבים", en: "Media works — now improve how performance is spread across creatives" }
        : mediaHealth === "unverified"
          ? { he: "הביצועים נראים טוב — הרווחיות עדיין לא מאומתת", en: "Performance looks good — profitability not yet verified" }
          : { he: "המדיה עובדת ואין חריגים בין הקריאייטיבים", en: "Media works and no creative stands out as a problem" };

  return { performance, candidates, mediaHealth, attention: { okay, needs }, headline };
}

// Compact, numbers-only frame for the phrasing model: it must reflect these,
// never re-derive or contradict them.
export function signalsFrame(result: CreativeSignalsResult, locale: "he" | "en"): string {
  const he = locale === "he";
  const lines = [he ? "אותות מחושבים (דטרמיניסטיים — חובה לשקף, אסור לגלות מחדש או לסתור):" : "COMPUTED SIGNALS (deterministic — must be reflected, never re-derived or contradicted):"];
  lines.push(`- ${he ? "כותרת" : "headline"}: ${he ? result.headline.he : result.headline.en}`);
  for (const c of result.candidates) {
    lines.push(`- [${c.status.toUpperCase()}] ${c.type} · ${he ? c.title.he : c.title.en} · ${he ? c.body.he : c.body.en} · ${he ? "משמעות" : "implication"}: ${he ? c.recommendation.he : c.recommendation.en} · ${he ? "ביטחון" : "confidence"} ${c.confidence} (n=${c.sampleSize})`);
  }
  return lines.join("\n");
}
