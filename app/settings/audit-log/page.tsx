import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { History, User as UserIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";

// Audit log viewer. Owner/admin only — members see "permission required".
// Read-only — log is append-only (no edit/delete).

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/settings/audit-log" as never);
  if (!auth.orgId) redirect("/");

  const chrome = await getAppChromeData();
  const isAdmin = auth.role === "owner" || auth.role === "admin";
  // Cookie is the source of truth for UI language (auth.locale drives
  // emails); reading it here keeps this page in step with the app shell.
  const locale = (await getAppLocale()) === "he" ? "he" : "en";
  const t = locale === "he"
    ? {
        title: "יומן ביקורת",
        subtitle: "פעולות רגישות בארגון — הזמנות צוות, שינויי הרשאות, עדכוני הגדרות וחיוב",
        denied: "רק בעלים ומנהלים יכולים לצפות ביומן הביקורת.",
        emptyTitle: "אין עדיין פעולות רגישות לתיעוד.",
        emptyBody: "כשמישהו יזמין חבר צוות, ישנה הרשאה, יעדכן הגדרות ארגון או יבצע שינוי חיוב — זה יופיע כאן.",
        system: "מערכת"
      }
    : {
        title: "Audit log",
        subtitle: "Security-relevant org actions — team invites, role changes, settings & billing updates",
        denied: "Only owners and admins can view the audit log.",
        emptyTitle: "No security-relevant actions logged yet.",
        emptyBody: "When someone invites a teammate, changes a role, updates organization settings, or makes a billing change, it will show up here.",
        system: "System"
      };

  if (!isAdmin) {
    return (
      <AppShell store={chrome.store} controls={chrome.controls}>
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t.denied}
          </p>
        </div>
      </AppShell>
    );
  }

  const db = getDb();
  const events = (await db.auditEvent.findMany({
    where: { orgId: auth.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      eventType: true,
      description: true,
      createdAt: true,
      actor: { select: { email: true, displayName: true } }
    }
  })) as Array<{
    id: string;
    eventType: string;
    description: string;
    createdAt: Date;
    actor: { email: string; displayName: string | null } | null;
  }>;

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
    <div dir={locale === "he" ? "rtl" : "ltr"} className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          <History className="me-2 inline h-5 w-5 text-muted-foreground" aria-hidden />
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-foreground">{t.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{t.emptyBody}</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const actor = event.actor?.displayName ?? event.actor?.email ?? t.system;
            return (
              <li key={event.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {event.eventType}
                  </span>
                  <time className="text-[11px] text-muted-foreground tabular-nums">
                    {new Date(event.createdAt).toLocaleString(locale === "he" ? "he-IL" : "en-US")}
                  </time>
                </div>
                <p className="mt-1.5 text-sm text-foreground">{event.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  <UserIcon className="me-1 inline h-3 w-3" aria-hidden />
                  {actor}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
    </AppShell>
  );
}
