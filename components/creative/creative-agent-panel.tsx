"use client";

// The Creative agent panel — a floating chat mounted ONLY on /creative*
// pages (via app/creative/layout.tsx). The agent interviews the merchant,
// then fills the new-project wizard: the server streams a {t:"wizard"}
// control frame, and this panel hands it to the wizard two ways:
//   1. Live: a CustomEvent the wizard listens for (same page, instant).
//   2. Carry-over: sessionStorage, so a prompt crafted while browsing
//      /creative or a project page is waiting when the wizard opens.
//
// Stream protocol is the BI widget's: text/plain with U+001E-delimited
// JSON control frames (see splitControlFrames below).

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, Send, Settings2, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardApplication } from "@/lib/services/creative-agent-chat-service";

export const CREATIVE_AGENT_APPLY_EVENT = "hiloomy:creative-agent-apply";
export const CREATIVE_AGENT_APPLY_STORAGE = "hiloomy-creative-agent-apply";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  at: number;
  applied?: boolean;
}

const STORAGE_KEY = "gg-chat-creative";
const MAX_STORED = 60;

function loadThread(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_STORED) : [];
  } catch {
    return [];
  }
}

function saveThread(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // storage full/blocked — thread just won't persist
  }
}

const RS = "";

function splitControlFrames(raw: string): {
  text: string;
  tools: string[];
  wizards: WizardApplication[];
  pending: string;
} {
  if (!raw.includes(RS)) return { text: raw, tools: [], wizards: [], pending: "" };
  const parts = raw.split(RS);
  const incomplete = parts.length % 2 === 0;
  const pending = incomplete ? RS + parts.pop()! : "";
  let text = "";
  const tools: string[] = [];
  const wizards: WizardApplication[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      text += part;
      return;
    }
    try {
      const frame = JSON.parse(part) as { t?: string; name?: string; apply?: WizardApplication };
      if (frame.t === "tool" && frame.name) tools.push(frame.name);
      if (frame.t === "wizard" && frame.apply?.prompt) wizards.push(frame.apply);
    } catch {
      // Not a frame we understand — drop it rather than leak JSON into prose.
    }
  });
  return { text, tools, wizards, pending };
}

const TOOL_LABELS: Record<string, { he: string; en: string }> = {
  list_products: { he: "בודק את הקטלוג", en: "Checking the catalog" },
  get_provider_options: { he: "בודק אילו מנועים זמינים", en: "Checking available engines" },
  apply_to_wizard: { he: "ממלא את האשף", en: "Filling the wizard" }
};

