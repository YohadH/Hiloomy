import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import {
  isDirectBiConfigured,
  runBiChatTurn,
  type BiChatHistoryEntry
} from "@/lib/services/bi-chat-service";

// POST /api/chat/bi — one conversational turn with the BI analyst, from
// the floating chat widget.
//
// Answered by a direct LLM API call with store-scoped tools — OpenAI by
// default, Anthropic when BI_CHAT_PROVIDER says so. See
// lib/services/bi-chat-service.ts.
//
// The Cloudflare-tunnel BI gateway is NO LONGER in this path. It was a
// dev-grade hop (ephemeral tunnel URL, shared bearer, single point of
// failure) and had no business fronting customer traffic. With no provider
// key configured this returns 503 rather than silently degrading to it.
//
// Always streams text/plain so the widget renders the answer as it forms.

export const dynamic = "force-dynamic";
// Allow long agent turns (Next route segment ceiling, seconds).
export const maxDuration = 300;

// History is resent in full on every turn, so it is pure recurring cost.
// 12 turns x 4,000 chars was ~13,000 tokens of mostly stale context; 6 x
// 1,500 keeps follow-ups coherent ("and the month before?") for ~1,200.
const MAX_HISTORY_ENTRIES = 6;
const MAX_HISTORY_CHARS = 1_500;

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
    .map((m) => ({ role: m.role as "user" | "agent", text: m.text.slice(0, MAX_HISTORY_CHARS) }));
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

  if (!isDirectBiConfigured() || !auth.storeId) {
    return NextResponse.json({ ok: false, error: "bi_unconfigured" }, { status: 503 });
  }

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
            onTextDelta: (delta) => controller.enqueue(encoder.encode(delta)),
            // Tool-progress frames ride the same text/plain stream, wrapped
            // in U+001E (RECORD SEPARATOR). A control character the model
            // will never emit in prose means the widget can split them out
            // without a second connection or a protocol change — and any
            // client that doesn't know about them still renders a readable
            // answer, just without the step list.
            onToolStart: (toolName) =>
              // Frames are delimited by U+001E (RECORD SEPARATOR) on both
              // sides. It is a literal control byte in the template below.
              controller.enqueue(
                encoder.encode(`${JSON.stringify({ t: "tool", name: toolName })}`)
              )
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
