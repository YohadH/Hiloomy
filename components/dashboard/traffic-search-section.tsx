import { TrendingUp, TrendingDown, Search, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TrafficSearchSummary } from "@/lib/services/traffic-search-summary-service";

// Dashboard "תנועה וחיפוש" section — GA4 traffic (30d vs prior 30d) and
// GSC top organic queries. Server-rendered, presentational only; the page
// hides the whole section when the summary is null.

export function TrafficSearchSection({
  summary,
  isHe
}: {
  summary: TrafficSearchSummary;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const nf = new Intl.NumberFormat(isHe ? "he-IL" : "en-US");

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* GA4 — traffic */}
      {summary.ga4 ? (
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Globe className="h-4 w-4" aria-hidden />
              {lang("תנועה לאתר (30 ימים)", "Site traffic (30 days)")}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{lang("ביקורים", "Sessions")}</p>
                <p className="text-lg font-bold tabular-nums" dir="ltr">
                  {nf.format(summary.ga4.sessions)}
                </p>
                {summary.ga4.sessionsChangePct !== null ? (
                  <p
                    className={`flex items-center gap-1 text-xs font-semibold ${
                      summary.ga4.sessionsChangePct >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {summary.ga4.sessionsChangePct >= 0 ? (
                      <TrendingUp className="h-3 w-3" aria-hidden />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden />
                    )}
                    <span dir="ltr">{summary.ga4.sessionsChangePct}%</span>
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{lang("שיעור המרה", "Conversion rate")}</p>
                <p className="text-lg font-bold tabular-nums" dir="ltr">
                  {summary.ga4.conversionRate !== null ? `${summary.ga4.conversionRate}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{lang("הכנסה (GA4)", "Revenue (GA4)")}</p>
                <p className="text-lg font-bold tabular-nums" dir="ltr">
                  ₪{nf.format(summary.ga4.revenue)}
                </p>
              </div>
            </div>
            {summary.ga4.topChannels.length > 0 ? (
              <div className="mt-3 space-y-1 border-t border-border/70 pt-2">
                {summary.ga4.topChannels.map((c) => (
                  <div key={c.channel} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground" dir="ltr">
                      {c.channel}
                    </span>
                    <span className="tabular-nums" dir="ltr">
                      {nf.format(c.sessions)} · {c.sharePct}%
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* GSC — organic search */}
      {summary.gsc ? (
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Search className="h-4 w-4" aria-hidden />
              {lang("חיפוש אורגני (Google)", "Organic search (Google)")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {nf.format(summary.gsc.totalClicks)} {lang("קליקים", "clicks")} ·{" "}
              {nf.format(summary.gsc.totalImpressions)} {lang("חשיפות", "impressions")}
              {summary.gsc.clicksChangePct != null ? (
                <span
                  className={
                    summary.gsc.clicksChangePct >= 0 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"
                  }
                >
                  {" "}
                  ({summary.gsc.clicksChangePct >= 0 ? "+" : ""}
                  {summary.gsc.clicksChangePct}%)
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {lang(
                `${summary.gsc.windowDays} ימים אחרונים · נתונים עד ${summary.gsc.dataThrough ?? "—"} (Google מעדכן באיחור של 2-3 ימים)`,
                `Last ${summary.gsc.windowDays} days · data through ${summary.gsc.dataThrough ?? "—"} (Google lags 2-3 days)`
              )}
            </p>
            <div className="mt-3 space-y-2">
              {summary.gsc.topQueries.map((q) => (
                <div key={q.query} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium" dir="auto">
                    {q.query}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {nf.format(q.clicks)} {lang("קליקים", "clicks")} · #{q.position}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
