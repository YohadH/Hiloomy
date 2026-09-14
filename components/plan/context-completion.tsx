// "Hiloomy צריכה השלמה קצרה" — compact, reusable: what Hiloomy knows, what it
// needs, and one CTA. Setup, never a management decision. Used on the
// receipt and on the initiative page (which also hosts the resolution flow).

import Link from "next/link";
import type { ContextTask } from "@/lib/domain/initiative-reality";
import { MAPPING_KIND_LABEL } from "@/lib/domain/initiative-reality";
import { cn } from "@/lib/utils";

const ACTION_LABEL = {
  confirm: { he: "אשר", en: "Confirm" },
  choose: { he: "בחר", en: "Choose" },
  search: { he: "חפש", en: "Search" },
  none: { he: "מאושר", en: "Confirmed" }
} as const;

export function ContextCompletion({ context, locale, href }: { context: ContextTask; locale: "he" | "en"; href: string | null }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fwd = isHe ? "←" : "→";
  const open = context.rows.filter((r) => r.action !== "none");
  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div>
        <p className="text-base font-semibold">{t("Hiloomy צריכה השלמה קצרה", "Hiloomy needs a short completion")}</p>
        <p className="text-sm text-muted-foreground">{t("כדי לחשב את המכירות, המלאי והרווחיות של היוזמה, צריך לחבר את הישויות הבאות.", "To compute the initiative's sales, inventory and profitability, the following entities need to be connected.")}</p>
      </div>
      {context.known.length ? (
        <ul className="text-sm">
          {context.known.map((k, i) => (
            <li key={i} className="text-success">
              ✓ {k[locale]}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-border/60 text-sm">
        {context.rows.map((r) => (
          <li key={r.kind} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span>
              <span className={cn("font-medium", r.action !== "none" && r.critical ? "text-warning" : "")}>
                {r.action === "none" ? "✓ " : r.critical ? "⚠ " : "○ "}
                {MAPPING_KIND_LABEL[r.kind][locale]}
              </span>
              <span className="text-xs text-muted-foreground">
                {" · "}
                {r.action === "none"
                  ? t("מאושר", "confirmed")
                  : r.action === "confirm"
                    ? t(`${r.provisional} זוהו אוטומטית — לאישור`, `${r.provisional} auto-matched — to confirm`)
                    : r.action === "choose"
                      ? t(`${r.candidates} הצעות נמצאו`, `${r.candidates} suggestions found`)
                      : t("אין התאמה בטוחה", "no confident match")}
                {!r.critical && r.action !== "none" ? ` · ${t("לא חובה", "optional")}` : ""}
              </span>
            </span>
            {r.action !== "none" && href ? (
              <Link href={`${href}#context` as never} className="text-xs font-semibold underline-offset-4 hover:underline">
                {ACTION_LABEL[r.action][locale]} {fwd}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {href && open.length ? (
        <Link href={`${href}#context` as never} className="inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
          {context.required > 0 ? t(`השלם ${context.required} חיבורים`, `Complete ${context.required} connection${context.required === 1 ? "" : "s"}`) : t("אשר את ההתאמות האוטומטיות", "Confirm the automatic matches")} {fwd}
        </Link>
      ) : null}
    </div>
  );
}
