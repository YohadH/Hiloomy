import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { askBiAgent, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";
import { toErrorMessage } from "@/lib/server/errors";

// POST /api/chat/bi — one conversational turn with the BI agent, from the
// floating chat widget. The gateway runs a full agent turn, so answers can
// take 30-120s; the widget shows a typing indicator meanwhile.

export const dynamic = "force-dynamic";
// Allow long agent turns (Next route segment ceiling, seconds).
export const maxDuration = 300;

const BI_CHAT_TIMEOUT_MS = 280_000;

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!isBiAgentConfigured()) {
    return NextResponse.json(
      { ok: false, error: "bi_unconfigured" },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { question?: string };
    const question = (body.question ?? "").trim().slice(0, 4000);
    if (!question) {
      return NextResponse.json({ ok: false, error: "question is required" }, { status: 400 });
    }
    const answer = await askBiAgent(question, { timeoutMs: BI_CHAT_TIMEOUT_MS });
    return NextResponse.json({ ok: true, answer });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}
