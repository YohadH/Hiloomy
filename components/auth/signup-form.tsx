"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { authStrings, type AuthLocale } from "./auth-strings";
import { GoogleSignInButton } from "./google-signin-button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLocale: AuthLocale = (searchParams.get("lang") === "en" ? "en" : "he");
  const [locale, setLocale] = useState<AuthLocale>(initialLocale);
  const dir = locale === "he" ? "rtl" : "ltr";
  const t = authStrings[locale].signup;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Lock <html> dir/lang on this page so Tailwind RTL classes flip
  // correctly for Hebrew users typing in form fields.
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) return setError(t.errors.emailRequired);
    if (!EMAIL_RE.test(email)) return setError(t.errors.emailInvalid);
    if (!password) return setError(t.errors.passwordRequired);
    if (password.length < 8) return setError(t.errors.passwordTooShort);

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      const next = searchParams.get("next") ?? "/";
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { locale },
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`
        }
      });
      if (signupError) {
        setError(signupError.message || t.errors.signupFailed);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.signupFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div dir={dir} className="rounded-2xl bg-card border border-border p-8 shadow-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-center text-xl font-semibold mb-2">{t.checkEmail}</h2>
        <p className="text-center text-sm text-muted-foreground">
          {t.checkEmailBody} <strong>{email}</strong>
        </p>
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

      <GoogleSignInButton locale={locale} next={searchParams.get("next") ?? undefined} />
      <div className="my-4 flex items-center gap-3">
        <span className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
          {locale === "he" ? "או" : "or"}
        </span>
        <span className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium mb-1">{t.emailLabel}</span>
          <div className="relative">
            <Mail className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" aria-hidden />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              autoComplete="email"
              autoCapitalize="none"
              className="w-full ps-9 pe-3 py-2.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              required
            />
          </div>
        </label>

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
              className="w-full ps-9 pe-3 py-2.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              required
              minLength={8}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t.passwordHint}</p>
        </label>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? t.submitting : t.submit}
        </button>

        <p className="text-[11px] text-center text-muted-foreground leading-5">
          {t.terms}{" "}
          <a href="/terms" className="underline hover:text-foreground">{t.termsLink}</a>{" "}
          {t.and}{" "}
          <a href="/privacy" className="underline hover:text-foreground">{t.privacyLink}</a>.
        </p>
      </form>

      <div className="mt-6 pt-6 border-t border-border/70 text-center text-sm text-muted-foreground">
        {t.alreadyHaveAccount}{" "}
        <a href={`/signin?lang=${locale}`} className="text-foreground font-medium hover:underline">
          {t.signinLink}
        </a>
      </div>
    </div>
  );
}
