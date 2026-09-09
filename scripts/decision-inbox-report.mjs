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
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(r, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
