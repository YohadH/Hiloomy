// Initiative Context Resolution: a missing critical mapping is NEEDS_CONTEXT,
// never "no issue"; overall confidence follows required coverage; weak
// suggestions never touch metrics; confirmation recomputes; setup never
// becomes a Today decision.

import { test } from "node:test";
import assert from "node:assert/strict";
import { contextRequirements, evaluateInitiativeReality, findingSignals, inferInitiativeKind, resolveMappings, usableLinks, NONE_ENTITY_ID, type ConfirmedEntityLink, type InitiativeEvidence, type InitiativeMappings, type MappingCandidates } from "@/lib/domain/initiative-reality";
import { composeRun, type ProbeData } from "@/lib/services/decision-candidate-audit-service";
import type { Initiative } from "@/lib/domain/plan";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const fresh = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const freshness = { shopify: fresh(0.2), meta: fresh(0.5), inventory: fresh(0.2), plan: fresh(1) };
const flat = (n: number, perDay: number) => Array.from({ length: n }, () => perDay);

// Satin Couture as the plan actually describes it — and, in the "missing"
// case, a catalogue where NO title matches exactly ("Satin Couture Full Set").
const satin = (over: Partial<Initiative> = {}): Initiative =>
  ({
    id: "satin",
    title: "Satin Couture launch",
    anchor: { kind: "launch", label: "Satin Couture" },
    start: "2026-09-01",
    end: "2026-09-30",
    offer: { discountPct: null, couponCode: null },
    products: [],
    relatedDecisions: [],
    text: "Satin Couture launch — check campaign status, how many sales, how many Travel Pillows went out with the full set as a gift, and decide whether to continue the coupon.",
    ...over
  }) as unknown as Initiative;

const catalogue: MappingCandidates = {
  products: [
    { id: "p_sheet", title: "Satin 600 Sheet — White" },
    { id: "p_duvet", title: "Satin 600 Oxford Duvet Set — White" },
    { id: "p_full", title: "Satin Couture Full Set — Stone" },
    { id: "p_pillow", title: "Travel Pillow" },
    { id: "p_neck", title: "Neck Travel Pillow" },
    { id: "p_other", title: "Linen Robe" }
  ],
  knownDiscountCodes: ["SATIN20", "SEPTEMBER15", "WELCOME10"],
  metaCampaigns: [{ id: "c_satin", name: "Satin August 2026", linkedProductIds: [] }],
  discountUsage: [
    { code: "SATIN20", orders: 42, firstUsed: "2026-09-02", lastUsed: "2026-09-13" },
    { code: "SEPTEMBER15", orders: 17, firstUsed: "2026-09-05", lastUsed: "2026-09-12" },
    { code: "WELCOME10", orders: 90, firstUsed: "2026-05-01", lastUsed: "2026-08-20" }
  ]
};

// Evidence gathered for whatever is USABLE (confirmed / provisional).
const evidenceFor = (m: InitiativeMappings): InitiativeEvidence => {
  const usable = usableLinks(m);
  const products = usable
    .filter((l) => l.kind === "product" || l.kind === "gift_product")
    .map((l) => ({
      id: l.id,
      title: l.label,
      role: l.kind === "gift_product" ? ("gift" as const) : ("product" as const),
      basis: l.state as "confirmed" | "provisional",
      rule: l.provenance.rule,
      revenue: l.kind === "gift_product" ? 0 : 32480,
      units: l.kind === "gift_product" ? 26 : 41,
      priorRevenue: l.kind === "gift_product" ? 0 : 27500,
      priorUnits: 0,
      dailyUnits: flat(14, l.kind === "gift_product" ? 26 / 14 : 41 / 14),
      inventory: l.kind === "gift_product" ? 15 : 120,
      coverDays: l.kind === "gift_product" ? 8 : 41,
      hasRealCost: true,
      marginRate: l.kind === "gift_product" ? null : 0.48
    }));
  const disc = usable.find((l) => l.kind === "discount");
  const camps = usable.filter((l) => l.kind === "meta_campaign");
  return {
    products,
    discount: disc ? { code: disc.id, basis: disc.state as "confirmed" | "provisional", rule: disc.provenance.rule, orders: 42, amount: 3900 } : null,
    campaigns: camps.map((l) => ({ id: l.id, name: l.label, basis: l.state as "confirmed" | "provisional", rule: l.provenance.rule, spend: 3095, purchases: 12, attributedRevenue: 9800 })),
    store: { sales7: 118000, velocityChangePct: 0.15, marginRate: 0.41 },
    freshness
  };
};

