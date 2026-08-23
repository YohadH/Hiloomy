import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { UploadBixGrowCsvButton } from "@/components/affiliate-portal/upload-bixgrow-csv-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePortalSettings } from "@/lib/services/affiliate-portal-service";
import { getAppLocale } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AffiliatePortalSettingsPage() {
  const [chrome, settings, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliatePortalSettings(),
    getAppLocale()
  ]);
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const onOff = (v: boolean) => (v ? lang("מופעל", "Enabled") : lang("כבוי", "Disabled"));
  const senderLabel = settings.senderEmail
    ? `${settings.senderName} - ${settings.senderEmail}`
    : settings.senderName || lang("לא הוגדר", "Not configured");

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
          title={lang("הגדרות פורטל, מיתוג והתראות", "Portal settings, branding, and notifications")}
          description={lang(
            "סקירת ההגדרות הנוכחיות של פורטל השותפים — מיתוג, התראות ובקרות תוכנית מתקדמות.",
            "Review the current affiliate portal configuration for branding, notifications, and advanced program controls."
          )}
        />
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{lang("פורטל השותפים", "Affiliate portal")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">{lang("שם הפורטל", "Portal name")}</p>
                <p className="mt-2 font-semibold">{settings.brandingName}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">{lang("שפה", "Language")}</p>
                <p className="mt-2 font-semibold">{settings.portalLanguage}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">{lang("דומיין החנות", "Store domain")}</p>
                <p className="mt-2 font-semibold" dir="ltr">{settings.storeDomain}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang("מיתוג", "Branding")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                {lang(
                  "לוגו, אייקון, קישורי סושיאל ועמודי פורטל ממותגים — מוכנים לחיבור לאחסון ולתהליכי העלאה.",
                  "Logo, favicon, social links, and branded portal pages are ready to be connected to real storage and upload flows."
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{lang("התראות", "Notifications")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">{lang("שולח", "Sender")}</p>
                <p className="mt-2 font-semibold">{senderLabel}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                {lang("אוטומציית הזמנות", "Invite automation")}: {onOff(settings.inviteAutomationEnabled)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                {lang("מייל על הזמנה משותפה", "Referral order email")}: {onOff(settings.referralOrderEmailEnabled)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                {lang("התראות שיוך קופון", "Coupon assignment notifications")}: {onOff(settings.couponAssignmentEnabled)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang("מתקדם", "Advanced")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                {lang("טפסי מס", "W-9 / tax forms")}: {onOff(settings.advanced.collectTaxForms)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                {lang("מעקב הזמנות ממתינות", "Track pending referral orders")}: {onOff(settings.advanced.trackPendingOrders)}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Webhooks: {settings.advanced.webhookReady ? lang("מוכן", "Ready") : lang("לא מוכן", "Not ready")}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{lang("ייבוא שיוכים מBixGrow", "BixGrow attribution import")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {lang(
                  "BixGrow היא פלטפורמת ייצוא ידני. הורידו את קובץ ההמרות (CSV) מהדשבורד של BixGrow והעלו אותו כאן כדי לייבא שיוכי שותפות. העלאה חוזרת של אותו קובץ בטוחה — שורות מזוהות לפי שותפה והזמנה ולא ייכפלו.",
                  "BixGrow is a manual-export platform. Download the conversions CSV from your BixGrow dashboard, then upload it here to import affiliate attributions. Re-uploading the same export is safe — rows are deduplicated by affiliate and order."
                )}
              </p>
              <UploadBixGrowCsvButton />
            </CardContent>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
