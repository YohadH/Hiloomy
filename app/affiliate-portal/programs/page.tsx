import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePrograms } from "@/lib/services/affiliate-portal-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function AffiliateProgramsPage() {
  const [chrome, programs] = await Promise.all([getAppChromeData(), getAffiliatePrograms()]);
  const program = programs[0];

  return (
    <AppShell store={chrome.store} controls={chrome.controls} localeOverride="en">
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Affiliate Portal"
          title="Programs, launch, and setup"
          description="Review the current affiliate program, the launch checklist, and the sign-up flow in one place."
        />
        <AffiliatePortalNav />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{program.name}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Affiliates earn {program.defaultCommissionRate}% commission on every approved order.
              </p>
            </div>
            <Button>Create program</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Affiliates</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(program.affiliates)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Orders</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(program.orders)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Sales</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(program.sales, chrome.store.currency)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Affiliate sign-up link</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="min-w-0 break-all text-sm">{program.signUpLink}</p>
                <Button variant="secondary" className="w-full md:w-auto">Copy</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Store embeds and blocks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-semibold">Active App Blocks</p>
              <p className="mt-2 text-sm text-muted-foreground">
                No active app blocks are enabled in the store yet. Use this area for embeds, portal pages, and widgets.
              </p>
            </div>
            <Button variant="secondary">View details</Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Setup guide</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {program.checklist.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.group}</p>
              <p className="mt-2 font-semibold">{item.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.done ? "Completed" : "Pending"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional growth levers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Recruit affiliates", "Expand recruitment with sign-up pages, marketplace placements, and post-purchase widgets."],
            ["Motivate affiliates", "Use bonuses, creative packs, gifts, and campaigns to increase output."],
            ["Other", "Layer in email, referral programs, royalty workflows, and advanced tracking as the program grows."]
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-semibold">{title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
