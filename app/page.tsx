import { AppShell } from "@/components/layout/app-shell";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { FirstSyncPending } from "@/components/onboarding/first-sync-pending";
import { getOnboardingStatus } from "@/lib/onboarding/onboarding-status";
import { getAuthContext } from "@/lib/auth/session";
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
import { AlertOctagon, TrendingUp, Wallet } from "lucide-react";
import { getOverviewPayload, getAppChromeData } from "@/lib/services/analytics-service";
import { listOpenAlerts } from "@/lib/services/alert-writer-service";
import { buildStockoutImminentReport } from "@/lib/services/stockout-imminent-service";
import { buildRoasCollapseReport } from "@/lib/services/roas-collapse-service";
import { upsertCompetitorResponseAlerts } from "@/lib/services/competitor-intel-service";
import { getCompetitorBrief } from "@/lib/services/competitor-brief-service";
import { CompetitorBriefSection } from "@/components/command-center/competitor-brief-section";
import { buildContributionMargin } from "@/lib/services/contribution-margin-service";
import { buildSetupHealth } from "@/lib/services/setup-health-service";
import { SetupHealthBadge } from "@/components/setup-health/setup-health-badge";
import { SetupHealthChecklistCard } from "@/components/setup-health/setup-health-checklist-card";
import {
  measureOutcomesForResolvedAlerts,
  getRecentlyResolvedWithOutcomes,
  type ResolvedAlertWithOutcome
} from "@/lib/services/alert-outcome-service";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";

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
    return (
      <main className="min-h-screen bg-gradient-to-br from-violet-50/30 via-background to-indigo-50/30">
        <OnboardingWizard
          email={auth.email ?? ""}
          pendingShopDomain={onboarding.pendingShopDomain}
          locale={isHe ? "he" : "en"}
        />
      </main>
    );
  }

  const [overview, chrome, storeId] = await Promise.all([
    getOverviewPayload(),
    getAppChromeData(),
    resolveActiveStoreId()
  ]);

  // Second-stage onboarding: store is connected but first sync hasn't
  // returned any orders yet. Render a polling pending screen instead of
  // a confusing empty dashboard.
  const totalRevenue = overview.kpis.reduce(
    (sum, kpi) => sum + (typeof kpi.value === "number" ? kpi.value : 0),
    0
  );
  if (totalRevenue === 0 && storeId && onboarding.brandCount > 0 && onboarding.connectedBrandCount > 0) {
    return (
      <AppShell store={chrome.store} controls={chrome.controls}>
        <FirstSyncPending storeId={storeId} locale={isHe ? "he" : "en"} />
      </AppShell>
    );
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
    const roasWindow = {
      start: new Date(`${chrome.controls.startDate}T00:00:00Z`),
      end: new Date(`${chrome.controls.endDate}T23:59:59Z`)
    };
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

  // Competitor brief — intel snapshot + BI-prescribed actions (today/this
  // week). storeId lets the generator feed LIVE store facts (product movers,
  // campaign ROAS, open alerts) into the prompt so actions name real things.
  // Cached 24h; falls back to the intel's own action list when the BI agent
  // is unreachable, so the section always renders.
  const competitorBrief = await getCompetitorBrief(storeId ?? undefined).catch(() => null);

  // Contribution margin for the same window the controls have selected.
  // This is the "money snapshot" anchor — explicit accuracy label, no
  // fake precision.
  const contributionMargin = storeId
    ? await buildContributionMargin({
        storeId,
        start: new Date(`${chrome.controls.startDate}T00:00:00Z`),
        end: new Date(`${chrome.controls.endDate}T23:59:59Z`)
      }).catch(() => null)
    : null;

  // Per-day context for the trend chart — top products, active Meta
  // campaigns, IG posts, discounts redeemed. Powers the rich hover
  // tooltip + event markers so the operator can answer "WHY did
  // revenue move on this day?".
  const trendContext = storeId
    ? await getDailyTrendContext(
        storeId,
        new Date(`${chrome.controls.startDate}T00:00:00Z`),
        new Date(`${chrome.controls.endDate}T23:59:59Z`)
      ).catch(() => ({}))
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
        {/* ── BUSINESS SUMMARY — 2-3 line glance at current state ────── */}
        {contributionMargin ? (
          <BusinessSummaryBlock
            revenue={contributionMargin.totals.revenue}
            profit={contributionMargin.totals.contributionMargin}
            profitRate={contributionMargin.totals.contributionMarginRate}
            criticalCount={alertCards.filter((a) => a.severity === "critical").length}
            highCount={alertCards.filter((a) => a.severity === "high").length}
            currency={overview.store.currency}
            isHe={isHe}
          />
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

        {/* ── SETUP CHECKLIST — actionable to-do list until 100% ──────── */}
        {setupHealth ? <SetupHealthChecklistCard report={setupHealth} locale={locale} /> : null}

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
              // Match both English labels and Hebrew equivalents (הכנסות / רווח משוער).
              const isRevenue =
                label.includes("revenue") ||
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
              "קו אינדיגו = הכנסה ברוטו, כחול = רווח מוערך. הפער ביניהם הוא המרווח.",
              "Indigo line = gross revenue, blue = estimated profit. The gap between them is your margin."
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
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#5E6AD2" }} />
                    {lang("הכנסה", "Revenue")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#0080FF" }} />
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
        {mediumAndLow.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SectionHead
                eyebrow={lang("השבוע", "This week")}
                title={lang("התראות לבדיקה", "Alerts to review")}
                hint={lang("לא דחוף — שווה לבדוק במהלך השבוע.", "Not urgent — check during weekly planning.")}
              />
              <PriorityBadge level="important" isHe={isHe} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {mediumAndLow.map((alert) => (
                <CommandCenterAlertCard key={alert.id} alert={alert} locale={locale} />
              ))}
            </div>
          </section>
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

function BusinessSummaryBlock({
  revenue,
  profit,
  profitRate,
  criticalCount,
  highCount,
  currency,
  isHe
}: {
  revenue: number;
  profit: number;
  profitRate: number;
  criticalCount: number;
  highCount: number;
  currency: string;
  isHe: boolean;
}) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const fmt = (n: number) => formatCurrency(n, currency);
  const ratePct = (profitRate * 100).toFixed(1);
  const alertSummary =
    criticalCount > 0
      ? lang(`${criticalCount} קריטיות פתוחות`, `${criticalCount} critical open`)
      : highCount > 0
        ? lang(`${highCount} גבוהות פתוחות`, `${highCount} high-priority open`)
        : lang("אין התראות קריטיות", "No critical alerts");

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
        {lang("סיכום עסקי", "Business snapshot")}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-base font-bold text-foreground">
          {lang("הכנסה", "Revenue")}: {fmt(revenue)}
        </span>
        <span className="text-base font-bold text-foreground">
          {lang("רווח", "Profit")}: {fmt(profit)}{" "}
          <span className="text-sm font-semibold text-muted-foreground">({ratePct}%)</span>
        </span>
        <span
          className={`text-sm font-semibold ${
            criticalCount > 0 ? "text-red-700" : highCount > 0 ? "text-amber-700" : "text-emerald-700"
          }`}
        >
          {alertSummary}
        </span>
      </div>
    </div>
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

  return (
    <section className="space-y-3">
      <SectionHead
        eyebrow={lang("הלולאה נסגרת", "Closed loop")}
        title={lang("מה קרה אחרי הפעולה שלכם", "What happened after you acted")}
        hint={lang(
          `מעקב אחרי ההמלצות שביצעתם לאחרונה. ${wins} הצליחו · ${misses} לא — שווה ללמוד מהכישלונות.`,
          `Tracking recent recommendations you actioned. ${wins} worked · ${misses} didn't — failures are where the learning is.`
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
      {/* Mobile: stacked layout (headline on top, breakdown below in 2-col grid).
          sm+: side-by-side with breakdown growing to fill remaining space. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lang("רווח תרומה", "Contribution margin")}{" "}
            <span
              className={`ms-1 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${confPill}`}
            >
              {q.accuracy}
            </span>
          </p>
          <p className={`mt-1 text-xl sm:text-2xl font-bold ${confText}`}>
            {fmt(t.contributionMargin)}{" "}
            <span className="text-sm font-semibold">({ratePct}%)</span>
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-[11px] sm:w-auto sm:flex-1 sm:grid-cols-4">
          <BreakdownTile label={lang("הכנסה", "Revenue")} value={fmt(t.revenue)} />
          <BreakdownTile label={lang("הנחות", "Discounts")} value={`-${fmt(t.discounts)}`} />
          <BreakdownTile label={lang("החזרים", "Refunds")} value={`-${fmt(t.refunds)}`} />
          <BreakdownTile label={lang("עלות מוצרים (COGS)", "COGS")} value={`-${fmt(t.cogs)}`} />
          {t.affiliateCommission > 0 ? (
            <BreakdownTile
              label={lang("עמלות שותפים", "Affiliate")}
              value={`-${fmt(t.affiliateCommission)}`}
            />
          ) : null}
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
                  `🚩 ${criticalCount} התראה${criticalCount === 1 ? " קריטית פתוחה" : "ות קריטיות פתוחות"} — דורש פעולה היום`,
                  `🚩 ${criticalCount} critical alert${criticalCount === 1 ? "" : "s"} — needs action today`
                )
              : highCount > 0
                ? lang(
                    `${highCount} התראה${highCount === 1 ? " גבוהה פתוחה" : "ות גבוהות פתוחות"}`,
                    `${highCount} high-priority alert${highCount === 1 ? "" : "s"} open`
                  )
                : lang(
                    `${mediumCount} התראה${mediumCount === 1 ? "" : "ות"} לבדיקה השבוע`,
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
