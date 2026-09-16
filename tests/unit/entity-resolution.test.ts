// Entity resolution: connect before asking. The question policy, the launch
// states (unknown ≠ not detected ≠ not yet live), event semantics in the
// campaign resolver ("rosh Hasana 2026" is never a Sukkot candidate), the
// coupon resolver, and the reality status that follows — with the Sukkot
// initiative (Take a Nap, 22–30 Sep 2026) as the validation case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assessLaunch, decide, bandOf } from "@/lib/domain/entity-resolution";
import { resolveCampaigns, type ResolverCampaign } from "@/lib/domain/campaign-resolver";
import { evaluateInitiativeReality, resolveMappings, type InitiativeEvidence, type MappingCandidates } from "@/lib/domain/initiative-reality";
import { eventMentions } from "@/lib/domain/calendar-events";
import type { Initiative } from "@/lib/domain/plan";

test("question policy: 0.94 vs 0.31 → use the first; 0.83 vs 0.79 → ask; nothing plausible → none", () => {
  const a = decide([{ id: "A", score: 0.94 }, { id: "B", score: 0.31 }]);
  assert.equal(a.kind, "accept");
  assert.equal(a.kind === "accept" && a.pick.id, "A");
  const b = decide([{ id: "A", score: 0.83 }, { id: "B", score: 0.79 }]);
  assert.equal(b.kind, "ask");
  assert.deepEqual(b.kind === "ask" ? b.between.map((x) => x.id) : [], ["A", "B"]);
  const c = decide([{ id: "A", score: 0.4 }]);
  assert.equal(c.kind, "none");
  // A clear medium leader with no plausible rival is usable; a lone 0.5 is only a suggestion.
  const d = decide([{ id: "A", score: 0.6 }, { id: "B", score: 0.2 }]);
  assert.equal(d.kind, "accept");
  assert.equal(decide([{ id: "A", score: 0.5 }]).kind, "none");
  assert.equal(bandOf(0.94), "high");
  assert.equal(bandOf(0.5), "medium");
  assert.equal(bandOf(0.2), "low");
});

test("event semantics: the calendar reads campaign names", () => {
  assert.deepEqual(eventMentions("rosh Hasana 2026 - 15% off").map((m) => `${m.key}:${m.strength}`), ["rosh_hashanah:strong"]);
  assert.deepEqual(eventMentions("Sukkot Sale 2026").map((m) => m.key), ["sukkot"]);
  assert.deepEqual(eventMentions("מבצעי בלאק פריידי").map((m) => m.key), ["black_friday"]);
  assert.equal(eventMentions("BAMBOO back to stock").length, 0);
});

const daily = (from: string, days: number, spend: number) => Array.from({ length: days }, (_, i) => ({ date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), spend, clicks: 50 }));
const campaigns: ResolverCampaign[] = [
  { id: "rh1", name: "rosh Hasana 2026 - 15% off", linkedProductIds: [], signals: { daily: daily("2026-08-28", 20, 400), destinationUrls: [], creativeText: "" } },
  { id: "rh2", name: "מארזי מתנה ראש השנה 2026", linkedProductIds: [], signals: { daily: daily("2026-08-08", 32, 100), destinationUrls: [], creativeText: "" } },
  { id: "rh3", name: "remarekting rosh hasana 2026 - 2", linkedProductIds: [], signals: { daily: daily("2026-08-30", 15, 120), destinationUrls: [], creativeText: "" } },
  { id: "bamboo", name: "BAMBOO back to stock", linkedProductIds: [], signals: { daily: daily("2026-08-19", 25, 50), destinationUrls: [], creativeText: "" } }
];
const sukkot = { title: "סוכות", anchorLabel: "סוכות", text: "סוכות — מבצע חג", start: "2026-09-22", end: "2026-09-30", couponCode: null, products: [] };

