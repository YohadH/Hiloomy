import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import { getDb } from "@/lib/server/db";
import { History, User as UserIcon } from "lucide-react";

// Audit log viewer. Owner/admin only — members see "permission required".
// Read-only — log is append-only (no edit/delete).

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const auth = await getAuthContext();
  if (!auth.userId) redirect("/signin?next=/settings/audit-log" as never);
  if (!auth.orgId) redirect("/");

  const isAdmin = auth.role === "owner" || auth.role === "admin";
  const locale = auth.locale === "he" ? "he" : "en";
  const t = locale === "he"
    ? {
        title: "יומן ביקורת",
        subtitle: "כל הפעולות הקריטיות בארגון — 100 הרשומות האחרונות",
        denied: "רק בעלים ומנהלים יכולים לצפות ביומן הביקורת.",
        empty: "אין רשומות עדיין.",
        system: "מערכת"
      }
    : {
        title: "Audit log",
        subtitle: "All security-relevant org actions, last 100 entries",
        denied: "Only owners and admins can view the audit log.",
        empty: "No entries yet.",
        system: "System"
      };

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t.denied}
        </p>
      </main>
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
    <main dir={locale === "he" ? "rtl" : "ltr"} className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          <History className="me-2 inline h-5 w-5 text-muted-foreground" aria-hidden />
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {events.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground text-center">
          {t.empty}
        </p>
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
    </main>
  );
}
