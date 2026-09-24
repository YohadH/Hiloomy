// The owner's four manual reads of a Meta account (2026-09-24) must fall out of
// the deterministic engine, in the same statuses, with no LLM involved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreativeSignals, signalsFrame, type SignalsInput } from "@/lib/domain/meta-creative-signals";

const m = (spend: number, revenue: number, purchases: number, clicks: number, impressions: number) => ({ spend, revenue, purchases, clicks, impressions });

// Account ROAS 4.97 vs breakeven 2.6. Advantage+ has a 62% concentration
// winner; 702 has an emerging creative (CPA 46 vs 104, 2 vs 9 purchases);
// Paz has one creative at 100% of sales and a sibling spending with none.
function fixture(): SignalsInput {
  const adv = { campaignId: "adv", name: "Advantage+", ...m(5200, 25500, 90, 4100, 210000) };
  const c702 = { campaignId: "702", name: "702", ...m(1030, 5750, 11, 900, 60000) };
  const paz = { campaignId: "paz", name: "Paz", ...m(900, 3600, 6, 700, 40000) };
  return {
    account: m(7130, 35450, 107, 5700, 310000),
    breakevenRoas: 2.6,
    campaigns: [adv, c702, paz],
    creatives: [
      { creativeId: "holiday", name: "Holiday", campaignId: "adv", ...m(3220, 15810, 56, 2500, 120000) },
      { creativeId: "adv-b", name: "Adv B", campaignId: "adv", ...m(1200, 6000, 22, 1000, 55000) },
      { creativeId: "adv-c", name: "Adv C", campaignId: "adv", ...m(780, 3690, 12, 600, 35000) },
      { creativeId: "702-main", name: "702 Main", campaignId: "702", ...m(936, 5000, 9, 780, 52000) },
      { creativeId: "702-vid1", name: "702 Vid1", campaignId: "702", ...m(92, 711, 2, 120, 8000) },
      { creativeId: "paz-1", name: "Paz 1", campaignId: "paz", ...m(600, 3600, 6, 450, 26000) },
      { creativeId: "paz-2", name: "Paz 2", campaignId: "paz", ...m(300, 0, 0, 250, 14000) }
    ]
  };
}

test("account health is context when ROAS clears breakeven by ≥1.5×", () => {
  const r = buildCreativeSignals(fixture());
  const health = r.candidates.find((c) => c.type === "ACCOUNT_HEALTH")!;
  assert.equal(r.mediaHealth, "strong");
  assert.equal(health.status, "context");
  assert.equal(health.evidence.accountRoas, 4.97);
  assert.equal(health.evidence.ratio, 1.91);
  assert.match(r.headline.he, /המדיה עובדת/);
});

test("62% concentration in Advantage+ is a WATCH candidate naming the winner", () => {
  const r = buildCreativeSignals(fixture());
  const c = r.candidates.find((x) => x.type === "CREATIVE_CONCENTRATION" && x.campaignId === "adv")!;
  assert.equal(r.candidates.filter((x) => x.type === "CREATIVE_CONCENTRATION").length, 1, "a two-creative campaign is not a concentration signal");
  assert.equal(c.status, "watch");
  assert.equal(c.campaignName, "Advantage+");
  assert.deepEqual(c.creativeNames, ["Holiday"]);
  assert.equal(c.evidence.revenueShare, 0.62);
  assert.equal(c.evidence.purchases, 56);
  assert.match(c.body.he, /62%/);
  // The same creative is also the established winner.
  const w = r.candidates.find((x) => x.type === "ESTABLISHED_WINNER" && x.campaignId === "adv")!;
  assert.equal(w.status, "winner");
  assert.equal(w.confidence, "high");
});

test("702 Vid1 is an EMERGING winner → TEST, not SCALE", () => {
  const r = buildCreativeSignals(fixture());
  const e = r.candidates.find((x) => x.type === "EMERGING_WINNER")!;
  assert.equal(e.status, "test");
  assert.equal(e.campaignName, "702");
  assert.equal(e.creativeNames[0], "702 Vid1");
  assert.equal(e.evidence.cpa, 46);
  assert.equal(e.evidence.baselineCpa, 104);
  assert.equal(e.evidence.cpaImprovement, 0.56);
  assert.equal(e.evidence.roas, 7.73);
  assert.equal(e.evidence.baselineRoas, 5.34);
  assert.equal(e.confidence, "low");
  assert.match(e.recommendation.he, /TEST, לא SCALE/);
});

test("Paz: one creative at 100% with a sibling spending ₪300 and 0 purchases → REVIEW possible waste", () => {
  const r = buildCreativeSignals(fixture());
  const p = r.candidates.find((x) => x.campaignId === "paz" && (x.type === "ZERO_CONVERSION_SPEND" || x.type === "CAMPAIGN_DEPENDENCY"))!;
  assert.equal(p.type, "ZERO_CONVERSION_SPEND");
  assert.equal(p.status, "review");
  assert.equal(p.evidence.idleSpend, 300);
  assert.match(p.recommendation.he, /לבדוק האם/);
});