test("Sukkot initiative vs Rosh Hashanah campaigns: rejected with the reason, none suggested — absence is the finding", () => {
  const r = resolveCampaigns(sukkot, campaigns);
  assert.equal(r.event?.key, "sukkot");
  assert.equal(r.likely, null);
  assert.equal(r.alternatives.length, 0);
  assert.equal(r.rejected.length, 3);
  assert.ok(r.rejected.every((x) => x.by === "event_conflict"));
  assert.match(r.rejected.find((x) => x.id === "rh1")!.reason.en, /rejected as a Sukkot candidate because its name \("rosh hasana"\) indicates Rosh Hashanah/);
  assert.match(r.rejected.find((x) => x.id === "rh2")!.reason.en, /its name \("ראש השנה"\) indicates Rosh Hashanah/);
  assert.equal(r.considered, 0);
});

test("when 'Sukkot Sale 2026' appears in Meta it is accepted automatically, high confidence, no question", () => {
  const withSukkot = [...campaigns, { id: "sk", name: "Sukkot Sale 2026", linkedProductIds: [], signals: { daily: daily("2026-09-20", 5, 300), destinationUrls: ["https://takeanap.co.il/collections/%D7%A1%D7%95%D7%9B%D7%95%D7%AA"], creativeText: "מבצע סוכות" } }];
  const r = resolveCampaigns(sukkot, withSukkot);
  assert.ok(r.likely);
  assert.equal(r.likely!.id, "sk");
  assert.equal(r.likely!.confidence, "high");
  assert.ok(r.likely!.reasons.some((x) => /names Sukkot/.test(x.en)));
  assert.equal(decide([r.likely!, ...r.alternatives]).kind, "accept");
});

test("a manager rejection removes a campaign from the candidates and is listed with its reason", () => {
  const r = resolveCampaigns({ ...sukkot, anchorLabel: "back to stock", title: "Back in stock", rejectedIds: ["bamboo"] }, campaigns);
  assert.ok(r.rejected.some((x) => x.id === "bamboo" && x.by === "manager"));
  assert.ok(!r.alternatives.some((x) => x.id === "bamboo") && r.likely?.id !== "bamboo");
});

test("launch detection: far → not yet live (expected); imminent → attention; live → risk; no data source → unknown", () => {
  const checks = (state: "detected" | "not_detected" | "unknown") => [{ kind: "campaign" as const, state, line: { he: "x", en: "x" } }];
  const far = assessLaunch({ start: "2026-09-22", end: "2026-09-30", today: "2026-09-10", eventName: { he: "סוכות", en: "Sukkot" }, title: "סוכות", checks: checks("not_detected") });
  assert.equal(far.phase, "far");
  assert.equal(far.checks[0].state, "not_yet_live");
  assert.match(far.insight!.en, /No Sukkot activity detected yet \(campaign\)\. Expected — the initiative starts in 12 days\./);
  const approaching = assessLaunch({ start: "2026-09-22", end: "2026-09-30", today: "2026-09-16", eventName: { he: "סוכות", en: "Sukkot" }, title: "סוכות", checks: checks("not_detected") });
  assert.equal(approaching.phase, "approaching");
  assert.match(approaching.insight!.en, /starts in 6 days — but the launch window is approaching/);
  assert.equal(approaching.severity, "attention");
  const imminent = assessLaunch({ start: "2026-09-22", end: "2026-09-30", today: "2026-09-20", eventName: null, title: "סוכות", checks: checks("not_detected") });
  assert.equal(imminent.phase, "imminent");
  assert.equal(imminent.checks[0].state, "not_detected");
  assert.match(imminent.insight!.en, /starts in 2 days and no launch activity has been detected yet/);
  const live = assessLaunch({ start: "2026-09-22", end: "2026-09-30", today: "2026-09-24", eventName: null, title: "סוכות", checks: checks("not_detected") });
  assert.equal(live.severity, "risk");
  assert.match(live.insight!.en, /live for 3 days and no operational launch activity has been detected/);
  const unknown = assessLaunch({ start: "2026-09-22", end: "2026-09-30", today: "2026-09-24", eventName: null, title: "סוכות", checks: checks("unknown") });
  assert.match(unknown.insight!.en, /No connected data source to check campaign — unknown, not "not found"/);
  const detected = assessLaunch({ start: "2026-09-22", end: "2026-09-30", today: "2026-09-24", eventName: null, title: "סוכות", checks: checks("detected") });
  assert.equal(detected.insight, null);
});

