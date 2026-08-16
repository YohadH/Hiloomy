import { AlertOctagon, Bot, Briefcase, Lightbulb, Plug, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NarrativeBanner } from "@/components/dashboard-v2/narrative-banner";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { StatTile } from "@/components/dashboard-v2/kpi-tile";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getGrowthAgentOverview } from "@/lib/services/growth-agent-overview-service";
import { getGrowthAgentStoreContext } from "@/lib/services/growth-agent-service";
import { GrowthAgentNav } from "@/components/growth-agent/agent-nav";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";
import { GrowthMonitoringGrid } from "@/components/growth-agent/monitoring-grid";
import { GrowthFindingsList } from "@/components/growth-agent/findings-list";
import { GrowthActionCenter } from "@/components/growth-agent/action-center";
import { GrowthConnectionsPanel } from "@/components/growth-agent/connections-panel";
import { GrowthAgentManualControls } from "@/components/growth-agent/manual-controls";
import { ProductRecommendationsPanel } from "@/components/growth-agent/product-recommendations-panel";
import { formatNumber } from "@/lib/utils";
import { getAppLocale } from "@/lib/i18n";

export default async function GrowthAgentOverviewPage() {
  const locale = await getAppLocale();
  const { store } = await getGrowthAgentStoreContext();
  const [chrome, overview] = await Promise.all([
    getAppChromeData(store.id),
    getGrowthAgentOverview(store.id)
  ]);

  const connectedCount = overview.connectedPlatforms.filter((item) => item.status === "connected").length;
  const tone = overview.status === "active" ? "up" : "neutral";
  const modeLabel = overview.currentMode.replaceAll("_", " ");
  const headline =
    overview.status === "active"
      ? locale === "he"
        ? `הסוכן פעיל במצב ${modeLabel} – ${overview.alertsLast7Days} התראות ב7 הימים האחרונים.`
        : `Agent is active in ${modeLabel} mode - ${overview.alertsLast7Days} alerts in the last 7 days.`
      : locale === "he"
        ? "הסוכן מושהה. הפעילו אותו כדי שיתחיל לעקוב אחרי החנות."
        : "Agent is paused. Switch it on to start watching your store.";
  const body =
    locale === "he"
      ? `${connectedCount} מתוך ${overview.connectedPlatforms.length} פלטפורמות מחוברות | ${overview.activeRulesCount} חוקים פעילים | ${overview.productRecommendations.length} רעיונות מוצרים ממתינים.`
      : `${connectedCount} of ${overview.connectedPlatforms.length} platforms connected | ${overview.activeRulesCount} active rules | ${overview.productRecommendations.length} sourcing ideas waiting.`;
  const comparisonSummary = overview.provenance.comparisonWindow
    ? `${overview.provenance.comparisonWindow} (${overview.provenance.comparisonLabel})`
    : locale === "he"
      ? "לא נבחר חלון השוואה."
      : "No comparison window selected.";

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-6 sm:space-y-8">
        <PageHead
          eyebrow={locale === "he" ? "סוכן צמיחה" : "Growth Agent"}
          title={
            locale === "he"
              ? "ניטור מבוסס AI לבריאות החנות, התנועה והסורסינג"
              : "AI-driven monitoring for store health, traffic, and sourcing"
          }
          description={
            locale === "he"
              ? "זיהוי אנומליות, הסבר על הגורמים הסבירים, והרצת פעולות מבוקרות לפי החנות וחלון הדיווח המוצגים למטה."
              : "Detect anomalies, explain likely causes, and run guarded actions using the store and reporting window shown below."
          }
        />

        <NarrativeBanner
          eyebrow={locale === "he" ? "סטטוס הסוכן" : "Agent status"}
          headline={headline}
          body={body}
          tone={tone}
          toneLabel={
            overview.status === "active"
              ? locale === "he" ? "פעיל" : "Active"
              : locale === "he" ? "מושהה" : "Paused"
          }
        />

        <GrowthAgentNav />

        <GrowthAgentManualControls storeId={store.id} />

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 1" : "Step 1"}
            title={locale === "he" ? "הסוכן במבט מהיר" : "Agent at a glance"}
            hint={
              locale === "he"
                ? "שישה מדדים שמספרים לכם אם הסוכן תקין ומחובר."
                : "Six metrics that tell you if the agent is healthy and connected."
            }
          />
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label={locale === "he" ? "סטטוס הסוכן" : "Agent status"}
              value={
                <span className="flex justify-center">
                  <GrowthStatusBadge status={overview.status} />
                </span>
              }
              icon={Bot}
              tooltip={
                locale === "he"
                  ? "האם הסוכן כרגע פעיל, מושהה או במצב שגיאה."
                  : "Whether the agent is currently active, paused, or in error."
              }
            />
            <StatTile
              label={locale === "he" ? "מצב נוכחי" : "Current mode"}
              value={overview.currentMode.replaceAll("_", " ")}
              icon={ShieldCheck}
              tooltip={
                locale === "he"
                  ? "מצב הפעלה: צפייה בלבד, המלצה או ביצוע אוטומטי."
                  : "Operating mode: observe-only, recommend, or auto-execute."
              }
            />
            <StatTile
              label={locale === "he" ? "פלטפורמות מחוברות" : "Connected platforms"}
              value={formatNumber(connectedCount)}
              icon={Plug}
              tooltip={
                locale === "he"
                  ? "מקורות נתונים תקינים כרגע (Shopify, תנועה, פרסום, רשתות, קראולר)."
                  : "Data sources currently healthy (Shopify, traffic, ads, social, crawler)."
              }
              hint={
                locale === "he"
                  ? `${connectedCount} / ${overview.connectedPlatforms.length} תקינים`
                  : `${connectedCount} / ${overview.connectedPlatforms.length} healthy`
              }
            />
            <StatTile
              label={locale === "he" ? "חוקים פעילים" : "Active rules"}
              value={formatNumber(overview.activeRulesCount)}
              icon={Briefcase}
              tooltip={
                locale === "he"
                  ? "חוקי זיהוי ומגבלות שהסוכן אוכף כרגע."
                  : "Detection rules and guardrails the agent enforces right now."
              }
            />
            <StatTile
              label={locale === "he" ? "התראות (7 ימים)" : "Alerts (7d)"}
              value={formatNumber(overview.alertsLast7Days)}
              icon={AlertOctagon}
              tooltip={
                locale === "he"
                  ? "אנומליות שהסוכן זיהה בשבוע האחרון."
                  : "Anomalies the agent surfaced in the past week."
              }
              hint={
                locale === "he"
                  ? "קפיצות מסמנות שמשהו משמעותי זז."
                  : "Spikes mean something material moved."
              }
            />
            <StatTile
              label={locale === "he" ? "רעיונות למוצרים" : "Product ideas"}
              value={formatNumber(overview.productRecommendations.length)}
              icon={Lightbulb}
              tooltip={
                locale === "he"
                  ? "רעיונות סורסינג שהקראולר מצא ומתאימים לקטלוג ולמרווחים שלכם."
                  : "Sourcing ideas surfaced by the crawler that match your catalog and margin targets."
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 2" : "Step 2"}
            title={locale === "he" ? "סטטוס חי וראיות" : "Live status and evidence"}
            hint={
              locale === "he"
                ? "מה הסוכן עשה לאחרונה, איזו חנות הוא קורא, ואילו מקורות מזינים אותו."
                : "What the agent did most recently, which store it is reading, and which data sources are feeding it."
            }
          />
          <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {locale === "he" ? "פעילות אחרונה של הסוכן" : "Latest agent activity"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">
                    {locale === "he" ? "סנכרון אחרון:" : "Last sync:"}
                  </strong>{" "}
                  {overview.lastSyncTime
                    ? new Date(overview.lastSyncTime).toLocaleString(locale === "he" ? "he-IL" : "en-US")
                    : locale === "he" ? "אין סנכרון עדיין" : "No sync yet"}
                </p>
                <p>
                  <strong className="text-foreground">
                    {locale === "he" ? "הבעיות העיקריות שזוהו:" : "Top detected issues:"}
                  </strong>{" "}
                  {overview.topDetectedIssues.length
                    ? overview.topDetectedIssues.map((item) => item.metricName).join(" | ")
                    : locale === "he" ? "אין בעיות דחופות" : "No urgent issues"}
                </p>
                <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
                  <p>
                    <strong className="text-foreground">
                      {locale === "he" ? "החנות שבמעקב:" : "Store in scope:"}
                    </strong>{" "}
                    {overview.provenance.storeName} ({overview.provenance.storeDomain})
                  </p>
                  <p>
                    <strong className="text-foreground">
                      {locale === "he" ? "חלון דיווח:" : "Reporting window:"}
                    </strong>{" "}
                    {overview.provenance.reportingWindow} ({overview.provenance.reportingLabel})
                  </p>
                  <p>
                    <strong className="text-foreground">
                      {locale === "he" ? "מושווה מול:" : "Compared against:"}
                    </strong>{" "}
                    {comparisonSummary}
                  </p>
                  <p>
                    <strong className="text-foreground">
                      {locale === "he" ? "נתונים שנותחו:" : "Data used:"}
                    </strong>{" "}
                    {locale === "he"
                      ? `${formatNumber(overview.provenance.ordersAnalyzed)} הזמנות ו-${formatNumber(overview.provenance.productsAnalyzed)} מוצרים בחלון הנוכחי.`
                      : `${formatNumber(overview.provenance.ordersAnalyzed)} orders and ${formatNumber(overview.provenance.productsAnalyzed)} products in the current window.`}
                  </p>
                  <p>
                    <strong className="text-foreground">
                      {locale === "he" ? "מקור תמונת המצב:" : "Snapshot source:"}
                    </strong>{" "}
                    {overview.provenance.lastSnapshotSource ?? (locale === "he" ? "אין תמונת מצב עדיין" : "No snapshot yet")}
                  </p>
                </div>
                <p className="rounded-lg bg-indigo-500/5 px-3 py-2 text-indigo-700">
                  {locale === "he"
                    ? "הסוכן נעול לחנות המחוברת שמוצגת למעלה. פעולות רצות רק עבור אותה חנות אם הן מותרות, מחוברות, מעל סף הביטחון ובתוך המגבלות שהגדרתם."
                    : "This agent is locked to the connected store shown above. Actions only run for that store when they are allowed, connected, above confidence threshold, and inside your guardrails."}
                </p>
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800">
                  {locale === "he"
                    ? "ההסברים לפי ערוץ מדויקים יותר כשמחברי התנועה והפרסום תקינים. בלעדיהם, הסוכן נשען על אותות הזמנות מShopify והערכות כיווניות."
                    : "Channel explanations are strongest when traffic and ad connectors are healthy. Without them, the agent falls back to Shopify order signals and directional heuristics."}
                </p>
              </CardContent>
            </Card>
            <GrowthConnectionsPanel connections={overview.connectedPlatforms} />
          </div>
        </section>

        {overview.productRecommendations.length ? (
          <section className="space-y-3">
            <SectionHead
              eyebrow={locale === "he" ? "שלב 3" : "Step 3"}
              title={locale === "he" ? "רעיונות סורסינג ממתינים לבדיקה" : "Sourcing ideas waiting for review"}
              hint={
                locale === "he"
                  ? "מוצרים שהקראולר מצא ומתאימים לחנות שלכם. אשרו בAction Center כדי לפתוח עליהם טיוטה."
                  : "Crawler-surfaced products that match your store. Approve in the Action Center to draft them."
              }
            />
            <ProductRecommendationsPanel
              recommendations={overview.productRecommendations}
              currency={chrome.store.currency}
              storeId={store.id}
            />
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 4" : "Step 4"}
            title={locale === "he" ? "רשת הניטור" : "Monitoring grid"}
            hint={
              locale === "he"
                ? "אותות לכל מדד ולכל ערוץ שהסוכן עוקב אחריהם כרגע."
                : "Per-metric and per-channel signals the agent is watching right now."
            }
          />
          <GrowthMonitoringGrid
            cards={overview.monitoringCards}
            trafficChannels={overview.trafficChannels}
            currency={chrome.store.currency}
          />
        </section>

        <section className="space-y-3">
          <SectionHead
            eyebrow={locale === "he" ? "שלב 5" : "Step 5"}
            title={locale === "he" ? "ממצאים אחרונים ותור פעולות" : "Recent findings and action queue"}
            hint={
              locale === "he"
                ? "משמאל – מה שהסוכן סימן. מימין – מה שממתין לאישור או כבר בוצע."
                : "Left is what the agent flagged. Right is what is waiting for approval or already executed."
            }
          />
          <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr]">
            <GrowthFindingsList
              findings={overview.findings.slice(0, 6)}
              title={locale === "he" ? "ממצאים אחרונים" : "Recent findings"}
            />
            <GrowthActionCenter
              actions={overview.actions.slice(0, 6)}
              storeId={store.id}
              title={locale === "he" ? "תצוגה מקדימה של Action Center" : "Action center preview"}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
