import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { recordJudgment } from "@/lib/services/decision-inbox-service";
import type { JudgmentTag } from "@/lib/domain/decision";

// POST /api/decisions/[id]/judge
// Body: { tags: ("useful"|"obvious"|"wrong"|"missing_context")[], changedDecision: boolean | null }
//
// The manager's judgment of the decision itself — the wedge measurement.
// Independent of approve/ignore: a decision can be approved AND obvious.

export const dynamic = "force-dynamic";

const TAGS = new Set<JudgmentTag>(["useful", "obvious", "wrong", "missing_context"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { tags?: unknown; changedDecision?: unknown };
    const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is JudgmentTag => typeof t === "string" && TAGS.has(t as JudgmentTag)) : [];
    const changedDecision = typeof body.changedDecision === "boolean" ? body.changedDecision : null;
    if (tags.length === 0 && changedDecision === null) throw new AppError("Nothing to record.", 400);
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const result = await recordJudgment({ storeId, id, tags, changedDecision, by: auth.email ?? auth.userId });
    if (!result.ok) throw new AppError("Decision not found.", 404);
    return NextResponse.json({ ok: true, id, tags, changedDecision });
  } catch (error) {
    const code = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: code });
  }
}
