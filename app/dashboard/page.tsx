import { AppShell } from "@/components/layout/app-shell";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { FirstSyncPending } from "@/components/onboarding/first-sync-pending";
import { getOnboardingStatus } from "@/lib/onboarding/onboarding-status";
import { getAuthContext, listUserOrgsForSwitcher } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHead } from "@/components/dashboard-v2/section-head";
import { KpiTile } from "@/components/dashboard-v2/kpi-tile";
import { StyledTable } from "@/components/dashboard-v2/styled-table";
import { RevenueChartV2 } from "@/components/dashboard-v2/revenue-chart-v2";
import { EnrichedRevenueChart } from "@/components/dashboard-v2/enriched-revenue-chart";
import { getDailyTrendContext } from "@/lib/services/daily-trend-context-service";
import { StockBadge } from "@/components/dashboard-v2/stock-badge";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import {
  CommandCenterAlertCard,
  type CommandCenterAlert
} from "@/components/command-center/command-center-alert-card";
import { LeakScanHero } from "@/components/command-center/leak-scan-hero";
import { buildLeakScan } from "@/lib/services/leak-scan-service";
import { AlertOctagon, TrendingUp, Wallet } from "lucide-react";
import { getOverviewPayload, getAppChromeData } from "@/lib/services/analytics-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import { buildStockoutImminentReport } from "@/lib/services/stockout-imminent-service";
import { buildRoasCollapseReport } from "@/lib/services/roas-collapse-service";
import { upsertCampaignFunnelAlerts } from "@/lib/services/campaign-funnel-alert-service";
import { upsertSilentProductAlerts } from "@/lib/services/silent-product-alert-service";
import { getCompetitorCrawlSummary, upsertCompetitorResponseAlerts } from "@/lib/services/competitor-intel-service";
import { getCompetitorBrief } from "@/lib/services/competitor-brief-service";
import { CompetitorBriefSection } from "@/components/command-center/competitor-brief-section";
import { TrafficSearchSection } from "@/components/dashboard/traffic-search-section";
import { MetaCampaignsSection } from "@/components/dashboard/meta-campaigns-section";
import { MetaCampaignsInsight } from "@/components/dashboard/meta-campaigns-insight";
import { getMetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import { buildTrafficSearchSummary } from "@/lib/services/traffic-search-summary-service";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { buildSetupHealth } from "@/lib/services/setup-health-service";
import { SetupHealthBadge } from "@/components/setup-health/setup-health-badge";
import {
  measureOutcomesForResolvedAlerts,
  getRecentlyResolvedWithOutcomes,
  type ResolvedAlertWithOutcome
} from "@/lib/services/alert-outcome-service";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";
import { heCountPhrase } from "@/lib/i18n/he-plural";
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getDb } from "@/lib/server/db";

/** Priority badge labels and colors, matching Hebrew UX convention. */
type PriorityLevel = "critical" | "important" | "low";

