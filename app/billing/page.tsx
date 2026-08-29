import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getSubscriptionStatus } from "@/lib/billing/subscription-status";
import { getDb } from "@/lib/server/db";
import { PLANS } from "@/lib/billing/plans";
import { BillingPlanPicker } from "@/components/billing/billing-plan-picker";
import { billingEnabled } from "@/lib/billing/billing-flag";
import { AppShell } from "@/components/layout/app-shell";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/billing" as never);
  if (!auth.orgId) redirect("/");

  const sub = await getSubscriptionStatus();

  const db = getDb();
  const org = (await db.organization.findUnique({
    where: { id: auth.orgId },
    select: { name: true, currency: true }
  })) as { name: string; currency: string } | null;
  if (!org) redirect("/");

  const chrome = await getAppChromeData();

  // Cookie first (what the app shell renders from), DB locale as the
  // fallback — otherwise this page could disagree with the surrounding UI.
  const cookieLocale = await getAppLocale();
  const locale = cookieLocale === "he" ? "he" : "en";
  const currency = org.currency === "USD" ? "USD" : "ILS";

  // Billing disabled in this environment — show a friendly notice
  // instead of the plan picker so the page still works for poking around.
  if (!billingEnabled()) {
    const disabledCopy =
      locale === "he"
        ? {
            title: "התשלומים מושבתים כרגע",
            body: "המערכת רצה במצב פיתוח. כשתפעילו חיוב (BILLING_ENABLED=true) תופיע כאן בחירת מסלולים."
          }
        : {
            title: "Billing is currently disabled",
            body: "The app is running in development mode. Set BILLING_ENABLED=true in your environment to enable plan selection here."
          };
    return (
      <AppShell store={chrome.store} controls={chrome.controls}>
        <div dir={locale === "he" ? "rtl" : "ltr"} className="mx-auto w-full max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight">{disabledCopy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{disabledCopy.body}</p>
        </div>
      </AppShell>
    );
  }

  const t =
    locale === "he"
      ? {
          title: "מנוי וחיוב",
          subtitle: `מסלולים ל-${org.name}`,
          currentPlan: "המסלול הנוכחי",
          status: { trial_active: "תקופת ניסיון פעילה", trial_expired: "תקופת ניסיון הסתיימה", paid: "מנוי פעיל", no_org: "—" }
        }
      : {
          title: "Billing & subscription",
          subtitle: `Plans for ${org.name}`,
          currentPlan: "Current plan",
          status: { trial_active: "Trial active", trial_expired: "Trial expired", paid: "Active subscription", no_org: "—" }
        };

  const planLabel = (sub.plan === "starter" || sub.plan === "growth" || sub.plan === "agency")
    ? PLANS[sub.plan].name[locale]
    : (locale === "he" ? "תקופת ניסיון" : "Trial");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
    <div dir={locale === "he" ? "rtl" : "ltr"} className="mx-auto w-full max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="mb-8 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.currentPlan}
        </p>
        <p className="mt-1 text-xl font-semibold">{planLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.status[sub.status]}
          {sub.status === "trial_active" && sub.daysUntilTrialEnd != null
            ? ` · ${sub.daysUntilTrialEnd} ${locale === "he" ? "ימים" : "days"}`
            : ""}
        </p>
        {sub.hasStripeCustomer ? (
          <form action="/api/billing/portal" method="POST" className="mt-3">
            <button
              type="submit"
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              {locale === "he" ? "ניהול תשלומים וחשבוניות" : "Manage payment & invoices"}
            </button>
          </form>
        ) : null}
      </div>

      <BillingPlanPicker locale={locale} currency={currency} currentPlan={sub.plan} />
    </div>
    </AppShell>
  );
}
