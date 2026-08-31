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
 * STORE-RELATIVE color coding. The old absolute bands (red under 5%, green
 * only above 25%) rendered this store — whose real cohort retention runs
 * 1–6% — as a wall of red: honest, but pattern-blind, and the owner asked
 * where all the other colors went. The shade now expresses each cell
 * RELATIVE to the store's own best month (red = your weak months, amber =
 * middle, green = your strong months), while the number in the cell stays
 * the true absolute percent.
 */
function cellShade(rate: number | null, maxRate: number): {
  bg: string;
  text: string;
} {
  if (rate == null) return { bg: "#ffffff", text: "#94a3b8" };
  if (rate <= 0) return { bg: "#f8fafc", text: "#cbd5e1" };

  const t = maxRate > 0 ? Math.min(rate / maxRate, 1) : 0;
  const blend = (
    from: [number, number, number],
    to: [number, number, number],
    p: number
  ): string =>
    `rgb(${Math.round(from[0] + (to[0] - from[0]) * p)}, ${Math.round(from[1] + (to[1] - from[1]) * p)}, ${Math.round(from[2] + (to[2] - from[2]) * p)})`;

  // Bottom third: light rose → rose. Middle third: amber. Top third:
  // light emerald → strong emerald.
  if (t < 1 / 3) {
    const p = t / (1 / 3);
    return { bg: blend([255, 241, 242], [252, 165, 165], p), text: "#7f1d1d" };
  }
  if (t < 2 / 3) {
    const p = (t - 1 / 3) / (1 / 3);
    return { bg: blend([254, 243, 199], [252, 211, 77], p), text: "#78350f" };
  }
  const p = (t - 2 / 3) / (1 / 3);
  return {
    bg: blend([167, 243, 208], [5, 150, 105], p),
    text: p > 0.55 ? "#ffffff" : "#064e3b"
  };
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

  // Build the column header set: join month, then months 1..monthsOut.
  const cols: number[] = [];
  for (let i = 0; i <= report.monthsOut; i += 1) cols.push(i);

  // Per-column weighted average — "how many come back in month N overall".
  // The owner's question ("how much for each month") needs a total row, not
  // just per-cohort cells (F-062).
  const colAvg: Array<number | null> = cols.map((i) => {
    if (i === 0) return null;
    let returned = 0;
    let base = 0;
    for (const row of report.cohorts) {
      if (row.rates[i] == null) continue;
      returned += row.values[i] ?? 0;
      base += row.cohortSize;
    }
    return base > 0 ? returned / base : null;
  });

  // The store's own best month — the anchor for the relative color scale.
  let maxRate = 0;
  for (const row of report.cohorts) {
    for (let i = 1; i < row.rates.length; i += 1) {
      const r = row.rates[i];
      if (r != null && r > maxRate) maxRate = r;
    }
  }

  return (
    <div className="overflow-x-auto table-scroll scroll-fade-end">
      {/* `cohort-cell-in` keyframes live in app/globals.css — an inline
          <style> here leaked its text into copy-paste / text extraction. */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-border bg-card px-2 py-1 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {lang("קבוצת הצטרפות", "Cohort")}
            </th>
            {cols.map((i) => (
              <th
                key={i}
                className="whitespace-nowrap border border-border bg-card px-1.5 py-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground"
              >
                {/* Plain-language headers — the old "+0 / +1 / +2" told the
                    reader nothing without the prose above (F-062). */}
                {i === 0 ? lang("הצטרפו", "Joined") : lang(`חודש ${i}`, `Month ${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.cohorts.map((row) => (
            <tr key={row.cohortMonth} className="transition-colors hover:bg-muted/40">
              <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-card px-2 py-1 text-[11px] font-semibold">
                {formatMonthLabel(row.cohortMonth, locale)}
              </td>
              {row.values.map((count, i) => {
                if (i === 0) {
                  // The join month is 100% by definition — the darkest cell
                  // in the old chart carried zero information (F-065).
                  // Render it neutral, holding the cohort's size.
                  return (
                    <td
                      key={i}
                      className="whitespace-nowrap border border-border bg-muted/40 px-1 py-1 text-center text-[11px] text-muted-foreground"
                    >
                      {row.cohortSize.toLocaleString(isHe ? "he-IL" : "en-US")}{" "}
                      {lang("לקוחות", "customers")}
                    </td>
                  );
                }
                const rate = row.rates[i];
                const shade = cellShade(rate, maxRate);
                return (
                  <td
                    key={i}
                    className="group relative border border-border px-1 py-0.5 text-center align-middle transition-transform duration-150 hover:z-20 hover:scale-110 hover:shadow-md"
                    style={{
                      background: shade.bg,
                      color: shade.text,
                      // Staggered fade-in so the retention decay reads
                      // left-to-right on load (keyframes in globals.css).
                      animation: `cohort-cell-in 320ms ease-out ${Math.min(i * 45, 540)}ms backwards`
                    }}
                  >
                    {rate == null ? (
                      ""
                    ) : (
                      <>
                        {/* Count AND rate in-cell — the owner's question is
                            a count question (F-062). */}
                        <span className="inline-flex flex-col leading-tight">
                          <span className="text-[11px] font-semibold">
                            {display === "rate" ? `${Math.round(rate * 100)}%` : String(count)}
                          </span>
                          <span className="text-[9px] opacity-80">
                            {display === "rate" ? String(count) : `${Math.round(rate * 100)}%`}
                          </span>
                        </span>
                        {/* Real hover tooltip per cell — the native title
                            attr was invisible in practice. Pure CSS. */}
                        <span
                          className="pointer-events-none absolute start-1/2 top-full z-30 mt-1 hidden w-max max-w-[240px] translate-x-[-50%] rounded-lg border border-border bg-card px-3 py-2 text-start text-[11px] leading-4 text-foreground shadow-xl group-hover:block rtl:translate-x-[50%]"
                          role="tooltip"
                        >
                          <span className="block font-bold">
                            {lang(
                              `קבוצת ${formatMonthLabel(row.cohortMonth, locale)} · חודש ${i}`,
                              `${formatMonthLabel(row.cohortMonth, locale)} cohort · month ${i}`
                            )}
                          </span>
                          {lang(
                            `${count} מתוך ${row.cohortSize.toLocaleString("he-IL")} לקוחות חזרו להזמין (${(rate * 100).toFixed(1)}%).`,
                            `${count} of ${row.cohortSize.toLocaleString("en-US")} customers ordered again (${(rate * 100).toFixed(1)}%).`
                          )}
                        </span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {lang("ממוצע כולל", "Overall avg")}
            </td>
            {cols.map((i) => (
              <td
                key={i}
                className="border border-border bg-muted/30 px-1 py-1 text-center text-[11px] font-semibold text-muted-foreground"
              >
                {colAvg[i] == null ? "" : `${(colAvg[i]! * 100).toFixed(1)}%`}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>{lang("מקרא (יחסי לחנות שלכם):", "Legend (relative to YOUR store):")}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "rgb(252,165,165)" }} />
          {lang("החודשים החלשים שלכם", "Your weak months")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "rgb(252,211,77)" }} />
          {lang("בינוני", "Middle")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-6 rounded-sm" style={{ background: "rgb(5,150,105)" }} />
          {lang(`החזקים שלכם (השיא: ${(maxRate * 100).toFixed(1)}%)`, `Your strong months (peak: ${(maxRate * 100).toFixed(1)}%)`)}
        </span>
        <span className="ms-auto">
          {lang(
            `${report.cohorts.length} מחזורים · ${report.totalCustomers.toLocaleString("he-IL")} לקוחות · כל ההיסטוריה — התצוגה הזו אינה מושפעת מבורר התאריכים`,
            `${report.cohorts.length} cohorts · ${report.totalCustomers.toLocaleString("en-US")} customers · lifetime view — this chart ignores the date picker`
          )}
        </span>
      </div>
    </div>
  );
}
