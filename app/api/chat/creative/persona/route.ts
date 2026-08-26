// GET/POST /api/chat/creative/persona — the owner's predefined persona for
// the Creative agent (brand voice, visual house rules, standing creative
// direction). Injected into the agent's system prompt on every turn; an
// empty save clears it back to the default persona alone.

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import {
  getCreativeAgentOwnerPersona,
  setCreativeAgentOwnerPersona
} from "@/lib/services/creative-agent-chat-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.userId) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    const persona = await getCreativeAgentOwnerPersona(storeId);
    return NextResponse.json({ ok: true, persona });
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
    if (!storeId) throw new AppError("No active store.", 400);
    const body = (await request.json().catch(() => ({}))) as { persona?: unknown };
    const persona = await setCreativeAgentOwnerPersona(
      storeId,
      typeof body.persona === "string" ? body.persona : ""
    );
    return NextResponse.json({ ok: true, persona });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
