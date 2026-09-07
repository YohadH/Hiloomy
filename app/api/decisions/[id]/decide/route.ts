import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { recordHumanDecision, type HumanChoiceInput } from "@/lib/services/decision-inbox-service";

// POST /api/decisions/[id]/decide
// Body: { choice: "approve" | "alternative" | "ignore", optionKey?: string }
//
// Records the manager's decision on a Decision Object. The decision is a row
// in the Alert ledger; the choice becomes the row's status plus a
// payloadJson.humanDecision record, which is what Decision Memory reads back.
// Multi-tenant safe: the row must belong to the caller's active store.

export const dynamic = "force-dynamic";

const CHOICES = new Set<HumanChoiceInput>(["approve", "alternative", "ignore"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { choice?: string; optionKey?: string };
    const choice = body.choice as HumanChoiceInput | undefined;
    if (!choice || !CHOICES.has(choice)) {
      throw new AppError(`choice must be one of: ${Array.from(CHOICES).join(", ")}`, 400);
    }
    if (choice === "alternative" && !body.optionKey) {
      throw new AppError("optionKey is required when choosing another option.", 400);
    }
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const result = await recordHumanDecision({
      storeId,
      id,
      choice,
      optionKey: body.optionKey,
      by: auth.email ?? auth.userId
    });
    if (!result.ok) throw new AppError("Decision not found.", 404);
    return NextResponse.json({ ok: true, id, choice });
  } catch (error) {
    const code = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: code });
  }
}
