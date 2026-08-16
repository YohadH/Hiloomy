import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { UploadBixGrowCsvButton } from "@/components/affiliate-portal/upload-bixgrow-csv-button";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePortalSettings } from "@/lib/services/affiliate-portal-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AffiliatePortalSettingsPage() {
  const [chrome, settings] = await Promise.all([getAppChromeData(), getAffiliatePortalSettings()]);
  const senderLabel = settings.senderEmail
    ? `${settings.senderName} - ${settings.senderEmail}`
    : settings.senderName || "Not configured";

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Affiliate Portal"
          title="Portal settings, branding, and notifications"
          description="Review the current affiliate portal configuration for branding, notifications, and advanced program controls."
        />
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Affiliate portal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">Portal name</p>
                <p className="mt-2 font-semibold">{settings.brandingName}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">Language</p>
                <p className="mt-2 font-semibold">{settings.portalLanguage}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">Store domain</p>
                <p className="mt-2 font-semibold">{settings.storeDomain}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Logo, favicon, social links, and branded portal pages are ready to be connected to real storage and upload flows.
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-muted-foreground">Sender</p>
                <p className="mt-2 font-semibold">{senderLabel}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Invite automation: {settings.inviteAutomationEnabled ? "Enabled" : "Disabled"}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Referral order email: {settings.referralOrderEmailEnabled ? "Enabled" : "Disabled"}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Coupon assignment notifications: {settings.couponAssignmentEnabled ? "Enabled" : "Disabled"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Advanced</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                W-9 / tax forms: {settings.advanced.collectTaxForms ? "Enabled" : "Disabled"}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Track pending referral orders: {settings.advanced.trackPendingOrders ? "Enabled" : "Disabled"}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                Webhooks ready: {settings.advanced.webhookReady ? "Ready" : "Not ready"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>BixGrow attribution import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                BixGrow is a manual-export platform. Download the conversions CSV from your BixGrow dashboard, then
                upload it here to import affiliate attributions. Re-uploading the same export is safe — rows are
                deduplicated by affiliate and order.
              </p>
              <UploadBixGrowCsvButton />
            </CardContent>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
