// Auth pages live under (auth) — a route group so they don't inherit
// the main AppShell sidebar/topbar. They render on a clean centered
// canvas with brand color.

import type { ReactNode } from "react";
import { HiloomyLogo } from "@/components/ui/logo";
import { getAppLocale } from "@/lib/i18n";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const locale = await getAppLocale();
  const isHe = locale === "he";

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-background to-emerald-50 flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between gap-3">
        <a href={`/welcome?lang=${locale}`} className="inline-flex items-center">
          <HiloomyLogo />
        </a>
        <a
          href={`/welcome?lang=${locale}`}
          className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {isHe ? "→ חזרה לעמוד הבית" : "← Back to the home page"}
        </a>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
        <a href="/privacy" className="underline hover:text-foreground">Privacy</a>
        <span className="mx-2">·</span>
        <a href="/terms" className="underline hover:text-foreground">Terms</a>
      </footer>
    </div>
  );
}
