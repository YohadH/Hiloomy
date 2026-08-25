"use client";

// Affiliate magic-link login form (B8). Always answers with the same
// message whether or not the email exists — no enumeration.

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function AffiliateLoginForm({ slug, accent }: { slug: string; accent: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/my/${encodeURIComponent(slug)}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "השליחה נכשלה — נסו שוב.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "השליחה נכשלה — נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
        אם הכתובת רשומה בתוכנית — קישור כניסה בדרך אליה עכשיו (תקף ל־15 דקות; בדקו גם בספאם).
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="האימייל שנרשמתם איתו"
        required
        aria-label="אימייל"
        dir="ltr"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: accent }}
      >
        {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden /> : "שלחו לי קישור כניסה"}
      </button>
    </form>
  );
}
