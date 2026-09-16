// Campaign Resolver: probabilistic, several signals, alternatives — never a
// binary link, never timing-and-spend alone. Scenario from Take a Nap's
// satin initiative (16 Sep 2026): a ₪19,950 Hebrew-named campaign, a ₪731
// English-named test, a campaign that ended before the window, and an
// always-on retargeting campaign that must never be picked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { HIGH, MEDIUM, resolveCampaigns, urlWords, type CampaignDaily, type ResolverCampaign, type ResolverInitiative } from "@/lib/domain/campaign-resolver";
import { resolveMappings, type MappingCandidates } from "@/lib/domain/initiative-reality";
import type { Initiative } from "@/lib/domain/plan";

const day = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daily = (from: string, to: string, spendPerDay: number, clicksPerDay: number): CampaignDaily[] => {
  const out: CampaignDaily[] = [];
  for (let d = from; d <= to; d = day(d, 1)) out.push({ date: d, spend: spendPerDay, clicks: clicksPerDay });
  return out;
};

const initiative: ResolverInitiative = {
  title: "השקת סאטן קוטור",
  anchorLabel: "סאטן קוטור",
  text: "השקת סאטן קוטור — לבדוק קמפיין, מכירות, לעדכן דף קולקציה",
  start: "2026-09-01",
  end: "2026-09-30",
  couponCode: "SATIN15",
  products: [
    { id: "p_sheet", title: "סדין סאטן 600 - לבן", handle: "satin-sheet-600-white" },
    { id: "p_set", title: "סט מצעים מלא סאטן Tailored", handle: "satin-tailored-full-set" }
  ]
};

const campaigns = (over: Partial<Record<"aug" | "v2" | "v1" | "retarget", Partial<ResolverCampaign>>> = {}): ResolverCampaign[] => [
  { id: "aug", name: "‎קמפיין סאטן אוגוסט 2026‎ - adset budget", linkedProductIds: [], signals: { daily: daily("2026-08-08", "2026-09-15", 512, 240), destinationUrls: [], creativeText: "" }, ...over.aug },
  { id: "v2", name: "Sateen Tailored web traffic Campaign - v2 Campaign", linkedProductIds: [], signals: { daily: daily("2026-08-08", "2026-09-15", 19, 117), destinationUrls: [], creativeText: "" }, ...over.v2 },
  { id: "v1", name: "Sateen Tailored web traffic Campaign", linkedProductIds: [], signals: { daily: daily("2026-08-08", "2026-08-19", 58, 300), destinationUrls: [], creativeText: "" }, ...over.v1 },
  { id: "retarget", name: "Always-on retargeting — all products", linkedProductIds: [], signals: { daily: daily("2026-07-20", "2026-09-15", 900, 400), destinationUrls: ["https://takeanap.co.il/"], creativeText: "חזרו לעגלה" }, ...over.retarget }
];

test("name + spend alone: the big Hebrew campaign leads, the English test is the alternative, retargeting is never listed", () => {
  const r = resolveCampaigns(initiative, campaigns());
  assert.equal(r.total, 4);
  assert.equal(r.considered, 3); // retargeting has no content signal
  const ranked = [...(r.likely ? [r.likely] : []), ...r.alternatives];
  assert.equal(ranked[0].id, "aug");
  assert.equal(ranked[1].id, "v2");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[0].score < MEDIUM, "name + spend is not enough for medium confidence");
  assert.equal(r.likely, null, "nothing stands clear enough to be called likely");
  assert.ok(ranked[0].reasons.some((x) => /largest spend among the candidates/.test(x.en)));
  assert.ok(ranked[1].reasons.some((x) => /the campaign name contains "סאטן"/.test(x.en)), "the alias family lets סאטן match Sateen");
  const v1 = ranked.find((x) => x.id === "v1")!;
  assert.ok(v1.reasons.some((x) => /spent nothing inside the initiative window/.test(x.en)));
  assert.ok(v1.score < ranked[1].score);
});

