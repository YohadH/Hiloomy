// "מה קורה כאן?" — the initiative's paid funnel, stage by stage, with the
// deterministic diagnosis. Rendering rules (owner, 2026-09-15):
//   • Only stages the data actually carries are shown — never an invented
//     step. When mid-funnel is missing the diagnosis says the break point
//     is unknown; the UI does not fake it.
//   • Every stage names its SOURCE. The pixel stages (LPV/ATC/checkout and
//     Meta purchases) are the ATTRIBUTED funnel; Shopify purchases are the
//     COMMERCE TRUTH, shown apart so nobody reads 1,803 ATCs as a Shopify
//     measurement.
//   • Rates are judged against the store baseline, not absolute counts.
// Presentational only.

import type { FunnelDiagnosis, FunnelStage } from "@/lib/domain/funnel-diagnosis";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

const SOURCE_LABEL: Record<FunnelStage["source"], { he: string; en: string; cls: string }> = {
  meta_reported: { he: "מטא", en: "Meta", cls: "bg-muted text-muted-foreground" },
  meta_pixel: { he: "פיקסל מטא", en: "Meta pixel", cls: "bg-muted text-muted-foreground" },
  shopify: { he: "שופיפיי מאומת", en: "Shopify confirmed", cls: "bg-success/15 text-success" }
};

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function InitiativeFunnel({ funnel, locale }: { funnel: FunnelDiagnosis; locale: Locale }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const attributed = funnel.stages.filter((s) => s.key !== "shopify_purchases" && s.value !== null);
  const shopify = funnel.stages.find((s) => s.key === "shopify_purchases") ?? null;
  const mismatch = funnel.verdict === "attribution_mismatch";

  return (
    <div className="space-y-4">
      {/* Attributed funnel — Meta */}
      {attributed.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("המשפך המיוחס · מטא", "Attributed funnel · Meta")}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {attributed.map((s) => {
              const isBreak = funnel.breakStage === s.key;
              return (
                <div key={s.key} className={cn("rounded-md border p-2.5", isBreak ? "border-danger/60 bg-danger/5" : "border-border")}>
                  <p className={cn("text-lg font-semibold tabular-nums leading-tight", isBreak && "text-danger")}>{s.value!.toLocaleString("en-US")}</p>
                  <p className="text-xs text-muted-foreground">{s.label[locale]}</p>
                  {s.rate !== null ? (
                    <p className={cn("text-[11px] tabular-nums", s.materiallyBelow ? "font-semibold text-danger" : "text-muted-foreground")}>
                      {pct(s.rate)}
                      {s.benchmarkRate !== null ? <span className="text-muted-foreground"> {t("מול", "vs")} {pct(s.benchmarkRate)}</span> : null}
                    </p>
                  ) : null}
                  <span className={cn("mt-1 inline-block rounded-full px-1.5 py-px text-[10px]", SOURCE_LABEL[s.source].cls)}>{SOURCE_LABEL[s.source][locale]}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("אחוזים = המרה מהשלב הקודם, מול בייסליין החנות (90 יום, כל הקמפיינים).", "Percentages = conversion from the previous stage, vs the store baseline (90d, all campaigns).")}</p>
        </div>
      ) : null}

      {/* Commerce truth — Shopify, apart from the pixel */}
      {shopify && shopify.value !== null ? (
        <div className={cn("flex flex-wrap items-center gap-3 rounded-md border p-3", mismatch ? "border-warning/60 bg-warning/5" : "border-border")}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("אמת מסחרית · שופיפיי", "Commerce truth · Shopify")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {shopify.value.toLocaleString("en-US")} <span className="text-sm font-normal text-muted-foreground">{t("יחידות מהמוצרים המקושרים בחלון", "units of the linked products in the window")}</span>
            </p>
          </div>
          {mismatch ? <p className="text-sm font-medium text-warning">{t(`מול ${funnel.metaPurchases} רכישות לפי ייחוס מטא — הפער הוא הממצא.`, `vs ${funnel.metaPurchases} purchases by Meta's attribution — the gap is the finding.`)}</p> : null}
        </div>
      ) : null}

      {/* The deterministic diagnosis */}
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("אבחנה", "Diagnosis")}</p>
        <p className="text-base font-semibold leading-snug">{funnel.headline[locale]}</p>
        <p className="text-sm text-muted-foreground">{funnel.detail[locale]}</p>
        {funnel.verdict === "attribution_mismatch" && funnel.mismatchReasons.length ? (
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {funnel.mismatchReasons.slice(0, 4).map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warning" />
                <span>{r[locale]}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[11px] text-muted-foreground">{funnel.exposure.basisNote[locale]}</p>
      </div>
    </div>
  );
}
