import { AppShell } from "@/components/layout/app-shell";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { FirstSyncPending } from "@/components/onboarding/first-sync-pending";
import { getOnboardingStatus } from "@/lib/onboarding/onboarding-status";
import { getAuthContext, listUserOrgsForSwitcher } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHead } from "@/components/dashboard-v2/section-head";
import { KpiTile } from "@/components/dashboard-v2/kpi-tile";
import { StyledTable, MobileRowFacts } from "@/components/dashboard-v2/styled-table";
import { RevenueChartV2 } from "@/components/dashboard-v2/revenue-chart-v2";
import { EnrichedRevenueChart } from "@/components/dashboard-v2/enriched-revenue-chart";
import { getDailyTrendContext } from "@/lib/services/daily-trend-context-service";
import { StockBadge } from "@/components/dashboard-v2/stock-badge";
import { CollectionChips } from "@/components/dashboard-v2/collection-chips";
import type { CommandCenterAlert } from "@/components/command-center/command-center-alert-card";
import Link from "next/link";
import { LeakScanHero } from "@/components/command-center/leak-scan-hero";
import { buildLeakScan } from "@/lib/services/leak-scan-service";
import { getOverviewPayload, getAppChromeData } from "@/lib/services/analytics-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import { buildStockoutImminentReport } from "@/lib/services/stockout-imminent-service";
import { buildRoasCollapseReport } from "@/lib/services/roas-collapse-service";
import { upsertCampaignFunnelAlerts } from "@/lib/services/campaign-funnel-alert-service";
import { upsertSilentProductAlerts } from "@/lib/services/silent-product-alert-service";
import { upsertCompetitorResponseAlerts } from "@/lib/services/competitor-intel-service";
import { readDecisionInboxSummary, readMarketSummary } from "@/lib/services/command-center-summary-service";
import { DecisionSummaryBlock, MarketLine } from "@/components/command-center/overview-blocks";
import { TrafficSearchSection } from "@/components/dashboard/traffic-search-section";
import { MetaCampaignsSection } from "@/components/dashboard/meta-campaigns-section";
import { MetaCampaignsInsight } from "@/components/dashboard/meta-campaigns-insight";
import { getMetaCampaignsOverview } from "@/lib/services/meta-campaigns-overview-service";
import { getGoogleAdsOverview } from "@/lib/services/google-ads-service";
import { GoogleAdsSection } from "@/components/dashboard/google-ads-section";
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
import { getReportingDateRangeSelection } from "@/lib/server/reporting-date-range";
import { getDb } from "@/lib/server/db";
import { parseSalesChannelFilter, SALES_CHANNEL_FILTER_LABEL } from "@/lib/domain/sales-channel";
import { orderChannelWhere } from "@/lib/server/sales-channel-filter";
import { ChannelFilterControl } from "@/components/command-center/channel-filter";


// Command Center = Executive Overview (8 Sep 2026). Order: top risk (Leak
// Scan) → money → decisions pointer (Today) + one market line (Market) →
// trend → channel detail → alerts → products behind disclosure.
//
// It produces no decisions of its own. Today is the source of truth for
// decisions, Market for external context; this page only points at them.

