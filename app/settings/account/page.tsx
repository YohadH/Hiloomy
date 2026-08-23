import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/settings/account" as never);

  const db = getDb();
  const user = (await db.user.findUnique({
    where: { id: auth.userId },
    select: { email: true, displayName: true, locale: true, createdAt: true, lastSignInAt: true }
  })) as {
    email: string;
    displayName: string | null;
    locale: string;
    createdAt: Date;
    lastSignInAt: Date | null;
  } | null;

  if (!user) redirect("/signin" as never);

  // Cookie drives UI language (auth.locale drives emails) — same rule as
  // the app shell, so this page can't render in the "other" language.
  const uiLocale = await getAppLocale();
  const t = uiLocale === "he"
    ? { title: "הגדרות חשבון", subtitle: "פרטים אישיים והעדפות שפה" }
    : { title: "Account settings", subtitle: "Personal details and language preference" };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* initialLocale uses uiLocale (cookie), NOT user.locale (DB) —
          otherwise the form body renders in the opposite language to its
          own header, which is exactly the bug the E2E pass caught. */}
      <AccountSettingsForm
        initialEmail={user.email}
        initialDisplayName={user.displayName ?? ""}
        initialLocale={uiLocale === "en" ? "en" : "he"}
      />
    </main>
  );
}
