import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { DesignPartnersManager } from "@/components/settings/design-partners-manager";

export const dynamic = "force-dynamic";

export default async function DesignPartnersPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/settings/partners" as never);
  // Onboarding creates orgs + invitations — owners/admins only.
  if (auth.role !== "owner" && auth.role !== "admin") redirect("/settings" as never);

  const chrome = await getAppChromeData();
  const uiLocale = await getAppLocale();
  const isHe = uiLocale === "he";
  const t = isHe
    ? {
        title: "שותפי עיצוב ומותגים",
        subtitle: "חברו חנויות נוספות — שלכם או של שותפי עיצוב — כל אחת בארגון משלה"
      }
    : {
        title: "Design partners & brands",
        subtitle: "Connect additional stores — your own or design partners' — each in its own org"
      };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <DesignPartnersManager isHe={isHe} />
      </div>
    </AppShell>
  );
}
