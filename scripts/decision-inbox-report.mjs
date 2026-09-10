// Decision Inbox wedge report — the table for the 14-day review.
//
// Read-only. Prints, for one store and window:
//   decisions generated · surfaced on Today · cross-domain · by kind ·
//   by status · ledger state · judgments (useful / obvious / wrong /
//   missing context) · "changed my decision" · human choices · outcomes
// plus one row per decision.
//
// Runs where the data lives (DATABASE_URL), like the other scripts:
//   node --import tsx scripts/decision-inbox-report.mjs <storeId> [--days 14] [--json out.json]

import fs from "node:fs";
import { buildDecisionReport } from "../lib/services/decision-inbox-service";
import { buildCandidateAuditReport } from "../lib/services/decision-candidate-audit-service";

const args = process.argv.slice(2);
const storeId = args.find((a) => !a.startsWith("--"));
if (!storeId) {
  console.error("usage: node --import tsx scripts/decision-inbox-report.mjs <storeId> [--days 14] [--json out.json]");
  process.exit(1);
}
const daysIdx = args.indexOf("--days");
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) || 14 : 14;
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

const DOMAIN_OF_KIND = {
  stockout_imminent: "Inventory × Sales × Meta",
  commission_leakage: "Affiliate × Customer history",
  decision_standalone_loss: "Product × Discount × Profit",
  decision_discount_tradeoff: "Discount × Profit",
  campaign_reallocation: "Campaign × Product × Inventory",
  competitor_promo: "Market × Sales × Margin",
  roas_collapse: "Meta × Profit"
};

const r = await buildDecisionReport(storeId, days);
const line = (label, value) => console.log(`${String(label).padEnd(28)} ${value}`);

console.log(`\nDecision Inbox — ${storeId} — last ${days} days (${r.since.slice(0, 10)} → ${r.until.slice(0, 10)})\n`);
line("decisions generated", r.generated);
line("surfaced on Today", r.surfaced);
line("cross-domain (≥2 sources)", r.crossDomain);
console.log("");
for (const [kind, n] of Object.entries(r.byKind).sort((a, b) => b[1] - a[1])) line(`  ${kind}`, `${n}   ${DOMAIN_OF_KIND[kind] ?? ""}`);
console.log("");
line("ACT / CHANGE PLAN / TEST", `${r.byStatus.act} / ${r.byStatus.change_plan} / ${r.byStatus.test}`);
line("WATCH / DO NOT ACT", `${r.byStatus.watch} / ${r.byStatus.do_not_act}`);
line("state open/watch/escal/res", `${r.byState.open} / ${r.byState.watching} / ${r.byState.escalated} / ${r.byState.resolved}`);
console.log("");
line("judged", r.judged);
line("  useful", r.judgments.useful);
line("  obvious", r.judgments.obvious);
line("  wrong", r.judgments.wrong);
line("  missing context", r.judgments.missing_context);
line("changed management decision", r.changedDecision);
console.log("");
line("approved / alt / ignored", `${r.human.approved} / ${r.human.alternative} / ${r.human.ignored}`);
line("pending / auto-closed / expired", `${r.human.pending} / ${r.human.auto_closed} / ${r.human.expired ?? 0}`);
line("outcomes win/neutral/miss", `${r.outcomes.win} / ${r.outcomes.neutral} / ${r.outcomes.miss} (no data: ${r.outcomes.no_data})`);

