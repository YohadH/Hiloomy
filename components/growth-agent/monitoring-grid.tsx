import type { GrowthMonitoringCard, GrowthTrafficChannel } from "@/lib/domain/growth-agent-types";
import { Card, CardContent } from "@/components/ui/card";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";
import { formatCurrency, formatNumber, formatSignedPercent } from "@/lib/utils";
import { getGrowthMetricLabel } from "@/lib/i18n/growth-agent-labels";

function formatMetric(card: GrowthMonitoringCard, currency: string) {
  if (card.unit === "currency") return formatCurrency(card.data.current, currency);
  if (card.unit === "percent") return `${card.data.current.toFixed(2)}%`;
  return formatNumber(card.data.current);
}

export function GrowthMonitoringGrid({
  cards,
  trafficChannels,
  currency,
  locale = "he"
}: {
  cards: GrowthMonitoringCard[];
  trafficChannels: GrowthTrafficChannel[];
  currency: string;
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{getGrowthMetricLabel(card.key, card.label, locale)}</p>
                  <p className="mt-2 text-2xl font-semibold">{formatMetric(card, currency)}</p>
                </div>
                <GrowthStatusBadge status={card.data.status} locale={locale} />
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <p>{lang("מול אתמול", "vs yesterday")} {formatSignedPercent(card.data.previousDayDelta)}</p>
                <p>{lang("מול 7 ימים", "vs 7 days")} {formatSignedPercent(card.data.last7DaysDelta)}</p>
              </div>
              <p className="text-xs text-muted-foreground">{lang("רמת ביטחון", "Confidence")} {Math.round(card.data.confidence * 100)}%</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{lang("תנועה לפי ערוץ", "Traffic by channel")}</h3>
              <p className="text-sm text-muted-foreground">{lang("השתמשו בהפרשים לפי ערוץ כדי להפריד בין בעיות תנועה לבעיות המרה.", "Use channel deltas to separate traffic issues from conversion issues.")}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {trafficChannels.map((channel) => (
              <div key={channel.channel} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{channel.channel}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{formatNumber(channel.sessions)} {lang("ביקורים", "sessions")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(channel.revenue, currency)} {lang("הכנסות", "revenue")}</p>
                  </div>
                  <GrowthStatusBadge status={channel.status} locale={locale} />
                </div>
                <p className="mt-3 text-sm font-medium">{formatSignedPercent(channel.delta)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{lang("רמת ביטחון", "Confidence")} {Math.round(channel.confidence * 100)}%</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
