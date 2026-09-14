// Initiative Reality — the live state of ONE commercial initiative, the
// bridge between declared intent (the plan) and the decision layer:
//
//   Commercial Plan → Initiative Reality → finding → CANDIDATE → scoring →
//   clustering → ranking → threshold → Today → choice → outcome
//
// Rules this module enforces (docs/DECISION-INBOX-PLAN.md §0e):
//   • Brand-wide data never answers an initiative-specific question. A metric
//     is either scoped to the initiative (through a mapped entity) or labelled
//     `scope: "store"` as broader context. Missing initiative context is
//     better than a confident but misleading answer.
//   • Three tiers of mapping trust, and they are DATA, not labels:
//       confirmed   — the operator, or an exact identifier that exists in the
//                     store (a discount code used on orders). Full evidence.
//       provisional — strong deterministic evidence: the exact catalogue
//                     product title in the initiative's text; a campaign tied
//                     to a mapped product through a real campaign–product
//                     link. Usable, but every number rests on it is capped at
//                     "estimated", carries "מבוסס על התאמה אוטומטית · טרם
//                     אושר", and the status confidence is at most "medium".
//       suggested   — weak evidence (a token in a campaign name). Shown as a
//                     question; never used in a metric or a finding.
//     Every link keeps its provenance (rule + what matched). Confirming a
//     provisional link records the operator on top of the original rule —
//     it never rewrites where the number came from.
//   • Status: on_track / off_track need an explicit target and enough data.
//     Without a target the honest states are no_issue_detected,
//     needs_attention, insufficient_data. The plan model has no target yet,
//     so on_track / off_track cannot occur today.
//   • A finding never opens a decision. A risk finding becomes a CANDIDATE
//     for the shared pipeline; unknowns (restock date, whether the gift is
//     mandatory, an alternative gift) are listed as missing evidence, not
//     used as gates.
//
// Everything here is pure and unit-tested; the service gathers the inputs.

import type { EvidenceQuality, Localized } from "@/lib/domain/decision";
import type { Initiative } from "@/lib/domain/plan";

const L = (he: string, en: string): Localized => ({ he, en });

// ---------------------------------------------------------------------------
// Mapping: initiative → the business entities it refers to.

export type MappingKind = "product" | "gift_product" | "discount" | "meta_campaign";
export type LinkBasis = "confirmed" | "provisional" | "suggested";
export type MappingState = LinkBasis | "missing";
export type LinkConfidence = "high" | "medium" | "low";
export type MappingRule = "operator" | "exact_product_title" | "campaign_product_link" | "campaign_name_token" | "discount_code_used";

// Which rules are strong enough to be used without confirmation.
export const PROVISIONAL_RULES: readonly MappingRule[] = ["exact_product_title", "campaign_product_link"];

export interface LinkProvenance {
  rule: MappingRule; // the rule that produced the link (or "operator")
  matchedOn: string; // the exact evidence: the title, the code, the product id, the token
  // When the operator confirmed a link the system had found, the original
  // automatic rule stays here — the data's origin is never rewritten.
  auto: MappingRule | null;
}

export interface EntityLink {
  kind: MappingKind;
  id: string;
  label: string;
  state: LinkBasis;
  confidence: LinkConfidence | null; // null when confirmed
  reason: Localized; // the rule, in words
  provenance: LinkProvenance;
}

// Stored in plan overrides (`entityLinks`), keyed by initiative id.
export interface ConfirmedEntityLink {
  initiativeId: string;
  kind: MappingKind;
  id: string;
  label: string;
  via?: string | null; // the automatic rule that suggested it, if any, at confirmation time
}

export interface MappingCandidates {
  products: Array<{ id: string; title: string }>;
  knownDiscountCodes: string[]; // codes used on Shopify orders (or affiliate coupons)
  metaCampaigns: Array<{ id: string; name: string; linkedProductIds: string[] }>;
}

export interface InitiativeMappings {
  initiativeId: string;
  links: EntityLink[];
  byKind: Record<MappingKind, { state: MappingState; count: number; detail: Localized }>;
}

export const MAPPING_KIND_LABEL: Record<MappingKind, Localized> = {
  product: L("מוצרים", "Products"),
  gift_product: L("מוצר מתנה", "Gift product"),
  discount: L("קופון", "Coupon"),
  meta_campaign: L("קמפיין Meta", "Meta campaign")
};

export const BASIS_LABEL: Record<LinkBasis, Localized> = {
  confirmed: L("מאושר", "Confirmed"),
  provisional: L("זוהה אוטומטית · טרם אושר", "Auto-matched · not yet confirmed"),
  suggested: L("הצעה", "Suggested")
};

export const PROVISIONAL_NOTE: Localized = L("מבוסס על התאמה אוטומטית · טרם אושר", "Based on an automatic match · not yet confirmed");

