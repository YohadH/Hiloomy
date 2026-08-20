import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { ensureAffiliateProgramSeed } from "@/lib/services/affiliate-portal-admin-service";
import {
  applyReturningCommissionPolicy,
  classifyUnclassifiedAttributions,
  upsertCommissionLeakageAlert,
  type ReturningCustomerPolicy
} from "@/lib/services/affiliate-leakage-service";

// POST /api/affiliate-portal/programs/policy
// Body: {
//   storeId: string,
//   policy: "full" | "reduced" | "zero",
//   returningRatePct?: number,        // required when policy = "reduced" (0–100)
//   reactivationWindowDays?: number | null  // optional win-back carve-out
// }
//
// Saves the returning-customer commission policy on the store's program
// (the first/default one — same row the programs page shows), then
// immediately reprices unpaid returning-customer conversions and
// re-evaluates the monthly leakage alert so the merchant sees the effect
// without waiting for the next cron tick.

export const dynamic = "force-dynamic";

const POLICIES: ReturningCustomerPolicy[] = ["full", "reduced", "zero"];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    if (!storeId) throw new AppError("Store id is required.", 400);
    await assertStoreInActiveOrg(storeId);

    const policy = body.policy as ReturningCustomerPolicy;
    if (!POLICIES.includes(policy)) {
      throw new AppError("Policy must be one of: full, reduced, zero.", 400);
    }

    let returningRate: number | null = null;
    if (policy === "reduced") {
      const pct = Number(body.returningRatePct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new AppError("Returning-customer rate must be between 0 and 100 percent.", 400);
      }
      returningRate = Math.round(pct * 100) / 10000; // pct → 0..1 fraction, 4dp
    }

    let reactivationWindowDays: number | null = null;
    if (body.reactivationWindowDays != null && body.reactivationWindowDays !== "") {
      const days = Number(body.reactivationWindowDays);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        throw new AppError("Reactivation window must be a whole number of days (1–3650).", 400);
      }
      reactivationWindowDays = days;
    }

    const db = getDb();
    if (!db?.affiliateProgram) throw new AppError("Database client is not available.", 500);

    // The portal UI presents ONE program concept, but imports (BixGrow)
    // can leave several program rows with members split across them —
    // so the policy is written to EVERY program of the store. Seed the
    // default program first if none exists yet.
    let program = await db.affiliateProgram.findFirst({
      where: { storeId },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (!program) {
      await ensureAffiliateProgramSeed(storeId);
      program = await db.affiliateProgram.findFirst({
        where: { storeId },
        orderBy: { createdAt: "asc" },
        select: { id: true }
      });
    }
    if (!program) throw new AppError("No affiliate program exists for this store.", 404);

    await db.affiliateProgram.updateMany({
      where: { storeId },
      data: {
        returningCustomerPolicy: policy,
        returningCommissionRate: returningRate,
        reactivationWindowDays
      }
    });

    // Apply immediately: classify any fresh rows, reprice unpaid returning
    // conversions under the new policy, refresh the monthly alert state.
    await classifyUnclassifiedAttributions(storeId).catch(() => 0);
    const repriceResult = await applyReturningCommissionPolicy(storeId);
    await upsertCommissionLeakageAlert(storeId).catch(() => null);

    return NextResponse.json({
      ok: true,
      programId: program.id,
      policy,
      returningRatePct: returningRate != null ? Math.round(returningRate * 10000) / 100 : null,
      reactivationWindowDays,
      repriced: repriceResult.repriced
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
