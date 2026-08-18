import Link from "next/link";
import { Building2, Globe, Settings2, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { ShopifyConnectionManager } from "@/components/settings/shopify-connection-manager";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { CreatorConnectionsManager } from "@/components/settings/creator-connections-manager";
import { MetaAdsConnectionManager } from "@/components/settings/meta-ads-connection-manager";
import { WeeklyReportRecipientsManager } from "@/components/settings/weekly-report-recipients-manager";
import { CompetitorSetManager } from "@/components/settings/competitor-set-manager";
import { GscConnectionManager } from "@/components/settings/gsc-connection-manager";
import { IntegrationsHub, type IntegrationItem } from "@/components/settings/integrations-hub";
import { SettingsNav, type SettingsNavItem } from "@/components/settings/settings-nav";
import { BixGrowWebhookCard } from "@/components/settings/bixgrow-webhook-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getShopifyConnectionSummary } from "@/lib/services/shopify-connection-service";
import { getSyncStatus } from "@/lib/services/shopify-sync-service";
import { getMetaAdsConnectionSummary } from "@/lib/services/meta-ads-service";
import { buildSetupHealth } from "@/lib/services/setup-health-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { getDb } from "@/lib/server/db";
import { GSC_PLATFORM } from "@/lib/services/gsc-service";
import { getAuthContext } from "@/lib/auth/session";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    gsc_connected?: string;
    gsc_error?: string;
  }>;
}) {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const dictionary = getDictionary(locale);
  const chrome = await getAppChromeData();
  const params = await searchParams;
  const gscConnected = params.gsc_connected === "true";
  const gscError = params.gsc_error ?? null;

  const [connectionSummary, syncStatus, metaAdsConnection, setupHealth, storeRow, gscConnection, igConnection] =
    await Promise.all([
      getShopifyConnectionSummary(chrome.store.id),
      getSyncStatus(chrome.store.id),
      getMetaAdsConnectionSummary(chrome.store.id).catch(() => null),
      buildSetupHealth({ storeId: chrome.store.id }).catch(() => null),
      getDb()
        .store.findUnique({
          where: { id: chrome.store.id },
          select: { bixgrowSlug: true }
        })
        .catch(() => null),
      getDb()
        .platformConnection.findUnique({
          where: { storeId_platform: { storeId: chrome.store.id, platform: GSC_PLATFORM } },
          select: {
            status: true,
            tokenLastFour: true,
            healthMessage: true,
            lastSyncAt: true,
            createdAt: true,
            updatedAt: true
          }
        })
        .catch(() => null),
      getDb()
        .instagramConnection.findFirst({
          where: { storeId: chrome.store.id },
          select: { id: true }
        })
        .catch(() => null)
    ]);

  // Organization context — powers the "Organization & team" section that
  // links to /settings/organization (team invites, roles, plan) and
  // /portfolio (the multi-store rollup). Best-effort: a dev environment
  // without auth simply hides the section.
  const orgSummary = await (async () => {
    try {
      const auth = await getAuthContext();
      if (!auth.orgId) return null;
      const org = (await getDb().organization.findUnique({
        where: { id: auth.orgId },
        select: {
          name: true,
          plan: true,
          _count: { select: { memberships: true, stores: true } }
        }
      })) as {
        name: string;
        plan: string;
        _count: { memberships: number; stores: number };
      } | null;
      if (!org) return null;
      return {
        name: org.name,
        plan: org.plan,
        members: org._count.memberships,
        stores: org._count.stores,
        role: auth.role ?? "member"
      };
    } catch {
      return null;
    }
  })();

  // Public URL the BixGrow webhook URL is built from. APP_URL is set in
  // production; locally we fall back to the dev origin so the card shows
  // a working localhost URL during testing.
  const publicAppUrl =
    process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  const isConnected = chrome.store.connected;

  // ── Integrations hub model ─────────────────────────────────────────
  const integrations: IntegrationItem[] = [
    {
      id: "shopify",
      name: "Shopify",
      category: lang("מסחר", "Commerce"),
      description: lang(
        "חנות הShopify מזינה הזמנות, מוצרים ולקוחות — הבסיס לכל הדוחות.",
        "Your Shopify store feeds orders, products and customers — the base for every report."
      ),
      status: isConnected ? "connected" : "not_connected",
      meta: isConnected ? chrome.store.domain : null,
      required: true
    },
    {
      id: "meta",
      name: "Meta Ads",
      category: lang("פרסום", "Advertising"),
      description: lang(
        "ביצועי קמפיינים, ROAS והוצאות פרסום נכנסים לחישוב הרווח.",
        "Campaign performance, ROAS and ad spend flow into profit math."
      ),
      status: metaAdsConnection ? "connected" : "not_connected"
    },
    {
      id: "googleads",
      name: "Google Ads",
      category: lang("פרסום", "Advertising"),
      description: lang(
        "ביצועי קמפיינים בGoogle — חיפוש, שופינג וPMax — בחישוב הרווח.",
        "Google campaign performance — Search, Shopping and PMax — in profit math."
      ),
      status: "soon"
    },
    {
      id: "tiktok",
      name: "TikTok Ads",
      category: lang("פרסום", "Advertising"),
      description: lang(
        "ביצועי קמפיינים בTikTok לצד Meta — באותו דשבורד.",
        "TikTok campaign performance next to Meta — in the same dashboard."
      ),
      status: "soon"
    },
    {
      id: "gsc",
      name: "Google Search Console",
      category: lang("אנליטיקס", "Analytics"),
      description: lang(
        "נתוני חיפוש אורגני — שאילתות, קליקים ודירוגים בדוח השבועי.",
        "Organic search data — queries, clicks and rankings in the weekly report."
      ),
      status: gscConnection
        ? gscConnection.status === "error"
          ? "attention"
          : "connected"
        : "not_connected"
    },
    {
      id: "ga4",
      name: "Google Analytics 4",
      category: lang("אנליטיקס", "Analytics"),
      description: lang(
        "אירועי אתר והתנהגות גולשים להעשרת ייחוס המכירות.",
        "Site events and visitor behavior to enrich sales attribution."
      ),
      status: "soon"
    },
    {
      id: "instagram",
      name: "Instagram",
      category: lang("יוצרים ומשפיענים", "Influencers & creators"),
      description: lang(
        "פוסטים, מעורבות וייחוס מכירות ליוצרים בעמוד Creator Commerce.",
        "Posts, engagement and creator sales attribution for Creator Commerce."
      ),
      status: igConnection ? "connected" : "not_connected"
    },
    {
      id: "humanz",
      name: "Humanz",
      category: lang("יוצרים ומשפיענים", "Influencers & creators"),
      description: lang(
        "קמפייני משפיענים מHumanz מיוחסים להזמנות ולרווח בפועל.",
        "Humanz influencer campaigns attributed to real orders and profit."
      ),
      status: "soon"
    },
    {
      id: "bixgrow",
      name: "BixGrow",
      category: lang("יוצרים ומשפיענים", "Influencers & creators"),
      description: lang(
        "ייבוא המרות שותפים היסטוריות וwebhook להמרות חדשות.",
        "Historical affiliate conversion imports plus a webhook for new ones."
      ),
      status: storeRow?.bixgrowSlug ? "connected" : "not_connected"
    },
    {
      id: "flashy",
      name: "Flashy",
      category: lang("אימייל וSMS", "Email & SMS"),
      description: lang(
        "קמפיינים ואוטומציות מFlashy לצד ההכנסות שהם מייצרים.",
        "Flashy campaigns and automations next to the revenue they drive."
      ),
      status: "soon"
    },
    {
      id: "klaviyo",
      name: "Klaviyo",
      category: lang("אימייל וSMS", "Email & SMS"),
      description: lang(
        "ביצועי אימייל מרקטינג לצד ההכנסות שהם מייצרים.",
        "Email marketing performance next to the revenue it drives."
      ),
      status: "soon"
    },
    {
      id: "sheets",
      name: "Google Sheets",
      category: lang("ייצוא נתונים", "Data export"),
      description: lang(
        "ייצוא דוחות ונתונים אוטומטי לגיליונות שלכם.",
        "Automatic report and data exports into your sheets."
      ),
      status: "soon"
    }
  ];

  const integrationPanels = {
    shopify: (
      <ShopifyConnectionManager
        initialConnection={connectionSummary}
        initialSyncStatus={syncStatus}
        labels={dictionary.settings.shopify}
      />
    ),
    meta: <MetaAdsConnectionManager storeId={chrome.store.id} initialConnection={metaAdsConnection} />,
    instagram: <CreatorConnectionsManager labels={dictionary.creator} />,
    gsc: (
      <GscConnectionManager
        storeId={chrome.store.id}
        initialConnection={
          gscConnection
            ? {
                status: gscConnection.status,
                tokenLastFour: gscConnection.tokenLastFour ?? null,
                healthMessage: gscConnection.healthMessage ?? null,
                lastSyncAt: gscConnection.lastSyncAt?.toISOString() ?? null,
                connectedAt: gscConnection.createdAt.toISOString(),
                updatedAt: gscConnection.updatedAt.toISOString()
              }
            : null
        }
        gscConnected={gscConnected}
        gscError={gscError}
      />
    ),
    bixgrow: (
      <BixGrowWebhookCard
        initialSlug={storeRow?.bixgrowSlug ?? null}
        publicAppUrl={publicAppUrl}
        storeName={chrome.store.name}
        locale={isHe ? "he" : "en"}
      />
    )
  };

  // Open the relevant panel automatically: a GSC OAuth round-trip lands
  // back here with query params; otherwise an unconnected store is the
  // single most important thing on the page.
  const initialOpen = gscConnected || gscError ? "gsc" : !isConnected ? "shopify" : null;

  // ── Sub-navigation model ───────────────────────────────────────────
  const navItems: SettingsNavItem[] = [
    { id: "setup-health", label: lang("סטטוס הגדרה", "Setup status"), group: lang("סקירה", "Overview") },
    { id: "integrations", label: lang("אינטגרציות", "Integrations"), group: lang("חיבורים", "Connections") },
    { id: "reporting", label: lang("דיווח ורווח", "Reporting & profit"), group: lang("דוחות", "Reporting") },
    { id: "weekly-report", label: lang("דוח שבועי", "Weekly report"), group: lang("דוחות", "Reporting") },
    { id: "competitors", label: lang("מתחרים", "Competitors"), group: lang("דוחות", "Reporting") },
    ...(orgSummary
      ? [{ id: "organization", label: lang("ארגון וצוות", "Organization & team"), group: lang("חשבון", "Account") }]
      : []),
    { id: "language", label: lang("שפה", "Language"), group: lang("חשבון", "Account") },
    { id: "roadmap", label: lang("בהמשך", "Coming next"), group: lang("חשבון", "Account") }
  ];

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-5 sm:space-y-6">
        <PageHead
          eyebrow={dictionary.settings.eyebrow}
          title={dictionary.settings.title}
          description={dictionary.settings.description}
        />

        <div className="lg:flex lg:items-start lg:gap-8">
          <SettingsNav items={navItems} isHe={isHe} />

          <div className="min-w-0 flex-1 space-y-10 lg:mt-0 mt-4">
            {/* ── Setup status ──────────────────────────────────────── */}
            <section id="setup-health" className="scroll-mt-24 space-y-3">
              <SectionHead
                eyebrow={lang("סקירה", "Overview")}
                title={lang("סטטוס הגדרה וביטחון בנתונים", "Setup status & data confidence")}
                hint={lang(
                  "כמה מהחיבורים וההגדרות שמשפיעים על דיוק הדוחות כבר במקום.",
                  "How many of the connections and settings that drive report accuracy are in place."
                )}
              />
              {setupHealth ? (
                <SetupHealthChecklist report={setupHealth} locale={locale} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {lang("סטטוס ההגדרה יופיע אחרי חיבור החנות.", "Setup status appears once the store is connected.")}
                </p>
              )}
            </section>

            {/* ── Integrations hub ──────────────────────────────────── */}
            <section id="integrations" className="scroll-mt-24 space-y-3">
              <SectionHead
                eyebrow={lang("חיבורים", "Connections")}
                title={lang("אינטגרציות", "Integrations")}
                hint={lang(
                  "חברו את מקורות הנתונים שלכם. Shopify חובה — כל השאר מעשירים את התמונה.",
                  "Connect your data sources. Shopify is required — everything else enriches the picture."
                )}
              />
              <IntegrationsHub
                isHe={isHe}
                items={integrations}
                panels={integrationPanels}
                initialOpen={initialOpen}
                requestEmail="support@hiloomy.com"
              />
            </section>

            {/* ── Reporting & profit ────────────────────────────────── */}
            <section id="reporting" className="scroll-mt-24 space-y-3">
              <SectionHead
                eyebrow={lang("דוחות", "Reporting")}
                title={dictionary.settings.reportingTitle}
                hint={dictionary.settings.reportingDescription}
              />
              <Card>
                <CardContent className="space-y-3 pt-6">
                  {[
                    [dictionary.settings.dateRange, chrome.controls.dateRangeLabel],
                    [dictionary.settings.currency, chrome.store.currency],
                    [dictionary.settings.estimatedCostMode, chrome.store.estimatedCostMode],
                    [
                      dictionary.settings.defaultCostRatio,
                      chrome.store.defaultCostRatio
                        ? `${(chrome.store.defaultCostRatio * 100).toFixed(1)}%`
                        : "35.0%"
                    ],
                    [dictionary.settings.compareToPreviousPeriod, dictionary.settings.enabled]
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold tabular-nums">{value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            {/* ── Weekly report ─────────────────────────────────────── */}
            <section id="weekly-report" className="scroll-mt-24 space-y-3">
              <Card>
                <CardContent className="pt-6">
                  <WeeklyReportRecipientsManager isHe={isHe} />
                </CardContent>
              </Card>
            </section>

            {/* ── Competitors ───────────────────────────────────────── */}
            <section id="competitors" className="scroll-mt-24 space-y-3">
              <Card>
                <CardContent className="pt-6">
                  <CompetitorSetManager isHe={isHe} />
                </CardContent>
              </Card>
            </section>

            {/* ── Organization & team ───────────────────────────────── */}
            {orgSummary ? (
              <section id="organization" className="scroll-mt-24 space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
                        <Building2 className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <CardTitle className="text-base">
                        {lang("ארגון וצוות", "Organization & team")}
                      </CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {lang(
                        "ניהול חברי צוות, הזמנות, מותגים מחוברים ומסלול.",
                        "Manage teammates, invitations, connected brands, and your plan."
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">{orgSummary.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {lang(
                            `${orgSummary.stores} מותגים · ${orgSummary.members} חברי צוות · מסלול ${orgSummary.plan}`,
                            `${orgSummary.stores} brands · ${orgSummary.members} members · ${orgSummary.plan} plan`
                          )}
                        </p>
                      </div>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-green-700">
                        {orgSummary.role}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={"/settings/organization" as never}
                        className="inline-flex items-center rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:border-green-500"
                      >
                        {lang("ניהול צוות והזמנות", "Manage team & invites")}
                      </Link>
                      {orgSummary.stores >= 2 ? (
                        <Link
                          href={"/portfolio" as never}
                          className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-green-300 hover:text-foreground"
                        >
                          {lang("דשבורד כל המותגים", "All-brands dashboard")}
                        </Link>
                      ) : null}
                      <Link
                        href={"/connect-brand" as never}
                        className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-green-300 hover:text-foreground"
                      >
                        {lang("+ חיבור מותג נוסף", "+ Connect another brand")}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </section>
            ) : null}

            {/* ── Language ──────────────────────────────────────────── */}
            <section id="language" className="scroll-mt-24 space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Globe className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{dictionary.settings.languageTitle}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground">{dictionary.settings.languageDescription}</p>
                </CardHeader>
                <CardContent>
                  <LanguageSwitcher
                    locale={locale}
                    labels={{
                      english: dictionary.settings.english,
                      hebrew: dictionary.settings.hebrew
                    }}
                  />
                </CardContent>
              </Card>
            </section>

            {/* ── Roadmap / future ──────────────────────────────────── */}
            <section id="roadmap" className="scroll-mt-24 space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Wrench className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <CardTitle className="text-base">{dictionary.settings.futureTitle}</CardTitle>
                    <HelpTip>
                      {lang(
                        "מה נחבר בהמשך, בשקיפות לגבי מה שעדיין לא בנוי.",
                        "What we'll wire up next. Honest about what's not built yet."
                      )}
                    </HelpTip>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.oauthTodo}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.costTodo}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{dictionary.settings.notificationsTodo}</p>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SetupHealthChecklist({
  report,
  locale
}: {
  report: import("@/lib/services/setup-health-service").SetupHealthReport;
  locale: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const tone =
    report.confidenceLevel === "high"
      ? "border-emerald-200 bg-emerald-50"
      : report.confidenceLevel === "medium"
        ? "border-amber-200 bg-amber-50"
        : "border-rose-200 bg-rose-50";
  const scoreColor =
    report.confidenceLevel === "high"
      ? "text-emerald-800"
      : report.confidenceLevel === "medium"
        ? "text-amber-800"
        : "text-rose-800";
  const sections: Array<{
    id: import("@/lib/services/setup-health-service").SetupCheck["category"];
    title: { he: string; en: string };
  }> = [
    {
      id: "connections",
      title: { he: "חיבורים", en: "Connections" }
    },
    {
      id: "configuration",
      title: { he: "הגדרות", en: "Configuration" }
    },
    {
      id: "data_quality",
      title: { he: "איכות נתונים", en: "Data quality" }
    }
  ];
  const checksByCategory = new Map<string, typeof report.checks>();
  for (const c of report.checks) {
    const existing = checksByCategory.get(c.category) ?? [];
    existing.push(c);
    checksByCategory.set(c.category, existing);
  }

  return (
    <div className={`rounded-xl border ${tone} p-5`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lang("ביטחון בנתונים", "Data confidence")}
          </p>
          <p className={`text-2xl sm:text-3xl font-bold ${scoreColor}`}>
            {report.score}%{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({report.passed}/{report.checks.length} {lang("עברו", "passing")})
            </span>
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {report.failed > 0 ? (
            <p>
              <strong className="text-rose-800">{report.failed}</strong>{" "}
              {lang("חיבורים/הגדרות חסרים", "missing setup items")}
            </p>
          ) : null}
          {report.warnings > 0 ? (
            <p>
              <strong className="text-amber-800">{report.warnings}</strong>{" "}
              {lang("אזהרות לשיפור דיוק", "warnings to improve accuracy")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {sections.map((section) => {
          const items = checksByCategory.get(section.id) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title[isHe ? "he" : "en"]}
              </p>
              <ul className="space-y-2">
                {items.map((c) => {
                  const Icon =
                    c.status === "pass"
                      ? CheckCircle2
                      : c.status === "warning"
                        ? AlertTriangle
                        : XCircle;
                  const iconColor =
                    c.status === "pass"
                      ? "text-emerald-600"
                      : c.status === "warning"
                        ? "text-amber-600"
                        : "text-rose-600";
                  return (
                    <li
                      key={c.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor}`} aria-hidden />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">
                          {c.title[isHe ? "he" : "en"]}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {c.description[isHe ? "he" : "en"]}
                        </p>
                        {c.status !== "pass" && c.fixHref && c.fixLabel ? (
                          <a
                            href={c.fixHref}
                            className="mt-1.5 inline-block text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
                          >
                            → {c.fixLabel[isHe ? "he" : "en"]}
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
