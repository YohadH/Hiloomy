"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock, AlertTriangle } from "lucide-react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { authStrings, type AuthLocale } from "./auth-strings";
import { GoogleSignInButton } from "./google-signin-button";

export function SigninForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLocale: AuthLocale = (searchParams.get("lang") === "en" ? "en" : "he");
  const [locale, setLocale] = useState<AuthLocale>(initialLocale);
  const dir = locale === "he" ? "rtl" : "ltr";
  const t = authStrings[locale].signin;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) return setError(t.errors.emailRequired);
    if (!password) return setError(t.errors.passwordRequired);

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: signinError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signinError) {
        const message =
          /invalid login credentials/i.test(signinError.message ?? "")
            ? t.errors.invalidCredentials
            : (signinError.message || t.errors.signinFailed);
        setError(message);
        setSubmitting(false);
        return;
      }
      // Successful sign in — redirect to the requested `next` or home.
      const next = searchParams.get("next") ?? "/";
      // Cast to any: Next.js's typedRoutes makes router.replace strict,
      // but `next` is a runtime value we validate elsewhere.
      router.replace(next as never);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.signinFailed);
      setSubmitting(false);
    }
  };

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
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{t.passwordLabel}</span>
            <a href={`/forgot-password?lang=${locale}`} className="text-[11px] text-muted-foreground hover:text-foreground underline">
              {t.forgotPassword}
            </a>
          </div>
          <div className="relative">
            <Lock className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" aria-hidden />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.passwordPlaceholder}
              autoComplete="current-password"
              className="w-full ps-9 pe-3 py-2.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
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
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? t.submitting : t.submit}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-border/70 text-center text-sm text-muted-foreground">
        {t.noAccount}{" "}
        <a href={`/signup?lang=${locale}`} className="text-foreground font-medium hover:underline">
          {t.signupLink}
        </a>
      </div>
    </div>
  );
}
