// Global 404 (Launch-QA). Without this file, notFound() — called by the
// public affiliate links (/join/{slug}, /my/{slug}) on a bad/stale slug, and
// by any unmatched route — fell through to Next's bare "This page could not
// be found" with no styling and no way out, which reads as broken under the
// brand. This gives every dead end a clean, bilingual page with an exit.

import Link from "next/link";
import { cookies } from "next/headers";

export default async function NotFound() {
  let isHe = true;
  try {
    isHe = (await cookies()).get("app-locale")?.value !== "en";
  } catch {
    // Rendered outside a request scope — default to Hebrew (the app's primary).
  }

  const t = isHe
    ? {
        title: "הדף לא נמצא",
        body: "הקישור אולי שגוי, פג תוקף או הוסר. אפשר לחזור לעמוד הראשי או להתחבר.",
        home: "לעמוד הראשי",
        signin: "התחברות"
      }
    : {
        title: "Page not found",
        body: "The link may be wrong, expired, or removed. Head back to the main page or sign in.",
        home: "Go to homepage",
        signin: "Sign in"
      };

  return (
    <main
      dir={isHe ? "rtl" : "ltr"}
      className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-5xl font-extrabold tracking-tight text-emerald-700">404</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t.body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
          >
            {t.home}
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t.signin}
          </Link>
        </div>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Hiloomy</p>
      </div>
    </main>
  );
}
