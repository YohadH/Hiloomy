import type { GrowthPlatformConnection } from "@/lib/domain/growth-agent-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";
import { getConnectorDefinition } from "@/lib/services/growth-agent-connectors";

export function GrowthConnectionsPanel({
  connections,
  locale = "he"
}: {
  connections: GrowthPlatformConnection[];
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{lang("חיבורים", "Connections")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {connections.map((connection) => {
          const definition = getConnectorDefinition(connection.platform);
          return (
            <div key={connection.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{definition?.displayName ?? connection.platform}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{connection.healthMessage ?? lang("אין עדיין סטטוס למחבר.", "No connector status yet.")}</p>
                </div>
                <GrowthStatusBadge status={connection.status} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{lang("סנכרון אחרון:", "Last sync:")} {connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString(isHe ? "he-IL" : "en-US") : lang("מעולם לא", "Never")}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