const confirmedCampaign: ConfirmedEntityLink[] = [{ initiativeId: "satin", kind: "meta_campaign", id: "c_satin", label: "Satin August 2026", via: "campaign_name_token" }];

test("requirements come from the initiative's own text: a launch with a gift, a coupon and a campaign needs all four", () => {
  const { kind, requirements } = contextRequirements(satin());
  assert.equal(kind, "launch");
  assert.deepEqual(requirements.map((r) => [r.kind, r.critical]), [["product", true], ["gift_product", true], ["discount", true], ["meta_campaign", true]]);
  // A plain event campaign without gift/coupon/campaign words needs only its products.
  const plain = satin({ title: "מבצע סתיו", anchor: { kind: "event", label: "מבצע סתיו" }, text: "מבצע סתיו על כל האתר" });
  const r2 = contextRequirements(plain);
  assert.equal(inferInitiativeKind(plain), "event_campaign");
  // "מבצע" references a discount but names no coupon → optional; no campaign word → optional.
  assert.deepEqual(r2.requirements.map((r) => [r.kind, r.critical]), [["product", true], ["discount", false], ["meta_campaign", false]]);
});

test("1. missing product mapping → needs_context (not no_issue_detected), with the exact reason and a resolution task", () => {
  const m = resolveMappings(satin(), catalogue, confirmedCampaign);
  const r = evaluateInitiativeReality(satin(), m, evidenceFor(m), NOW);
  assert.equal(r.status, "needs_context");
  assert.match(r.statusReason.en, /cannot evaluate sales, inventory or profitability until these are connected: products, gift product, coupon/);
  assert.deepEqual(r.context.missingCritical, ["product", "gift_product", "discount"]);
  assert.equal(r.context.required, 3);
  assert.ok(r.context.known.some((k) => /Meta campaign: Satin August 2026/.test(k.en)));
  assert.ok(r.context.known.some((k) => /Meta spend ₪3,095/.test(k.en)));
  const row = (k: string) => r.context.rows.find((x) => x.kind === k)!;
  assert.equal(row("product").action, "choose");
  assert.equal(row("product").candidates, 3); // three "Satin" titles
  assert.equal(row("gift_product").action, "choose");
  assert.equal(row("gift_product").candidates, 2); // Travel Pillow, Neck Travel Pillow
  assert.equal(row("discount").action, "choose"); // codes used in the window
  assert.equal(row("meta_campaign").action, "none");
});

test("2. confirmed Meta but missing products → overall confidence LOW, even though the campaign mapping itself is confirmed", () => {
  const m = resolveMappings(satin(), catalogue, confirmedCampaign);
  assert.equal(m.byKind.meta_campaign.state, "confirmed");
  const r = evaluateInitiativeReality(satin(), m, evidenceFor(m), NOW);
  assert.equal(r.confidence, "low");
  assert.match(r.confidenceReason.en, /Some entities are confirmed, but sales, inventory or profitability cannot be evaluated because products, gift product, coupon are not connected/);
  assert.equal(r.metrics.find((x) => x.key === "meta_spend")!.value, "₪3,095");
  assert.equal(r.metrics.find((x) => x.key === "revenue")!.value, null);
});

