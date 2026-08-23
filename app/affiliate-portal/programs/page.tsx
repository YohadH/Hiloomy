import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { AffiliatePortalNav } from "@/components/affiliate-portal/portal-nav";
import { ReturningPolicyCard } from "@/components/affiliate-portal/returning-policy-card";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { getAffiliatePrograms } from "@/lib/services/affiliate-portal-service";
import { getAppLocale } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Fully bilingual (2026-08-23). The localeOverride="en" pin that used to
// be here forced the WHOLE shell — sidebar included — into English for
// Hebrew users the moment they opened the affiliate portal.

export default async function AffiliateProgramsPage() {
  const [chrome, programs, locale] = await Promise.all([
    getAppChromeData(),
    getAffiliatePrograms(),
    getAppLocale()
  ]);
  const program = programs[0];
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <section className="space-y-4">
        <SectionHeading
          eyebrow={lang("פורטל שותפים", "Affiliate Portal")}
          title={lang("תוכניות, השקה והגדרות", "Programs, launch, and setup")}
          description={lang(
            "סקירת תוכנית השותפים הנוכחית, מדיניות העמלות ותהליך ההצטרפות — במקום אחד.",
            "Review the current affiliate program, the launch checklist, and the sign-up flow in one place."
          )}
        />
        <AffiliatePortalNav locale={isHe ? "he" : "en"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{program.name}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                {lang(
                  `שותפות מרוויחות ${program.defaultCommissionRate}% עמלה על כל הזמנה מאושרת.`,
                  `Affiliates earn ${program.defaultCommissionRate}% commission on every approved order.`
                )}
              </p>
            </div>
            <Button>{lang("יצירת תוכנית", "Create program")}</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{lang("שותפות", "Affiliates")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(program.affiliates)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{lang("הזמנות", "Orders")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(program.orders)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{lang("מכירות", "Sales")}</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(program.sales, chrome.store.currency)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">
                {lang("קישור הצטרפות לשותפות", "Affiliate sign-up link")}
              </p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="min-w-0 break-all text-sm" dir="ltr">
                  {program.signUpLink}
                </p>
                <Button variant="secondary" className="w-full md:w-auto">
                  {lang("העתקה", "Copy")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <ReturningPolicyCard
            storeId={chrome.store.id}
            locale={isHe ? "he" : "en"}
            baseRatePct={program.defaultCommissionRate}
            initialPolicy={program.returningCustomerPolicy}
            initialReturningRatePct={program.returningCommissionRatePct}
            initialReactivationWindowDays={program.reactivationWindowDays}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{lang("הטמעות ובלוקים בחנות", "Store embeds and blocks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-semibold">{lang("בלוקים פעילים באפליקציה", "Active App Blocks")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {lang(
                  "עדיין אין בלוקים פעילים בחנות. כאן יופיעו הטמעות, עמודי פורטל ווידג'טים.",
                  "No active app blocks are enabled in the store yet. Use this area for embeds, portal pages, and widgets."
                )}
              </p>
            </div>
            <Button variant="secondary">{lang("פרטים נוספים", "View details")}</Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{lang("מדריך הגדרה", "Setup guide")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {program.checklist.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.group}</p>
              <p className="mt-2 font-semibold">{item.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.done ? lang("הושלם", "Completed") : lang("ממתין", "Pending")}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lang("מנופי צמיחה נוספים", "Additional growth levers")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            [
              lang("גיוס שותפות", "Recruit affiliates"),
              lang(
                "הרחיבו את הגיוס עם עמודי הרשמה, מיקומים במרקטפלייס ווידג'טים אחרי רכישה.",
                "Expand recruitment with sign-up pages, marketplace placements, and post-purchase widgets."
              )
            ],
            [
              lang("הנעת שותפות", "Motivate affiliates"),
              lang(
                "השתמשו בבונוסים, חבילות קריאייטיב, מתנות וקמפיינים כדי להגדיל תפוקה.",
                "Use bonuses, creative packs, gifts, and campaigns to increase output."
              )
            ],
            [
              lang("ועוד", "Other"),
              lang(
                "הוסיפו אימייל, תוכניות הפניה, תגמולים ומעקב מתקדם ככל שהתוכנית גדלה.",
                "Layer in email, referral programs, royalty workflows, and advanced tracking as the program grows."
              )
            ]
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
