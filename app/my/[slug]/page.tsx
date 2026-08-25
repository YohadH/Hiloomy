// hiloomy.com/my/{slug} — the affiliate's branded door (HLA-12/B8).
// Three behaviors:
//   ?token=…        → redeem the magic-link token (via the session route,
//                     which can set cookies) and land in the dashboard.
//   valid session   → straight to the dashboard.
//   otherwise       → the email form that sends a magic login link.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getProgramBySlug } from "@/lib/services/affiliate-signup-service";
import {
  AFFILIATE_SESSION_COOKIE,
  verifyAffiliateToken
} from "@/lib/server/affiliate-session";
import { AffiliateLoginForm } from "@/components/affiliate-join/login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const context = await getProgramBySlug(slug).catch(() => null);
  return { title: context ? `פורטל השותפים של ${context.store.name}` : "פורטל שותפים" };
}

export default async function AffiliateLoginPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  const context = await getProgramBySlug(slug).catch(() => null);
  if (!context) notFound();

  // Magic-link redemption happens in the session ROUTE (pages can't set
  // cookies); bounce there with the token.
  if (token) {
    redirect(`/api/my/${encodeURIComponent(slug)}/session?token=${encodeURIComponent(token)}` as never);
  }

  // Already signed in for THIS store → dashboard.
  const cookieStore = await cookies();
  const session = verifyAffiliateToken(
    cookieStore.get(AFFILIATE_SESSION_COOKIE)?.value,
    "session"
  );
  if (session && session.storeId === context.store.id) {
    redirect(`/my/${encodeURIComponent(slug)}/dashboard` as never);
  }

  const { program, store } = context;
  const accent = program.brandAccentColor || "#047857";

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {program.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={program.brandLogoUrl} alt={store.name} className="mx-auto mb-4 h-14 w-auto object-contain" />
          ) : (
            <p className="mb-1 text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
              {store.name}
            </p>
          )}
          <h1 className="text-2xl font-bold text-slate-900">הדשבורד שלך</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            הכניסו את האימייל שנרשמתם איתו — נשלח לכם קישור כניסה. בלי סיסמאות.
          </p>
          <div className="mt-5">
            <AffiliateLoginForm slug={program.signupSlug} accent={accent} />
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          עוד לא בתוכנית?{" "}
          <a href={`/join/${program.signupSlug}`} className="font-semibold underline" style={{ color: accent }}>
            הצטרפו כאן
          </a>
        </p>
      </div>
    </main>
  );
}