export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[״"'׳`’‘]/g, "")
    .replace(/[-_/|·•+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const GIFT_RE = /\bמתנה\b|במתנה|\bgift\b|\bfree\b|חינם/i;

// Is `title` mentioned in `text` as a gift? Deterministic: the product name
// and a gift word inside the same clause (split on , . ; — / | newline).
export function mentionedAsGift(text: string, title: string): boolean {
  const n = normalizeText(title);
  if (!n) return false;
  return text
    .split(/[,.;\n—|/]+/)
    .map((c) => normalizeText(c))
    .some((c) => c.includes(n) && GIFT_RE.test(c));
}

// Tokens of the initiative's own name that are specific enough to point at
// a campaign — a WEAK signal, always a suggestion.
const GENERIC = new Set(["campaign", "launch", "sale", "promo", "promotion", "meta", "facebook", "instagram", "september", "october", "קמפיין", "השקה", "מבצע", "מכירה"]);
export function nameTokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
}

export function resolveMappings(
  initiative: Pick<Initiative, "id" | "title" | "products" | "offer" | "anchor"> & { text: string },
  candidates: MappingCandidates,
  confirmed: ConfirmedEntityLink[]
): InitiativeMappings {
  const links: EntityLink[] = [];
  const mine = confirmed.filter((c) => c.initiativeId === initiative.id);
  const find = (kind: MappingKind, id: string) => links.find((l) => l.kind === kind && l.id === id);

  // 1. Automatic links, each with its rule.
  for (const p of initiative.products) {
    const gift = mentionedAsGift(initiative.text, p.title);
    const kind: MappingKind = gift ? "gift_product" : "product";
    links.push({
      kind,
      id: p.productId,
      label: p.title,
      state: "provisional",
      confidence: "high",
      reason: gift ? L(`שם המוצר המדויק "${p.title}" מופיע בתוכנית באותו משפט עם "מתנה"`, `The exact product name "${p.title}" appears in the plan in the same clause as "gift"`) : L(`שם המוצר המדויק "${p.title}" מופיע בטקסט התוכנית`, `The exact product name "${p.title}" appears in the plan text`),
      provenance: { rule: "exact_product_title", matchedOn: p.title, auto: null }
    });
  }
  const code = initiative.offer.couponCode?.trim().toUpperCase() ?? null;
  const known = new Set(candidates.knownDiscountCodes.map((c) => c.trim().toUpperCase()));
  if (code && known.has(code)) {
    links.push({ kind: "discount", id: code, label: code, state: "confirmed", confidence: null, reason: L(`הקוד ${code} קיים ב-Shopify (שימוש בהזמנות)`, `Code ${code} exists in Shopify (used on orders)`), provenance: { rule: "discount_code_used", matchedOn: code, auto: null } });
  }
  const productIds = new Set(links.filter((l) => l.kind === "product" || l.kind === "gift_product").map((l) => l.id));
  const tokens = [...new Set([...nameTokens(initiative.title), ...nameTokens(initiative.anchor.label)])];
  for (const c of candidates.metaCampaigns) {
    const viaProduct = c.linkedProductIds.find((id) => productIds.has(id));
    if (viaProduct) {
      const label = links.find((l) => l.id === viaProduct)?.label ?? viaProduct;
      links.push({ kind: "meta_campaign", id: c.id, label: c.name, state: "provisional", confidence: "high", reason: L(`מקושר ל"${label}" בקישורי קמפיין–מוצר`, `Linked to "${label}" through campaign–product links`), provenance: { rule: "campaign_product_link", matchedOn: viaProduct, auto: null } });
      continue;
    }
    const cn = normalizeText(c.name);
    const tok = tokens.find((tk) => cn.includes(tk));
    if (tok) links.push({ kind: "meta_campaign", id: c.id, label: c.name, state: "suggested", confidence: "medium", reason: L(`שם הקמפיין מכיל "${tok}" — התאמה חלשה, דורשת אישור`, `The campaign name contains "${tok}" — a weak match, needs confirmation`), provenance: { rule: "campaign_name_token", matchedOn: tok, auto: null } });
  }

  // 2. Operator confirmations override the state but keep the origin.
  for (const c of mine) {
    const existing = find(c.kind, c.id);
    if (existing) {
      existing.state = "confirmed";
      existing.confidence = null;
      existing.reason = L("אושר על ידי המנהל", "Confirmed by the operator");
      existing.provenance = { rule: "operator", matchedOn: existing.provenance.matchedOn, auto: existing.provenance.rule };
    } else {
      links.push({ kind: c.kind, id: c.id, label: c.label, state: "confirmed", confidence: null, reason: L("קושר על ידי המנהל", "Linked by the operator"), provenance: { rule: "operator", matchedOn: c.label, auto: (c.via as MappingRule | null | undefined) ?? null } });
    }
  }

  const byKind = {} as InitiativeMappings["byKind"];
  for (const kind of ["product", "gift_product", "discount", "meta_campaign"] as MappingKind[]) {
    const of = links.filter((l) => l.kind === kind);
    const n = (s: LinkBasis) => of.filter((l) => l.state === s).length;
    const state: MappingState = n("confirmed") > 0 ? "confirmed" : n("provisional") > 0 ? "provisional" : n("suggested") > 0 ? "suggested" : "missing";
    const detail =
      state === "confirmed"
        ? L(`${n("confirmed")} מאושרים${n("provisional") ? ` · ${n("provisional")} זוהו אוטומטית` : ""}`, `${n("confirmed")} confirmed${n("provisional") ? ` · ${n("provisional")} auto-matched` : ""}`)
        : state === "provisional"
          ? L(`${n("provisional")} זוהו אוטומטית — טרם אושרו`, `${n("provisional")} auto-matched — not yet confirmed`)
          : state === "suggested"
            ? L(`${n("suggested")} הצעות חלשות — דורשות אישור`, `${n("suggested")} weak suggestions — need confirmation`)
            : kind === "discount" && code
              ? L(`${code} נזכר בתוכנית אך לא נראה ב-Shopify`, `${code} is named in the plan but not seen in Shopify`)
              : L("לא מקושר", "Not linked");
    byKind[kind] = { state, count: of.length, detail };
  }
  return { initiativeId: initiative.id, links, byKind };
}

// Links that may feed evidence: confirmed and provisional. Suggested never.
export const usableLinks = (m: InitiativeMappings) => m.links.filter((l) => l.state !== "suggested");

// ---------------------------------------------------------------------------
// Evidence gathered per USABLE entity for the initiative's window.

export interface ProductEvidence {
  id: string;
  title: string;
  role: "product" | "gift";
  basis: Exclude<LinkBasis, "suggested">;
  rule: MappingRule;
  revenue: number | null; // net of line discounts and refunds, window to date
  units: number | null;
  priorRevenue: number | null; // the same number of days right before the window
  priorUnits: number | null;
  dailyUnits: number[]; // units per day across the window to date (consumption profile)
  inventory: number | null;
  coverDays: number | null; // at the window's own pace
  hasRealCost: boolean;
  marginRate: number | null;
}

export interface DiscountEvidence {
  code: string;
  basis: Exclude<LinkBasis, "suggested">;
  rule: MappingRule;
  orders: number;
  amount: number;
}

export interface CampaignEvidence {
  id: string;
  name: string;
  basis: Exclude<LinkBasis, "suggested">;
  rule: MappingRule;
  spend: number;
  purchases: number;
  attributedRevenue: number | null; // Meta's own purchase value (purchase ROAS × spend)
}

export interface InitiativeFreshness {
  shopify: string | null;
  meta: string | null;
  inventory: string | null;
  plan: string | null;
}

export interface InitiativeEvidence {
  products: ProductEvidence[];
  discount: DiscountEvidence | null;
  campaigns: CampaignEvidence[];
  // Broader brand context — shown only as such, never as initiative status.
  store: { sales7: number | null; velocityChangePct: number | null; marginRate: number | null } | null;
  freshness: InitiativeFreshness;
}

// ---------------------------------------------------------------------------
// The evaluated reality.

export type InitiativeRealityStatus = "on_track" | "off_track" | "no_issue_detected" | "needs_attention" | "insufficient_data";
export type MetricScope = "initiative" | "store";

export interface MetricProvenance {
  kind: MappingKind;
  id: string;
  label: string;
  basis: LinkBasis;
  rule: MappingRule;
}

export interface InitiativeMetric {
  key: string;
  label: Localized;
  value: string | null;
  quality: EvidenceQuality;
  scope: MetricScope;
  basis: Exclude<LinkBasis, "suggested"> | null; // the weakest mapping the number rests on
  source: "shopify" | "meta" | "inventory" | "profit" | "plan";
  provenance: MetricProvenance[]; // exactly which mappings produced the number
  note?: Localized;
}

export type FindingKind =
  | "no_sales_since_start"
  | "coupon_unused"
  | "campaign_no_spend"
  | "inventory_short_of_window"
  | "gift_inventory_short"
  | "spend_exceeds_attributed_revenue"
  | "negative_margin"
  | "half_window_no_activity"
  | "sales_vs_prior"
  | "progressing";

export interface ConsumptionProfile {
  perDay: number; // units per day across the window to date
  trendPct: number | null; // second half vs first half of the window (null when too short)
  stability: "stable" | "rising" | "falling" | "unknown";
  daysObserved: number;
}

export interface InitiativeFinding {
  kind: FindingKind;
  severity: "info" | "attention" | "risk";
  basis: Exclude<LinkBasis, "suggested">; // the weakest mapping the finding rests on
  unconfirmed: boolean; // basis !== confirmed
  statement: Localized;
  // Observable facts a candidate can carry, and what is NOT known.
  evidence: string[];
  missing: Localized[];
  consumption?: ConsumptionProfile;
  product?: { id: string; title: string; role: "product" | "gift"; inventory: number | null; coverDays: number | null };
}

export interface MissingEvidence {
  key: "products" | "gift" | "discount" | "campaign" | "costs" | "confirm_products" | "confirm_campaign" | "confirm_gift";
  label: Localized;
}

export interface StatusLine {
  label: Localized;
  state: "healthy" | "above" | "below" | "risk" | "acceptable" | "unknown";
  text: Localized;
}

// The finding that becomes a candidate for the shared pipeline. Never a
// decision by itself.
export interface CandidateFinding {
  kind: FindingKind;
  candidateKind: "initiative_gift_stock_risk" | "initiative_stock_risk" | "initiative_margin_risk";
  question: Localized;
  finding: InitiativeFinding;
}

export interface InitiativeReality {
  initiativeId: string;
  title: string;
  period: { start: string; end: string; today: string; dayIndex: number; totalDays: number; daysRemaining: number; elapsedShare: number };
  status: InitiativeRealityStatus;
  statusReason: Localized;
  lines: StatusLine[];
  mappings: InitiativeMappings;
  metrics: InitiativeMetric[];
  findings: InitiativeFinding[];
  missingEvidence: MissingEvidence[];
  // No target exists in the plan model; on_track / off_track need one.
  goal: { defined: boolean; note: Localized };
  confidence: LinkConfidence;
  confidenceReason: Localized;
  freshness: InitiativeFreshness;
  stale: boolean;
  // Rests on confirmed or provisional evidence only.
  evidenceBasis: "confirmed" | "provisional" | "none";
  candidateFinding: CandidateFinding | null;
  evaluatedAt: string;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const ils = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
const pctStr = (r: number) => `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;
const hoursOld = (iso: string | null, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 3_600_000 : null);
const weakest = (bases: Array<Exclude<LinkBasis, "suggested">>): Exclude<LinkBasis, "suggested"> => (bases.some((b) => b === "provisional") ? "provisional" : "confirmed");

export function consumptionProfile(dailyUnits: number[]): ConsumptionProfile {
  const n = dailyUnits.length;
  const total = dailyUnits.reduce((a, b) => a + b, 0);
  const perDay = n > 0 ? total / n : 0;
  if (n < 6) return { perDay, trendPct: null, stability: "unknown", daysObserved: n };
  const half = Math.floor(n / 2);
  const first = dailyUnits.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const second = dailyUnits.slice(n - half).reduce((a, b) => a + b, 0) / half;
  const trendPct = first > 0 ? (second - first) / first : second > 0 ? 1 : 0;
  return { perDay, trendPct, stability: Math.abs(trendPct) < 0.25 ? "stable" : trendPct > 0 ? "rising" : "falling", daysObserved: n };
}

export function evaluateInitiativeReality(
  initiative: Pick<Initiative, "id" | "title" | "start" | "end" | "offer">,
  mappings: InitiativeMappings,
  ev: InitiativeEvidence,
  now: Date
): InitiativeReality {
  const today = now.toISOString().slice(0, 10);
  const totalDays = daysBetween(initiative.start, initiative.end) + 1;
  const dayIndex = Math.min(totalDays, Math.max(0, daysBetween(initiative.start, today) + 1));
  const daysRemaining = Math.max(0, daysBetween(today, initiative.end));
  const live = initiative.start <= today && initiative.end >= today;
  const elapsedShare = totalDays > 0 ? Math.min(1, Math.max(0, dayIndex / totalDays)) : 0;
  const period = { start: initiative.start, end: initiative.end, today, dayIndex, totalDays, daysRemaining, elapsedShare };

  const metrics: InitiativeMetric[] = [];
  const findings: InitiativeFinding[] = [];
  const missing: MissingEvidence[] = [];
  const lines: StatusLine[] = [];

  // Quality is capped by the weakest mapping underneath the number.
  const cap = (basis: Exclude<LinkBasis, "suggested">, q: EvidenceQuality): EvidenceQuality => (basis === "provisional" && q !== "unavailable" ? "estimated" : q);
  const provNote = (basis: Exclude<LinkBasis, "suggested">, other?: Localized): Localized | undefined =>
    basis === "provisional" ? (other ? L(`${other.he} · ${PROVISIONAL_NOTE.he}`, `${other.en} · ${PROVISIONAL_NOTE.en}`) : PROVISIONAL_NOTE) : other;
  const provOf = (items: Array<{ id: string; title?: string; name?: string; code?: string; basis: Exclude<LinkBasis, "suggested">; rule: MappingRule; role?: "product" | "gift" }>, kind?: MappingKind): MetricProvenance[] =>
    items.map((x) => ({ kind: kind ?? (x.role === "gift" ? "gift_product" : "product"), id: x.id, label: x.title ?? x.name ?? x.code ?? x.id, basis: x.basis, rule: x.rule }));
  const unknownGift = [L("מועד אספקה חוזרת של המתנה", "When the gift can be restocked"), L("האם המתנה חובה או אופציונלית להצעה", "Whether the gift is mandatory or optional for the offer"), L("האם קיימת מתנה חלופית", "Whether an alternative gift exists")];
  const unknownStock = [L("מועד אספקה חוזרת", "When the product can be restocked"), L("האם הקמפיין ימשיך באותו קצב", "Whether the campaign will keep the same pace")];

  // ── Products (initiative-specific sales) ─────────────────────────────
  const mainProducts = ev.products.filter((p) => p.role === "product");
  const gifts = ev.products.filter((p) => p.role === "gift");
  if (mainProducts.length === 0) {
    missing.push({ key: "products", label: L("אילו מוצרים היוזמה מוכרת — לא מקושר", "Which products the initiative sells — not linked") });
    metrics.push({ key: "revenue", label: L("הכנסות היוזמה", "Initiative revenue"), value: null, quality: "unavailable", scope: "initiative", basis: null, source: "shopify", provenance: [], note: L("מוצרים לא מקושרים", "products not linked") });
  } else {
    const basis = weakest(mainProducts.map((p) => p.basis));
    const prov = provOf(mainProducts);
    const rev = mainProducts.reduce((n, p) => n + (p.revenue ?? 0), 0);
    const units = mainProducts.reduce((n, p) => n + (p.units ?? 0), 0);
    const priorRev = mainProducts.every((p) => p.priorRevenue !== null) ? mainProducts.reduce((n, p) => n + (p.priorRevenue ?? 0), 0) : null;
    const vs = priorRev !== null && priorRev > 0 ? (rev - priorRev) / priorRev : null;
    metrics.push({ key: "revenue", label: L("הכנסות היוזמה", "Initiative revenue"), value: ils(rev), quality: cap(basis, "known"), scope: "initiative", basis, source: "shopify", provenance: prov, note: provNote(basis, vs !== null ? L(`${pctStr(vs)} מול תקופה מקבילה קודמת`, `${pctStr(vs)} vs the previous comparable period`) : undefined) });
    metrics.push({ key: "units", label: L("יחידות שנמכרו", "Units sold"), value: String(units), quality: cap(basis, "known"), scope: "initiative", basis, source: "shopify", provenance: prov, note: provNote(basis) });
    if (vs !== null) findings.push({ kind: "sales_vs_prior", severity: "info", basis, unconfirmed: basis !== "confirmed", statement: L(`המכירות ${vs >= 0 ? "מעל" : "מתחת"} לתקופה המקבילה הקודמת (${pctStr(vs)}).`, `Sales are ${vs >= 0 ? "above" : "below"} the previous comparable period (${pctStr(vs)}).`), evidence: [`revenue ${ils(rev)} vs ${ils(priorRev!)} prior`], missing: [] });
    if (live && dayIndex >= 3 && units === 0) findings.push({ kind: "no_sales_since_start", severity: "attention", basis, unconfirmed: basis !== "confirmed", statement: L(`היוזמה התחילה לפני ${dayIndex} ימים ואין מכירות של המוצרים המקושרים.`, `The initiative started ${dayIndex} days ago and the linked products have no sales.`), evidence: [`0 units in ${dayIndex} days`], missing: [] });
    for (const p of mainProducts) {
      const note = p.coverDays !== null ? L(`${p.coverDays} ימי כיסוי בקצב היוזמה`, `${p.coverDays} days of cover at the initiative's pace`) : p.inventory !== null ? L(`${p.inventory} במלאי, אין קצב למדוד`, `${p.inventory} in stock, no pace to measure`) : L("מלאי לא ידוע", "inventory unknown");
      metrics.push({ key: `inventory:${p.id}`, label: L(`מלאי · ${p.title}`, `Inventory · ${p.title}`), value: p.inventory === null ? null : String(p.inventory), quality: p.inventory === null ? "unavailable" : cap(p.basis, "known"), scope: "initiative", basis: p.basis, source: "inventory", provenance: provOf([p]), note: provNote(p.basis, note) });
      if (live && p.coverDays !== null && p.coverDays < daysRemaining) {
        const c = consumptionProfile(p.dailyUnits);
        findings.push({
          kind: "inventory_short_of_window",
          severity: "risk",
          basis: p.basis,
          unconfirmed: p.basis !== "confirmed",
          statement: L(`"${p.title}" ייגמר בעוד ~${p.coverDays} ימים, והיוזמה נמשכת עוד ${daysRemaining} ימים.`, `"${p.title}" runs out in ~${p.coverDays} days, and the initiative runs ${daysRemaining} more days.`),
          evidence: [`inventory ${p.inventory}`, `consumption ${c.perDay.toFixed(1)}/day over ${c.daysObserved} days`, `trend ${c.trendPct === null ? "n/a" : pctStr(c.trendPct)} (${c.stability})`, `estimated ${p.coverDays} days remaining vs ${daysRemaining} initiative days`],
          missing: unknownStock,
          consumption: c,
          product: { id: p.id, title: p.title, role: "product", inventory: p.inventory, coverDays: p.coverDays }
        });
      }
    }
    const withCost = mainProducts.filter((p) => p.marginRate !== null);
    if (withCost.length) {
      const real = mainProducts.every((p) => p.hasRealCost);
      const netAll = mainProducts.reduce((n, p) => n + (p.revenue ?? 0), 0);
      const rate = netAll > 0 ? withCost.reduce((n, p) => n + (p.marginRate ?? 0) * (p.revenue ?? 0), 0) / netAll : null;
      if (rate !== null) {
        metrics.push({ key: "margin", label: L("מרווח תרומה", "Contribution margin"), value: `${Math.round(rate * 100)}%`, quality: cap(basis, real ? "calculated" : "estimated"), scope: "initiative", basis, source: "profit", provenance: prov, note: provNote(basis, real ? undefined : L("עלות אמיתית חסרה לחלק מהמוצרים", "real cost missing on some products")) });
        if (rate < 0 && real) findings.push({ kind: "negative_margin", severity: "risk", basis, unconfirmed: basis !== "confirmed", statement: L(`מרווח התרומה של היוזמה שלילי (${Math.round(rate * 100)}%).`, `The initiative's contribution margin is negative (${Math.round(rate * 100)}%).`), evidence: [`margin ${Math.round(rate * 100)}% on ${ils(netAll)} net`], missing: [L("האם ההצעה כוללת עלויות שאינן במערכת", "Whether the offer carries costs not in the system")] });
      }
      if (!real) missing.push({ key: "costs", label: L("עלות אמיתית לכל מוצרי היוזמה", "A real cost on every initiative product") });
    } else {
      missing.push({ key: "costs", label: L("עלות אמיתית לכל מוצרי היוזמה", "A real cost on every initiative product") });
    }
    if (basis === "provisional") missing.push({ key: "confirm_products", label: L("אישור המוצרים שזוהו אוטומטית", "Confirm the auto-matched products") });
  }

  // ── Gift product ─────────────────────────────────────────────────────
  for (const g of gifts) {
    const units = g.units ?? 0;
    metrics.push({ key: `gift:${g.id}`, label: L(`מתנה · ${g.title}`, `Gift · ${g.title}`), value: g.units === null ? null : String(units), quality: g.units === null ? "unavailable" : cap(g.basis, "known"), scope: "initiative", basis: g.basis, source: "shopify", provenance: provOf([g]), note: provNote(g.basis, L("יחידות שניתנו בחלון היוזמה", "units given in the initiative window")) });
    metrics.push({ key: `gift_inventory:${g.id}`, label: L(`מלאי מתנה · ${g.title}`, `Gift inventory · ${g.title}`), value: g.coverDays === null ? (g.inventory === null ? null : String(g.inventory)) : `${g.coverDays}`, quality: g.inventory === null ? "unavailable" : cap(g.basis, "known"), scope: "initiative", basis: g.basis, source: "inventory", provenance: provOf([g]), note: provNote(g.basis, g.coverDays !== null ? L("ימי כיסוי בקצב היוזמה", "days of cover at the initiative's pace") : L("יחידות במלאי", "units in stock")) });
    if (live && g.coverDays !== null && g.coverDays < daysRemaining) {
      const c = consumptionProfile(g.dailyUnits);
      findings.push({
        kind: "gift_inventory_short",
        severity: "risk",
        basis: g.basis,
        unconfirmed: g.basis !== "confirmed",
        statement: L(`מלאי המתנה "${g.title}" ייגמר בעוד ~${g.coverDays} ימים, לפני סוף היוזמה (${daysRemaining} ימים).`, `Gift stock for "${g.title}" runs out in ~${g.coverDays} days, before the initiative ends (${daysRemaining} days).`),
        evidence: [`gift inventory ${g.inventory}`, `given ${units} units · ${c.perDay.toFixed(1)}/day over ${c.daysObserved} days`, `trend ${c.trendPct === null ? "n/a" : pctStr(c.trendPct)} (${c.stability})`, `estimated ${g.coverDays} days remaining vs ${daysRemaining} initiative days`],
        missing: unknownGift,
        consumption: c,
        product: { id: g.id, title: g.title, role: "gift", inventory: g.inventory, coverDays: g.coverDays }
      });
    }
    if (g.basis === "provisional" && !missing.some((m) => m.key === "confirm_gift")) missing.push({ key: "confirm_gift", label: L("אישור מוצר המתנה שזוהה אוטומטית", "Confirm the auto-matched gift product") });
  }

  // ── Coupon ───────────────────────────────────────────────────────────
  if (ev.discount) {
    const d = ev.discount;
    metrics.push({ key: "coupon_orders", label: L(`שימוש בקופון ${d.code}`, `Coupon ${d.code} usage`), value: String(d.orders), quality: cap(d.basis, "known"), scope: "initiative", basis: d.basis, source: "shopify", provenance: [{ kind: "discount", id: d.code, label: d.code, basis: d.basis, rule: d.rule }], note: provNote(d.basis, L(`${ils(d.amount)} הנחה שניתנה בחלון`, `${ils(d.amount)} discount given in the window`)) });
    if (live && dayIndex >= 3 && d.orders === 0) findings.push({ kind: "coupon_unused", severity: "attention", basis: d.basis, unconfirmed: d.basis !== "confirmed", statement: L(`הקופון ${d.code} לא שימש באף הזמנה מאז תחילת היוזמה.`, `Coupon ${d.code} has not been used on any order since the initiative started.`), evidence: [`0 orders with ${d.code} in ${dayIndex} days`], missing: [] });
  } else if (initiative.offer.couponCode) {
    missing.push({ key: "discount", label: L(`הקופון ${initiative.offer.couponCode} לא נראה ב-Shopify`, `Coupon ${initiative.offer.couponCode} not seen in Shopify`) });
    metrics.push({ key: "coupon_orders", label: L("שימוש בקופון", "Coupon usage"), value: null, quality: "unavailable", scope: "initiative", basis: null, source: "shopify", provenance: [], note: L("קופון לא מקושר", "coupon not linked") });
  }

  // ── Meta ─────────────────────────────────────────────────────────────
  if (ev.campaigns.length) {
    const basis = weakest(ev.campaigns.map((c) => c.basis));
    const prov = provOf(ev.campaigns, "meta_campaign");
    const spend = ev.campaigns.reduce((n, c) => n + c.spend, 0);
    const attributed = ev.campaigns.every((c) => c.attributedRevenue !== null) ? ev.campaigns.reduce((n, c) => n + (c.attributedRevenue ?? 0), 0) : null;
    const roas = attributed !== null && spend > 0 ? attributed / spend : null;
    metrics.push({ key: "meta_spend", label: L("הוצאת Meta על הקמפיין", "Meta spend on the campaign"), value: ils(spend), quality: cap(basis, "known"), scope: "initiative", basis, source: "meta", provenance: prov, note: provNote(basis, L(ev.campaigns.map((c) => c.name).join(", "), ev.campaigns.map((c) => c.name).join(", "))) });
    metrics.push({ key: "meta_revenue", label: L("הכנסה משויכת (Meta)", "Attributed revenue (Meta)"), value: attributed === null ? null : ils(attributed), quality: attributed === null ? "unavailable" : cap(basis, "estimated"), scope: "initiative", basis, source: "meta", provenance: prov, note: attributed === null ? L("Meta לא דיווח ערך רכישה", "Meta reported no purchase value") : provNote(basis, L("לפי הייחוס של Meta עצמה", "by Meta's own attribution")) });
    metrics.push({ key: "meta_roas", label: L("ROAS", "ROAS"), value: roas === null ? null : roas.toFixed(1), quality: roas === null ? "unavailable" : cap(basis, "estimated"), scope: "initiative", basis, source: "meta", provenance: prov, note: provNote(basis) });
    if (live && dayIndex >= 2 && spend === 0) findings.push({ kind: "campaign_no_spend", severity: "attention", basis, unconfirmed: basis !== "confirmed", statement: L("הקמפיין המקושר לא הוציא תקציב מאז תחילת היוזמה.", "The linked campaign has spent nothing since the initiative started."), evidence: ["spend ₪0 in the window"], missing: [] });
    if (spend > 0 && attributed !== null && attributed < spend) findings.push({ kind: "spend_exceeds_attributed_revenue", severity: "attention", basis, unconfirmed: basis !== "confirmed", statement: L(`ההוצאה (${ils(spend)}) גבוהה מההכנסה שהקמפיין מייחס לעצמו (${ils(attributed)}).`, `Spend (${ils(spend)}) exceeds the revenue the campaign attributes to itself (${ils(attributed)}).`), evidence: [`spend ${ils(spend)} vs attributed ${ils(attributed)}`], missing: [] });
    if (basis === "provisional") missing.push({ key: "confirm_campaign", label: L("אישור הקמפיין שזוהה אוטומטית", "Confirm the auto-matched campaign") });
  } else {
    const weak = mappings.links.some((l) => l.kind === "meta_campaign" && l.state === "suggested");
    missing.push({ key: "campaign", label: weak ? L("קמפיין Meta — יש הצעה חלשה בלבד, דורשת אישור", "Meta campaign — only a weak suggestion, needs confirmation") : L("קמפיין Meta של היוזמה — לא מקושר", "The initiative's Meta campaign — not linked") });
    metrics.push({ key: "meta_spend", label: L("ביצועי הקמפיין", "Campaign performance"), value: null, quality: "unavailable", scope: "initiative", basis: null, source: "meta", provenance: [], note: L("קמפיין לא מקושר", "campaign not linked") });
  }

  // ── Half the window gone with no activity at all ─────────────────────
  const anyActivity = ev.products.some((p) => (p.units ?? 0) > 0) || (ev.discount?.orders ?? 0) > 0 || ev.campaigns.some((c) => c.spend > 0);
  const anyMapped = ev.products.length > 0 || ev.discount !== null || ev.campaigns.length > 0;
  if (live && anyMapped && elapsedShare >= 0.5 && !anyActivity) {
    const basis = weakest([...ev.products.map((p) => p.basis), ...(ev.discount ? [ev.discount.basis] : []), ...ev.campaigns.map((c) => c.basis)]);
    findings.push({ kind: "half_window_no_activity", severity: "attention", basis, unconfirmed: basis !== "confirmed", statement: L("חצי מחלון היוזמה עבר ללא מכירות, שימוש בקופון או הוצאת קמפיין.", "Half the initiative window has passed with no sales, coupon use or campaign spend."), evidence: [`day ${dayIndex} of ${totalDays}`], missing: [] });
  }

  // ── Broader brand context: labelled, never mixed in ──────────────────
  if (ev.store) {
    if (ev.store.sales7 !== null) metrics.push({ key: "store_sales7", label: L("מכירות כל החנות / 7 ימים", "Whole-store sales / 7 days"), value: ils(ev.store.sales7), quality: "known", scope: "store", basis: null, source: "shopify", provenance: [], note: ev.store.velocityChangePct !== null ? L(`${pctStr(ev.store.velocityChangePct)} מול 7 הימים הקודמים`, `${pctStr(ev.store.velocityChangePct)} vs the prior 7 days`) : undefined });
    if (ev.store.marginRate !== null) metrics.push({ key: "store_margin", label: L("מרווח תרומה כל החנות", "Whole-store contribution margin"), value: `${Math.round(ev.store.marginRate * 100)}%`, quality: "estimated", scope: "store", basis: null, source: "profit", provenance: [] });
  }

  // ── Status ───────────────────────────────────────────────────────────
  const usable = [...ev.products.map((p) => p.basis), ...(ev.discount ? [ev.discount.basis] : []), ...ev.campaigns.map((c) => c.basis)];
  const evidenceBasis: InitiativeReality["evidenceBasis"] = usable.length === 0 ? "none" : usable.some((b) => b === "confirmed") ? "confirmed" : "provisional";
  const hasEvidence = evidenceBasis !== "none";
  const issues = findings.filter((f) => f.severity !== "info");
  const risks = findings.filter((f) => f.severity === "risk");
  const goalDefined = false; // the plan model carries no target
  let status: InitiativeRealityStatus;
  let statusReason: Localized;
  if (!hasEvidence) {
    status = "insufficient_data";
    statusReason = mappings.links.length ? L("הישויות של היוזמה מוצעות בלבד (התאמה חלשה) — אין מספיק מידע להעריך.", "The initiative's entities are only weakly suggested — not enough to evaluate.") : L("הישויות של היוזמה לא ממופות — אין מספיק מידע להעריך.", "The initiative's entities are not mapped — not enough to evaluate.");
  } else if (issues.length) {
    status = "needs_attention";
    statusReason = (risks[0] ?? issues[0]).statement;
  } else if (goalDefined) {
    status = "on_track"; // unreachable today: kept for when a target exists
    statusReason = L("עומד ביעד.", "Meeting the target.");
  } else {
    status = "no_issue_detected";
    statusReason = L("נבדק — לא נמצאה בעיה מהותית. אין יעד שמאפשר לקבוע אם היוזמה במסלול.", "Checked — no material issue found. No target exists to say whether it is on track.");
  }
  if (evidenceBasis === "provisional" && status !== "insufficient_data") statusReason = L(`${statusReason.he} מבוסס על התאמה אוטומטית — טרם אושר.`, `${statusReason.en} Based on automatic matches — not yet confirmed.`);
  if (status === "no_issue_detected" && !findings.some((f) => f.kind !== "sales_vs_prior")) findings.push({ kind: "progressing", severity: "info", basis: evidenceBasis === "confirmed" ? "confirmed" : "provisional", unconfirmed: evidenceBasis !== "confirmed", statement: L("היוזמה מתקדמת ללא ממצא חריג.", "The initiative is progressing with no exceptional finding."), evidence: [], missing: [] });

  // Status lines (Campaign / Sales / Inventory / Margin) — each with a reason.
  const salesM = metrics.find((m) => m.key === "revenue");
  const vsF = findings.find((f) => f.kind === "sales_vs_prior");
  lines.push({ label: L("מכירות", "Sales"), state: !salesM || salesM.value === null ? "unknown" : vsF ? (vsF.statement.en.includes("above") ? "above" : "below") : "acceptable", text: !salesM || salesM.value === null ? L("לא מקושר", "not linked") : (salesM.note ?? L(salesM.value, salesM.value)) });
  const camp = metrics.find((m) => m.key === "meta_spend");
  const campIssue = findings.find((f) => f.kind === "campaign_no_spend" || f.kind === "spend_exceeds_attributed_revenue");
  lines.push({ label: L("קמפיין", "Campaign"), state: !camp || camp.value === null ? "unknown" : campIssue ? "risk" : "healthy", text: !camp || camp.value === null ? L("לא מקושר", "not linked") : (campIssue?.statement ?? L(`${camp.value} הוצאה`, `${camp.value} spend`)) });
  const invRisk = findings.find((f) => f.kind === "inventory_short_of_window" || f.kind === "gift_inventory_short");
  const invKnown = ev.products.some((p) => p.inventory !== null);
  lines.push({ label: L("מלאי", "Inventory"), state: invRisk ? "risk" : invKnown ? "healthy" : "unknown", text: invRisk ? invRisk.statement : invKnown ? L("מספיק לחלון היוזמה", "enough for the initiative window") : L("לא ידוע", "unknown") });
  const marginM = metrics.find((m) => m.key === "margin");
  lines.push({ label: L("רווחיות", "Margin"), state: !marginM ? "unknown" : findings.some((f) => f.kind === "negative_margin") ? "risk" : "acceptable", text: marginM ? L(`${marginM.value} (${marginM.quality === "estimated" ? "אומדן" : "מחושב"})`, `${marginM.value} (${marginM.quality})`) : L("עלויות חסרות", "costs missing") });

  // ── Confidence: deterministic, from mapping trust + costs + freshness ──
  const shopifyAge = hoursOld(ev.freshness.shopify, now);
  const metaAge = hoursOld(ev.freshness.meta, now);
  const stale = (shopifyAge !== null && shopifyAge > 24) || (metaAge !== null && ev.campaigns.length > 0 && metaAge > 24);
  const veryStale = (shopifyAge !== null && shopifyAge > 48) || (metaAge !== null && ev.campaigns.length > 0 && metaAge > 48);
  const costsMissing = missing.some((m) => m.key === "costs");
  const anyProvisional = usable.some((b) => b === "provisional");
  let confidence: LinkConfidence;
  let confidenceReason: Localized;
  if (!hasEvidence || veryStale) {
    confidence = "low";
    confidenceReason = veryStale ? L("הנתונים לא סונכרנו יותר מ-48 שעות.", "Data has not synced for more than 48 hours.") : mappings.links.length ? L("רק הצעות חלשות — אף מיפוי אינו שמיש.", "Only weak suggestions — no usable mapping.") : L("אין ישויות ממופות.", "No entities are mapped.");
  } else if (anyProvisional || stale || costsMissing || missing.some((m) => m.key === "campaign")) {
    confidence = "medium";
    confidenceReason = anyProvisional
      ? L("חלק מהראיות נשענות על התאמה אוטומטית שטרם אושרה.", "Some evidence rests on automatic matches that are not yet confirmed.")
      : stale
        ? L("הנתונים בני יותר מ-24 שעות.", "Data is more than 24 hours old.")
        : costsMissing
          ? L("מוצרים וקמפיין מקושרים, אבל עלויות אמיתיות חסרות.", "Products and campaign are linked, but real product costs are incomplete.")
          : L("הקמפיין של היוזמה אינו מקושר.", "The initiative's campaign is not linked.");
  } else {
    confidence = "high";
    confidenceReason = L("כל הישויות מאושרות, העלויות אמיתיות והנתונים טריים.", "Every entity is confirmed, costs are real and data is fresh.");
  }

  // ── Candidate: a risk on usable evidence. Never a decision by itself. ─
  const risk = risks[0] ?? null;
  const giftName = risk?.product?.title;
  const candidateFinding: CandidateFinding | null = risk
    ? {
        kind: risk.kind,
        candidateKind: risk.kind === "gift_inventory_short" ? "initiative_gift_stock_risk" : risk.kind === "inventory_short_of_window" ? "initiative_stock_risk" : "initiative_margin_risk",
        question:
          risk.kind === "gift_inventory_short"
            ? L(`האם להמשיך להציע את "${giftName}" כמתנה עד סוף היוזמה?`, `Should we keep offering "${giftName}" as the gift until the initiative ends?`)
            : risk.kind === "inventory_short_of_window"
              ? L(`המלאי של "${giftName}" לא מספיק לחלון היוזמה — להמשיך כמתוכנן, לקצר או לחדש מלאי?`, `Stock of "${giftName}" will not last the initiative window — continue as planned, shorten it, or restock?`)
              : L("מרווח התרומה של היוזמה שלילי — להמשיך, לשנות את ההצעה או לעצור?", "The initiative's contribution margin is negative — continue, change the offer, or stop?"),
        finding: risk
      }
    : null;

  return {
    initiativeId: initiative.id,
    title: initiative.title,
    period,
    status,
    statusReason,
    lines,
    mappings,
    metrics,
    findings,
    missingEvidence: missing,
    goal: { defined: goalDefined, note: L("לא הוגדר יעד מסחרי ליוזמה הזו.", "No commercial target was defined for this initiative.") },
    confidence,
    confidenceReason,
    freshness: ev.freshness,
    stale,
    evidenceBasis,
    candidateFinding,
    evaluatedAt: now.toISOString()
  };
}

