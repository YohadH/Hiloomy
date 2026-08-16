import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getAppLocale } from "@/lib/i18n";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

// "Connect another brand" — exposed via the store-switcher "+" link AND
// from Settings when no brand is selected. Same wizard component as
// first-run onboarding (welcome step is skipped because they're not new
// any more — we start them on the connect step).

export const dynamic = "force-dynamic";

export default async function ConnectBrandPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/connect-brand" as never);

  const locale = await getAppLocale();
  const t = locale === "he"
    ? { title: "חיבור מותג נוסף", back: "← חזרה לדשבורד" }
    : { title: "Connect a new brand", back: "← Back to dashboard" };

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-50/30 via-background to-indigo-50/30">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <a href="/" className="text-xs text-muted-foreground hover:text-foreground">
          {t.back}
        </a>
      </div>
      <OnboardingWizard
        email={auth.email ?? ""}
        pendingShopDomain={null}
        locale={locale === "he" ? "he" : "en"}
      />
    </main>
  );
}
