// Command Center = Executive Overview. It does NOT produce decisions; it
// points at the two sources of truth: Today (decisions) and Market (external
// context). Both summaries here are cheap ledger reads — no engines run, no
// model is called — so the overview never disagrees with Today and costs
// nothing to render.

import { getDb } from "@/lib/server/db";
import type { DecisionStatus } from "@/lib/domain/decision";

export const DECISION_SUMMARY_KEY_PREFIX = "decision_inbox_summary:";

export interface DecisionInboxSummary {
  decisions: number;
  byStatus: Record<DecisionStatus, number>;
  watching: number;
  updatedAt: string;
}

// Written by buildDecisionInbox every time Today (or the daily cron) runs, so
// the Command Center can show "3 decisions need your attention · 1 ACT" as of
// the last evaluation without re-running the engines.
export async function writeDecisionInboxSummary(storeId: string, summary: DecisionInboxSummary): Promise<void> {
  try {
    const key = `${DECISION_SUMMARY_KEY_PREFIX}${storeId}`;
    const value = JSON.stringify(summary);
    await getDb().systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  } catch {
    // best-effort
  }
}

export async function readDecisionInboxSummary(storeId: string): Promise<DecisionInboxSummary | null> {
  try {
    const row = await getDb().systemConfig.findUnique({ where: { key: `${DECISION_SUMMARY_KEY_PREFIX}${storeId}` }, select: { value: true } });
    if (!row) return null;
    const parsed = JSON.parse(row.value) as DecisionInboxSummary;
    if (typeof parsed?.decisions !== "number" || !parsed.byStatus || typeof parsed.updatedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface MarketSummary {
  monitored: number;
  // Competitor moves that opened a decision in the last 7 days (the only
  // competitor signals that matter commercially).
  relevantThisWeek: number;
  // Whether the provider has returned any snapshot yet.
  hasData: boolean;
}

export async function readMarketSummary(storeId: string): Promise<MarketSummary | null> {
  try {
    const db = getDb();
    const d7 = new Date(Date.now() - 7 * 86_400_000);
    const [monitored, relevantThisWeek, snapshots] = await Promise.all([
      db.competitor.count({ where: { storeId, status: "active" } }),
      db.alert.count({ where: { storeId, type: "competitor_promo", createdAt: { gte: d7 } } }),
      db.competitorSnapshot.count({ where: { storeId } })
    ]);
    if (monitored === 0) return null;
    return { monitored, relevantThisWeek, hasData: snapshots > 0 };
  } catch {
    return null;
  }
}
