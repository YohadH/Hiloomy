import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { SetupHealthReport } from "@/lib/services/setup-health-service";

// Small inline badge for the Command Center / chrome. Links to Settings
// where the full checklist lives. Click target is the whole badge.

export function SetupHealthBadge({
  report,
  locale = "he",
  href = "/settings"
}: {
  report: SetupHealthReport;
  locale?: "he" | "en";
  href?: string;
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  const Icon =
    report.confidenceLevel === "high"
      ? ShieldCheck
      : report.confidenceLevel === "medium"
        ? ShieldAlert
        : ShieldX;
  const tone =
    report.confidenceLevel === "high"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : report.confidenceLevel === "medium"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-rose-300 bg-rose-50 text-rose-900";

  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors hover:brightness-95 ${tone}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>
        {lang("ביטחון בנתונים", "Data confidence")}: {report.score}%
      </span>
      {report.failed > 0 ? (
        <span className="rounded-full bg-rose-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {report.failed} {lang("חסר", "missing")}
        </span>
      ) : null}
    </a>
  );
}
