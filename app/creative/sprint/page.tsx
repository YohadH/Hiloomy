// Sprint list page — shows every sprint on the active store with a
// status snapshot and quick links into the detail view. "New sprint"
// CTA opens the launcher form.
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { Button } from "@/components/ui/button";
import { CreativeTabs } from "@/components/creative/creative-tabs";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { listSprints } from "@/lib/services/creative-sprint/sprint-service";

export const dynamic = "force-dynamic";

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: string): string {
  if (status === "complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "running" || status === "measuring") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "cancelled" || status === "failed") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "awaiting_brief_approval" || status === "awaiting_asset_approval") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default async function CreativeSprintsPage() {
  const [chrome, locale] = await Promise.all([getAppChromeData(), getAppLocale()]);
  const storeId = await resolveActiveStoreId();
  const sprints = storeId ? await listSprints(storeId) : [];

  const heading =
    locale === "he"
      ? {
          eyebrow: "Creative Sprint",
          title: "ספרינטים של 100 מודעות",
          description:
            "ייצרו 100 קונספטים שונים, פרסמו בMeta עם תקציב קטן לכל מודעה, ותנו למערכת לפסול את החלשות אחרי 6/24/72 שעות ולהשאיר רק את המנצחות."
        }
      : {
          eyebrow: "Creative Sprint",
          title: "100-ad creative sprints",
          description:
            "Generate 100 distinct ad concepts, publish each to Meta with a tiny daily budget, then let the cascade evaluator kill the losers at +6h / +24h / +72h and keep only the winners."
        };

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-start justify-between gap-4">
          <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/creative/sprint/new" as any}>
            <Button>{locale === "he" ? "ספרינט חדש" : "New sprint"}</Button>
          </Link>
        </div>
        <CreativeTabs locale={locale} />

        {sprints.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {locale === "he"
                ? "עדיין לא יצרתם ספרינטים. לחצו על 'ספרינט חדש' למעלה כדי להתחיל."
                : "No sprints yet. Click 'New sprint' above to start."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{locale === "he" ? "שם" : "Name"}</th>
                  <th className="px-4 py-3 text-start font-semibold">{locale === "he" ? "סטטוס" : "Status"}</th>
                  <th className="px-4 py-3 text-start font-semibold">{locale === "he" ? "שלב" : "Stage"}</th>
                  <th className="px-4 py-3 text-end font-semibold">{locale === "he" ? "פעילות" : "Alive"}</th>
                  <th className="px-4 py-3 text-end font-semibold">{locale === "he" ? "נפסלו" : "Killed"}</th>
                  <th className="px-4 py-3 text-end font-semibold">{locale === "he" ? "מנצחות" : "Winners"}</th>
                  <th className="px-4 py-3 text-start font-semibold">{locale === "he" ? "פורסם" : "Published"}</th>
                  <th className="px-4 py-3 text-start font-semibold">{locale === "he" ? "נוצר" : "Created"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sprints.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Link href={`/creative/sprint/${s.id}` as any} className="font-medium text-foreground hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{s.currentStage}/3</td>
                    <td className="px-4 py-3 text-end tabular-nums text-sky-700">{s.aliveCount}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-rose-600">{s.killedCount}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-emerald-700">{s.winnerCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.publishedAt ? formatDate(s.publishedAt, locale) : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(s.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