test("destination page + start timing lift the leader to a clear pick; high confidence needs several signals", () => {
  const r = resolveCampaigns(initiative, campaigns({ aug: { signals: { daily: daily("2026-08-30", "2026-09-15", 1250, 580), destinationUrls: ["https://takeanap.co.il/collections/%D7%A1%D7%90%D7%98%D7%9F-1"], creativeText: "סאטן קוטור — הסט המלא. קוד SATIN15" } } }));
  assert.ok(r.likely, "a clear leader exists");
  assert.equal(r.likely!.id, "aug");
  assert.ok(r.likely!.score >= HIGH, `score ${r.likely!.score} should be high`);
  assert.equal(r.likely!.confidence, "high");
  assert.ok(r.likely!.reasons.some((x) => /the ads land on \/collections\/סאטן-1 \(matches "סאטן"\)/.test(x.en)));
  assert.ok(r.likely!.reasons.some((x) => /coupon SATIN15 appears in the ads/.test(x.en)));
  assert.ok(r.likely!.reasons.some((x) => /started 2 days before the initiative/.test(x.en)));
  assert.equal(r.alternatives[0].id, "v2");
});

test("a campaign–product link is a strong content signal on its own; a product handle in the destination URL counts too", () => {
  const r = resolveCampaigns(initiative, campaigns({ v2: { linkedProductIds: ["p_set"], signals: { daily: daily("2026-09-01", "2026-09-15", 19, 117), destinationUrls: ["https://takeanap.co.il/products/satin-tailored-full-set"], creativeText: "" } } }));
  const ranked = [...(r.likely ? [r.likely] : []), ...r.alternatives];
  const v2 = ranked.find((x) => x.id === "v2")!;
  assert.ok(v2.reasons.some((x) => /linked to "סט מצעים מלא סאטן Tailored" through campaign–product links/.test(x.en)));
  assert.ok(v2.reasons.some((x) => /matches "satin-tailored-full-set"/.test(x.en)));
  assert.equal(ranked[0].id, "v2", "content beats raw spend");
});

test("timing and spend alone never qualify, even for the biggest spender", () => {
  const r = resolveCampaigns({ ...initiative, anchorLabel: "מבצע חורף", title: "מבצע חורף", products: [] }, campaigns());
  assert.equal(r.considered, 0);
  assert.equal(r.likely, null);
});

test("urlWords decodes Hebrew paths", () => {
  assert.equal(urlWords("https://takeanap.co.il/collections/%D7%A1%D7%90%D7%98%D7%9F-1?utm_source=fb"), "collections סאטן 1");
});

test("resolveMappings: with signals, a high-confidence pick becomes a provisional link; the rest are suggestions with their percentage", () => {
  const init = { id: "satin", title: initiative.title, anchor: { kind: "launch", label: initiative.anchorLabel }, start: initiative.start, end: initiative.end, offer: { discountPct: null, couponCode: "SATIN15" }, products: [], text: initiative.text } as unknown as Initiative;
  const cands: MappingCandidates = {
    products: [{ id: "p_sheet", title: "סדין סאטן 600 - לבן", handle: "satin-sheet-600-white" }],
    knownDiscountCodes: ["SATIN15"],
    metaCampaigns: campaigns({ aug: { signals: { daily: daily("2026-08-30", "2026-09-15", 1250, 580), destinationUrls: ["https://takeanap.co.il/collections/%D7%A1%D7%90%D7%98%D7%9F-1"], creativeText: "קוד SATIN15" } } }).map((c) => ({ id: c.id, name: c.name, linkedProductIds: c.linkedProductIds, signals: c.signals })),
    discountUsage: []
  };
  const m = resolveMappings(init, cands, [{ initiativeId: "satin", kind: "product", id: "p_sheet", label: "סדין סאטן 600 - לבן" }]);
  const meta = m.links.filter((l) => l.kind === "meta_campaign");
  assert.equal(meta[0].id, "aug");
  assert.equal(meta[0].state, "provisional");
  assert.equal(meta[0].provenance.rule, "campaign_resolver");
  assert.match(meta[0].reason.en, /^\d+% · /);
  assert.match(meta[0].reason.en, /auto-matched, to confirm$/);
  assert.ok(meta.slice(1).every((l) => l.state === "suggested"));
  assert.ok(m.campaignResolution && m.campaignResolution.likely?.id === "aug");
  assert.equal(m.byKind.meta_campaign.state, "provisional");
  // Without signals the old rules apply unchanged.
  const plain = resolveMappings(init, { ...cands, metaCampaigns: cands.metaCampaigns.map((c) => ({ id: c.id, name: c.name, linkedProductIds: [] })) }, []);
  assert.ok(plain.links.filter((l) => l.kind === "meta_campaign").every((l) => l.state === "suggested" && l.provenance.rule === "campaign_name_token"));
  assert.equal(plain.campaignResolution, null);
});
