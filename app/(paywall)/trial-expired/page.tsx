import Link from "next/link";
import { getAuthContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSubscriptionStatus } from "@/lib/billing/subscription-status";

// Trial-expired paywall. The middleware redirects here when the user's
// trial has expired AND they don't have a paid plan. The page itself
// also checks status, so if the user manages to get here while still
// trial_active, we bounce them back home.

export const dynamic = "force-dynamic";

export default async function TrialExpiredPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/billing" as never);

  const sub = await getSubscriptionStatus();
  if (sub.status !== "trial_expired") redirect("/");

  const t =
    auth.locale === "he"
      ? {
          title: "תקופת הניסיון שלכם הסתיימה",
          body: "כדי להמשיך להשתמש בHiloomy, בחרו מסלול שמתאים לכם. החל מ49$ לחודש.",
          cta: "בחרו מסלול",
          signOut: "התנתקו"
        }
      : {
          title: "Your trial has ended",
          body: "To keep using Hiloomy, choose a plan. Starting at $49/month.",
          cta: "Choose a plan",
          signOut: "Sign out"
        };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-violet-50 via-background to-indigo-50">
      <div className="max-w-md w-full rounded-2xl bg-card border border-border p-8 shadow-lg text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-700 mb-4">
          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
        <Link
          href={"/billing" as never}
          className="mt-6 inline-block w-full rounded-md bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
        >
          {t.cta}
        </Link>
        <form action="/api/auth/signout" method="POST" className="mt-3">
          <button
            type="submit"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t.signOut}
          </button>
        </form>
      </div>
    </main>
  );
}