console.log("\nrows:");
for (const row of r.rows) {
  console.log(
    `  ${row.id.slice(-5).toUpperCase()}  ${row.detectedAt.slice(0, 10)}  ${row.status.padEnd(11)} ${row.state.padEnd(9)} ${row.kind.padEnd(27)} ${row.domains.join("+").padEnd(30)} ${row.surfacedAt ? "shown " : "hidden"}  ${row.human.padEnd(11)} ${row.judgment.join(",") || "-"}${row.changedDecision === true ? "  CHANGED" : ""}  ${row.title}`
  );
}
// ── Candidate audit (shadow ranking) — the second half of the 14-day review.
const excludeIdx = args.indexOf("--exclude");
const exclude = excludeIdx >= 0 ? String(args[excludeIdx + 1] ?? "").split(",").filter(Boolean) : [];
const a = await buildCandidateAuditReport(storeId, days, exclude);
console.log(`\nCandidate audit — ${a.runs} runs (${a.runsWithClustering} clustered) · ranking ${a.rankingVersions.join(", ") || "-"} · clustering ${a.clusteringVersions.join(", ") || "-"}`);
line("Today #1 ≠ unclustered #1", a.disagreement.topDiffersRate === null ? "-" : `${a.disagreement.topDiffersRate}% of runs`);
line("Today #1 ≠ clustered #1", a.disagreement.clusteredTopDiffersRate === null ? "-" : `${a.disagreement.clusteredTopDiffersRate}% of runs`);
line("clustering changed #1 / top-3", `${a.clusteringDisagreement.changedTopRate ?? "-"}% / ${a.clusteringDisagreement.changedTop3Rate ?? "-"}%`);
line("inventory replaced in top-3", a.clusteringDisagreement.avgInventoryReplacedInTop3 ?? "-");
line("attention compression", `${a.compression.rawSignals} raw signals → ${a.compression.managementCandidates} management candidates${a.compression.ratio !== null ? ` (×${a.compression.ratio})` : ""}`);
line("decision density", a.decisionDensity === null ? "-" : `${a.decisionDensity} candidates per eligible domain`);
console.log("");
console.log("domain               raw  cand  compress  top3%(clustered)  shadow  today  useful obvious");
for (const d of a.domains) {
  console.log(`${d.domain.padEnd(20)} ${String(d.rawSignals).padStart(4)} ${String(d.managementCandidates).padStart(5)}  ${String(d.compression !== null ? `×${d.compression}` : "-").padStart(8)}  ${String(d.clusteredTop3Share).padStart(16)}  ${String(d.shadowSurfaced).padStart(6)}  ${String(d.distinctSurfaced).padStart(5)}  ${String(d.feedback.judged ? d.feedback.useful : "-").padStart(6)} ${String(d.feedback.judged ? d.feedback.obvious : "-").padStart(7)}`);
}
console.log("");
console.log("domain               cand  surf  conv%  avgScore  obsScore  avgRank  novelty  top3%  xdom%  judged useful obvious wrong changed highValue  top suppression");
for (const d of a.domains) {
  const f = d.feedback;
  console.log(
    `${d.domain.padEnd(20)} ${String(d.candidates).padStart(4)}  ${String(d.distinctSurfaced).padStart(4)}  ${String(d.conversion ?? "-").padStart(5)}  ${String(d.avgScore ?? "-").padStart(8)}  ${String(d.avgObservableScore ?? "-").padStart(8)}  ${String(d.avgRank ?? "-").padStart(7)}  ${String(d.avgNovelty ?? "-").padStart(7)}  ${String(d.top3Share).padStart(5)}  ${String(d.crossDomainRate ?? "-").padStart(5)}  ${String(f.judged).padStart(6)} ${String(f.useful).padStart(6)} ${String(f.obvious).padStart(7)} ${String(f.wrong).padStart(5)} ${String(f.changed).padStart(7)} ${String(f.highValue).padStart(9)}  ${d.topSuppression.map((t) => `${t.reason}×${t.n}`).join(", ")}`
  );
}
console.log("");
line("top suppression reasons", a.topSuppression.map((t) => `${t.reason}×${t.n}`).join(", ") || "-");
const inv = a.inventory;
console.log("\nInventory bias diagnostic");
line("  % of raw signals", `${inv.signalShare}%`);
line("  % of management candidates", `${inv.candidateShare}%`);
line("  % of clustered top-3", `${inv.top3Share}%`);
line("  % of surfaced", `${inv.surfacedShare}%`);
line("  obvious rate", inv.obviousRate === null ? "-" : `${inv.obviousRate}%`);
line("  useful rate", inv.usefulRate === null ? "-" : `${inv.usefulRate}%`);
line("  others eligible→none", `${inv.otherDomainsEligibleButNone} / ${inv.otherDomainsEligibleRuns}`);
line("  classification", `${inv.classification}${inv.findings.length > 1 ? ` [${inv.findings.join(", ")}]` : ""} — ${inv.because}`);
if (a.latest) {
  console.log(`\nlatest run ${a.latest.runAt.slice(0, 16)} (${a.latest.trigger})${a.latest.clustered ? "" : " — recorded before clustering existed"}:`);
  if (a.latest.narrative) console.log(`\n  ${a.latest.narrative.en}`);
  if (a.latest.clustered) {
    console.log("\n  management candidates (clustered ranking):");
    console.log("  rank  domain               kind                              members  score  mat urg conf act mgmt nov xdom  shadow  title");
    for (const c of a.latest.candidates) {
      const s = c.scores;
      console.log(`  ${String(c.rank ?? "-").padStart(4)}  ${c.domain.padEnd(20)} ${c.kind.padEnd(33)} ${String(c.memberCount).padStart(7)}  ${String(c.globalScore).padStart(5)}  ${String(s.materiality).padStart(3)} ${String(s.urgency).padStart(3)} ${String(s.confidence).padStart(4)} ${String(s.actionability).padStart(3)} ${String(s.managementJudgment).padStart(4)} ${String(s.novelty).padStart(3)} ${String(s.crossDomain).padStart(4)}  ${c.surfaced ? "YES   " : "no    "}  ${c.title.en}`);
      if (c.cluster && c.memberCount > 1) {
        console.log(`        lead: ${c.cluster.lead.title}${c.cluster.lead.daysCover !== null ? ` · ${c.cluster.lead.daysCover.toFixed(1)}d` : ""}${c.cluster.lead.revenue14 !== null ? ` · ₪${Math.round(c.cluster.lead.revenue14)}` : ""}`);
        for (const m of c.cluster.members.filter((m) => m.signalId !== c.cluster.lead.signalId)) console.log(`        also: ${m.title}${m.daysCover !== null ? ` · ${m.daysCover.toFixed(1)}d` : ""}${m.revenue14 !== null ? ` · ₪${Math.round(m.revenue14)}` : ""}${m.surfacedOnToday ? " · shown on Today" : ""}`);
        console.log(`        why grouped: ${c.cluster.reasons.en.join("; ")}`);
        console.log(`        ${c.evidenceSummary.join(" · ")}`);
      }
    }
    console.log("\n  raw signals (unclustered ranking):");
  }
  console.log("rank  domain               kind                        score  mat urg conf act mgmt nov xdom  today  shown  reason");
  for (const c of a.latest.rows) {
    const s = c.scores;
    console.log(
      `${String(c.rank ?? "-").padStart(4)}  ${c.domain.padEnd(20)} ${c.kind.padEnd(27)} ${String(c.globalScore).padStart(5)}  ${String(s.materiality).padStart(3)} ${String(s.urgency).padStart(3)} ${String(s.confidence).padStart(4)} ${String(s.actionability).padStart(3)} ${String(s.managementJudgment).padStart(4)} ${String(s.novelty).padStart(3)} ${String(s.crossDomain).padStart(4)}  ${String(c.todayRank ?? "-").padStart(5)}  ${c.surfaced ? "YES  " : "no   "}  ${c.suppressionReason ?? ""}  ${c.title.en}`
    );
  }
  for (const x of a.latest.explanations) {
    console.log(`\n  why surfaced — ${x.title}: ${x.strengths.join("; ")}`);
    for (const o of x.outranked) console.log(`    outranked ${o.domain} "${o.title}" — ${o.because} (gap ${o.gap})`);
  }
  if (a.latest.ablation) {
    console.log(`\n  without ${a.latest.ablation.exclude.join(", ")}:`);
    for (const r of a.latest.ablation.rows) console.log(`    ${r.rank}. ${r.domain} — ${r.score}  ${r.title}`);
  }
}
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ decisions: r, candidates: a }, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
