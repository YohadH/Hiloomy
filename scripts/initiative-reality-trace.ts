// Acceptance trace for Initiative Reality on REAL data — one initiative,
// end to end: mapping (with the rule behind each link) → metrics (quality,
// basis, provenance) → confidence → status → finding → candidate → score
// against the last recorded run → did it reach Today, and if not, why.
//
//   $env:DATABASE_URL = "<prod pooler url>"
//   node --import tsx scripts/initiative-reality-trace.ts incenseparfums.myshopify.com "Satin"
//   node --import tsx scripts/initiative-reality-trace.ts <storeId> "Satin" --json
//
// Read-only. Prints no secrets.

import { getDb } from "@/lib/server/db";
import { buildPlanView, currentPlanSheetId } from "@/lib/services/plan-service";
import { buildInitiativeReality, loadRealityInputs } from "@/lib/services/initiative-reality-service";
import { findingSignals } from "@/lib/domain/initiative-reality";
import { scoreCandidate } from "@/lib/domain/decision-candidate";
import { readInitiativeCandidateVerdicts } from "@/lib/services/decision-candidate-audit-service";

const [, , target, needle, ...flags] = process.argv;
if (!target || !needle) {
  console.error('usage: node --import tsx scripts/initiative-reality-trace.ts <shop.myshopify.com | storeId> "<initiative name fragment>" [--json]');
  process.exit(1);
}
const asJson = flags.includes("--json");
const db = getDb() as any;
const now = new Date();

const store = (await db.store.findFirst({ where: /\.myshopify\.com$/i.test(target) ? { domain: target } : { id: target }, select: { id: true, domain: true } })) as { id: string; domain: string } | null;
if (!store) throw new Error(`no store for ${target}`);
const sheetId = await currentPlanSheetId(store.id, now);
if (!sheetId) throw new Error("no plan sheet covers today");
const plan = await buildPlanView(store.id, sheetId, now);
const n = needle.toLowerCase();
const initiative = plan.initiatives.find((i) => i.kind === "move" && (i.title.toLowerCase().includes(n) || i.text.toLowerCase().includes(n)));
if (!initiative) throw new Error(`no initiative matches "${needle}" in sheet ${sheetId}; initiatives: ${plan.initiatives.map((i) => i.title).join(" | ")}`);

const inputs = await loadRealityInputs(store.id, sheetId, now);
const reality = await buildInitiativeReality(store.id, initiative, inputs, now);
const signals = findingSignals(reality, initiative);
const verdicts = await readInitiativeCandidateVerdicts(store.id).catch(() => []);
const verdict = reality.candidateFinding ? verdicts.find((v) => v.initiativeId === initiative.id && v.kind === reality.candidateFinding!.candidateKind) ?? null : null;
const openDecisions = (await db.alert.findMany({ where: { storeId: store.id, type: "plan_decision", relatedEntityId: initiative.id }, select: { id: true, status: true, title: true, createdAt: true, payloadJson: true }, orderBy: { createdAt: "desc" }, take: 5 })) as Array<{ id: string; status: string; title: string; createdAt: Date; payloadJson: Record<string, unknown> | null }>;

// A local score preview when no run has recorded the candidate yet: the
// same scoreCandidate() the pipeline uses, so the number is comparable.
const preview = signals.map((f) => {
  const input = {
    domain: "plan" as const,
    kind: f.candidateKind,
    title: f.question,
    managementQuestion: f.question,
    trigger: f.finding.statement,
    evidenceSummary: f.finding.evidence,
    connectedDomains: ["plan"],
    financialExposure: f.initiativeRevenue,
    financialExposureType: f.initiativeRevenue === null ? null : "initiative_revenue_window",
    financialConfidence: (f.initiativeRevenue === null ? "unavailable" : f.basis === "provisional" ? "estimated" : f.revenueQuality) as "known" | "calculated" | "estimated" | "unavailable",
    proposedStatus: "change_plan",
    proposedRecommendation: null,
    missingEvidence: f.finding.missing.map((m) => m.en),
    entity: { type: "plan_initiative", id: f.initiativeId, label: f.initiativeTitle },
    inputs: { daysCover: f.daysCover, confidence: f.confidence, domainsJoined: f.domainsJoined, revenue14dStore: null },
    relatedDecisionId: null,
    surfaced: false,
    todayRank: null,
    suppressionReason: null,
    eligible: true
  };
  return { kind: f.candidateKind, ...scoreCandidate(input) };
});

