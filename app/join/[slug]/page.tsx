// hiloomy.com/join/{slug} — the public, per-brand affiliate signup page
// (HLA-12/B2). No auth, no AppShell — this is what a prospective affiliate
// sees when the brand sends them the link. Branding (logo, color,
// headline, copy, terms) comes from the brand's own program settings.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProgramBySlug } from "@/lib/services/affiliate-signup-service";
import { AffiliateSignupForm } from "@/components/affiliate-join/signup-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const context = await getProgramBySlug(slug).catch(() => null);
  return { title: context ? `הצטרפות לתוכנית השותפים של ${context.store.name}` : "הצטרפות לתוכנית שותפים" };
}

export default async function AffiliateJoinPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const context = await getProgramBySlug(slug).catch(() => null);
  if (!context) notFound();
  const { program, store } = context;
  const accent = program.brandAccentColor || "#047857";

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-center">
            {program.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={program.brandLogoUrl}
                alt={store.name}
                className="mx-auto mb-4 h-14 w-auto object-contain"
              />
            ) : (
              <p className="mb-1 text-sm font-semibold uppercase tracking-widest" style={{ color: accent }}>
                {store.name}
              </p>
            )}
            <h1 className="text-2xl font-bold text-slate-900">
              {program.signupHeadline || `הצטרפו לתוכנית השותפים של ${store.name}`}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {program.signupCopy ||
                `מרוויחים ${program.commissionRatePct}% עמלה על כל הזמנה שמגיעה דרככם — עם קישור אישי, קוד קופון, ודשבורד שמראה בדיוק כמה מכרתם.`}
            </p>
            <p className="mt-3 inline-flex items-center rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: accent }}>
              {program.commissionRatePct}% עמלה על כל הזמנה
            </p>
          </div>

          <div className="mt-6">
            <AffiliateSignupForm slug={program.signupSlug} accent={accent} />
          </div>

          {program.termsText ? (
            <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">תנאי התוכנית</summary>
              <p className="mt-2 whitespace-pre-wrap">{program.termsText}</p>
            </details>
          ) : null}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          מופעל על ידי Hiloomy · כבר רשומים?{" "}
          <a href={`/my/${program.signupSlug}`} className="font-semibold underline" style={{ color: accent }}>
            כניסה לדשבורד שלכם
          </a>
        </p>
      </div>
    </main>
  );
}
