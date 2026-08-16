// Cron tick endpoint — called by creative-sprint-cron.ts every ~10 minutes.
// Walks every running sprint and evaluates every cascade stage whose
// trigger time has passed but hasn't been evaluated yet.
//
// Idempotent: re-runs are safe because `evaluateCascadeStage` always
// targets sprintAds with `finalStatus = "alive"`. Once an ad is killed
// it stays killed; once a stage is evaluated, `sprint.currentStage`
// advances past it so we don't re-evaluate.
//
// Auth: guarded by CRON_SECRET (x-cron-secret header). The middleware
// requireCronSecret only covers /api/cron/* paths; this route lives at
// /api/creative-sprint/cron/evaluate-due/ so it must self-enforce.
// DENY-by-default: when CRON_SECRET is absent, requests are rejected (401).
// Set CRON_SECRET in all environments (including local dev) to permit calls.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import {
  DEFAULT_CASCADE,
  evaluateCascadeStage,
  type CascadeStage,
  computeStageTriggers
} from "@/lib/services/creative-sprint/sprint-cascade";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // cascade eval can take a few minutes if many ads

// Returns a 401 NextResponse when the request is unauthorized, or null when
// the caller is permitted to proceed. Mirrors the logic in middleware.ts
// requireCronSecret() but is applied here directly because the middleware
// only guards /api/cron/* and this route lives at /api/creative-sprint/cron/*.
function checkCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET?.trim();
  // DENY-by-default: absent env var is NOT a pass-through — return 401 so the
  // endpoint is never reachable without a properly configured secret, even in
  // environments where CRON_SECRET was not set (fail-closed, not fail-open).
  if (!expected) return new Response("Unauthorized", { status: 401 });
  const provided = request.headers.get("x-cron-secret")?.trim();
  if (provided && provided === expected) return null; // authorized
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const authError = checkCronSecret(request);
  if (authError) return authError;
  const db = getDb();
  // Pull sprints that are live (running or already mid-measuring).
  const sprints = await db.creativeSprint.findMany({
    where: { status: { in: ["running", "measuring"] } },
    select: { id: true, currentStage: true, publishedAt: true, cascadeJson: true }
  });

  const evaluated: Array<{ sprintId: string; stage: number; killed: number; kept: number; alive: number; error?: string }> = [];
  const now = new Date();

  for (const sprint of sprints) {
    if (!sprint.publishedAt) continue;
    const cascade = (sprint.cascadeJson as unknown as CascadeStage[]) ?? DEFAULT_CASCADE;
    const triggers = computeStageTriggers(sprint.publishedAt, cascade);

    for (const trig of triggers) {
      if (trig.stage <= sprint.currentStage) continue; // already evaluated
      if (trig.firesAt > now) continue; // not yet due
      try {
        const result = await evaluateCascadeStage(sprint.id, trig.stage);
        evaluated.push({
          sprintId: sprint.id,
          stage: trig.stage,
          killed: result.killedCount,
          kept: result.keptCount,
          alive: result.aliveCount
        });
      } catch (err) {
        evaluated.push({
          sprintId: sprint.id,
          stage: trig.stage,
          killed: 0,
          kept: 0,
          alive: 0,
          error: err instanceof Error ? err.message : String(err)
        });
        // Don't break — try the next sprint.
      }
    }
  }

  return NextResponse.json({ ok: true, evaluated });
}
