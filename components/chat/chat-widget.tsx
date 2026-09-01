"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Bot, LifeBuoy, MessageCircle, Send, X, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Floating chat widget (Intercom-style, RTL-first).
//
// UX: a round launcher in the bottom corner. Tap → a speed-dial opens with
// two clearly separated destinations:
//   🤖 אנליסט הBI — a live conversation with the BI agent (long turns, so a
//      patient typing indicator with an honest "עד 2 דקות" expectation).
//   🛟 שירות לקוחות — messages stored in the support inbox + answered over
//      email ("עונים בדרך כלל תוך כמה שעות").
// Each chat keeps its own thread, persisted to localStorage so navigation
// between pages doesn't lose the conversation.

type ChatKind = "bi" | "support";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  at: number;
}

const STORAGE_PREFIX = "gg-chat-";
const MAX_STORED = 60;

function loadThread(kind: ChatKind): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + kind);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_STORED) : [];
  } catch {
    return [];
  }
}

function saveThread(kind: ChatKind, messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + kind, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // storage full/blocked — thread just won't persist
  }
}

export function ChatWidget({ locale = "he" }: { locale?: "he" | "en" }) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const [open, setOpen] = useState(false); // speed-dial open
  const [active, setActive] = useState<ChatKind | null>(null); // chat panel
  const [threads, setThreads] = useState<Record<ChatKind, ChatMessage[]>>({ bi: [], support: [] });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Live text of an in-flight streamed BI answer (null = not streaming).
  const [streaming, setStreaming] = useState<string | null>(null);
  // Tool names, in call order, for the live progress list.
  const [steps, setSteps] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThreads({ bi: loadThread("bi"), support: loadThread("support") });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active, threads, busy, streaming]);

  const CHATS: Record<
    ChatKind,
    { title: string; hint: string; icon: typeof Bot; intro: string; accent: string }
  > = {
    bi: {
      title: lang("הילומה", "Hiloma"),
      hint: lang("האנליסטית שלכם — מכירות, קמפיינים ומתחרים", "Your analyst — sales, campaigns, competitors"),
      icon: Bot,
      intro: lang(
        "היי! אני הילומה, האנליסטית של החנות. שאלו אותי כל דבר על המכירות, הקמפיינים או המתחרים — למשל: ״מה היה השבוע הכי חזק החודש?״ תשובה יכולה לקחת עד שתי דקות.",
        "Hi! I'm Hiloma, the store's analyst. Ask me anything about sales, campaigns or competitors. Answers can take up to two minutes."
      ),
      accent: "bg-emerald-600"
    },
    support: {
      title: lang("שירות לקוחות", "Customer support"),
      hint: lang("עונים בדרך כלל תוך כמה שעות", "We usually reply within a few hours"),
      icon: LifeBuoy,
      intro: lang(
        "ספרו לנו במה נוכל לעזור. ההודעה נשמרת אצלנו ונחזור אליכם למייל — בדרך כלל תוך כמה שעות.",
        "Tell us how we can help. We'll get back to you by email, usually within a few hours."
      ),
      accent: "bg-emerald-600"
    }
  };

  const pushMessage = (kind: ChatKind, message: ChatMessage) => {
    setThreads((prev) => {
      const next = { ...prev, [kind]: [...prev[kind], message].slice(-MAX_STORED) };
      saveThread(kind, next[kind]);
      return next;
    });
  };

  const send = async () => {
    if (!active || busy) return;
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    pushMessage(active, { role: "user", text, at: Date.now() });
    setBusy(true);
    try {
      if (active === "bi") {
        // Prior thread (before this question) so follow-ups keep context.
        const history = threads.bi.slice(-12).map((m) => ({ role: m.role, text: m.text }));
        const res = await fetch("/api/chat/bi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: text,
            history,
            // Which app page the merchant is on — the analyst grounds its
            // first insight in the section being viewed.
            section: window.location.pathname
          })
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (res.ok && contentType.includes("text/plain") && res.body) {
          // Direct-API path: the answer streams — render it as it arrives.
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          // `raw` accumulates everything off the wire, including the tool
          // frames. `full` is the prose only — what the merchant reads and
          // what gets stored in history.
          let raw = "";
          let full = "";
          setStreaming("");
          setSteps([]);
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              raw += decoder.decode(value, { stream: true });
              const split = splitControlFrames(raw);
              // Keep any trailing partial frame in `raw` so a frame cut
              // across two chunks isn't rendered as garbage prose.
              raw = split.pending;
              if (split.tools.length) {
                setSteps((prev) => [...prev, ...split.tools]);
              }
              full += split.text;
              setStreaming(full);
            }
            raw += decoder.decode();
            full += splitControlFrames(raw).text;
          } finally {
            setStreaming(null);
            setSteps([]);
          }
          pushMessage("bi", {
            role: "agent",
            text: full.trim() || lang("לא התקבלה תשובה — נסו שוב.", "No answer received — please try again."),
            at: Date.now()
          });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; answer?: string; error?: string };
        if (body.ok && body.answer) {
          pushMessage("bi", { role: "agent", text: body.answer, at: Date.now() });
        } else if (body.error === "bi_unconfigured") {
          pushMessage("bi", {
            role: "agent",
            text: lang("הילומה לא מחוברת בסביבה הזו כרגע.", "Hiloma isn't connected in this environment."),
            at: Date.now()
          });
        } else {
          pushMessage("bi", {
            role: "agent",
            text: lang("לא הצלחתי לענות הפעם — נסו שוב בעוד רגע.", "I couldn't answer this time — try again in a moment."),
            at: Date.now()
          });
        }
      } else {
        const res = await fetch("/api/chat/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text })
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
        pushMessage("support", {
          role: "agent",
          text: body.ok
            ? lang("קיבלנו! נחזור אליכם למייל בהקדם. אפשר להוסיף פרטים כאן בינתיים.", "Got it! We'll reply by email soon. Feel free to add details here.")
            : lang("ההודעה לא נשלחה — נסו שוב.", "The message wasn't sent — please try again."),
          at: Date.now()
        });
      }
    } catch {
      pushMessage(active, {
        role: "agent",
        text: lang("תקלת תקשורת — נסו שוב.", "Connection problem — please try again."),
        at: Date.now()
      });
    } finally {
      setBusy(false);
    }
  };

  // ── Chat panel ──────────────────────────────────────────────────────
  if (active) {
    const chat = CHATS[active];
    const Icon = chat.icon;
    const thread = threads[active];
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 flex h-[min(72vh,580px)] w-auto max-w-[390px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:left-auto sm:w-[390px]">
        <div className={cn("flex items-center gap-3 px-4 py-3 text-white", chat.accent)}>
          <button
            type="button"
            onClick={() => setActive(null)}
            className="rounded-lg p-1 transition-colors hover:bg-white/15"
            aria-label={lang("חזרה", "Back")}
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </button>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-4">{chat.title}</p>
            <p className="truncate text-[11px] leading-4 text-white/80">{chat.hint}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setActive(null);
              setOpen(false);
            }}
            className="rounded-lg p-1 transition-colors hover:bg-white/15"
            aria-label={lang("סגירה", "Close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-3 py-4">
          <Bubble role="agent" text={chat.intro} isHe={isHe} />
          {thread.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} isHe={isHe} />
          ))}
          {/* Live tool timeline. A turn can run several tool rounds over a
              minute or more; showing which step is running turns dead air
              into visible progress, and tells the merchant what the answer
              is actually grounded in. Completed steps stay listed. */}
          {active === "bi" && busy && steps.length > 0 ? (
            <ol className="space-y-1.5 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5" aria-live="polite">
              {steps.map((name, i) => {
                const isLast = i === steps.length - 1;
                return (
                  <li key={`${name}-${i}`} className="flex items-center gap-2 text-[11px]">
                    {isLast ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-emerald-600" aria-hidden />
                    ) : (
                      <span className="grid h-3 w-3 shrink-0 place-items-center rounded-full bg-emerald-600 text-[8px] font-bold text-white" aria-hidden>
                        ✓
                      </span>
                    )}
                    <span className={isLast ? "font-medium text-foreground" : "text-muted-foreground"}>
                      {toolLabel(name, isHe)}
                      {isLast ? "…" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {streaming ? <Bubble role="agent" text={streaming} isHe={isHe} /> : null}
          {busy && !streaming && steps.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {active === "bi"
                ? lang("האנליסט בודק בנתונים…", "The analyst is checking the data…")
                : lang("שולח…", "Sending…")}
            </div>
          ) : null}
        </div>

        <form
          className="flex items-end gap-2 border-t border-border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={lang("כתבו הודעה…", "Type a message…")}
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-opacity",
              chat.accent,
              (busy || !draft.trim()) && "opacity-40"
            )}
            aria-label={lang("שליחה", "Send")}
          >
            <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          </button>
        </form>
      </div>
    );
  }

  // ── Launcher + speed-dial ───────────────────────────────────────────
  return (
    // Physical right + right-aligned column regardless of document direction:
    // with logical `start`, the launcher and its speed-dial landed on the left
    // in one direction and overflowed the viewport edge in the other on
    // phones, pushing the page sideways.
    // dir="ltr" on the column: `items-end` is LOGICAL, so under the page's RTL
    // it aligned the speed-dial to the LEFT while the launcher sat on the
    // right (the whole stack jumped sides on open). Pinning the column to LTR
    // makes "end" = right; the cards re-declare the page direction inside.
    <div dir="ltr" className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {open ? (
        <div dir={isHe ? "rtl" : "ltr"} className="flex flex-col items-end gap-2">
          {(Object.keys(CHATS) as ChatKind[]).map((kind, i) => {
            const chat = CHATS[kind];
            const Icon = chat.icon;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setActive(kind)}
                className="flex w-64 items-center gap-3 rounded-2xl border border-border bg-card p-3 text-start shadow-xl transition-transform hover:-translate-y-0.5"
                style={{ animation: `gg-chat-pop 160ms ease-out ${i * 60}ms backwards` }}
              >
                <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white", chat.accent)}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{chat.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{chat.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-105",
          open ? "bg-slate-700" : "bg-emerald-600"
        )}
        aria-label={lang("פתיחת צ'אט", "Open chat")}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}
      </button>
      <style>{`@keyframes gg-chat-pop { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

// Split a raw stream chunk into prose and tool-progress frames.
//
// The server interleaves control frames delimited by U+001E RECORD
// SEPARATOR, a character the model will never produce in prose. Anything
// after the last delimiter is returned as `pending` because a frame can be
// cut in half across two network chunks — rendering that half as text would
// briefly show raw JSON in the answer.
function splitControlFrames(raw: string): { text: string; tools: string[]; pending: string } {
  const RS = "";
  if (!raw.includes(RS)) return { text: raw, tools: [], pending: "" };
  const parts = raw.split(RS);
  // An odd number of delimiters means the last frame is still arriving.
  const incomplete = parts.length % 2 === 0;
  const pending = incomplete ? RS + parts.pop()! : "";
  let text = "";
  const tools: string[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      text += part;
      return;
    }
    try {
      const frame = JSON.parse(part) as { t?: string; name?: string };
      if (frame.t === "tool" && frame.name) tools.push(frame.name);
    } catch {
      // Not a frame we understand — drop it rather than leak JSON into prose.
    }
  });
  return { text, tools, pending };
}

// Merchant-facing labels for the tool names. Anything unmapped falls back to
// a generic line rather than exposing an internal identifier.
const TOOL_LABELS: Record<string, { he: string; en: string }> = {
  get_profit_summary: { he: "קורא נתוני רווח", en: "Reading profit data" },
  get_kpi_trend: { he: "בודק מגמות", en: "Checking trends" },
  get_channel_performance: { he: "בודק ערוצי מכירה", en: "Checking sales channels" },
  get_ad_performance: { he: "בודק ביצועי קמפיינים", en: "Checking campaign performance" },
  get_discount_effectiveness: { he: "בודק קודי הנחה", en: "Checking discount codes" },
  get_product_performance: { he: "בודק ביצועי מוצרים", en: "Checking product performance" },
  get_orders: { he: "שולף הזמנות", en: "Fetching orders" },
  get_customers: { he: "בודק נתוני לקוחות", en: "Checking customer data" },
  get_traffic: { he: "בודק תנועה באתר", en: "Checking site traffic" },
  get_organic_search: { he: "בודק חיפוש אורגני", en: "Checking organic search" },
  get_retention: { he: "בודק שימור לקוחות", en: "Checking retention" },
  get_open_alerts: { he: "בודק התראות פתוחות", en: "Checking open alerts" },
  get_competitor_week: { he: "בודק מתחרים", en: "Checking competitors" }
};

function toolLabel(name: string, isHe: boolean): string {
  const entry = TOOL_LABELS[name];
  if (entry) return isHe ? entry.he : entry.en;
  return isHe ? "מנתח נתונים" : "Analysing data";
}

// Minimal, injection-SAFE inline markdown: **bold**, *italic*, `code`.
// The model emits these; rendering them raw showed literal asterisks in every
// answer (H-11). Element-based (no dangerouslySetInnerHTML) — React escapes
// all text, so there's no XSS surface. Newlines are handled by the bubble's
// whitespace-pre-wrap.
function renderRich(text: string): Array<string | ReactElement> {
  const out: Array<string | ReactElement> = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined)
      out.push(
        <code key={key++} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/15">
          {m[2]}
        </code>
      );
    else if (m[3] !== undefined) out.push(<em key={key++}>{m[3]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Bubble({ role, text, isHe }: { role: "user" | "agent"; text: string; isHe: boolean }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-start flex-row-reverse" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm",
          isUser
            ? "bg-emerald-600 text-white rounded-ee-md"
            : "bg-card border border-border text-foreground rounded-es-md"
        )}
        dir={isHe ? "rtl" : "ltr"}
      >
        {renderRich(text)}
      </div>
    </div>
  );
}
