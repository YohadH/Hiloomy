"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import { displayDecisionId, type Decision } from "@/lib/domain/decision";
import { DecisionReceipt, type DecideChoice } from "./decision-receipt";

type Locale = "he" | "en";

// Side sheet hosting a Decision Receipt. Portaled to <body> so no page
// wrapper can clip it; full-screen on phones, a wide sheet on the inline-end
// side on desktop. Escape and the scrim both close it.
export function DecisionDrawer({
  decision,
  locale,
  onClose,
  onDecide,
  busy,
  error
}: {
  decision: Decision | null;
  locale: Locale;
  onClose: () => void;
  onDecide: (choice: DecideChoice, optionKey?: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!decision) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [decision, onClose]);

  if (!mounted || !decision) return null;
  const isHe = locale === "he";

  return createPortal(
    <div
      dir={isHe ? "rtl" : "ltr"}
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={decision.title[locale]}
    >
      <div
        className="flex h-[100dvh] w-full flex-col bg-background shadow-2xl sm:w-[min(720px,94vw)] sm:border-s sm:border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-semibold tracking-[0.12em]">{displayDecisionId(decision.id)}</span>
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={`/today/${decision.id}` as any}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {isHe ? "פתיחה בעמוד" : "Open as page"}
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={isHe ? "סגירה" : "Close"}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
          <DecisionReceipt decision={decision} locale={locale} onDecide={onDecide} busy={busy} error={error} />
        </div>
      </div>
    </div>,
    document.body
  );
}