function PriorityBadge({ level, isHe }: { level: PriorityLevel; isHe: boolean }) {
  const styles: Record<PriorityLevel, string> = {
    critical: "bg-red-100 text-red-800 border-red-200",
    important: "bg-amber-100 text-amber-800 border-amber-200",
    low: "bg-slate-100 text-slate-600 border-slate-200"
  };
  const labels: Record<PriorityLevel, { he: string; en: string }> = {
    critical: { he: "קריטי", en: "Critical" },
    important: { he: "חשוב", en: "Important" },
    low: { he: "נמוך", en: "Low" }
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[level]}`}
    >
      {isHe ? labels[level].he : labels[level].en}
    </span>
  );
}

// Founder Command Center — the new homepage. Lead with what needs action,
// then show money snapshot, then push trend + top products below the fold
// as context. Replaces the old "step 1 → step 6" dashboard-of-everything.
//
// Design: alerts FIRST, money snapshot SECOND, action drawer THIRD,
// historical context LAST. The founder's first 10 seconds should answer
// "what do I need to do today" — everything else is supporting material.

export default async function CommandCenterPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  // Onboarding gate — if this is a fresh user with no connected brands,
  // render the wizard instead of the empty dashboard. Wizard takes them
  // through Shopify OAuth → page reload → normal dashboard.
  const onboarding = await getOnboardingStatus();
  if (onboarding.needsOnboarding) {
    const auth = await getAuthContext();
    // The wizard has no top bar, so a user whose active-org cookie points at
    // an EMPTY org (every signup creates one) but who belongs to another org
    // that already has a connected store was stuck here with no way out
    // (Take a Nap's owners, 1 Sep 2026). Hand the wizard those orgs so it
    // can offer a one-click switch instead of "connect your first store".
    const connectedOrgs = (await listUserOrgsForSwitcher().catch(() => [])).filter(
      (o) => !o.isActive && o.storeCount > 0
    );
    return (
      <main className="min-h-screen bg-gradient-to-br from-green-50/30 via-background to-emerald-50/30">
        <OnboardingWizard
          email={auth.email ?? ""}
          pendingShopDomain={onboarding.pendingShopDomain}
          locale={isHe ? "he" : "en"}
          connectedOrgs={connectedOrgs}
        />
      </main>
    );
  }

  const [overview, chrome, storeId, selection] = await Promise.all([
    getOverviewPayload(),
    getAppChromeData(),
    resolveActiveStoreId(),
    // The selection carries the REAL window instants (store-timezone day
    // boundaries). Re-parsing chrome.controls' display strings as bare UTC
    // shifted every section below by 3 hours vs the KPI grid — which is how
    // one dashboard showed two different רווח תרומה numbers (F-010).
    getReportingDateRangeSelection(isHe ? "he" : "en")
  ]);
  const windowRange = { start: selection.start, end: selection.end };

  // Second-stage onboarding: store is connected but the FIRST sync hasn't
  // completed yet. Gate on actual sync state, never on revenue — a store
  // with zero sales in the selected window (fresh dev store, quiet week)
  // must still get its real dashboard, otherwise it looks stuck forever
  // on "pulling your data" even though the sync finished fine.
  if (storeId && onboarding.connectedBrandCount > 0) {
    const connection = (await getDb()
      .shopifyConnection.findUnique({
        where: { storeId },
        select: { lastSyncAt: true, syncStatus: true }
      })
      .catch(() => null)) as { lastSyncAt: Date | null; syncStatus: string } | null;
    const neverSynced = !!connection && connection.lastSyncAt === null;
    if (neverSynced) {
      return (
        <AppShell store={chrome.store} controls={chrome.controls}>
          <FirstSyncPending storeId={storeId} locale={isHe ? "he" : "en"} />
        </AppShell>
      );
    }
  }

  // Run forward-looking detection engines BEFORE reading the alerts table
  // so the page reflects fresh state. These are idempotent (upsert by
  // fingerprint) and cheap — a single groupBy + product fetch each.
  // ROAS-collapse uses the report's date window so it tracks the same
  // period the founder is currently looking at.
  //
  // ALSO measure outcomes for previously-resolved alerts so the closed
  // loop has fresh data ("you did X last week → here's what happened").
  if (storeId) {
    const roasWindow = windowRange;
    await Promise.all([
      buildStockoutImminentReport({ storeId }).catch((e) => {
        console.error("[command-center] stockout engine failed:", e);
        return null;
      }),
      buildRoasCollapseReport({
        storeId,
        start: roasWindow.start,
        end: roasWindow.end
      }).catch((e) => {
        console.error("[command-center] roas engine failed:", e);
        return null;
      }),
      // Campaign × commerce joins (F-013/F-004): funnel disconnects and
      // silent products — cheap groupBys, refreshed on load like the rest.
      upsertCampaignFunnelAlerts(storeId).catch((e) => {
        console.error("[command-center] campaign-funnel engine failed:", e);
        return null;
      }),
      upsertSilentProductAlerts(storeId).catch((e) => {
        console.error("[command-center] silent-product engine failed:", e);
        return null;
      }),
      measureOutcomesForResolvedAlerts({ storeId }).catch((e) => {
        console.error("[command-center] outcome measurement failed:", e);
        return null;
      }),
      // Competitor moves (opened promo / deepened discount) → approvable
      // alerts. Fixed last-7-days window — the competitor diff is weekly
      // by nature, independent of the dashboard's selected date range.
      upsertCompetitorResponseAlerts({
        storeId,
        start: new Date(Date.now() - 7 * 86_400_000),
        end: new Date()
      }).catch((e) => {
        console.error("[command-center] competitor alert engine failed:", e);
        return null;
      })
    ]);
  }

  // Read closed-loop outcomes (last 14 days of resolved alerts that have
  // been measured). Surfaces "you did X → result Y" on the Command Center.
  const closedLoop = storeId
    ? await getRecentlyResolvedWithOutcomes({ storeId, lookbackDays: 14, limit: 8 }).catch(() => [])
    : [];

  // Setup health — drives the SaaS "Data confidence" badge next to the
  // headline. Built once, used in two surfaces.
  const setupHealth = storeId
    ? await buildSetupHealth({ storeId }).catch(() => null)
    : null;

  // Leak Scan — the product's headline "₪ you're leaking" number. Follows
  // the SELECTED date range (windowRange) so its money-window legs — notably
  // the roas_burn campaign set — match the Meta campaigns section below,
  // instead of a separate fixed 30-day window (the "5 vs 4 campaigns"
  // mismatch the owner flagged). Silent-product/affiliate legs keep their
  // own longer detection horizons.
  const leakScan = storeId
    ? await buildLeakScan({ storeId, start: windowRange.start, end: windowRange.end }).catch(() => null)
    : null;

  // Competitor brief — intel snapshot + BI-prescribed actions (today/this
  // week). storeId lets the generator feed LIVE store facts (product movers,
  // campaign ROAS, open alerts) into the prompt so actions name real things.
  // Cached 24h; falls back to the intel's own action list when the BI agent
  // is unreachable, so the section always renders.
  const competitorBrief = await getCompetitorBrief(storeId ?? undefined, isHe ? "he" : "en").catch(() => null);
  // The brief is null until the FIRST competitor crawl lands (apply a date
  // range, or the 2h cron). Hiding the whole section then made "I added
  // competitors, where's the banner?" a support question (Take a Nap,
  // 1 Sep 2026) — count the active set so we can say "pending" instead.
  const activeCompetitorCount =
    !competitorBrief && storeId
      ? await getDb()
          .competitor.count({ where: { storeId, status: "active" } })
          .catch(() => 0)
      : 0;
  // What the last crawl actually found — "provider has no data yet for these
  // domains" is a different message from "crawl hasn't run".
  const competitorCrawl =
    activeCompetitorCount > 0 && storeId ? await getCompetitorCrawlSummary(storeId).catch(() => null) : null;

  // Traffic (GA4) + organic search (GSC) summary — follows the page's
  // selected date window like every other section. Null when neither
  // source has synced data — the section hides entirely.
  const trafficSearch = storeId
    ? await buildTrafficSearchSummary(storeId, windowRange).catch(() => null)
    : null;

  // Meta campaigns overview — same selected window. Null (section hides)
  // when no campaign insights are synced. The BI insight card under it
  // fetches lazily client-side so the page never waits on an LLM.
  const metaCampaigns = storeId
    ? await getMetaCampaignsOverview(storeId, windowRange).catch(() => null)
    : null;

  // Contribution margin for the same window the controls have selected.
  // This is the "money snapshot" anchor — explicit accuracy label, no
  // fake precision.
  const contributionMargin = storeId
    ? await buildContributionMargin({
        storeId,
        start: windowRange.start,
        end: windowRange.end
      }).catch(() => null)
    : null;

  // Per-day context for the trend chart — top products, active Meta
  // campaigns, IG posts, discounts redeemed. Powers the rich hover
  // tooltip + event markers so the operator can answer "WHY did
  // revenue move on this day?".
  const trendContext = storeId
    ? await getDailyTrendContext(storeId, windowRange.start, windowRange.end).catch(() => ({}))
    : {};

  // Pull open alerts from the normalized table. Critical/high get hero
  // placement; medium/low go below in a compact list.
  const openAlerts = storeId
    ? ((await listOpenAlerts({
        storeId,
        limit: 50
      })) as unknown as Array<{
        id: string;
        type: string;
        severity: "critical" | "high" | "medium" | "low";
        source: string;
        title: string;
        description: string | null;
        recommendedAction: string | null;
        metricName: string | null;
        currentValue: { toString(): string } | null;
        previousValue: { toString(): string } | null;
        relatedEntityType: string | null;
        relatedEntityId: string | null;
        payloadJson: Record<string, unknown> | null;
        createdAt: Date;
      }>)
    : [];

  const alertCards: CommandCenterAlert[] = openAlerts.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    source: a.source,
    title: a.title,
    description: a.description ?? "",
    recommendedAction: a.recommendedAction ?? "",
    metricName: a.metricName,
    currentValue: a.currentValue ? a.currentValue.toString() : null,
    previousValue: a.previousValue ? a.previousValue.toString() : null,
    relatedEntityType: a.relatedEntityType,
    relatedEntityId: a.relatedEntityId,
    payloadJson: a.payloadJson,
    createdAt: a.createdAt.toISOString()
  }));

  const criticalAndHigh = alertCards.filter(
    (a) => a.severity === "critical" || a.severity === "high"
  );
  const mediumAndLow = alertCards.filter(
    (a) => a.severity === "medium" || a.severity === "low"
  );

  const topProducts = overview.productPerformance.slice(0, 10);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        {/* ── LEAK SCAN — the product's headline number, always first ── */}
        {leakScan ? (
          <LeakScanHero scan={leakScan} currency={overview.store.currency} isHe={isHe} />
        ) : null}

        {/* ── HEADLINE — what's on fire right now + data confidence ───── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <CommandCenterHeadline
              isHe={isHe}
              criticalCount={alertCards.filter((a) => a.severity === "critical").length}
              highCount={alertCards.filter((a) => a.severity === "high").length}
              mediumCount={alertCards.filter((a) => a.severity === "medium").length}
              totalOpen={alertCards.length}
            />
          </div>
          {setupHealth ? <SetupHealthBadge report={setupHealth} locale={locale} /> : null}
        </div>

        {/* ── SECTION — Money snapshot (הכסף) — leads, per CEO order ──── */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={lang("הכסף", "The money")}
            title={lang("מצב פיננסי", "Money snapshot")}
            hint={lang(
              "המספרים המהותיים של החלון הנוכחי. שישה מדדים שעונים על השאלה 'האם החנות בריאה?'",
              "The vitals for this window. Six metrics that answer 'is the store healthy?'"
            )}
          />
          {contributionMargin ? (
            <ContributionMarginPanel
              report={contributionMargin}
              currency={overview.store.currency}
              isHe={isHe}
            />
          ) : null}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {overview.kpis.map((kpi) => {
              const label = kpi.label.toLowerCase();
              // Match the Shopify-parity labels (סך מכירות / Total sales) plus
              // the legacy revenue wordings so drill-links survive copy changes.
              const isRevenue =
                label.includes("revenue") ||
                label.includes("total sales") ||
                label.includes("מכירות") ||
                label.includes("הכנסות") ||
                label.includes("הכנסה");
              const isProfit =
                label.includes("profit") ||
                label.includes("רווח");
              const drillHref = isRevenue
                ? "/sales-summary"
                : isProfit
                  ? "/profit"
                  : undefined;
              return (
                <KpiTile
                  key={kpi.label}
                  kpi={kpi}
                  currency={overview.store.currency}
                  href={drillHref}
                  locale={locale}
                />
              );
            })}
          </div>
        </section>

        {/* ── SECTION — Trend chart (מגמה) ────────────────────────────── */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={lang("מגמה", "Trend")}
            title={lang("הכנסות ורווח יומיים", "Daily revenue & estimated profit")}
            hint={lang(
              // No color names here — they rotted once already (the caption
              // said indigo/blue over a green/orange chart). The in-card
              // legend right under this carries the colors.
              "שני קווים: הכנסה ברוטו ורווח מוערך. הפער ביניהם הוא המרווח — המקרא שעל הגרף מראה מי זה מי.",
              "Two lines: gross revenue and estimated profit. The gap between them is your margin — the chart's legend shows which is which."
            )}
          />
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {lang("הכנסות מול רווח מוערך", "Revenue vs estimated profit")}
                </CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#16A34A" }} />
                    {lang("הכנסה", "Revenue")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F97316" }} />
                    {lang("רווח", "Profit")}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <EnrichedRevenueChart
                data={overview.dailyMetrics}
                context={trendContext}
                currency={overview.store.currency}
                locale={isHe ? "he" : "en"}
              />
            </CardContent>
          </Card>
        </section>

        {/* ── SECTION — Competitors (מתחרים): intel + prescribed response ─ */}
        {competitorBrief ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={lang("מתחרים", "Competitors")}
              title={lang("מה המתחרים עושים — ואיך להגיב", "What competitors are doing — and the response")}
              hint={lang(
                "תמונת מודיעין עדכנית ופעולות מומלצות להיום ולשבוע.",
                "Current intel snapshot plus prescribed actions for today and this week."
              )}
            />
            <CompetitorBriefSection brief={competitorBrief} isHe={isHe} />
          </section>
        ) : activeCompetitorCount > 0 ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={lang("מתחרים", "Competitors")}
              title={lang("מה המתחרים עושים — ואיך להגיב", "What competitors are doing — and the response")}
            />
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
              {competitorCrawl ? (
                <>
                  <p>
                    {isHe
                      ? `${activeCompetitorCount} מתחרים במעקב. הסריקה האחרונה (${new Date(competitorCrawl.at).toLocaleString("he-IL")}) החזירה נתונים עבור ${competitorCrawl.snapshotsUpserted} מתוכם.`
                      : `${activeCompetitorCount} competitors tracked. The last crawl (${new Date(competitorCrawl.at).toLocaleString("en-GB")}) returned data for ${competitorCrawl.snapshotsUpserted} of them.`}
                  </p>
                  {competitorCrawl.skippedNoData > 0 ? (
                    <p className="mt-1.5">
                      {isHe
                        ? `ספק המודיעין עדיין לא מחזיק נתונים על: ${competitorCrawl.outcomes.filter((o) => o.result === "no_data").map((o) => o.domain).join(", ")}. זה מתמלא תוך ימים אחרי ההוספה — הסנכרון האוטומטי ימשיך לבדוק כל שעתיים.`
                        : `The intel provider has no data yet for: ${competitorCrawl.outcomes.filter((o) => o.result === "no_data").map((o) => o.domain).join(", ")}. It fills within days of adding a domain — the automatic sync keeps checking every 2 hours.`}
                    </p>
                  ) : null}
                </>
              ) : isHe ? (
                `${activeCompetitorCount} מתחרים במעקב — הסריקה הראשונה עדיין לא רצה. החילו טווח תאריכים (למעלה) כדי להריץ אותה עכשיו, או המתינו לסנכרון האוטומטי (עד שעתיים). התובנות והמלצות הפעולה יופיעו כאן אחרי הסריקה.`
              ) : (
                `${activeCompetitorCount} competitors tracked — the first crawl hasn't run yet. Apply a date range (top of the page) to run it now, or wait for the automatic sync (up to 2 hours). Intel and prescribed actions appear here once it lands.`
              )}
            </div>
          </section>
        ) : null}

        {/* ── SECTION — Traffic & organic search (תנועה וחיפוש) ────────── */}
        {trafficSearch ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={lang("תנועה וחיפוש", "Traffic & search")}
              title={lang("מי מגיע לאתר — ומאיפה", "Who reaches the site — and from where")}
              hint={lang(
                "ביקורים והמרות מGoogle Analytics, ושאילתות החיפוש שמביאות קליקים מGoogle.",
                "Sessions and conversions from Google Analytics, and the search queries earning clicks on Google."
              )}
            />
            <TrafficSearchSection summary={trafficSearch} isHe={isHe} />
          </section>
        ) : null}

        {/* ── SECTION — Meta campaigns (קמפיינים) ──────────────────────── */}
        {metaCampaigns ? (
          <section id="meta-campaigns" className="scroll-mt-24 space-y-3">
            <SectionHead
              eyebrow={lang("קמפיינים", "Campaigns")}
              title={lang("הקמפיינים שרצים בMeta — ומה הם מחזירים", "The Meta campaigns running — and what they return")}
              hint={lang(
                "הוצאה, רכישות וROAS לכל קמפיין בטווח הנבחר, עם סינון — ותובנת סוכן מתחת.",
                "Spend, purchases, and ROAS per campaign for the selected window, with filters — and an agent insight below."
              )}
            />
            <MetaCampaignsSection overview={metaCampaigns} isHe={isHe} />
            <MetaCampaignsInsight isHe={isHe} />
          </section>
        ) : null}

        {/* ── SECTION — Critical + High alerts (התראות גבוהות) ────────── */}
        {criticalAndHigh.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SectionHead
                eyebrow={lang("דורש פעולה היום", "Needs action today")}
                title={lang("התראות בעדיפות גבוהה", "High-priority alerts")}
                hint={lang("כל כרטיס כולל פעולה מומלצת.", "Each card has a suggested action.")}
              />
              <PriorityBadge level="critical" isHe={isHe} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {criticalAndHigh.map((alert) => (
                <CommandCenterAlertCard key={alert.id} alert={alert} locale={locale} />
              ))}
            </div>
          </section>
        ) : null}

        {/* ── SECTION — Medium/Low alerts (התראות) ────────────────────── */}
        {/* Collapsed by default (F-016): this is the NOT-urgent tier, but
            expanded it took more space than the critical section above —
            inverting the priority the split is meant to communicate. */}
        {mediumAndLow.length > 0 ? (
          <details className="group rounded-2xl border border-border bg-card/40 open:bg-card">
            <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 hover:bg-muted/40">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
                <span className="text-sm font-semibold text-foreground">
                  {lang(`התראות לבדיקה (${mediumAndLow.length})`, `Alerts to review (${mediumAndLow.length})`)}
                </span>
                <PriorityBadge level="important" isHe={isHe} />
                <span className="text-xs font-normal text-muted-foreground">
                  {lang("לא דחוף — שווה לבדוק במהלך השבוע. לחצו לפתיחה.", "Not urgent — check during weekly planning. Click to expand.")}
                </span>
              </span>
            </summary>
            <div className="grid gap-3 border-t border-border px-5 py-4 lg:grid-cols-2">
              {mediumAndLow.map((alert) => (
                <CommandCenterAlertCard key={alert.id} alert={alert} locale={locale} />
              ))}
            </div>
          </details>
        ) : null}

        {/* ── CLOSED LOOP — "you did X last week → result Y" ──────────── */}
        {closedLoop.length > 0 ? (
          <ClosedLoopSection items={closedLoop} isHe={isHe} />
        ) : null}

        {/* ── SECTION 5 — Products carrying the store (below-fold detail) ─
            Memo initiative 3.1 — the Command Center's primary scan is
            Signals · Money · Trend. Everything else, including the top
            products table, moves behind progressive disclosure so it
            doesn't compete for the founder's first 10 seconds. Native
            <details> works without JS and remembers its own open state
            per session. */}
        <details className="group rounded-2xl border border-border bg-card/40 open:bg-card">
          <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-semibold text-foreground hover:bg-muted/40">
            <span className="inline-flex items-center gap-2">
              <span className="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
              {lang("מוצרים מובילים ופרטים נוספים", "Top products & more detail")}
              <span className="ms-auto text-xs font-normal text-muted-foreground">
                {lang("לחצו כדי לפתוח", "click to expand")}
              </span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4">
          <SectionHead
            eyebrow={lang("מוצרים", "Products")}
            title={lang("מוצרים שמחזיקים את החנות", "Products carrying the store")}
            hint={lang(
              "10 המובילים בהכנסות. החליטו לאן להפנות תקציב או על מה לשמור מלאי.",
              "Top 10 by revenue. Decide where to send ad budget or which SKUs to keep stocked."
            )}
            cta={{ href: "/profit", label: lang("הטבלה המלאה →", "Full table →") }}
          />
          <StyledTable
            numbered
            locale={locale}
            rowKey={(row) => row.productId}
            rows={topProducts}
            columns={[
              { key: "productTitle", label: lang("מוצר", "Product") },
              {
                key: "collection",
                label: lang("קולקציות", "Collections"),
                render: (row) => <CollectionChips collections={row.collections} fallback={row.collection} />
              },
              {
                key: "unitsSold",
                label: lang("יחידות", "Units sold"),
                align: "end",
                render: (row) => formatNumber(row.unitsSold)
              },
              {
                key: "inventoryQuantity",
                label: lang("במלאי", "In stock"),
                align: "end",
                render: (row) => <StockBadge quantity={row.inventoryQuantity} locale={locale} />
              },
              {
                key: "revenue",
                label: lang("הכנסה", "Revenue"),
                align: "end",
                render: (row) => formatCurrency(row.revenue, overview.store.currency)
              },
              {
                key: "estimatedProfit",
                label: lang("רווח מוערך", "Est. profit"),
                align: "end",
                emphasis: true,
                render: (row) => formatCurrency(row.estimatedProfit, overview.store.currency)
              }
            ]}
          />
          </div>
        </details>
      </div>
    </AppShell>
  );
}

