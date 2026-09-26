"use client";

// Creator side of campaigns: "what do I post and when", each brief with its
// ready campaign link and a "פרסמתי" button (+ optional post URL).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { BRIEF_FORMAT_LABEL, BRIEF_STATUS_LABEL, briefIsLate } from "@/lib/domain/affiliate-campaign";
import type { MemberBrief } from "@/lib/services/affiliate-campaign-service";

export function BriefList({ slug, briefs, accent }: { slug: string; briefs: MemberBrief[]; accent: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const markPosted = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/my/${encodeURIComponent(slug)}/briefs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrl: urls[id] || null })
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "לא הצלחנו לשמור, נסו שוב");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* selectable */
    }
  };

  const dateFmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jerusalem" });

  if (briefs.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <p className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">מה מפרסמים ומתי</p>
      <ul className="divide-y divide-slate-100">
        {briefs.map((b) => {
          const late = briefIsLate(b);
          const done = b.status === "posted";
          return (
            <li key={b.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: accent }}>
                    {b.campaignName}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    <span className="me-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{BRIEF_FORMAT_LABEL[b.format].he}</span>
                    {b.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    לפרסום ב-{dateFmt(b.dueDate)}
                    {late ? <span className="ms-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">עבר התאריך</span> : null}
                  </p>
                  {b.promoText ? <p className="mt-1 text-sm text-slate-700">{b.promoText}</p> : null}
                  {b.instructions ? <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{b.instructions}</p> : null}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${done ? "bg-emerald-100 text-emerald-800" : b.status === "missed" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                  {BRIEF_STATUS_LABEL[b.status].he}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {b.link ? (
                  <button type="button" onClick={() => copy(b.id, b.link!)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-start">
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold text-slate-500">הקישור לקמפיין הזה</span>
                      <span className="block truncate font-mono text-xs text-slate-800" dir="ltr">
                        {b.link.replace(/^https?:\/\//, "")}
                      </span>
                    </span>
                    {copied === b.id ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Copy className="h-4 w-4 shrink-0 text-slate-500" />}
                  </button>
                ) : null}
                {b.couponCode ? (
                  <button type="button" onClick={() => copy(`${b.id}-c`, b.couponCode!)} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-start">
                    <span>
                      <span className="block text-[11px] font-semibold text-slate-500">קוד הקופון לקמפיין</span>
                      <span className="block font-mono text-xs text-slate-800" dir="ltr">
                        {b.couponCode}
                      </span>
                    </span>
                    {copied === `${b.id}-c` ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Copy className="h-4 w-4 shrink-0 text-slate-500" />}
                  </button>
                ) : null}
              </div>

              {!done && b.status !== "cancelled" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    dir="ltr"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
                    placeholder="קישור לפוסט (אופציונלי)"
                    value={urls[b.id] ?? ""}
                    onChange={(e) => setUrls({ ...urls, [b.id]: e.target.value })}
                  />
                  <button type="button" disabled={busy === b.id} onClick={() => markPosted(b.id)} className="rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-60" style={{ background: accent }}>
                    {busy === b.id ? "שומר…" : "פרסמתי ✓"}
                  </button>
                </div>
              ) : b.postUrl ? (
                <a href={b.postUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline" style={{ color: accent }} dir="ltr">
                  {b.postUrl}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="px-5 pb-4 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
