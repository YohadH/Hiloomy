import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { askBiAgent, isBiAgentConfigured } from "@/lib/clients/bi-agent-client";
import {
  isDirectBiConfigured,
  runBiChatTurn,
  type BiChatHistoryEntry
} from "@/lib/services/bi-chat-service";
import { toErrorMessage } from "@/lib/server/errors";

// POST /api/chat/bi — one conversational turn with the BI analyst, from
// the floating chat widget.
//
// Two providers, checked in order:
//   1. Direct Anthropic API (ANTHROPIC_API_KEY set) — persona + store-scoped
//      tools in lib/services/bi-chat-service.ts. Streams the answer as
//      text/plain chunks; the widget renders them as they arrive.
//   2. Legacy BI gateway tunnel (BI_AGENT_URL/TOKEN) — single JSON response,
//      30-120s. Kept as fallback until the migration completes.
// The widget branches on the response Content-Type.

export const dynamic = "force-dynamic";
// Allow long agent turns (Next route segment ceiling, seconds).
export const maxDuration = 300;

const BI_CHAT_TIMEOUT_MS = 280_000;
const MAX_HISTORY_ENTRIES = 12;

function sanitizeHistory(raw: unknown): BiChatHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: string; text: string } =>
        typeof m === "object" &&
        m !== null &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "agent") &&
        typeof (m as { text?: unknown }).text === "string"
    )
    .slice(-MAX_HISTORY_ENTRIES)
    .map((m) => ({ role: m.role as "user" | "agent", text: m.text.slice(0, 4000) }));
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    history?: unknown;
    section?: unknown;
  };
  const question = (body.question ?? "").trim().slice(0, 4000);
  // App route the merchant is viewing — grounds the persona's per-section
  // rules. Constrained to a path-looking string; never trusted beyond that.
  const section =
    typeof body.section === "string" && /^\/[\w\-/]{0,80}$/.test(body.section)
      ? body.section
      : null;
  if (!question) {
    return NextResponse.json({ ok: false, error: "question is required" }, { status: 400 });
  }

  // ── Direct Anthropic path (streaming) ─────────────────────────────────
  if (isDirectBiConfigured() && auth.storeId) {
    const storeId = auth.storeId;
    const locale = auth.locale;
    const history = sanitizeHistory(body.history);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const finalText = await runBiChatTurn({
            storeId,
            locale,
            question,
            history,
            section,
            onTextDelta: (delta) => controller.enqueue(encoder.encode(delta))
          });
          if (!finalText) {
            controller.enqueue(
              encoder.encode(
                locale === "he"
                  ? "לא הצלחתי לגבש תשובה הפעם — נסו לנסח מחדש."
                  : "I couldn't form an answer this time — try rephrasing."
              )
            );
          }
        } catch (err) {
          console.error("[chat/bi] direct turn failed:", err);
          // Mid-stream failure: append an apology rather than dropping the
          // connection with no explanation.
          controller.enqueue(
            encoder.encode(
              locale === "he"
                ? "\n\n(שגיאה טכנית — נסו שוב בעוד רגע.)"
                : "\n\n(Technical error — please try again in a moment.)"
            )
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // Disable proxy buffering so deltas reach the browser immediately.
        "X-Accel-Buffering": "no"
      }
    });
  }

  // ── Legacy tunnel fallback (single JSON response) ─────────────────────
  if (!isBiAgentConfigured()) {
    return NextResponse.json({ ok: false, error: "bi_unconfigured" }, { status: 503 });
  }
  try {
    const answer = await askBiAgent(question, { timeoutMs: BI_CHAT_TIMEOUT_MS });
    return NextResponse.json({ ok: true, answer });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status: 502 });
  }
}