test("3. an exact product title is PROVISIONAL and usable as estimated evidence; 4. weak token suggestions never touch metrics", () => {
  const exact = satin({ products: [{ productId: "p_full", title: "Satin Couture Full Set — Stone", inventory: 120, units14d: 41, unitsPrior14d: 0, coverDays: 41, hasRealCost: true, liveCampaigns: 0 }], text: "Satin Couture Full Set — Stone launch — check campaign status and sales" } as Partial<Initiative>);
  const m = resolveMappings(exact, catalogue, []);
  const full = m.links.find((l) => l.id === "p_full")!;
  assert.equal(full.state, "provisional");
  assert.equal(full.provenance.rule, "exact_product_title");
  const weak = m.links.filter((l) => l.provenance.rule === "product_title_token");
  assert.ok(weak.length >= 2);
  assert.ok(weak.every((l) => l.state === "suggested"));
  const r = evaluateInitiativeReality(exact, m, evidenceFor(m), NOW);
  const rev = r.metrics.find((x) => x.key === "revenue")!;
  assert.equal(rev.value, "₪32,480");
  assert.equal(rev.quality, "estimated");
  assert.deepEqual(rev.provenance.map((p) => p.id), ["p_full"]); // the weak suggestions are not in the number
  assert.ok(usableLinks(m).every((l) => l.provenance.rule !== "product_title_token"));
});

