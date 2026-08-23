import type { GrowthFinding } from "@/lib/domain/growth-agent-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GrowthStatusBadge } from "@/components/growth-agent/status-badge";

export function GrowthFindingsList({
  findings,
  title,
  locale = "he"
}: {
  findings: GrowthFinding[];
  title?: string;
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);
  const resolvedTitle = title ?? lang("ממצאי הסוכן", "Agent Findings");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{resolvedTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {findings.length ? findings.map((finding) => (
          <div key={finding.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <GrowthStatusBadge status={finding.severity} locale={locale} />
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground" dir="ltr">{finding.metricName}</span>
                </div>
                <p className="text-base font-semibold">{finding.summary}</p>
                <p className="text-sm text-muted-foreground">{lang("גורמים אפשריים:", "Possible causes:")} {finding.possibleCauses.join(" • ")}</p>
                <p className="text-sm text-muted-foreground">{lang("פעולה מומלצת:", "Recommended action:")} {finding.recommendedActions.join(" • ")}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>{new Date(finding.timestamp).toLocaleString(isHe ? "he-IL" : "en-US")}</p>
                <p className="mt-2">{lang("רמת ביטחון", "Confidence")} {Math.round(finding.confidenceScore * 100)}%</p>
              </div>
            </div>
          </div>
        )) : <p className="text-sm text-muted-foreground">{lang("אין ממצאים עדיין. הריצו סריקה ידנית כדי למלא את פיד הניטור.", "No findings yet. Run a manual scan to populate the monitoring feed.")}</p>}
      </CardContent>
    </Card>
  );
}