// ── The reality: coupon resolver + status without a form ──────────────
const NOW = new Date("2026-09-16T12:00:00.000Z");
const fresh = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const initiative = (over: Partial<Initiative> = {}) =>
  ({ id: "sukkot", title: "סוכות", anchor: { kind: "event", label: "סוכות" }, start: "2026-09-22", end: "2026-09-30", offer: { discountPct: null, couponCode: null }, products: [], relatedDecisions: [], text: "סוכות — קמפיין ומבצע חג", ...over }) as unknown as Initiative;
const cands = (over: Partial<MappingCandidates> = {}): MappingCandidates => ({
  products: [{ id: "p1", title: "סט מצעים סוכות", handle: "sukkot-set" }, { id: "p2", title: "מגבת רחצה", handle: "towel" }],
  knownDiscountCodes: [],
  metaCampaigns: campaigns.map((c) => ({ id: c.id, name: c.name, linkedProductIds: [], signals: c.signals })),
  discountUsage: [],
  ...over
});
const noEvidence = (mappings: ReturnType<typeof resolveMappings>): InitiativeEvidence => ({ products: mappings.links.filter((l) => l.kind === "product" && l.state !== "suggested").map((l) => ({ id: l.id, title: l.label, role: "product" as const, basis: l.state as "confirmed" | "provisional", rule: l.provenance.rule, revenue: 0, units: 0, priorRevenue: null, priorUnits: null, dailyUnits: [], inventory: 40, coverDays: null, hasRealCost: false, marginRate: null })), discount: null, campaigns: [], store: null, freshness: { shopify: fresh(1), meta: fresh(1), inventory: fresh(1), plan: fresh(2) } });

test("Sukkot on 16 Sep: no form. 'Hiloomy checked' — 4 campaigns checked, 3 excluded as Rosh Hashanah, campaign not yet live; the status gates the numbers but speaks 'checked', and asks nothing", () => {
  const m = resolveMappings(initiative(), cands(), []);
  assert.equal(m.question, null);
  assert.equal(m.rejectedLinks.filter((r) => r.kind === "meta_campaign").length, 3);
  assert.match(m.checked.meta_campaign!.en, /^4 campaigns checked — none names the initiative .* · 3 campaigns of another holiday excluded automatically$/);
  const r = evaluateInitiativeReality(initiative(), m, noEvidence(m), NOW);
  assert.equal(r.status, "needs_context");
  assert.doesNotMatch(r.statusReason.en, /until these are connected|Complete \d+ connection/);
  assert.match(r.statusReason.en, /^Hiloomy checked the initiative\. No Sukkot activity detected yet/);
  assert.equal(r.context.launch.phase, "approaching");
  assert.equal(r.context.launch.checks.find((c) => c.kind === "campaign")!.state, "not_yet_live");
  assert.doesNotMatch(r.context.launch.insight!.en, /products/); // products are a mapping gap, not launch activity
  assert.equal(r.context.question, null);
  assert.equal(r.context.rejected.length, 3);
  assert.ok(r.context.checked.some((c) => /Campaign:/.test(c.en)));
  // Not a form: the finding is about the launch, and it is not yet a risk.
  assert.ok(!r.findings.some((f) => f.kind === "launch_activity_missing"));
});