// The compact shape stored on a plan decision's payload and shown on the
// receipt — enough to answer "what is happening now" without the DB.
export interface InitiativeRealitySummary {
  initiativeId: string;
  title: string;
  period: InitiativeReality["period"];
  offer: { discountPct: number | null; couponCode: string | null };
  status: InitiativeRealityStatus;
  statusReason: Localized;
  lines: StatusLine[];
  metrics: InitiativeMetric[];
  findings: InitiativeFinding[];
  missingEvidence: MissingEvidence[];
  mappings: Array<{ kind: MappingKind; state: MappingState; count: number; detail: Localized }>;
  links: Array<{ kind: MappingKind; id: string; label: string; state: LinkBasis; provenance: LinkProvenance }>;
  goalNote: Localized;
  confidence: LinkConfidence;
  confidenceReason: Localized;
  freshness: InitiativeFreshness;
  stale: boolean;
  evidenceBasis: InitiativeReality["evidenceBasis"];
  candidateFinding: CandidateFinding | null;
  evaluatedAt: string;
}

export function summarizeReality(r: InitiativeReality, offer: Initiative["offer"]): InitiativeRealitySummary {
  return {
    initiativeId: r.initiativeId,
    title: r.title,
    period: r.period,
    offer,
    status: r.status,
    statusReason: r.statusReason,
    lines: r.lines,
    metrics: r.metrics,
    findings: r.findings,
    missingEvidence: r.missingEvidence,
    mappings: (["product", "gift_product", "discount", "meta_campaign"] as MappingKind[]).map((kind) => ({ kind, ...r.mappings.byKind[kind] })),
    links: r.mappings.links.map((l) => ({ kind: l.kind, id: l.id, label: l.label, state: l.state, provenance: l.provenance })),
    goalNote: r.goal.note,
    confidence: r.confidence,
    confidenceReason: r.confidenceReason,
    freshness: r.freshness,
    stale: r.stale,
    evidenceBasis: r.evidenceBasis,
    candidateFinding: r.candidateFinding,
    evaluatedAt: r.evaluatedAt
  };
}

