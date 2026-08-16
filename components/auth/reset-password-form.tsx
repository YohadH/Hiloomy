"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { authStrings, type AuthLocale } from "./auth-strings";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialLocale: AuthLocale = (searchParams.get("lang") === "en" ? "en" : "he");
  const [locale, setLocale] = useState<AuthLocale>(initialLocale);
  const dir = locale === "he" ? "rtl" : "ltr";
  const t = authStrings[locale].reset;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t.errors.tooShort);
    if (password !== confirm) return setError(t.errors.mismatch);

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      // Supabase auto-exchanges the recovery token from the URL fragment.
      // When updateUser is called with a session, it sets the password.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (/session/i.test(updateError.message ?? "")) {
          setError(t.errors.invalidLink);
        } else {
          setError(updateError.message);
        }
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div dir={dir} className="rounded-2xl bg-card border border-border p-8 shadow-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-center text-xl font-semibold mb-2">{t.successTitle}</h2>
        <p className="text-center text-sm text-muted-foreground">{t.successBody}</p>
        <a
          href={`/signin?lang=${locale}`}
          className="mt-6 block w-full text-center rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
        >
          {t.goToSignin}
        </a>
      </div>
    );
  }

  return (
    <div dir={dir} className="rounded-2xl bg-card border border-border p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setLocale(locale === "he" ? "en" : "he")}
          className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
        >
          {authStrings[locale].switchLanguage}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium mb-1">{t.passwordLabel}</span>
          <div className="relative">
            <Lock className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" aria-hidden />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              autoComplete="new-password"
              minLength={8}
              className="w-full ps-9 pe-3 py-2.5 rounded-md border border-border bg-background text-sm"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="block text-sm font-medium mb-1">{t.confirmLabel}</span>
          <div className="relative">
            <Lock className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" aria-hidden />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full ps-9 pe-3 py-2.5 rounded-md border border-border bg-background text-sm"
              required
            />
          </div>
        </label>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !password || !confirm}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? t.submitting : t.submit}
        </button>
      </form>
    </div>
  );
}