export default async function CommandCenterPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  // Sales-channel filter (9 Sep 2026): the owner wants the MONEY and the
  // TREND CHART to be viewable for the online store alone or for Shopify
  // POS alone. Only those two sections follow it — every other section and
  // every decision engine keeps the full store, on purpose.
  const query = await searchParams;
  const channel = parseSalesChannelFilter(query.channel);

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
    getOverviewPayload({ channel }),
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

  // Every read below is independent of the others, so they run together.
  // They used to be awaited one after another (ten round trips in a row),
  // which is what made a channel-filter switch feel frozen (owner, 9 Sep
  // 2026). Only the engines above must finish first — they write the
  // alerts that listOpenAlerts reads.
  type OpenAlertRow = {
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
  };
  const [
    // Closed-loop outcomes: "you did X → result Y" (last 14 days).
    closedLoop,
    // Setup health — the "Data confidence" badge next to the headline.
    setupHealth,
    // Leak Scan — the headline "₪ you're leaking", on the SELECTED window so
    // its roas_burn leg matches the Meta section below.
    leakScan,
    // Executive Overview: the page produces no decisions; it points at Today
    // and Market through two cheap ledger reads.
    decisionSummary,
    marketSummary,
    // GA4 + GSC summary — hidden when neither source has data.
    trafficSearch,
    // Meta campaigns — hidden when no insights are synced.
    metaCampaigns,
    // Google Ads — null until an account is connected and synced.
    googleAds,
    // Contribution margin — the money snapshot, same window, channel-aware.
    contributionMargin,
    // Whether the store ever took a POS order (shows the channel control).
    hasPosOrders,
    // Per-day context for the trend chart's tooltip and markers.
    trendContext,
    // Open alerts: critical/high get hero placement, medium/low a list.
    openAlerts
  ] = storeId
    ? await Promise.all([
        getRecentlyResolvedWithOutcomes({ storeId, lookbackDays: 14, limit: 8 }).catch((): ResolvedAlertWithOutcome[] => []),
        buildSetupHealth({ storeId }).catch(() => null),
        buildLeakScan({ storeId, start: windowRange.start, end: windowRange.end }).catch(() => null),
        readDecisionInboxSummary(storeId),
        readMarketSummary(storeId),
        buildTrafficSearchSummary(storeId, windowRange).catch(() => null),
        getMetaCampaignsOverview(storeId, windowRange).catch(() => null),
        getGoogleAdsOverview(storeId, windowRange).catch(() => null),
        buildContributionMargin({ storeId, start: windowRange.start, end: windowRange.end, channel }).catch(() => null),
        getDb()
          .order.count({ where: { storeId, ...orderChannelWhere("pos") } })
          .then((n: number) => n > 0)
          .catch(() => false),
        getDailyTrendContext(storeId, windowRange.start, windowRange.end).catch(() => ({})),
        listOpenAlerts({ storeId, limit: 50 }).then((rows) => rows as unknown as OpenAlertRow[])
      ])
    : [[] as ResolvedAlertWithOutcome[], null, null, null, null, null, null, null, null, false, {}, [] as OpenAlertRow[]];
  const showChannelFilter = hasPosOrders || channel !== "all";
  const channelSuffix = channel === "all" ? "" : ` · ${SALES_CHANNEL_FILTER_LABEL[channel][isHe ? "he" : "en"]}`;

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

        {/* ── ATTENTION — pointer to Today (the only place decisions are made)
            + data confidence. Replaces the old alerts headline: open alerts
            are the raw material of decisions, not a second list. */}
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <DecisionSummaryBlock summary={decisionSummary} locale={isHe ? "he" : "en"} />
            </div>
            {setupHealth ? <SetupHealthBadge report={setupHealth} locale={locale} /> : null}
          </div>
          <MarketLine summary={marketSummary} locale={isHe ? "he" : "en"} />
        </section>

        {/* ── SECTION — Money snapshot (הכסף) — leads, per CEO order ──── */}
        <section className="space-y-3">
          <SectionHead
            eyebrow={lang("הכסף", "The money")}
            title={lang("מצב פיננסי", "Money snapshot")}
            hint={lang(`המספרים של החלון הנבחר${channelSuffix}.`, `The numbers for the selected window${channelSuffix}.`)}
          />
          {showChannelFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              <ChannelFilterControl value={channel} query={query} locale={isHe ? "he" : "en"} />
              <p className="text-xs text-muted-foreground">
                {lang("משפיע על הכסף ועל גרף המגמה בלבד. שאר העמוד — כל החנות.", "Applies to the money and the trend chart only. The rest of the page is the whole store.")}
              </p>
            </div>
          ) : null}
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
            title={lang(`הכנסות ורווח יומיים${channelSuffix}`, `Daily revenue & estimated profit${channelSuffix}`)}
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
            <MetaCampaignsSection
              overview={metaCampaigns}
              isHe={isHe}
              // Breakeven ROAS = 1 / contribution-margin rate — the point a
              // campaign must clear to be profitable after COGS/shipping/fees.
              // Only when cost coverage is real (≥60%); otherwise the margin is
              // a default-ratio guess and a "breakeven" from it would mislead,
              // so we pass null and the block judges against ROAS ×1 and says so.
              breakevenRoas={
                contributionMargin &&
                contributionMargin.quality.costCoverage >= 0.6 &&
                contributionMargin.totals.contributionMarginRate > 0
                  ? 1 / contributionMargin.totals.contributionMarginRate
                  : null
              }
            />
            {/* key=storeId: this is a client component that fetches the insight
                once on mount. A brand switch does router.refresh() (re-renders
                server components) but would NOT remount a client component, so
                it kept showing the previous brand's insight (hbosem's text on
                Incense, 7 Sep 2026). Keying on the active store forces a remount
                — and a fresh fetch — whenever the brand changes. */}
            <MetaCampaignsInsight key={storeId} isHe={isHe} />
          </section>
        ) : null}

        {/* ── SECTION — Google Ads campaigns ───────────────────────────── */}
        {googleAds ? (
          <section id="google-ads" className="scroll-mt-24 space-y-3">
            <SectionHead
              eyebrow={lang("קמפיינים", "Campaigns")}
              title={lang("הקמפיינים שרצים ב־Google Ads — ומה הם מחזירים", "The Google Ads campaigns running — and what they return")}
              hint={lang("הוצאה, המרות וערך המרות לכל קמפיין בטווח הנבחר, מול נקודת האיזון של החנות.", "Spend, conversions and conversion value per campaign for the selected window, against the store's breakeven.")}
            />
            <GoogleAdsSection
              overview={googleAds}
              isHe={isHe}
              breakevenRoas={
                contributionMargin &&
                contributionMargin.quality.costCoverage >= 0.6 &&
                contributionMargin.totals.contributionMarginRate > 0
                  ? 1 / contributionMargin.totals.contributionMarginRate
                  : null
              }
            />
          </section>
        ) : null}

        {/* ── ALERTS — counts + link only. The cards that used to render here
            were the same rows Today turns into decisions, each with its own
            "recommended action": a second decision list. The full list stays
            on /alerts for audit; judgment happens on Today. */}
        {alertCards.length > 0 ? (
          <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-y border-border py-3 text-sm">
            <span>
              <span className="font-semibold">{lang("התראות פתוחות", "Open alerts")}: </span>
              <span className="text-muted-foreground">
                {[
                  criticalAndHigh.filter((a) => a.severity === "critical").length > 0
                    ? lang(`${criticalAndHigh.filter((a) => a.severity === "critical").length} קריטיות`, `${criticalAndHigh.filter((a) => a.severity === "critical").length} critical`)
                    : null,
                  criticalAndHigh.filter((a) => a.severity === "high").length > 0
                    ? lang(`${criticalAndHigh.filter((a) => a.severity === "high").length} גבוהות`, `${criticalAndHigh.filter((a) => a.severity === "high").length} high`)
                    : null,
                  mediumAndLow.length > 0 ? lang(`${mediumAndLow.length} לבדיקה`, `${mediumAndLow.length} to review`) : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {" · "}
                {lang("ההחלטות שנגזרות מהן נמצאות בעמוד היום.", "The decisions they feed are on Today.")}
              </span>
            </span>
            <Link href={"/alerts" as never} className="inline-flex min-h-8 items-center font-semibold text-foreground underline-offset-4 hover:underline">
              {lang("לרשימה המלאה", "Full list")}
            </Link>
          </p>
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
            mobileRender={(row, i) => (
              <div>
                <p className="text-sm font-semibold">
                  <span className="me-2 text-xs text-muted-foreground">{i + 1}</span>
                  {row.productTitle}
                </p>
                <MobileRowFacts
                  facts={[
                    { label: lang("הכנסה", "Revenue"), value: formatCurrency(row.revenue, overview.store.currency) },
                    { label: lang("רווח מוערך", "Est. profit"), value: formatCurrency(row.estimatedProfit, overview.store.currency) },
                    { label: lang("יחידות", "Units"), value: formatNumber(row.unitsSold) },
                    { label: lang("במלאי", "In stock"), value: <StockBadge quantity={row.inventoryQuantity} locale={locale} /> }
                  ]}
                />
                <div className="mt-2">
                  <CollectionChips collections={row.collections} fallback={row.collection} />
                </div>
              </div>
            )}
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