test("live with nothing detected → the launch finding appears (missing execution is a business finding)", () => {
  const live = initiative({ start: "2026-09-10", end: "2026-09-30" });
  const m = resolveMappings(live, cands(), []);
  const r = evaluateInitiativeReality(live, m, noEvidence(m), NOW);
  const f = r.findings.find((x) => x.kind === "launch_activity_missing");
  assert.ok(f, "launch finding present");
  assert.match(f!.statement.en, /live for 7 days and no operational launch activity has been detected \(campaign, coupon\)/);
});

test("two plausible campaigns too close to pick → the ONE question, and only then needs_context", () => {
  const close: MappingCandidates["metaCampaigns"] = [
    { id: "a", name: "Sukkot Sale 2026 - prospecting", linkedProductIds: [], signals: { daily: daily("2026-09-15", 10, 300), destinationUrls: [], creativeText: "" } },
    { id: "b", name: "Sukkot Sale 2026 - retargeting", linkedProductIds: [], signals: { daily: daily("2026-09-15", 10, 290), destinationUrls: [], creativeText: "" } }
  ];
  const withCampaignText = initiative({ text: "סוכות — לבדוק קמפיין" } as Partial<Initiative>);
  const m = resolveMappings(withCampaignText, cands({ metaCampaigns: close }), []);
  assert.ok(m.question, "a question exists");
  assert.equal(m.question!.kind, "meta_campaign");
  assert.equal(m.question!.options.length, 2);
  assert.ok(m.links.filter((l) => l.kind === "meta_campaign").every((l) => l.state === "suggested"), "neither is auto-accepted");
  const r = evaluateInitiativeReality(withCampaignText, m, noEvidence(m), NOW);
  assert.equal(r.status, "needs_context");
  assert.match(r.statusReason.en, /one answer would improve this evaluation/);
});

