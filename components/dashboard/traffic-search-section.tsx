import { TrendingUp, TrendingDown, Search, Globe, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  TrafficSearchSummary,
  TrafficBreakdownRow
} from "@/lib/services/traffic-search-summary-service";

// Dashboard "תנועה וחיפוש" — GA4 traffic + GSC organic, both following
// the page's selected window.
//
// Layout rewrite (2026-08-23): the old three-across metric strip put the
// change-% under the wrong column in RTL and crammed labels. Metrics are
// now full-width rows with the label leading and the value trailing, and
// the money question ("which link actually works") gets its own block of
// source / campaign / landing-page tables instead of channel groups only.

function Metric({
  label,
  value,
  sub,
  delta
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-2">
        {delta != null ? (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
              delta >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
            dir="ltr"
          >
            {delta >= 0 ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden />
            )}
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        ) : null}
        {sub ? <span className="text-[11px] text-muted-foreground">{sub}</span> : null}
        <span className="text-base font-bold tabular-nums" dir="ltr">
          {value}
        </span>
      </span>
    </div>
  );
}

function BreakdownList({
  title,
  rows,
  isHe,
  nf,
  emptyHint
}: {
  title: string;
  rows: TrafficBreakdownRow[];
  isHe: boolean;
  nf: Intl.NumberFormat;
  emptyHint?: string;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  if (rows.length === 0) {
    return emptyHint ? (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    ) : null;
  }
  // Two lines per row instead of one. Cramming label + three figures onto a
  // single line meant the label truncated to nothing in a third-width column,
  // and the figures ran together into an unreadable string.
  const top = rows.slice(0, 5);
  const maxRevenue = Math.max(...top.map((r) => r.revenue), 0);

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2.5">
        {top.map((row) => {
          const share = maxRevenue > 0 ? Math.max(row.revenue / maxRevenue, row.revenue > 0 ? 0.04 : 0) : 0;
          return (
            <div key={row.key} className="text-xs">
              {/* Sources, UTM values and URLs are Latin — isolate them so the
                  bidi algorithm can't reorder a URL's query string, but keep
                  the Hebrew metric labels below in the page's own direction. */}
              <p className="truncate font-medium text-foreground" dir="ltr" title={row.key}>
                {row.key}
              </p>
              <div className="mt-1 flex items-center gap-2">
                {/* Revenue bar — the panel exists to rank by money earned, so
                    that is what gets the visual weight. */}
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className={`block h-full rounded-full ${row.transactions > 0 ? "bg-emerald-600" : "bg-transparent"}`}
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <bdi>{nf.format(row.sessions)}</bdi> {lang("ביקורים", "sessions")}
                </span>
                {row.transactions > 0 ? (
                  <span className="shrink-0 font-semibold text-emerald-700 tabular-nums">
                    <bdi>₪{nf.format(row.revenue)}</bdi>
                    <span className="ms-1 font-normal text-muted-foreground">
                      (<bdi>{row.transactions}</bdi> {lang("רכישות", "orders")})
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] font-medium text-rose-600">
                    {lang("לא הביא רכישות", "no purchases")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrafficSearchSection({
  summary,
  isHe
}: {
  summary: TrafficSearchSummary;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const nf = new Intl.NumberFormat(isHe ? "he-IL" : "en-US");
  const ga4 = summary.ga4;
  const hasBreakdowns =
    !!ga4 && (ga4.topSources.length > 0 || ga4.topCampaigns.length > 0 || ga4.topLandingPages.length > 0);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* GA4 — traffic */}
      {ga4 ? (
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Globe className="h-4 w-4" aria-hidden />
              {lang(`תנועה לאתר · ${ga4.windowDays} ימים`, `Site traffic · ${ga4.windowDays} days`)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {lang(
                `נתונים עד ${ga4.dataThrough ?? "—"} · מקור: Google Analytics 4`,
                `Data through ${ga4.dataThrough ?? "—"} · source: Google Analytics 4`
              )}
            </p>

            <div className="mt-3">
              <Metric
                label={lang("ביקורים", "Sessions")}
                value={nf.format(ga4.sessions)}
                delta={ga4.sessionsChangePct}
              />
              <Metric
                label={lang("רכישות מהתנועה", "Purchases from traffic")}
                value={nf.format(ga4.conversions)}
                sub={ga4.conversionRate != null ? `${ga4.conversionRate}% ${lang("המרה", "CR")}` : undefined}
              />
              <Metric
                label={lang("הכנסה שנמדדה בGA4", "Revenue tracked in GA4")}
                value={`₪${nf.format(ga4.revenue)}`}
              />
            </div>

            {ga4.topChannels.length > 0 ? (
              <div className="mt-3 border-t border-border/70 pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {lang("לפי ערוץ", "By channel")}
                </p>
                <div className="mt-1.5 space-y-1">
                  {ga4.topChannels.map((c) => (
                    <div key={c.channel} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-muted-foreground" dir="ltr">
                        {c.channel}
                      </span>
                      <span className="shrink-0 tabular-nums" dir="ltr">
                        {nf.format(c.sessions)} · {c.sharePct}%
                      </span>
                    </div>
                  ))}
                </div>
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
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {lang(
                `${summary.gsc.windowDays} ימים · נתונים עד ${summary.gsc.dataThrough ?? "—"} (Google מעדכן באיחור של 2-3 ימים)`,
                `${summary.gsc.windowDays} days · data through ${summary.gsc.dataThrough ?? "—"} (Google lags 2-3 days)`
              )}
            </p>

            <div className="mt-3">
              <Metric
                label={lang("קליקים מחיפוש", "Clicks from search")}
                value={nf.format(summary.gsc.totalClicks)}
                delta={summary.gsc.clicksChangePct}
              />
              <Metric
                label={lang("חשיפות", "Impressions")}
                value={nf.format(summary.gsc.totalImpressions)}
              />
            </div>

            <div className="mt-3 border-t border-border/70 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {lang("מילות החיפוש המובילות", "Top search queries")}
              </p>
              <div className="mt-1.5 space-y-1">
                {summary.gsc.topQueries.map((q) => (
                  <div key={q.query} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-medium" dir="auto">
                      {q.query}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                      {nf.format(q.clicks)} {lang("קליקים", "clicks")} · {lang("מיקום", "pos")} #{q.position}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Which links actually work — the GA4 breakdowns */}
      {ga4 ? (
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Link2 className="h-4 w-4" aria-hidden />
                {lang("אילו קישורים באמת עובדים", "Which links actually work")}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {lang(
                  "מקור התנועה, קמפיין ודף הנחיתה — עם הרכישות שכל אחד הביא בפועל, לא רק ביקורים.",
                  "Traffic source, campaign and landing page — with the purchases each actually produced, not just visits."
                )}
              </p>
            </div>

            {/* Three columns only from lg. At md each column was ~1/3 of the
                card, which left no room for a landing-page URL beside its
                figures — every label truncated to a few characters. */}
            {hasBreakdowns ? (
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <BreakdownList
                  title={lang("מקורות (source / medium)", "Sources (source / medium)")}
                  rows={ga4.topSources}
                  isHe={isHe}
                  nf={nf}
                />
                <BreakdownList
                  title={lang("קמפיינים (UTM)", "Campaigns (UTM)")}
                  rows={ga4.topCampaigns}
                  isHe={isHe}
                  nf={nf}
                  emptyHint={lang(
                    "לא נמצאו קמפיינים מתויגים. הוסיפו utm_campaign לקישורים בביו, בסטוריז ובניוזלטר כדי לראות כאן מה עובד.",
                    "No tagged campaigns found. Add utm_campaign to your bio, story and newsletter links to see what works here."
                  )}
                />
                <BreakdownList
                  title={lang("דפי נחיתה", "Landing pages")}
                  rows={ga4.topLandingPages}
                  isHe={isHe}
                  nf={nf}
                />
              </div>
            ) : (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {lang(
                  "פירוט הקישורים ייאסף בסנכרון GA4 הבא. אפשר להריץ אותו מיד: הגדרות ← Google ← Sync now.",
                  "Link-level detail is collected on the next GA4 sync. Run it now: Settings → Google → Sync now."
                )}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
