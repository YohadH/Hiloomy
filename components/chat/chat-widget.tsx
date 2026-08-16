"use client";

import { useEffect, useRef, useState } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThreads({ bi: loadThread("bi"), support: loadThread("support") });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active, threads, busy]);

  const CHATS: Record<
    ChatKind,
    { title: string; hint: string; icon: typeof Bot; intro: string; accent: string }
  > = {
    bi: {
      title: lang("אנליסט הBI", "BI analyst"),
      hint: lang("שאלות על המכירות, הקמפיינים והמתחרים", "Ask about sales, campaigns, competitors"),
      icon: Bot,
      intro: lang(
        "היי! אני אנליסט הBI של החנות. שאלו אותי כל דבר על המכירות, הקמפיינים או המתחרים — למשל: ״מה היה השבוע הכי חזק החודש?״ תשובה יכולה לקחת עד שתי דקות.",
        "Hi! I'm the store's BI analyst. Ask me anything about sales, campaigns or competitors. Answers can take up to two minutes."
      ),
      accent: "bg-indigo-600"
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
        const res = await fetch("/api/chat/bi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text })
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; answer?: string; error?: string };
        if (body.ok && body.answer) {
          pushMessage("bi", { role: "agent", text: body.answer, at: Date.now() });
        } else if (body.error === "bi_unconfigured") {
          pushMessage("bi", {
            role: "agent",
            text: lang("סוכן הBI לא מחובר בסביבה הזו כרגע.", "The BI agent isn't connected in this environment."),
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
      <div className="fixed bottom-4 start-4 z-50 flex h-[min(72vh,580px)] w-[min(94vw,390px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
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
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {active === "bi"
                ? lang("האנליסט בודק בנתונים… זה יכול לקחת עד שתי דקות", "The analyst is checking the data… up to two minutes")
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
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-400"
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
    <div className="fixed bottom-4 start-4 z-50 flex flex-col items-start gap-2">
      {open ? (
        <div className="flex flex-col gap-2">
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
          open ? "bg-slate-700" : "bg-indigo-600"
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

function Bubble({ role, text, isHe }: { role: "user" | "agent"; text: string; isHe: boolean }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-start flex-row-reverse" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm",
          isUser
            ? "bg-indigo-600 text-white rounded-ee-md"
            : "bg-card border border-border text-foreground rounded-es-md"
        )}
        dir={isHe ? "rtl" : "ltr"}
      >
        {text}
      </div>
    </div>
  );
}
