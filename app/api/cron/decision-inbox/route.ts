import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { buildDecisionInbox } from "@/lib/services/decision-inbox-service";

// Daily Decision Inbox pass. For every store that has completed a Shopify
// sync, runs the same evaluation Today runs on load: refreshes the engines,
// builds the decisions, advances the ledger state and appends today's
// evidence snapshot. Without this cron, decisions are only created when
// somebody opens the app — which makes a 14-day wedge test meaningless on
// the days nobody looks.
//
// Idempotent: engines upsert by fingerprint, the ledger advances the SAME
// row, snapshots dedupe per day. Per-store failures are logged, not fatal.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const db = getDb();
  const connections = (await db.shopifyConnection.findMany({
    where: { lastSyncAt: { not: null } },
    select: { storeId: true }
  })) as Array<{ storeId: string }>;

  const results: Array<{ storeId: string; decisions: number; watching: number; reviewed: number }> = [];
  const errors: Array<{ storeId: string; error: string }> = [];
  for (const { storeId } of connections) {
    try {
      const inbox = await buildDecisionInbox(storeId);
      results.push({ storeId, decisions: inbox.stats.decisions, watching: inbox.stats.watching, reviewed: inbox.stats.reviewed });
    } catch (e) {
      errors.push({ storeId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: errors.length === 0, stores: connections.length, results, errors });
}