test("coupon resolver: one order with the initiative's products → 0.55 medium; more orders raise it; the event in the code adds; unrelated window codes stay low", () => {
  const linked = [{ initiativeId: "sukkot", kind: "product" as const, id: "p1", label: "סט מצעים סוכות" }];
  const usage = (orders: number, onP1: number, code = "SUKKOT20") => [{ code, orders, firstUsed: "2026-09-22", lastUsed: "2026-09-25", productOrders: [{ productId: "p1", orders: onP1 }] }];
  const one = resolveMappings(initiative({ start: "2026-09-22", end: "2026-09-30" }), cands({ discountUsage: usage(1, 1, "NAP20") }), linked);
  const l1 = one.links.find((l) => l.kind === "discount" && l.id === "NAP20")!;
  assert.equal(l1.state, "suggested");
  assert.equal(l1.confidence, "medium");
  assert.match(l1.reason.en, /^55% · 1 order with the code contain the initiative's products/);
  const many = resolveMappings(initiative({ start: "2026-09-22", end: "2026-09-30" }), cands({ discountUsage: usage(6, 4) }), linked);
  const l2 = many.links.find((l) => l.kind === "discount" && l.id === "SUKKOT20")!;
  assert.equal(l2.state, "provisional", "orders + the event name in the code → auto-accepted");
  assert.match(l2.reason.en, /the code names Sukkot/);
  assert.equal(l2.provenance.rule, "coupon_resolver");
  const unrelated = resolveMappings(initiative({ start: "2026-09-22", end: "2026-09-30" }), cands({ discountUsage: [{ code: "EXTRANAP", orders: 282, firstUsed: "2026-08-27", lastUsed: "2026-09-30", productOrders: [{ productId: "p2", orders: 200 }] }] }), linked);
  const l3 = unrelated.links.find((l) => l.kind === "discount" && l.id === "EXTRANAP")!;
  assert.equal(l3.state, "suggested");
  assert.equal(l3.confidence, "low");
  assert.match(l3.reason.en, /no proven link to the initiative/);
});

test("products from landing traffic: a likely campaign's /products/<handle> destination is auto-linked; a collection destination is inferred from the orders that landed there", () => {
  const camps: MappingCandidates["metaCampaigns"] = [
    { id: "sk", name: "Sukkot Sale 2026", linkedProductIds: [], signals: { daily: daily("2026-09-20", 6, 300), destinationUrls: ["https://takeanap.co.il/products/sukkot-set", "https://takeanap.co.il/collections/%D7%A1%D7%95%D7%9B%D7%95%D7%AA"], creativeText: "" } }
  ];
  const landingOrders = Array.from({ length: 5 }, (_, i) => ({ path: "/collections/%D7%A1%D7%95%D7%9B%D7%95%D7%AA", date: `2026-09-2${2 + (i % 3)}`, productIds: ["p2"] }));
  const m = resolveMappings(initiative(), cands({ metaCampaigns: camps, landingOrders }), []);
  const p1 = m.links.find((l) => l.kind === "product" && l.id === "p1")!;
  assert.equal(p1.state, "provisional");
  assert.equal(p1.provenance.rule, "landing_page_product");
  const p2 = m.links.find((l) => l.kind === "product" && l.id === "p2")!;
  assert.equal(p2.state, "suggested", "collection traffic never auto-confirms a product");
  assert.match(p2.reason.en, /Inferred from landing traffic/);
  assert.match(m.checked.product!.en, /2 products inferred from the campaign's landing traffic/);
});

test("a holiday initiative owns every campaign that names its holiday: all high-scoring Rosh Hashanah campaigns are linked, no question between siblings", () => {
  const rh = { title: "ראש השנה", anchorLabel: "ראש השנה", text: "ראש השנה — קמפיין ומבצע", start: "2026-09-01", end: "2026-09-30", couponCode: null, products: [] };
  const many: MappingCandidates["metaCampaigns"] = [
    { id: "a", name: "rosh Hasana 2026 - 15% off", linkedProductIds: [], signals: { daily: daily("2026-08-28", 20, 400), destinationUrls: [], creativeText: "ראש השנה" } },
    { id: "b", name: "מארזי מתנה ראש השנה 2026", linkedProductIds: [], signals: { daily: daily("2026-08-08", 32, 100), destinationUrls: [], creativeText: "ראש השנה" } },
    { id: "c", name: "remarekting rosh hasana 2026 - 2", linkedProductIds: [], signals: { daily: daily("2026-08-30", 15, 120), destinationUrls: [], creativeText: "" } },
    { id: "bamboo", name: "BAMBOO back to stock", linkedProductIds: [], signals: { daily: daily("2026-08-19", 25, 50), destinationUrls: [], creativeText: "" } }
  ];
  const init = { id: "rh", title: rh.title, anchor: { kind: "event", label: rh.anchorLabel }, start: rh.start, end: rh.end, offer: { discountPct: null, couponCode: null }, products: [], relatedDecisions: [], text: "ראש השנה — לבדוק קמפיין" } as unknown as Initiative;
  const m = resolveMappings(init, cands({ metaCampaigns: many }), []);
  const camps = m.links.filter((l) => l.kind === "meta_campaign");
  const provisional = camps.filter((l) => l.state === "provisional").map((l) => l.id).sort();
  assert.ok(provisional.length >= 2, `siblings linked: ${provisional.join(",")}`);
  assert.ok(!camps.some((l) => l.id === "bamboo"), "the bamboo campaign is not a candidate at all");
  assert.equal(m.question, null, "siblings never trigger the question");
  assert.match(m.checked.meta_campaign!.en, /Rosh Hashanah campaigns found and linked automatically/);
});

test("a clear medium leader with no plausible rival is used automatically (Back in stock, 65% vs 0%)", () => {
  assert.equal(decide([{ score: 0.65 }, { score: 0 }]).kind, "accept");
  assert.equal(decide([{ score: 0.65 }, { score: 0.5 }]).kind, "none");
});