test("no waste claim when the idle sibling barely spent", () => {
  const f = fixture();
  f.creatives = f.creatives.map((c) => (c.creativeId === "paz-2" ? { ...c, spend: 40 } : c));
  const r = buildCreativeSignals(f);
  const p = r.candidates.find((x) => x.campaignId === "paz" && (x.type === "ZERO_CONVERSION_SPEND" || x.type === "CAMPAIGN_DEPENDENCY"))!;
  assert.equal(p.type, "CAMPAIGN_DEPENDENCY");
  assert.equal(p.status, "watch");
  assert.match(p.body.he, /מעט מדי כדי לקבוע/);
});

test("ranking puts REVIEW before TEST before WATCH; context last; attention layer separates okay from needs", () => {
  const r = buildCreativeSignals(fixture());
  const statuses = r.candidates.map((c) => c.status);
  const firstIdx = (s: string) => statuses.indexOf(s as never);
  assert.ok(firstIdx("review") < firstIdx("test"));
  assert.ok(firstIdx("test") < firstIdx("watch"));
  assert.equal(statuses[statuses.length - 1], "context");
  assert.ok(r.attention.okay.some((o) => o.he === "רווחיות המדיה"));
  assert.ok(r.attention.needs.every((c) => c.status !== "context" && c.status !== "winner"));
});

test("CTR never ranks: a high-CTR low-ROAS creative is an underperformer with a CTR diagnostic", () => {
  const f = fixture();
  f.creatives.push({ creativeId: "adv-d", name: "Adv D", campaignId: "adv", ...m(1500, 1200, 4, 3000, 40000) }); // CTR 7.5%, ROAS 0.8
  f.campaigns[0] = { ...f.campaigns[0], ...m(6700, 26700, 94, 7100, 250000) };
  const r = buildCreativeSignals(f);
  const u = r.candidates.find((x) => x.type === "UNDERPERFORMER")!;
  assert.equal(u.creativeNames[0], "Adv D");
  assert.equal(u.status, "review");
  assert.match(u.body.he, /CTR גבוה/);
  // Not mistaken for a winner despite the highest CTR in the campaign.
  assert.ok(!r.candidates.some((x) => x.type === "ESTABLISHED_WINNER" && x.creativeNames[0] === "Adv D"));
});

test("fatigue needs a previous period: ROAS and CTR both down on comparable spend", () => {
  const f = fixture();
  f.creatives = f.creatives.map((c) => (c.creativeId === "holiday" ? { ...c, previous: m(3000, 24000, 70, 4200, 120000) } : c));
  const r = buildCreativeSignals(f);
  const fat = r.candidates.find((x) => x.type === "CREATIVE_FATIGUE")!;
  assert.equal(fat.creativeNames[0], "Holiday");
  assert.equal(fat.evidence.previousRoas, 8);
  assert.equal(fat.evidence.roas, 4.91);
});

test("without a breakeven the account is unverified and no profitable/losing claim is made", () => {
  const f = fixture();
  f.breakevenRoas = null;
  const r = buildCreativeSignals(f);
  assert.equal(r.mediaHealth, "unverified");
  const health = r.candidates.find((c) => c.type === "ACCOUNT_HEALTH")!;
  assert.match(health.body.he, /אי אפשר לומר רווחי/);
  assert.match(signalsFrame(r, "he"), /אותות מחושבים/);
});

test("a 100% campaign is a dependency signal only — never also a concentration signal", () => {
  const f = fixture();
  // Make Paz 3 creatives so concentration would otherwise qualify.
  f.creatives.push({ creativeId: "paz-3", name: "Paz 3", campaignId: "paz", ...m(200, 0, 0, 100, 9000) });
  const r = buildCreativeSignals(f);
  const paz = r.candidates.filter((c) => c.campaignId === "paz");
  assert.equal(paz.filter((c) => c.type === "CREATIVE_CONCENTRATION").length, 0);
  assert.equal(paz.filter((c) => c.type === "ZERO_CONVERSION_SPEND").length, 1);
});

test("funnel breaks are capped at two, WATCH, and skip campaigns with negligible spend", () => {
  const f = fixture();
  const fun = (lp: number, atc: number) => ({ linkClicks: 1000, landingPageViews: lp, addToCart: atc, initiateCheckout: Math.round(atc * 0.6) });
  f.campaigns = [
    { ...f.campaigns[0], funnel: fun(900, 180) },
    { ...f.campaigns[1], funnel: fun(880, 170) },
    { ...f.campaigns[2], funnel: fun(870, 160) },
    { campaignId: "t1", name: "Traffic 1", ...m(800, 0, 0, 1000, 50000), funnel: fun(850, 5) },
    { campaignId: "t2", name: "Traffic 2", ...m(700, 0, 0, 1000, 50000), funnel: fun(300, 60) },
    { campaignId: "tiny", name: "Tiny", ...m(20, 0, 0, 1000, 50000), funnel: fun(100, 1) }
  ];
  f.account = m(9650, 35450, 107, 8700, 460000);
  const r = buildCreativeSignals(f);
  const fb = r.candidates.filter((c) => c.type === "FUNNEL_BREAK");
  assert.ok(fb.length >= 1 && fb.length <= 2, String(fb.length));
  assert.ok(fb.every((c) => c.status === "watch"));
  assert.ok(!fb.some((c) => c.campaignName === "Tiny"));
});
