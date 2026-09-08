import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GoogleAdsOverview } from "@/lib/services/google-ads-service";

// Google Ads campaigns for the selected window — the Meta section's sibling.
// Conversion value here is what Google reports for its own conversion
// actions; it is not reconciled with Shopify orders, and the label says so.
export function GoogleAdsSection({
  overview,
  isHe,
  breakevenRoas
}: {
  overview: GoogleAdsOverview;
  isHe: boolean;
  breakevenRoas: number | null;
}) {
  const t = (he: string, en: string) => (isHe ? he : en);
  const money = (n: number) => `${overview.currency === "ILS" || !overview.currency ? "₪" : `${overview.currency} `}${Math.round(n).toLocaleString("en-US")}`;
  const nf = (n: number) => n.toLocaleString("en-US");
  const rows = overview.campaigns;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{t("קמפיינים ב־Google Ads", "Google Ads campaigns")}</p>
            <p className="text-xs text-muted-foreground">
              {overview.customerName ?? overview.customerId} · {overview.rangeStart} → {overview.rangeEnd}
              {overview.dataThrough ? ` · ${t("נתונים עד", "data through")} ${overview.dataThrough}` : ""}
            </p>
          </div>
          <dl className="flex gap-5 text-end">
            <div>
              <dt className="text-xs text-muted-foreground">{t("הוצאה", "Spend")}</dt>
              <dd className="text-sm font-semibold tabular-nums">{money(overview.totalSpend)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("המרות", "Conversions")}</dt>
              <dd className="text-sm font-semibold tabular-nums">{nf(Math.round(overview.totalConversions))}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("ערך המרות", "Conv. value")}</dt>
              <dd className="text-sm font-semibold tabular-nums">{money(overview.totalConversionsValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">ROAS</dt>
              <dd className={cn("text-sm font-semibold tabular-nums", overview.blendedRoas !== null && breakevenRoas !== null && overview.blendedRoas < breakevenRoas ? "text-danger" : "text-success")}>
                {overview.blendedRoas === null ? "—" : `${overview.blendedRoas.toFixed(2)}×`}
              </dd>
            </div>
          </dl>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("אין קמפיינים עם חשיפות בחלון הזה. לחצו סנכרון עכשיו בהגדרות אם החשבון חובר זה עתה.", "No campaigns with impressions in this window. Press Sync now in Settings if the account was just connected.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-2 pe-4 text-start">{t("קמפיין", "Campaign")}</th>
                  <th className="py-2 pe-4 text-start">{t("סוג", "Type")}</th>
                  <th className="py-2 pe-4 text-end">{t("הוצאה", "Spend")}</th>
                  <th className="py-2 pe-4 text-end">{t("קליקים", "Clicks")}</th>
                  <th className="py-2 pe-4 text-end">CTR</th>
                  <th className="py-2 pe-4 text-end">{t("המרות", "Conv.")}</th>
                  <th className="py-2 pe-4 text-end">{t("עלות להמרה", "CPA")}</th>
                  <th className="py-2 text-end">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((c) => {
                  const below = c.roas !== null && breakevenRoas !== null && c.roas < breakevenRoas;
                  return (
                    <tr key={c.campaignId}>
                      <td className="py-2 pe-4">
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", c.activeRecently ? "bg-success" : "bg-border")} />
                          <span className="font-medium">{c.campaignName}</span>
                        </span>
                      </td>
                      <td className="py-2 pe-4 text-xs text-muted-foreground">{(c.channelType ?? "").replace(/_/g, " ").toLowerCase()}</td>
                      <td className="py-2 pe-4 text-end tabular-nums">{money(c.spend)}</td>
                      <td className="py-2 pe-4 text-end tabular-nums">{nf(c.clicks)}</td>
                      <td className="py-2 pe-4 text-end tabular-nums">{c.ctr === null ? "—" : `${(c.ctr * 100).toFixed(2)}%`}</td>
                      <td className="py-2 pe-4 text-end tabular-nums">{c.conversions === 0 ? "0" : c.conversions.toFixed(1)}</td>
                      <td className="py-2 pe-4 text-end tabular-nums">{c.cpa === null ? "—" : money(c.cpa)}</td>
                      <td className={cn("py-2 text-end font-semibold tabular-nums", below ? "text-danger" : c.roas !== null ? "text-success" : "text-muted-foreground")}>
                        {c.roas === null ? t("ללא המרות", "no conv.") : `${c.roas.toFixed(2)}×`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {breakevenRoas !== null
            ? t(`נקודת האיזון של החנות: ROAS ${breakevenRoas.toFixed(1)}×. ערך ההמרות הוא כפי ש־Google מדווח, לא מאומת מול הזמנות Shopify.`, `Store breakeven: ROAS ${breakevenRoas.toFixed(1)}×. Conversion value is as Google reports it, not reconciled with Shopify orders.`)
            : t("ערך ההמרות הוא כפי ש־Google מדווח, לא מאומת מול הזמנות Shopify. נקודת איזון תוצג כשכיסוי העלויות יספיק.", "Conversion value is as Google reports it, not reconciled with Shopify orders. Breakeven appears once cost coverage is sufficient.")}
        </p>
      </CardContent>
    </Card>
  );
}
