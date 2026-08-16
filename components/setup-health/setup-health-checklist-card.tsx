import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SetupHealthReport, SetupCheck } from "@/lib/services/setup-health-service";

// Compact setup checklist for the Command Center — the Triple Whale-style
// "finish connecting your data" card. Complements the small SetupHealthBadge:
// the badge is the always-on score, this card is the actionable to-do list.
//
// Rendering rules:
//  - Hidden entirely once every check passes (nothing to do → no card).
//  - Failed + warning checks render as rows with a description and fix link.
//  - Passed checks collapse into a single line of green chips — proof of
//    progress without eating vertical space.

function statusIcon(status: SetupCheck["status"]) {
  if (status === "pass") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  }
  if (status === "warning") {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;
  }
  return <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />;
}

export function SetupHealthChecklistCard({
  report,
  locale = "he"
}: {
  report: SetupHealthReport;
  locale?: "he" | "en";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const open = report.checks.filter((c) => c.status !== "pass");
  if (open.length === 0) return null;

  const passed = report.checks.filter((c) => c.status === "pass");
  // Failures first (blocking accuracy), warnings after; heavier weight first
  // inside each group so the founder fixes the most impactful gap first.
  const ordered = [...open].sort((a, b) =>
    a.status === b.status ? b.weight - a.weight : a.status === "fail" ? -1 : 1
  );

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {lang("השלמת הגדרה", "Finish your setup")}
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              {passed.length}/{report.checks.length}{" "}
              {lang("הושלמו", "done")} · {lang("דיוק נתונים", "data accuracy")} {report.score}%
            </span>
          </CardTitle>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full rounded-full transition-all ${
              report.score >= 80 ? "bg-emerald-500" : report.score >= 50 ? "bg-amber-500" : "bg-rose-500"
            }`}
            style={{ width: `${report.score}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {ordered.map((check) => (
            <li key={check.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
              <span className="mt-0.5">{statusIcon(check.status)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-5">
                  {isHe ? check.title.he : check.title.en}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {isHe ? check.description.he : check.description.en}
                </p>
              </div>
              {check.fixHref ? (
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  href={check.fixHref as any}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  {check.fixLabel ? (isHe ? check.fixLabel.he : check.fixLabel.en) : lang("לתקן", "Fix")}
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        {passed.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {passed.map((check) => (
              <span
                key={check.id}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {isHe ? check.title.he : check.title.en}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
