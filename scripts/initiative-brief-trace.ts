// Acceptance trace for the FULL initiative brief on real data — the layer
// the Initiative Detail page renders: reality → funnel diagnosis →
// decision space → recommendation (campaign lane vs initiative lane,
// performance vs profit confidence).
//
//   $env:DATABASE_URL = "<prod pooler url>"
//   node --import tsx scripts/initiative-brief-trace.ts <shop.myshopify.com | storeId> "<name fragment>" [--json]
//
// Read-only (the brief path performs no writes). Prints no secrets.

import { getDb } from "@/lib/server/db";
import { buildPlanView, currentPlanSheetId } from "@/lib/services/plan-service";
import { buildInitiativeBrief, loadRealityInputs } from "@/lib/services/initiative-reality-service";

const [, , target, needle, ...flags] = process.argv;
if (!target || !needle) {
  console.error('usage: node --import tsx scripts/initiative-brief-trace.ts <shop.myshopify.com | storeId> "<initiative name fragment>" [--json]');
  process.exit(1);
}
const asJson = flags.includes("--json");
const db = getDb() as any;
const now = new Date();

async function main() {
const store = (await db.store.findFirst({ where: /\.myshopify\.com$/i.test(target) ? { domain: target } : { id: target }, select: { id: true, domain: true } })) as { id: string; domain: string } | null;
if (!store) throw new Error(`no store for ${target}`);
const sheetId = await currentPlanSheetId(store.id, now);
if (!sheetId) throw new Error("no plan sheet covers today");
const plan = await buildPlanView(store.id, sheetId, now);
const n = needle.toLowerCase();
const initiative = plan.initiatives.find((i) => i.kind === "move" && (i.title.toLowerCase().includes(n) || i.text.toLowerCase().includes(n)));
if (!initiative) throw new Error(`no initiative matches "${needle}" in sheet ${sheetId}; initiatives: ${plan.initiatives.map((i) => i.title).join(" | ")}`);

const inputs = await loadRealityInputs(store.id, sheetId, now);
const brief = await buildInitiativeBrief(store.id, initiative, inputs, now, null);
const d = brief.diagnosis;
const f = d?.funnel ?? null;
const rec = brief.recommendation;

const out = {
  store: store.domain,
  initiative: { id: initiative.id, title: initiative.title, start: initiative.start, end: initiative.end },
  status: { reality: brief.reality.status, reason: brief.reality.statusReason.en, reason_he: brief.reality.statusReason.he },
  // "Hiloomy checked the initiative" — what the resolution layer found before asking anything (§0h).
  checked: {
    launch: { phase: brief.reality.context.launch.phase, severity: brief.reality.context.launch.severity, insight: brief.reality.context.launch.insight?.en ?? null, insight_he: brief.reality.context.launch.insight?.he ?? null },
    checks: brief.reality.context.launch.checks.map((c) => ({ kind: c.kind, state: c.state, line: c.line.en })),
    question: brief.reality.context.question ? { kind: brief.reality.context.question.kind, options: brief.reality.context.question.options.map((o) => `${o.label} — ${o.reason.en}`) } : null,
    campaigns: brief.reality.mappings.campaignResolution
      ? {
          total: brief.reality.mappings.campaignResolution.total,
          considered: brief.reality.mappings.campaignResolution.considered,
          likely: brief.reality.mappings.campaignResolution.likely ? `${Math.round(brief.reality.mappings.campaignResolution.likely.score * 100)}% ${brief.reality.mappings.campaignResolution.likely.name}` : null,
          alternatives: brief.reality.mappings.campaignResolution.alternatives.map((a) => `${Math.round(a.score * 100)}% ${a.name}`),
          rejected: brief.reality.mappings.campaignResolution.rejected.map((r) => `${r.name} — ${r.reason.en}`)
        }
      : null,
    usedLinks: brief.reality.mappings.links.filter((l) => l.state !== "suggested").map((l) => `${l.kind}/${l.state} ${l.label} (${l.provenance.rule})`),
    suggested: brief.reality.mappings.links.filter((l) => l.state === "suggested").map((l) => `${l.kind} ${l.label} — ${l.reason.en}`)
  },
  funnel: f
    ? {
        stages: f.stages.map((s) => ({ stage: s.label.en, value: s.value, source: s.source, rate: s.rate !== null ? `${(s.rate * 100).toFixed(1)}%` : null, baseline: s.benchmarkRate !== null ? `${(s.benchmarkRate * 100).toFixed(1)}%` : null, materiallyBelow: s.materiallyBelow })),
        purchaseDemand: f.purchaseDemand,
        verdict: f.verdict,
        breakStage: f.breakStage,
        exposure: { sufficient: f.exposure.sufficient, expectedPurchases: f.exposure.expectedPurchases, basis: f.exposure.basisNote.en },
        headline: f.headline.en,
        headline_he: f.headline.he,
        detail: f.detail.en,
        mismatchReasons: f.mismatchReasons.map((r) => r.en)
      }
    : null,
  diagnosis: d ? { demand: `${d.demand.state} — ${d.demand.evidence.en}`, scope: d.scope, headline: d.headline.en, headline_he: d.headline.he } : null,
  recommendation: rec
    ? {
        answer: rec.answer,
        what: rec.what.en,
        what_he: rec.what.he,
        primaryAction: rec.primary?.type ?? null,
        paidCampaign: rec.paidCampaign ? `${rec.paidCampaign.verdict}: ${rec.paidCampaign.line.en}` : null,
        initiativeLine: rec.initiativeLine?.en ?? null,
        performanceConfidence: `${rec.performanceConfidence} — ${rec.performanceReason.en}`,
        profitConfidence: `${rec.profitConfidence} — ${rec.profitReason.en}`,
        alternatives: rec.alternatives.slice(0, 3).map((a) => a.option.type)
      }
    : null
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else for (const [k, v] of Object.entries(out)) console.log(`\n## ${k}\n${typeof v === "string" ? v : JSON.stringify(v, null, 2)}`);
await db.$disconnect?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
