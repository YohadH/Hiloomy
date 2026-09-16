// "Hiloomy בדקה את היוזמה" — the DEFAULT state of an initiative before the
// numbers exist (owner, 16 Sep 2026). Not a form. What Hiloomy investigated
// per kind, what it found, what is not detected vs not yet live vs unknown,
// which candidates it excluded and why — and, only when two candidates are
// too close to pick, ONE question. Used on the receipt and the initiative
// page (which also hosts the resolution flow behind a link).

import Link from "next/link";
import type { ContextTask } from "@/lib/domain/initiative-reality";
import type { ActivityCheck } from "@/lib/domain/entity-resolution";
import { cn } from "@/lib/utils";

const STATE: Record<ActivityCheck["state"], { mark: string; he: string; en: string; cls: string }> = {
  detected: { mark: "✓", he: "זוהה", en: "detected", cls: "text-success" },
  not_yet_live: { mark: "○", he: "עדיין לא באוויר", en: "not yet live", cls: "text-muted-foreground" },
  not_detected: { mark: "⚠", he: "לא זוהה", en: "not detected", cls: "text-warning" },
  unknown: { mark: "?", he: "לא ידוע — אין מקור נתונים", en: "unknown — no data source", cls: "text-muted-foreground" }
};
const KIND: Record<ActivityCheck["kind"], { he: string; en: string }> = {
  campaign: { he: "קמפיין", en: "Campaign" },
  coupon: { he: "קופון", en: "Coupon" },
  landing: { he: "דף נחיתה", en: "Landing page" },
  products: { he: "מוצרים", en: "Products" }
};

export function ContextCompletion({ context, locale, href }: { context: ContextTask; locale: "he" | "en"; href: string | null }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const launch = context.launch;
  const tone = launch.severity === "risk" ? "border-danger/40 bg-danger/5" : launch.severity === "attention" ? "border-warning/40 bg-warning/5" : "border-border bg-muted/30";
  return (
    <div className={cn("space-y-3 rounded-lg border p-4", tone)}>
      <div>
        <p className="text-base font-semibold">{t("Hiloomy בדקה את היוזמה", "Hiloomy checked the initiative")}</p>
        {launch.insight ? <p className="mt-1 text-sm">{launch.insight[locale]}</p> : null}
      </div>
      <ul className="space-y-1.5 text-sm">
        {launch.checks.map((c) => {
          const st = STATE[c.state];
          return (
            <li key={c.kind} className="flex items-start gap-2">
              <span className={cn("mt-px w-4 shrink-0 text-center font-semibold", st.cls)} aria-hidden>
                {st.mark}
              </span>
              <span>
                <span className="font-medium">{KIND[c.kind][locale]}:</span> {c.line[locale]}
                <span className={cn("ms-1 text-xs", st.cls)}>· {st[locale]}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {context.rejected.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none underline-offset-4 hover:underline">{t(`${context.rejected.length} מועמדים הוצאו עם סיבה`, `${context.rejected.length} candidate${context.rejected.length === 1 ? "" : "s"} excluded with a reason`)}</summary>
          <ul className="mt-1 space-y-0.5">
            {context.rejected.slice(0, 8).map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <span className="font-medium text-foreground">{r.label}</span> — {r.reason[locale]}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {context.question ? (
        <div className="rounded-md border border-foreground/30 bg-background p-3 text-sm">
          <p className="font-semibold">{t("תשובה אחת תשפר את ההערכה", "One answer would improve this evaluation")}</p>
          <p className="text-xs text-muted-foreground">{context.question.why[locale]}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {context.question.options.map((o) => (
              <li key={o.id}>
                <span className="font-medium">{o.label}</span> · {o.reason[locale]}
              </li>
            ))}
          </ul>
          {href ? (
            <Link href={`${href}#context` as never} className="mt-2 inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
              {t("לבחור", "Choose")} {fwd}
            </Link>
          ) : null}
        </div>
      ) : href ? (
        <p className="text-xs text-muted-foreground">
          {t("Hiloomy ממשיכה לבדוק אוטומטית כשמגיעים נתונים חדשים.", "Hiloomy keeps checking automatically as new data arrives.")}{" "}
          <Link href={`${href}#audit` as never} className="underline-offset-4 hover:underline">
            {t("לתקן ידנית", "Correct by hand")} {fwd}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
