"use client";

// Copyable field (link / coupon) for the affiliate dashboard header.

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyFieldButton({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — the value is selectable below.
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 select-all truncate font-mono text-xs text-slate-800" dir="ltr">
          {value}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label={`העתקת ${label}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: accent }}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "הועתק!" : "העתקה"}
        </button>
      </div>
    </div>
  );
}
