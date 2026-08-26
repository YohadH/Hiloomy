import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import {
  isCreativeAgentChatConfigured,
  runCreativeAgentTurn,
  type CreativeChatHistoryEntry
} from "@/lib/services/creative-agent-chat-service";

// POST /api/chat/creative — one turn with the Creative agent, from the
// panel on the /creative pages. Same streaming protocol as /api/chat/bi:
// text/plain prose with U+001E-delimited control frames. Two frame kinds:
//   {t:"tool", name}   — tool progress (same as BI)
//   {t:"wizard", apply} — the agent filled the wizard; the panel forwards
//                         this to the new-project wizard (live event +
//                         sessionStorage carry-over).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_HISTORY_ENTRIES = 8;
const MAX_HISTORY_CHARS = 1_500;

function sanitizeHistory(raw: unknown): CreativeChatHistoryEntry[] {
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
    message?: string;
    history?: unknown;
    section?: unknown;
  };
  const message = (body.message ?? "").trim().slice(0, 4000);
  const section =
    typeof body.section === "string" && /^\/[\w\-/]{0,80}$/.test(body.section)
      ? body.section
      : null;
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  if (!isCreativeAgentChatConfigured() || !auth.storeId) {
    return NextResponse.json({ ok: false, error: "creative_chat_unconfigured" }, { status: 503 });
  }

  const storeId = auth.storeId;
  const locale = auth.locale;
  const history = sanitizeHistory(body.history);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runCreativeAgentTurn({
          storeId,
          locale,
          message,
          history,
          section,
          onTextDelta: (delta) => controller.enqueue(encoder.encode(delta)),
          // U+001E-delimited control frames — see splitControlFrames in the
          // panel for the client side. The delimiters are literal U+001E bytes
          // (invisible in most editors), same as the BI route.
          onToolStart: (toolName) =>
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ t: "tool", name: toolName })}`)
            ),
          onWizardApply: (wizard) =>
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ t: "wizard", apply: wizard })}`)
            )
        });
        if (!result.text) {
          controller.enqueue(
            encoder.encode(
              locale === "he"
                ? "לא הצלחתי לגבש תשובה הפעם — נסו לנסח מחדש."
                : "I couldn't form an answer this time — try rephrasing."
            )
          );
        }
      } catch (err) {
        console.error("[chat/creative] turn failed:", err);
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
      "X-Accel-Buffering": "no"
    }
  });
}
