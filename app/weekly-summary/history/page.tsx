import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAppLocale } from "@/lib/i18n";
import { listWeeklyReportsForStore } from "@/lib/services/weekly-report-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";

export const dynamic = "force-dynamic";

export default async function WeeklyReportsHistoryPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const [chrome, storeId] = await Promise.all([getAppChromeData(), resolveActiveStoreId()]);

  const weekly = storeId ? await listWeeklyReportsForStore(storeId, { kind: "weekly", take: 20 }) : [];
  const monthly = storeId ? await listWeeklyReportsForStore(storeId, { kind: "monthly", take: 12 }) : [];

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(isHe ? "he-IL" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(d);

  const heading = isHe
    ? {
        eyebrow: "סיכום שבועי",
        title: "היסטוריית דוחות",
        description:
          "כל הדוחות האוטומטיים שנשלחו לנמענים — שבועיים (ימי ראשון 09:00) וחודשיים (ב1 לכל חודש)."
      }
    : {
        eyebrow: "Weekly summary",
        title: "Report history",
        description: "All auto-generated reports sent to recipients — weekly (Sun 09:00) and monthly (1st of month)."
      };

  const t = isHe
    ? {
        weekly: "דוחות שבועיים",
        monthly: "דוחות חודשיים",
        empty: "אין דוחות עדיין. הדוח הראשון ייווצר אוטומטית ביום ראשון הקרוב בשעה 09:00 בשעון ירושלים.",
        period: "תקופה",
        generated: "נוצר",
        sent: "נשלח",
        notSent: "לא נשלח",
        download: "הורדת PDF"
      }
    : {
        weekly: "Weekly reports",
        monthly: "Monthly reports",
        empty: "No reports yet. The first one will be generated this Sunday at 09:00 Asia/Jerusalem.",
        period: "Period",
        generated: "Generated",
        sent: "Sent",
        notSent: "Not sent",
        download: "Download PDF"
      };

  const renderTable = (rows: typeof weekly) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-start text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-2">{t.period}</th>
          <th className="py-2">{t.generated}</th>
          <th className="py-2">{t.sent}</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border/60">
            <td className="py-2 font-medium">
              {fmtDate(r.periodStart)} — {fmtDate(r.periodEnd)}
            </td>
            <td className="py-2 text-muted-foreground">{fmtDate(r.generatedAt)}</td>
            <td className="py-2 text-xs">
              {r.sentAt ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  {fmtDate(r.sentAt)}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                  {t.notSent}
                </span>
              )}
            </td>
            <td className="py-2 text-end">
              <a
                href={`/api/weekly-summary/history/${r.id}/pdf`}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              >
                {t.download}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead eyebrow={heading.eyebrow} title={heading.title} description={heading.description} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.weekly}</CardTitle>
          </CardHeader>
          <CardContent>
            {weekly.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            ) : (
              renderTable(weekly)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t.monthly}</CardTitle>
          </CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            ) : (
              renderTable(monthly)
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
