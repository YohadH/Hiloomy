// The creatives behind the Meta campaigns — Command Center (owner ask,
// 2026-09-23). Sits beside the campaign list: same window, ranked by the
// sales each ad brought, and every card names its campaign first so the
// reader can match it to the list on the other side.

import { ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MetaTopCreative } from "@/lib/services/meta-top-creatives-service";
import { cn } from "@/lib/utils";

function cleanLabel(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\{\{[^}]+}}/g, "").replace(/\b[0-9a-f]{18,}\b/gi, "").replace(/[-_ ]{2,}/g, " ").replace(/^[\s_-]+|[\s_-]+$/g, "").trim();
  if (!cleaned || /^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  return cleaned;
}

export function MetaTopCreatives({ creatives, isHe, rangeLabel, profitLine = 1 }: { creatives: MetaTopCreative[]; isHe: boolean; rangeLabel: string; profitLine?: number }) {
  const lang = (he: string, en: string) => (isHe ? he : en);
  const nf = new Intl.NumberFormat(isHe ? "he-IL" : "en-US");
  const money = (n: number) => `₪${nf.format(Math.round(n))}`;
  const roasTone = (roas: number | null) => (roas == null ? "text-muted-foreground" : roas >= profitLine * 2 ? "text-emerald-700" : roas >= profitLine ? "text-amber-700" : "text-rose-700");

  return (
    <Card>
      <CardContent className="p-4">
        <div>
          <p className="text-sm font-bold text-foreground">{lang("הקריאייטיבים שמכרו הכי הרבה", "The creatives that sold the most")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {lang(`${rangeLabel} · מדורג לפי מכירות משויכות לפי Meta · כל כרטיס מציין לאיזה קמפיין הוא שייך`, `${rangeLabel} · ranked by Meta-attributed sales · each card names its campaign`)}
          </p>
        </div>

        {creatives.length ? (
          <ol className="mt-3 space-y-2">
            {creatives.map((c, i) => {
              const campaign = cleanLabel(c.campaignName) ?? lang("קמפיין ללא שם", "Unnamed campaign");
              const adLabel = cleanLabel(c.adName) ?? cleanLabel(c.creativeTitle) ?? lang("מודעה", "Ad");
              const link = c.previewUrl ?? c.permalinkUrl ?? null;
              return (
                <li key={c.adId} className="rounded-xl border border-border/60 bg-background p-3">
                  <div className="flex gap-3">
                    <div className="relative shrink-0">
                      {c.thumbnailUrl ? (
                        <img src={c.thumbnailUrl} alt={adLabel} className="h-[72px] w-[72px] rounded-lg border border-border object-cover" />
                      ) : (
                        <div className="grid h-[72px] w-[72px] place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
                          <ImageOff className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                      <span className="absolute -top-1.5 -start-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] font-bold text-background">{i + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Campaign first — this is how the card maps to the list beside it. */}
                      <p className="truncate text-[11px] font-semibold text-muted-foreground" title={campaign}>
                        <span className="me-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" aria-hidden />
                        {campaign}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="truncate text-sm font-semibold" title={adLabel}>{adLabel}</p>
                        <p className="text-sm font-bold tabular-nums text-emerald-800">
                          {money(c.revenue)} <span className="text-[11px] font-medium text-muted-foreground">{lang("מכירות", "sales")}</span>
                        </p>
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                        <span>{c.purchases} {lang("רכישות", "purchases")}</span>
                        <span>{lang("הוצאה", "spend")} {money(c.spend)}</span>
                        <span className={cn("font-semibold", roasTone(c.roas))}>ROAS {c.roas == null ? "—" : `×${c.roas.toFixed(2)}`}</span>
                        {c.cpa != null ? <span>CPA {money(c.cpa)}</span> : null}
                        {c.ctr != null ? <span>CTR {c.ctr.toFixed(2)}%</span> : null}
                      </p>
                      {c.creativeBody ? <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-foreground/80">{c.creativeBody}</p> : null}
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11px] font-semibold text-foreground underline-offset-4 hover:underline">
                          {lang("פתיחת המודעה", "Open the ad")}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {lang("אין עדיין שורות ברמת מודעה בחלון הזה. הסנכרון של Meta צריך הרשאת ads_read כדי להוריד קריאייטיבים.", "No ad-level rows in this window yet. The Meta sync needs ads_read to pull creatives.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