// ---------------------------------------------------------------------------
// Finding → candidate input for the shared pipeline (decision-candidate).

export interface InitiativeFindingSignal {
  initiativeId: string;
  initiativeTitle: string;
  candidateKind: CandidateFinding["candidateKind"];
  question: Localized;
  finding: InitiativeFinding;
  basis: "confirmed" | "provisional";
  confidence: LinkConfidence;
  daysCover: number | null;
  initiativeRevenue: number | null; // window to date, the ₪ the initiative has produced
  revenueQuality: EvidenceQuality;
  domainsJoined: number;
  hasOpenDecision: boolean;
  live: boolean;
}

export function findingSignals(r: InitiativeReality, initiative: Pick<Initiative, "relatedDecisions">): InitiativeFindingSignal[] {
  if (!r.candidateFinding) return [];
  const rev = r.metrics.find((m) => m.key === "revenue");
  const revenueNumber = rev?.value ? Number(rev.value.replace(/[^\d.-]/g, "")) : null;
  const sources = new Set(r.metrics.filter((m) => m.scope === "initiative" && m.value !== null).map((m) => m.source));
  return [
    {
      initiativeId: r.initiativeId,
      initiativeTitle: r.title,
      candidateKind: r.candidateFinding.candidateKind,
      question: r.candidateFinding.question,
      finding: r.candidateFinding.finding,
      basis: r.candidateFinding.finding.basis,
      confidence: r.confidence,
      daysCover: r.candidateFinding.finding.product?.coverDays ?? null,
      initiativeRevenue: revenueNumber !== null && Number.isFinite(revenueNumber) ? revenueNumber : null,
      revenueQuality: rev?.quality ?? "unavailable",
      domainsJoined: Math.max(1, sources.size + 1), // + plan
      hasOpenDecision: initiative.relatedDecisions.some((d) => d.state === "open"),
      live: r.period.start <= r.period.today && r.period.end >= r.period.today
    }
  ];
}