export function CreativeAgentPanel({ locale }: { locale: "he" | "en" }) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const pathname = usePathname();
  const router = useRouter();
  const onWizardPage = pathname === "/creative/new";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [appliedNotice, setAppliedNotice] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Owner persona editor ("give him a predefined prompt"): the standing
  // brand/style instructions injected into the agent's system prompt.
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaDraft, setPersonaDraft] = useState("");
  const [personaLoaded, setPersonaLoaded] = useState(false);
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaSaved, setPersonaSaved] = useState(false);

  const openPersona = async () => {
    setPersonaOpen(true);
    setPersonaSaved(false);
    if (personaLoaded) return;
    try {
      const res = await fetch("/api/chat/creative/persona");
      const body = await res.json().catch(() => ({}));
      if (body?.ok && typeof body.persona === "string") setPersonaDraft(body.persona);
      setPersonaLoaded(true);
    } catch {
      setPersonaLoaded(true);
    }
  };

  const savePersona = async () => {
    setPersonaSaving(true);
    setPersonaSaved(false);
    try {
      const res = await fetch("/api/chat/creative/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: personaDraft })
      });
      const body = await res.json().catch(() => ({}));
      if (body?.ok) {
        if (typeof body.persona === "string") setPersonaDraft(body.persona);
        setPersonaSaved(true);
      }
    } catch {
      // keep the draft; the owner can retry
    } finally {
      setPersonaSaving(false);
    }
  };

  useEffect(() => {
    setMessages(loadThread());
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, open]);

  const pushMessage = (msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg].slice(-MAX_STORED);
      saveThread(next);
      return next;
    });
  };

  const deliverToWizard = (apply: WizardApplication) => {
    // Carry-over first, so a same-tick navigation still finds it.
    try {
      sessionStorage.setItem(CREATIVE_AGENT_APPLY_STORAGE, JSON.stringify(apply));
    } catch {
      // storage blocked — the live event below still covers the open wizard
    }
    window.dispatchEvent(new CustomEvent(CREATIVE_AGENT_APPLY_EVENT, { detail: apply }));
    setAppliedNotice(true);
  };

  const send = async () => {
    if (busy) return;
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setAppliedNotice(false);
    pushMessage({ role: "user", text, at: Date.now() });
    setBusy(true);
    let applied = false;
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/chat/creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, section: pathname })
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.includes("text/plain") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
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
            raw = split.pending;
            if (split.tools.length) setSteps((prev) => [...prev, ...split.tools]);
            for (const apply of split.wizards) {
              deliverToWizard(apply);
              applied = true;
            }
            full += split.text;
            setStreaming(full);
          }
          raw += decoder.decode();
          const tail = splitControlFrames(raw);
          for (const apply of tail.wizards) {
            deliverToWizard(apply);
            applied = true;
          }
          full += tail.text;
        } finally {
          setStreaming(null);
          setSteps([]);
        }
        pushMessage({
          role: "agent",
          text: full.trim() || lang("לא התקבלה תשובה — נסו שוב.", "No answer received — please try again."),
          at: Date.now(),
          applied
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      pushMessage({
        role: "agent",
        text:
          body.error === "creative_chat_unconfigured"
            ? lang("סוכן הקריאייטיב לא מחובר בסביבה הזו כרגע.", "The Creative agent isn't connected in this environment.")
            : lang("לא הצלחתי לענות הפעם — נסו שוב בעוד רגע.", "I couldn't answer this time — try again in a moment."),
        at: Date.now()
      });
    } catch {
      pushMessage({
        role: "agent",
        text: lang("שגיאת רשת — נסו שוב.", "Network error — please try again."),
        at: Date.now()
      });
    } finally {
      setBusy(false);
    }
  };

  const starters = [
    lang("תמונת מוצר יוקרתית לרקע כהה", "A premium dark-background product shot"),
    lang("פוסט לאינסטגרם עם דוגמנית", "An Instagram post with a model"),
    lang("איזה מנוע הכי מתאים למה?", "Which engine fits which task?")
  ];

  return (
    <div dir={isHe ? "rtl" : "ltr"} className={cn("fixed bottom-5 z-50", isHe ? "left-5" : "right-5")}>
      {open ? (
        <div
          className="mb-3 flex h-[560px] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-2xl dark:border-violet-900 dark:bg-slate-950"
          style={{ animation: "gg-creative-pop 160ms ease-out" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-violet-100 bg-gradient-to-l from-violet-600 to-fuchsia-600 px-4 py-3 text-white dark:border-violet-900">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" aria-hidden />
              <div>
                <p className="text-sm font-bold">{lang("סוכן הקריאייטיב", "Creative agent")}</p>
                <p className="text-[10px] opacity-80">
                  {lang("מתאר → מקבל פרומפט מוכן באשף", "Describe it → get a ready prompt in the wizard")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => (personaOpen ? setPersonaOpen(false) : void openPersona())}
                className={cn("rounded-full p-1 hover:bg-white/15", personaOpen && "bg-white/20")}
                aria-label={lang("הפרסונה של הסוכן", "Agent persona")}
                title={lang("הפרסונה של הסוכן — הנחיות קבועות", "Agent persona — standing instructions")}
              >
                <Settings2 className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 hover:bg-white/15"
                aria-label={lang("סגירה", "Close")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Owner persona editor — replaces the thread while open */}
          {personaOpen ? (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {lang("הפרסונה של הסוכן", "Agent persona")}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang(
                  "הנחיות קבועות שהסוכן מקבל בכל שיחה: שפת המותג, סגנונות מועדפים, מה אסור. למשל: ״אנחנו מותג בשמים יוקרתי, תמיד רקעים כהים ותאורה דרמטית, לעולם לא צבעי פסטל״.",
                  "Standing instructions the agent receives in every conversation: brand voice, preferred styles, hard no's. E.g.: \"We are a premium perfume brand — always dark backgrounds and dramatic light, never pastels.\""
                )}
              </p>
              <textarea
                value={personaDraft}
                onChange={(e) => {
                  setPersonaDraft(e.target.value);
                  setPersonaSaved(false);
                }}
                rows={10}
                maxLength={6000}
                placeholder={
                  personaLoaded
                    ? lang("כתבו כאן את ההנחיות הקבועות…", "Write the standing instructions here…")
                    : lang("טוען…", "Loading…")
                }
                className="min-h-[220px] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  {lang("שמירה ריקה מחזירה לברירת המחדל.", "Saving empty restores the default persona.")}
                </p>
                <button
                  type="button"
                  onClick={() => void savePersona()}
                  disabled={personaSaving || !personaLoaded}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {personaSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : personaSaved ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : null}
                  {personaSaved ? lang("נשמר", "Saved") : lang("שמירת הפרסונה", "Save persona")}
                </button>
              </div>
            </div>
          ) : null}

          {!personaOpen ? (
          <>
          {/* Thread */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && streaming === null ? (
              <div className="space-y-2 pt-2">
                <p className="text-sm text-muted-foreground">
                  {lang(
                    "ספרו לי מה אתם רוצים ליצור — אני אכיר את המוצרים שלכם, אבחר מנוע, ואכתוב את הפרומפט ישר לתוך האשף.",
                    "Tell me what you want to create — I'll ground it in your catalog, pick an engine, and write the prompt straight into the wizard."
                  )}
                </p>
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDraft(s)}
                    className="block w-full rounded-2xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-start text-xs text-violet-900 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            {messages.map((m, i) => (
              <div key={`${m.at}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  )}
                >
                  {m.text}
                  {m.role === "agent" && m.applied ? (
                    <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      {lang("הפרומפט הוחל על האשף", "Prompt applied to the wizard")}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            {streaming !== null ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                  {streaming || (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {lang("חושב…", "Thinking…")}
                    </span>
                  )}
                  {steps.length > 0 ? (
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      {(() => {
                        const last = steps[steps.length - 1];
                        const label = TOOL_LABELS[last];
                        return label ? (isHe ? label.he : label.en) : lang("עובד…", "Working…");
                      })()}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {appliedNotice && !onWizardPage ? (
              <button
                type="button"
                onClick={() => router.push("/creative/new" as never)}
                className="mx-auto flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-violet-700"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {lang("הפרומפט מחכה באשף — פתיחה", "The prompt is waiting in the wizard — open it")}
              </button>
            ) : null}
          </div>

          {/* Composer */}
          <div className="border-t border-violet-100 p-3 dark:border-violet-900">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder={lang("למשל: פוטו מוצר על שיש שחור רטוב…", "e.g. product shot on wet black marble…")}
                className="min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !draft.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                aria-label={lang("שליחה", "Send")}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>
          </>
          ) : null}
        </div>
      ) : null}

      {/* Launcher — distinct from the global BI bubble (wand + violet). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-full bg-gradient-to-l from-violet-600 to-fuchsia-600 py-3 text-white shadow-xl transition hover:shadow-2xl",
          open ? "px-3" : "px-4"
        )}
        aria-label={lang("סוכן הקריאייטיב", "Creative agent")}
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Wand2 className="h-5 w-5" aria-hidden />}
        {!open ? <span className="text-sm font-bold">{lang("סוכן הקריאייטיב", "Creative agent")}</span> : null}
      </button>
      <style>{`@keyframes gg-creative-pop { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
