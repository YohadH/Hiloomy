import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PageHead, SectionHead } from "@/components/dashboard-v2/section-head";
import { ShopifyConnectionManager } from "@/components/settings/shopify-connection-manager";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { CreatorConnectionsManager } from "@/components/settings/creator-connections-manager";
import { MetaAdsConnectionManager } from "@/components/settings/meta-ads-connection-manager";
import { WeeklyReportRecipientsManager } from "@/components/settings/weekly-report-recipients-manager";
import { CompetitorSetManager } from "@/components/settings/competitor-set-manager";
import { GscConnectionManager } from "@/components/settings/gsc-connection-manager";
import { IntegrationsHub, type IntegrationItem } from "@/components/settings/integrations-hub";
import { SettingsTabs, type SettingsNavItem } from "@/components/settings/settings-nav";
import { BixGrowWebhookCard } from "@/components/settings/bixgrow-webhook-card";
import {
  SetupHealthSection,
  ReportingSection,
  OrganizationSection,
  LanguageSection,
  RoadmapSection
} from "@/components/settings/sections";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getShopifyConnectionSummary } from "@/lib/services/shopify-connection-service";
import { getSyncStatus } from "@/lib/services/shopify-sync-service";
import { getMetaAdsConnectionSummary } from "@/lib/services/meta-ads-service";
import { buildSetupHealth } from "@/lib/services/setup-health-service";
import { getAppLocale, getDictionary } from "@/lib/i18n";
import { getDb } from "@/lib/server/db";
import { GSC_PLATFORM } from "@/lib/services/gsc-service";
import { getAuthContext } from "@/lib/auth/session";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{
    gsc_connected?: string;
    gsc_error?: string;
    meta_connected?: string;
    meta_error?: string;
    meta_account?: string;
    meta_multi?: string;
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
  const metaOauthResult =
    params.meta_connected === "true" || params.meta_error
      ? {
          connected: params.meta_connected === "true",
          account: params.meta_account ?? null,
          multi: params.meta_multi === "1",
          error: params.meta_error ?? null
        }
      : null;

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

  // Organization context — best-effort: a dev environment without auth
  // simply hides the section.
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

  // Public URL the BixGrow webhook URL is built from.
  const publicAppUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
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
      id: "google",
      name: "Google",
      category: lang("אנליטיקס", "Analytics"),
      description: lang(
        "חיבור אחד לשירותי Google: נתוני חיפוש מSearch Console עכשיו, GA4 בקרוב.",
        "One connection for Google services: Search Console data now, GA4 coming soon."
      ),
      status: gscConnection
        ? gscConnection.status === "error"
          ? "attention"
          : "connected"
        : "not_connected"
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
        locale={locale}
      />
    ),
    meta: (
      <MetaAdsConnectionManager
        storeId={chrome.store.id}
        initialConnection={metaAdsConnection}
        isHe={isHe}
        oauthResult={metaOauthResult}
      />
    ),
    instagram: <CreatorConnectionsManager labels={dictionary.creator} />,
    google: (
      <div className="space-y-4">
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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        {lang(
          "בקרוב באותו חיבור: Google Analytics 4 — אירועי אתר והמרות לכל מוצר.",
          "Coming to this same connection: Google Analytics 4 — site events and per-product conversion."
        )}
      </p>
      </div>
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

  // Auto-open the relevant modal: OAuth round-trips land back here with
  // query params; otherwise an unconnected store is the top priority.
  const initialOpen =
    metaOauthResult ? "meta" : gscConnected || gscError ? "google" : !isConnected ? "shopify" : null;

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

        <SettingsTabs
          items={navItems}
          isHe={isHe}
          initialTab={initialOpen ? "integrations" : undefined}
          panels={{
            "setup-health": (
              <div className="space-y-3">
              <SectionHead
                eyebrow={lang("סקירה", "Overview")}
                title={lang("סטטוס הגדרה וביטחון בנתונים", "Setup status & data confidence")}
                hint={lang(
                  "כמה מהחיבורים וההגדרות שמשפיעים על דיוק הדוחות כבר במקום.",
                  "How many of the connections and settings that drive report accuracy are in place."
                )}
              />
              {setupHealth ? (
                <SetupHealthSection report={setupHealth} locale={locale} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {lang("סטטוס ההגדרה יופיע אחרי חיבור החנות.", "Setup status appears once the store is connected.")}
                </p>
              )}
            </div>
            ),

            "integrations": (
              <div className="space-y-3">
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
                requestEmail="yoadhakimv@gmail.com"
              />
            </div>
            ),

            "reporting": (
              <div className="space-y-3">
              <SectionHead
                eyebrow={lang("דוחות", "Reporting")}
                title={dictionary.settings.reportingTitle}
                hint={dictionary.settings.reportingDescription}
              />
              <ReportingSection
                dictionary={dictionary}
                rows={[
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
                ]}
              />
            </div>
            ),

            "weekly-report": (
              <div className="space-y-3">
              <Card>
                <CardContent className="pt-6">
                  <WeeklyReportRecipientsManager isHe={isHe} />
                </CardContent>
              </Card>
            </div>
            ),

            "competitors": (
              <div className="space-y-3">
              <Card>
                <CardContent className="pt-6">
                  <CompetitorSetManager isHe={isHe} />
                </CardContent>
              </Card>
            </div>
            ),

            ...(orgSummary
              ? {
                  organization: (
                    <div className="space-y-3">
                      <OrganizationSection org={orgSummary} isHe={isHe} />
                    </div>
                  )
                }
              : {}),

            "language": (
              <div className="space-y-3">
              <LanguageSection dictionary={dictionary}>
                <LanguageSwitcher
                  locale={locale}
                  labels={{
                    english: dictionary.settings.english,
                    hebrew: dictionary.settings.hebrew
                  }}
                />
              </LanguageSection>
            </div>
            ),

            "roadmap": (
              <div className="space-y-3">
              <RoadmapSection dictionary={dictionary} isHe={isHe} />
            </div>
            )
          }}
        />
      </div>
    </AppShell>
  );
}
