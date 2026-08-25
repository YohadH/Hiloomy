"use client";

// Public affiliate signup form (B2). Posts to /api/join/[slug]; on success
// the API already set the session cookie, so we hard-navigate into the
// affiliate dashboard. An email that's already registered flips to the
// "we sent you a login link" state instead of erroring (returning
// affiliates land here too).

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function AffiliateSignupForm({ slug, accent }: { slug: string; accent: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  // Honeypot: invisible to humans; bots that fill it are dropped silently.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingNotice, setExistingNotice] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, instagram, website })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "ההרשמה נכשלה — נסו שוב.");
      if (body.mode === "existing") {
        setExistingNotice(true);
        return;
      }
      // Session cookie is set — straight into their dashboard.
      window.location.href = `/my/${encodeURIComponent(slug)}/dashboard`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההרשמה נכשלה — נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  if (existingNotice) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm leading-6 text-emerald-900">
        הכתובת הזו כבר רשומה בתוכנית 🎉
        <br />
        שלחנו לה עכשיו קישור כניסה לדשבורד — בדקו את המייל (גם בספאם).
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="שם מלא"
        required
        minLength={2}
        aria-label="שם מלא"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="אימייל"
        required
        aria-label="אימייל"
        dir="ltr"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
      <input
        value={instagram}
        onChange={(e) => setInstagram(e.target.value)}
        placeholder="@ שם המשתמש באינסטגרם (לא חובה)"
        aria-label="אינסטגרם"
        dir="ltr"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
      {/* Honeypot — hidden from real users */}
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        placeholder="website"
      />
      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: accent }}
      >
        {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden /> : "הצטרפות לתוכנית"}
      </button>
      <p className="text-center text-[11px] leading-4 text-slate-400">
        בלחיצה על הכפתור מאשרים את תנאי התוכנית. תקבלו קישור אישי וגישה לדשבורד עם המכירות והעמלות שלכם.
      </p>
    </form>
  );
}
