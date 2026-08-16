import type { CohortRetentionReport } from "@/lib/services/cohort-retention-service";

// Classic retention triangle. Rows = acquisition cohort (newest at top),
// columns = months since first order. Cell shading scales with retention
// rate so the eye picks up the curve without reading every number.
//
// Read-only — no client JS. The picker for window length lives on the page.

function formatMonthLabel(yyyyMm: string, locale: "he" | "en"): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    year: "2-digit"
  });
}

/**
 * Enhanced cohort color coding with three zones:
 *  - High values (>= 25%): green ramp — strong retention
 *  - Mid values (5%–25%): neutral indigo ramp
 *  - Low values (> 0% and < 5%): red ramp — poor retention (outlier)
 * The colour scale is full-range (not capped at 60%) so outlier cells
 * stand out clearly at both extremes.
 */
function cellShade(rate: number | null): {
  bg: string;
  text: string;
} {
  if (rate == null) return { bg: "#ffffff", text: "#94a3b8" };
  if (rate <= 0) return { bg: "#f8fafc", text: "#cbd5e1" };

  // Low outlier: < 5% retention — red ramp
  if (rate < 0.05) {
    // t = 0 (near 0%) → faint rose; t = 1 (5%) → strong rose
    const t = rate / 0.05;
    const r = Math.round(255 - (255 - 220) * t); // 255 → 220
    const g = Math.round(241 - (241 - 38) * t);  // 241 → 38
    const b = Math.round(242 - (242 - 38) * t);  // 242 → 38
    const bg = `rgb(${r}, ${g}, ${b})`;
    const text = t > 0.6 ? "#ffffff" : "#7f1d1d";
    return { bg, text };
  }

  // High outlier: >= 25% retention — green ramp
  if (rate >= 0.25) {
    // t = 0 (25%) → light emerald; t = 1 (60%+) → strong emerald
    const t = Math.min((rate - 0.25) / 0.35, 1);
    const r = Math.round(209 - (209 - 4) * t);  // 209 → 4
    const g = Math.round(250 - (250 - 120) * t); // 250 → 120
    const b = Math.round(229 - (229 - 87) * t);  // 229 → 87
    const bg = `rgb(${r}, ${g}, ${b})`;
    const text = t > 0.45 ? "#ffffff" : "#14532d";
    return { bg, text };
  }

  // Mid range 5%–25%: indigo ramp (same hue as rest of the dashboard)
  const t = (rate - 0.05) / 0.20; // 0 at 5%, 1 at 25%
  // Light end #eef2ff → strong end #6366f1
  const r = Math.round(238 - (238 - 99) * t);
  const g = Math.round(242 - (242 - 102) * t);
  const b = Math.round(255 - (255 - 241) * t);
  const bg = `rgb(${r}, ${g}, ${b})`;
  const text = t > 0.65 ? "#ffffff" : "#1e293b";
  return { bg, text };
}

export function CohortHeatmap({
  report,
  locale = "he",
  display = "rate"
}: {
  report: CohortRetentionReport;
  locale?: "he" | "en";
  // "rate" = percentage (default), "count" = absolute customer count
  display?: "rate" | "count";
}) {
  const isHe = locale === "he";
  const lang = (he: string, en: string) => (isHe ? he : en);

  if (report.cohorts.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {lang(
          "אין עדיין נתוני קוהורט מספיקים להצגה.",
          "No cohort data yet — comes online once more order history is captured."
        )}
      </p>
    );
  }

  // Build the column header set: +0, +1, +2, ... +monthsOut.
  const cols: number[] = [];
  for (let i = 0; i <= report.monthsOut; i += 1) cols.push(i);

  return (
    <div className="overflow-x-auto table-scroll scroll-fade-end">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-border bg-card px-2 py-1 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {lang("מחזור (גודל)", "Cohort (size)")}
            </th>
            {cols.map((i) => (
              <th
                key={i}
                className="border border-border bg-card px-1.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                +{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.cohorts.map((row) => (
            <tr key={row.cohortMonth}>
              <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-card px-2 py-1 text-[11px] font-semibold">
                {formatMonthLabel(row.cohortMonth, locale)}{" "}
                <span className="font-normal text-muted-foreground">
                  ({row.cohortSize})
                </span>
              </td>
              {row.values.map((count, i) => {
                const rate = row.rates[i];
                const shade = cellShade(rate);
                return (
                  <td
                    key={i}
                    className="border border-border px-1 py-1 text-center text-[11px] font-medium"
                    style={{ background: shade.bg, color: shade.text }}
                    title={
                      rate != null && count != null
                        ? `${count} ${lang("לקוחות", "customers")} (${(rate * 100).toFixed(1)}%)`
                        : ""
                    }
                  >
                    {rate == null
                      ? ""
                      : display === "rate"
                        ? `${Math.round(rate * 100)}%`
                        : String(count)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>{lang("מקרא:", "Legend:")}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "rgb(220,38,38)" }} />
          {lang("נמוך מאוד (<5%)", "Very low (<5%)")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "#eef2ff" }} />
          {lang("בינוני", "Mid")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "rgb(4,120,87)" }} />
          {lang("גבוה (>25%)", "High (>25%)")}
        </span>
        <span className="ms-auto">
          {lang(
            `${report.cohorts.length} מחזורים · ${report.totalCustomers} לקוחות`,
            `${report.cohorts.length} cohorts · ${report.totalCustomers} customers`
          )}
        </span>
      </div>
    </div>
  );
}