test("5–7. confirming products, the gift and the coupon recomputes: metrics appear, status leaves needs_context, gift inventory and coupon usage become part of the reality", () => {
  const before = resolveMappings(satin(), catalogue, confirmedCampaign);
  assert.equal(evaluateInitiativeReality(satin(), before, evidenceFor(before), NOW).status, "needs_context");
  const confirmed: ConfirmedEntityLink[] = [
    ...confirmedCampaign,
    { initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set — Stone", via: "product_title_token" },
    { initiativeId: "satin", kind: "gift_product", id: "p_pillow", label: "Travel Pillow", via: "gift_clause_token" },
    { initiativeId: "satin", kind: "discount", id: "SATIN20", label: "SATIN20", via: "coupon_window_usage" }
  ];
  const after = resolveMappings(satin(), catalogue, confirmed);
  const r = evaluateInitiativeReality(satin(), after, evidenceFor(after), NOW);
  assert.notEqual(r.status, "needs_context");
  assert.equal(r.context.required, 0);
  const val = (k: string) => r.metrics.find((x) => x.key === k)!;
  assert.equal(val("revenue").value, "₪32,480");
  assert.equal(val("revenue").quality, "known");
  assert.equal(val("units").value, "41");
  assert.equal(val("gift:p_pillow").value, "26");
  assert.equal(val("gift_inventory:p_pillow").value, "8");
  assert.equal(val("coupon_orders").value, "42");
  assert.equal(val("meta_spend").value, "₪3,095");
  // 8 days of gift cover < 16 days remaining → needs_attention with the gift question as a CANDIDATE.
  assert.equal(r.status, "needs_attention");
  assert.match(r.candidateFinding!.question.en, /keep offering "Travel Pillow" as the gift/);
  assert.equal(r.confidence, "high");
  // Provenance survives confirmation.
  assert.equal(after.links.find((l) => l.id === "SATIN20")!.provenance.auto, "coupon_name_token"); // the system's own rule, not the client's claim
});

test("6b. 'not a Shopify product' resolves the gift requirement without inventing gift metrics", () => {
  const confirmed: ConfirmedEntityLink[] = [...confirmedCampaign, { initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set — Stone" }, { initiativeId: "satin", kind: "gift_product", id: NONE_ENTITY_ID, label: "Not a Shopify product" }, { initiativeId: "satin", kind: "discount", id: NONE_ENTITY_ID, label: "No coupon" }];
  const m = resolveMappings(satin(), catalogue, confirmed);
  assert.equal(m.byKind.gift_product.state, "confirmed");
  assert.match(m.byKind.gift_product.detail.en, /No such Shopify entity/);
  const r = evaluateInitiativeReality(satin(), m, evidenceFor(m), NOW);
  assert.equal(r.context.required, 0);
  assert.equal(r.metrics.find((x) => x.key.startsWith("gift:")), undefined);
  assert.notEqual(r.status, "needs_context");
});

test("coupon candidates come from codes used inside the initiative window, most used first, name tokens named", () => {
  const m = resolveMappings(satin(), catalogue, []);
  const coupons = m.links.filter((l) => l.kind === "discount");
  assert.deepEqual(coupons.map((l) => [l.id, l.state, l.provenance.rule]), [
    ["SATIN20", "suggested", "coupon_name_token"],
    ["SEPTEMBER15", "suggested", "coupon_window_usage"]
  ]);
  assert.match(coupons[0].reason.en, /contains "satin" and was used on 42 orders/);
  assert.equal(m.byKind.discount.state, "suggested");
  assert.ok(!usableLinks(m).some((l) => l.kind === "discount")); // never auto-confirmed
});

test("8. no candidates found → the row says search; the operator's manual pick is stored like any confirmation", () => {
  const bare = satin({ title: "September Growth Push", anchor: { kind: "text", label: "September Growth Push" }, text: "September growth push — products TBD, gift with every order" });
  const m = resolveMappings(bare, { ...catalogue, products: [{ id: "p_other", title: "Linen Robe" }], discountUsage: [] }, []);
  const r = evaluateInitiativeReality(bare, m, evidenceFor(m), NOW);
  assert.equal(r.context.rows.find((x) => x.kind === "product")!.action, "search");
  assert.equal(r.context.rows.find((x) => x.kind === "gift_product")!.action, "search");
  const picked = resolveMappings(bare, { ...catalogue, products: [{ id: "p_other", title: "Linen Robe" }], discountUsage: [] }, [{ initiativeId: bare.id, kind: "product", id: "p_other", label: "Linen Robe", via: "operator_search" }]);
  assert.equal(picked.links.find((l) => l.id === "p_other")!.state, "confirmed");
});

test("9. a missing goal does NOT become needs_context: fully mapped, no finding → no_issue_detected with the goal note", () => {
  const confirmed: ConfirmedEntityLink[] = [...confirmedCampaign, { initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set — Stone" }, { initiativeId: "satin", kind: "gift_product", id: "p_pillow", label: "Travel Pillow" }, { initiativeId: "satin", kind: "discount", id: "SATIN20", label: "SATIN20" }];
  const m = resolveMappings(satin(), catalogue, confirmed);
  const ev = evidenceFor(m);
  ev.products = ev.products.map((p) => ({ ...p, coverDays: 60, inventory: 500 }));
  const r = evaluateInitiativeReality(satin(), m, ev, NOW);
  assert.equal(r.status, "no_issue_detected");
  assert.equal(r.goal.defined, false);
  assert.match(r.statusReason.en, /No target exists/);
});

test("10. a mapping task never creates a Today decision: needs_context yields no candidate and no signal for the pipeline", () => {
  const m = resolveMappings(satin(), catalogue, confirmedCampaign);
  const r = evaluateInitiativeReality(satin(), m, evidenceFor(m), NOW);
  assert.equal(r.status, "needs_context");
  assert.equal(r.candidateFinding, null);
  const signals = findingSignals(r, satin());
  assert.deepEqual(signals, []);
  const probes: ProbeData = { productEcon: [], leakage: null, leakageAllProtected: false, meta: null, plan: null, silentAlerts: [], discount: null, competitors: null, initiativeFindings: signals };
  const run = composeRun({ storeId: "st", now: NOW, ledger: [], cardIds: [], todayOrder: [], probes });
  assert.equal(run.candidates.some((c) => c.kind.startsWith("initiative_")), false);
});

test("insufficient_data is distinct: mapped products but no evidence to measure (initiative not started)", () => {
  const future = satin({ start: "2026-10-01", end: "2026-10-31", text: "Satin Couture launch — check campaign status and sales" });
  const confirmed: ConfirmedEntityLink[] = [{ initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set — Stone" }, { initiativeId: "satin", kind: "meta_campaign", id: "c_satin", label: "Satin August 2026" }];
  const m = resolveMappings(future, catalogue, confirmed);
  const r = evaluateInitiativeReality(future, m, { products: [], discount: null, campaigns: [], store: null, freshness }, NOW);
  assert.equal(r.context.required, 0);
  assert.equal(r.status, "insufficient_data");
});

test("precision: a family name that matches 37 catalogue titles never becomes provisional — every one is a suggestion, the note says the query is too broad, and only a shortlist of 5 is offered", () => {
  const many = Array.from({ length: 37 }, (_, i) => ({ productId: `s${i}`, title: `סאטן ${["ציפית", "סדין", "ציפה", "סט מצעים", "שמיכה"][i % 5]} ${i}`, inventory: 10, units14d: 1, unitsPrior14d: 0, coverDays: 30, hasRealCost: true, liveCampaigns: 0 }));
  const init = satin({ title: "השקת סאטן קוטור", anchor: { kind: "launch", label: "סאטן קוטור" }, products: many, text: "השקת סאטן קוטור — לבדוק סטטוס קמפיין, כמה מכירות, כמה כריות ניתנו במתנה ולהחליט אם להמשיך את הקופון" } as Partial<Initiative>);
  const cat: MappingCandidates = { ...catalogue, products: many.map((p) => ({ id: p.productId, title: p.title })) };
  const m = resolveMappings(init, cat, []);
  const prods = m.links.filter((l) => l.kind === "product");
  assert.ok(prods.every((l) => l.state === "suggested"));
  assert.equal(usableLinks(m).filter((l) => l.kind === "product").length, 0);
  assert.equal(m.byKind.product.state, "suggested");
  assert.match(m.discovery.product!.note!.he, /מצאתי 37 מוצרים/);
  const r = evaluateInitiativeReality(init, m, evidenceFor(m), NOW);
  assert.equal(r.status, "needs_context");
  assert.equal(r.metrics.find((x) => x.key === "revenue")!.value, null); // no ₪55K built on 37 satin products
  assert.equal(r.candidateFinding, null);
  // Weak token discovery on a big catalogue is capped at five, best first.
  const bigCatalogue: MappingCandidates = { ...catalogue, products: [...catalogue.products, ...Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, title: `Satin Extra Long Name Variant ${i} — Color` }))] };
  const m2 = resolveMappings(satin(), bigCatalogue, []);
  const sug = m2.links.filter((l) => l.kind === "product");
  assert.equal(sug.length, 5);
  assert.equal(sug[0].label, "Satin Couture Full Set — Stone"); // two initiative tokens beat one
  assert.equal(m2.discovery.product!.total, 33);
  assert.match(m2.discovery.product!.note!.en, /the 5 most likely are shown/);
});

test("hygiene: 37 operator links confirmed in one batch from the 'סאטן' word rule are NOT confirmations — downgraded to suggestions, deduplicated by Shopify id, and the reality is needs_context again", () => {
  const many = Array.from({ length: 37 }, (_, i) => ({ productId: `s${i}`, title: `סאטן ${["ציפית", "סדין", "ציפה", "סט מצעים", "שמיכה"][i % 5]} ${i}`, inventory: 10, units14d: 1, unitsPrior14d: 0, coverDays: 30, hasRealCost: true, liveCampaigns: 0 }));
  const init = satin({ title: "השקת סאטן קוטור", anchor: { kind: "launch", label: "סאטן קוטור" }, products: [], text: "השקת סאטן קוטור — לבדוק סטטוס קמפיין" } as Partial<Initiative>);
  const cat: MappingCandidates = { ...catalogue, products: many.map((p) => ({ id: p.productId, title: p.title })) };
  // The stored state from before the precision fix: every shortlist row confirmed at once, one of them twice (gid form).
  const batch: ConfirmedEntityLink[] = [
    ...many.map((p) => ({ initiativeId: "satin", kind: "product" as const, id: p.productId, label: p.title, via: "product_title_token" })),
    { initiativeId: "satin", kind: "product", id: "gid://shopify/Product/s3", label: "סאטן סט מצעים 3", via: "product_title_token" }
  ];
  const m = resolveMappings(init, cat, batch);
  const prods = m.links.filter((l) => l.kind === "product");
  assert.equal(prods.length, 37); // the gid duplicate collapsed onto s3
  assert.ok(prods.every((l) => l.state === "suggested" && l.provenance.rule === "operator_bulk" && l.provenance.auto === "product_title_token"));
  assert.match(prods[0].reason.he, /אושר בבת אחת יחד עם 37 מוצרים מכלל המילה "product_title_token"/);
  assert.deepEqual(m.hygiene, { bulk: [{ kind: "product", count: 37, via: "product_title_token" }], duplicates: 1 });
  assert.equal(m.byKind.product.state, "suggested");
  assert.equal(usableLinks(m).filter((l) => l.kind === "product").length, 0);
  const r = evaluateInitiativeReality(init, m, evidenceFor(m), NOW);
  assert.equal(r.status, "needs_context");
  assert.equal(r.metrics.find((x) => x.key === "revenue")!.value, null); // no ₪55K on 37 satin products
  // Up to EXACT_MATCH_MAX products picked from a token shortlist are a real choice and stay confirmed.
  const few = resolveMappings(init, cat, batch.slice(0, 3));
  assert.equal(few.links.filter((l) => l.kind === "product" && l.state === "confirmed").length, 3);
  assert.ok(few.links.filter((l) => l.kind === "product").every((l) => l.provenance.rule !== "operator_bulk"));
  assert.equal(few.byKind.product.state, "confirmed");
  assert.deepEqual(few.hygiene, { bulk: [], duplicates: 0 });
});

test("inventory language: zero and negative inventory never read as 'runs out in −N days'", () => {
  const confirmed: ConfirmedEntityLink[] = [...confirmedCampaign, { initiativeId: "satin", kind: "product", id: "p_full", label: "Satin Couture Full Set — Stone" }, { initiativeId: "satin", kind: "gift_product", id: "p_pillow", label: "Travel Pillow" }, { initiativeId: "satin", kind: "discount", id: "SATIN20", label: "SATIN20" }];
  const m = resolveMappings(satin(), catalogue, confirmed);
  const ev = evidenceFor(m);
  ev.products = ev.products.map((p) => (p.role === "gift" ? { ...p, inventory: -11, coverDays: 0 } : { ...p, inventory: 0, coverDays: 0 }));
  const r = evaluateInitiativeReality(satin(), m, ev, NOW);
  const gift = r.findings.find((f) => f.kind === "gift_inventory_short")!;
  assert.match(gift.statement.he, /שלילי — דורש בדיקת נתונים/);
  assert.doesNotMatch(gift.statement.he, /-11|ייגמר בעוד/);
  const prod = r.findings.find((f) => f.kind === "inventory_short_of_window")!;
  assert.match(prod.statement.he, /אזל מהמלאי/);
  assert.equal(r.inventory.negative, 1);
  assert.equal(r.inventory.outOfStock, 1);
  assert.equal(r.inventory.atRisk, 2);
  assert.match(r.inventory.worst!.label.he, /אזל מהמלאי|שלילי/);
  assert.equal(r.metrics.find((x) => x.key === "gift_inventory:p_pillow")!.value, "0");
});

test("precedence: a missing critical entity wins over a risk measured on the usable parts — the evaluation is incomplete, so nothing is concluded", () => {
  const confirmed: ConfirmedEntityLink[] = [...confirmedCampaign, { initiativeId: "satin", kind: "gift_product", id: "p_pillow", label: "Travel Pillow" }];
  const m = resolveMappings(satin(), catalogue, confirmed); // products + coupon still unresolved; gift cover 8 < 16 is a risk
  const r = evaluateInitiativeReality(satin(), m, evidenceFor(m), NOW);
  assert.ok(r.findings.some((f) => f.kind === "gift_inventory_short"));
  assert.equal(r.status, "needs_context");
  assert.equal(r.candidateFinding, null);
  assert.deepEqual(findingSignals(r, satin()), []);
});
