// List + create sprints scoped to the active store.
import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { createSprint, listSprints, type SprintApprovalMode } from "@/lib/services/creative-sprint/sprint-service";
import type { CascadeStage } from "@/lib/services/creative-sprint/sprint-cascade";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) return NextResponse.json({ ok: true, sprints: [] });
    const sprints = await listSprints(storeId);
    return NextResponse.json({ ok: true, sprints });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("Connect a store before creating sprints.", 400);
    const body = (await request.json()) as {
      name?: string;
      productId?: string | null;
      targetCount?: number;
      dailyBudgetPerAd?: number;
      currency?: string;
      approvalMode?: SprintApprovalMode;
      cascade?: CascadeStage[];
      notes?: string | null;
    };
    if (!body.name?.trim()) throw new AppError("Sprint name is required.", 400);
    if (!body.dailyBudgetPerAd || body.dailyBudgetPerAd <= 0) {
      throw new AppError("dailyBudgetPerAd must be > 0.", 400);
    }
    const created = await createSprint({
      storeId,
      name: body.name.trim(),
      productId: body.productId,
      targetCount: body.targetCount,
      dailyBudgetPerAd: body.dailyBudgetPerAd,
      currency: body.currency,
      approvalMode: body.approvalMode,
      cascade: body.cascade,
      notes: body.notes
    });
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