function ClosedLoopSection({
  items,
  isHe
}: {
  items: ResolvedAlertWithOutcome[];
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const wins = items.filter((i) => i.outcome.verdict === "win").length;
  const misses = items.filter((i) => i.outcome.verdict === "miss").length;
  // Count EVERY state. The old "2 הצליחו · 1 לא" over 5 rows silently
  // dropped the unresolved ones — and "the app couldn't verify" is the
  // honest signal, not noise to hide (F-018).
  const unknowns = items.length - wins - misses;
  // Running total (F-017): the measured ₪ your actions produced — the
  // before-vs-after delta when the measurement has one, else the raw
  // post-action revenue.
  const measuredImpact = items
    .filter((i) => i.outcome.verdict === "win")
    .reduce((sum, i) => {
      const d = i.outcome.detail as { deltaRevenue?: number; revenue?: number } | undefined;
      return sum + (typeof d?.deltaRevenue === "number" ? Math.max(0, d.deltaRevenue) : d?.revenue ?? 0);
    }, 0);

  return (
    <section className="space-y-3">
      <SectionHead
        eyebrow={lang("הלולאה נסגרת", "Closed loop")}
        title={lang("מה קרה אחרי הפעולה שלכם", "What happened after you acted")}
        hint={lang(
          `מעקב אחרי ההמלצות שביצעתם לאחרונה. ${wins} הצליחו · ${misses} לא${unknowns > 0 ? ` · ${unknowns} עדיין לא ידוע` : ""}${measuredImpact > 0 ? ` · השפעה שנמדדה: ₪${Math.round(measuredImpact).toLocaleString("en-US")}` : ""} — שווה ללמוד מהכישלונות.`,
          `Tracking recent recommendations you actioned. ${wins} worked · ${misses} didn't${unknowns > 0 ? ` · ${unknowns} still unknown` : ""}${measuredImpact > 0 ? ` · measured impact: ₪${Math.round(measuredImpact).toLocaleString("en-US")}` : ""} — failures are where the learning is.`
        )}
      />
      <ul className="space-y-2">
        {items.map((item) => {
          const v = item.outcome.verdict;
          const Icon = v === "win" ? CheckCircle2 : v === "miss" ? XCircle : MinusCircle;
          const tone =
            v === "win"
              ? "border-emerald-200 bg-emerald-50"
              : v === "miss"
                ? "border-rose-200 bg-rose-50"
                : "border-slate-200 bg-slate-50";
          const iconColor =
            v === "win"
              ? "text-emerald-700"
              : v === "miss"
                ? "text-rose-700"
                : "text-slate-500";
          return (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border ${tone} p-3`}
            >
              <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor}`} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {new Date(item.resolvedAt).toLocaleDateString(isHe ? "he-IL" : "en-US", {
                    month: "short",
                    day: "numeric"
                  })}{" "}
                  · {item.type.replace(/_/g, " ")}
                </p>
                <p className="text-sm font-medium leading-snug">
                  {isHe ? item.outcome.summary.he : item.outcome.summary.en}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContributionMarginPanel({
  report,
  currency,
  isHe
}: {
  report: import("@/lib/services/contribution-margin-service").ContributionMarginReport;
  currency: string;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => formatCurrency(n, currency);
  const t = report.totals;
  const q = report.quality;
  const ratePct = (t.contributionMarginRate * 100).toFixed(1);

  const confBg =
    q.confidence === "high"
      ? "border-emerald-200 bg-emerald-50"
      : q.confidence === "medium"
        ? "border-amber-200 bg-amber-50"
        : "border-rose-200 bg-rose-50";
  const confText =
    q.confidence === "high"
      ? "text-emerald-800"
      : q.confidence === "medium"
        ? "text-amber-800"
        : "text-rose-800";
  const confPill =
    q.confidence === "high"
      ? "bg-emerald-200 text-emerald-900"
      : q.confidence === "medium"
        ? "bg-amber-200 text-amber-900"
        : "bg-rose-200 text-rose-900";

  return (
    <div className={`rounded-xl border ${confBg} p-4`}>
      {/* F-008 — the hero is GROSS SALES (an exact figure: no badge, no %);
          the waterfall of deductions follows and רווח תרומה closes the row
          as its visually-distinct RESULT, carrying the margin % and the
          accuracy badge (the estimation uncertainty is its, not the
          revenue's). Keeping the result last preserves the walk:
          gross − discounts − refunds − COGS − affiliate = contribution. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lang("מכירות ברוטו", "Gross sales")}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-foreground">{fmt(t.revenue)}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-[11px] sm:w-auto sm:flex-1 sm:grid-cols-4">
          <BreakdownTile label={lang("הנחות", "Discounts")} value={`-${fmt(t.discounts)}`} />
          <BreakdownTile label={lang("החזרים", "Refunds")} value={`-${fmt(t.refunds)}`} />
          <BreakdownTile label={lang("עלות מוצרים (COGS)", "COGS")} value={`-${fmt(t.cogs)}`} />
          {t.affiliateCommission > 0 ? (
            <BreakdownTile
              label={lang("עמלות שותפים", "Affiliate")}
              value={`-${fmt(t.affiliateCommission)}`}
            />
          ) : null}
          <div className={`rounded-md border-2 px-2 py-1.5 ${confBg}`}>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {lang("= רווח תרומה", "= Contribution")}{" "}
              <span className={`rounded-full px-1 py-0.5 text-[8px] uppercase tracking-wider ${confPill}`}>
                {q.accuracy}
              </span>
            </p>
            <p className={`mt-0.5 text-sm font-bold ${confText}`}>
              {fmt(t.contributionMargin)}{" "}
              <span className="text-[11px] font-semibold">({ratePct}%)</span>
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-4 text-muted-foreground line-clamp-1">
        {isHe ? q.notes.he : q.notes.en}
      </p>
    </div>
  );
}

function BreakdownTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CommandCenterHeadline({
  isHe,
  criticalCount,
  highCount,
  mediumCount,
  totalOpen
}: {
  isHe: boolean;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  totalOpen: number;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);

  if (totalOpen === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-emerald-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {lang("הכל תקין", "All clear")}
            </p>
            <p className="text-xs text-emerald-800">
              {lang(
                "אין התראות פתוחות. המשיכו לפי התכנון השבועי.",
                "No open alerts. Stay on your weekly plan."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isCritical = criticalCount > 0;
  return (
    <div
      className={`rounded-xl border px-5 py-4 ${
        isCritical
          ? "border-red-300 bg-red-50"
          : highCount > 0
            ? "border-rose-200 bg-rose-50"
            : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-3">
        {isCritical ? (
          <AlertOctagon className="h-5 w-5 text-red-700" aria-hidden />
        ) : (
          <Wallet className="h-5 w-5 text-amber-700" aria-hidden />
        )}
        <div>
          <p
            className={`text-sm font-bold ${
              isCritical ? "text-red-900" : highCount > 0 ? "text-rose-900" : "text-amber-900"
            }`}
          >
            {isCritical
              ? lang(
                  `🚩 ${heCountPhrase(criticalCount, { one: "התראה אחת", many: "התראות" }, { one: "קריטית פתוחה", many: "קריטיות פתוחות" })} — דורש פעולה היום`,
                  `🚩 ${criticalCount} critical alert${criticalCount === 1 ? "" : "s"} — needs action today`
                )
              : highCount > 0
                ? lang(
                    heCountPhrase(highCount, { one: "התראה אחת", many: "התראות" }, { one: "גבוהה פתוחה", many: "גבוהות פתוחות" }),
                    `${highCount} high-priority alert${highCount === 1 ? "" : "s"} open`
                  )
                : lang(
                    `${heCountPhrase(mediumCount, { one: "התראה אחת", many: "התראות" })} לבדיקה השבוע`,
                    `${mediumCount} alert${mediumCount === 1 ? "" : "s"} to review this week`
                  )}
          </p>
          <p className="mt-0.5 text-xs">
            {lang(
              `סה״כ ${totalOpen} פתוחות — כולן למטה עם פעולה מומלצת.`,
              `${totalOpen} total open — all listed below with a recommended action.`
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