const out = {
  store: store.domain,
  sheetId,
  initiative: { id: initiative.id, title: initiative.title, start: initiative.start, end: initiative.end, status: initiative.status, offer: initiative.offer, channels: initiative.channels, textExcerpt: initiative.text.slice(0, 300) },
  "1_mapping": reality.mappings.links.map((l) => ({ kind: l.kind, id: l.id, label: l.label, state: l.state, confidence: l.confidence, rule: l.provenance.rule, matchedOn: l.provenance.matchedOn, originallyAuto: l.provenance.auto, why: l.reason.en })),
  "1b_mapping_by_kind": reality.mappings.byKind,
  "3_metrics": reality.metrics.map((m) => ({ key: m.key, scope: m.scope, value: m.value, quality: m.quality, basis: m.basis, note: m.note?.en ?? null, provenance: m.provenance })),
  "4_estimated_metrics": reality.metrics.filter((m) => m.quality === "estimated").map((m) => m.key),
  "5_confidence": { level: reality.confidence, reason: reality.confidenceReason.en, evidenceBasis: reality.evidenceBasis, freshness: reality.freshness, stale: reality.stale },
  "6_status": { status: reality.status, reason: reality.statusReason.en, goalDefined: reality.goal.defined, lines: reality.lines.map((l) => `${l.label.en}: ${l.state} — ${l.text.en}`) },
  "7_findings": reality.findings.map((f) => ({ kind: f.kind, severity: f.severity, basis: f.basis, statement: f.statement.en, evidence: f.evidence, missing: f.missing.map((x) => x.en), consumption: f.consumption ?? null })),
  "8_candidate": reality.candidateFinding ? { candidateKind: reality.candidateFinding.candidateKind, question: reality.candidateFinding.question.en, signal: signals[0] } : null,
  "9_candidate_score": verdict ? { source: `recorded run ${verdict.runId} at ${verdict.runAt}`, globalScore: verdict.globalScore, rank: verdict.rank } : preview.length ? { source: "local preview with the pipeline's scoreCandidate (no recorded run has this candidate yet)", ...preview[0] } : null,
  "10_reached_today": verdict ? { surfacedByPipeline: verdict.surfaced, suppressionReason: verdict.suppressionReason, openDecisionForInitiative: openDecisions.filter((d) => d.status === "open").map((d) => ({ id: d.id, title: d.title, realityTriggered: d.payloadJson?.realityTriggered === true })) } : { surfacedByPipeline: null, note: "no recorded candidate run contains this candidate yet — open Today (or wait for the cron) so the audit records it, then run this trace again", openDecisionForInitiative: openDecisions.filter((d) => d.status === "open").map((d) => ({ id: d.id, title: d.title })) },
  "11_why_not": verdict && !verdict.surfaced ? { suppressionReason: verdict.suppressionReason, rank: verdict.rank, threshold: "shadow top 5 across all domains" } : null,
  missingEvidence: reality.missingEvidence.map((m) => m.label.en),
  recentPlanDecisions: openDecisions.map((d) => ({ id: d.id, status: d.status, title: d.title, createdAt: d.createdAt.toISOString() }))
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  const p = (k: string, v: unknown) => console.log(`\n## ${k}\n${typeof v === "string" ? v : JSON.stringify(v, null, 2)}`);
  for (const [k, v] of Object.entries(out)) p(k, v);
}
await db.$disconnect?.();
