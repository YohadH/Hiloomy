import type { GrowthMonitoringCard, GrowthTrafficChannel } from "@/lib/domain/growth-agent-types";
import { Card, CardContent } from "@/components/ui/card";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";
import { formatCurrency, formatNumber, formatSignedPercent } from "@/lib/utils";

function formatMetric(card: GrowthMonitoringCard, currency: string) {
  if (card.unit === "currency") return formatCurrency(card.data.current, currency);
  if (card.unit === "percent") return `${card.data.current.toFixed(2)}%`;
  return formatNumber(card.data.current);
}

export function GrowthMonitoringGrid({ cards, trafficChannels, currency }: { cards: GrowthMonitoringCard[]; trafficChannels: GrowthTrafficChannel[]; currency: string }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{formatMetric(card, currency)}</p>
                </div>
                <GrowthStatusBadge status={card.data.status} />
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <p>vs yesterday {formatSignedPercent(card.data.previousDayDelta)}</p>
                <p>vs 7 days {formatSignedPercent(card.data.last7DaysDelta)}</p>
              </div>
              <p className="text-xs text-muted-foreground">Confidence {Math.round(card.data.confidence * 100)}%</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Traffic by channel</h3>
              <p className="text-sm text-muted-foreground">Use channel deltas to separate traffic issues from conversion issues.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {trafficChannels.map((channel) => (
              <div key={channel.channel} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{channel.channel}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{formatNumber(channel.sessions)} sessions</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(channel.revenue, currency)} revenue</p>
                  </div>
                  <GrowthStatusBadge status={channel.status} />
                </div>
                <p className="mt-3 text-sm font-medium">{formatSignedPercent(channel.delta)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Confidence {Math.round(channel.confidence * 100)}%</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
