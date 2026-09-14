// "מצב היוזמה" — the manager's view of one initiative. Two modes:
//   A. context missing → ONLY the short completion (nothing is concluded);
//   B. context complete → Plan · Reality (four numbers) · What changed (one
//      sentence) · Does it require a decision? — the mapping audit, every
//      metric, per-product inventory and the store context sit behind
//      "details". Presentational only.

import Link from "next/link";
import type { InitiativeRealitySummary, InitiativeMetric } from "@/lib/domain/initiative-reality";
import { MAPPING_KIND_LABEL } from "@/lib/domain/initiative-reality";
import { ContextCompletion } from "@/components/plan/context-completion";
import { cn } from "@/lib/utils";

type Locale = "he" | "en";

const STATUS: Record<InitiativeRealitySummary["status"], { he: string; en: string; cls: string }> = {
  on_track: { he: "במסלול", en: "On track", cls: "bg-success/15 text-success" },
  off_track: { he: "מחוץ למסלול", en: "Off track", cls: "bg-danger/10 text-danger" },
  no_issue_detected: { he: "לא נמצאה בעיה", en: "No issue detected", cls: "bg-success/15 text-success" },
  needs_attention: { he: "דורש תשומת לב", en: "Needs attention", cls: "bg-warning/15 text-warning" },
  needs_context: { he: "דורש השלמה", en: "Needs context", cls: "bg-warning/15 text-warning" },
  insufficient_data: { he: "אין מספיק מידע", en: "Insufficient data", cls: "bg-muted text-muted-foreground" }
};
const QUALITY: Record<InitiativeMetric["quality"], { he: string; en: string }> = {
  known: { he: "ידוע", en: "Known" },
  calculated: { he: "מחושב", en: "Calculated" },
  estimated: { he: "אומדן", en: "Estimated" },
  unavailable: { he: "לא זמין", en: "Unavailable" }
};

function ago(iso: string | null, now: Date, isHe: boolean): string {
  if (!iso) return isHe ? "לא סונכרן" : "not synced";
  const m = Math.max(1, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return isHe ? `לפני ${d} ימים` : `${d}d ago`;
  if (h >= 1) return isHe ? `לפני ${h} שעות` : `${h}h ago`;
  return isHe ? `לפני ${m} דקות` : `${m}m ago`;
}

function Big({ value, label, note }: { value: string | null; label: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", value === null && "text-muted-foreground")}>{value ?? "—"}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function InitiativeRealityPanel({ r, locale, now, showPlan = true, mappingHref }: { r: InitiativeRealitySummary; locale: Locale; now: Date; showPlan?: boolean; mappingHref?: string }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(isHe ? "he-IL" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" });
  const st = STATUS[r.status];
  const live = r.period.start <= r.period.today && r.period.end >= r.period.today;
  const m = (k: string) => r.metrics.find((x) => x.key === k) ?? null;
  const gift = r.metrics.find((x) => x.key.startsWith("gift_inventory:")) ?? null;
  const giftUnits = r.metrics.find((x) => x.key.startsWith("gift:")) ?? null;
  const changes = r.findings.filter((f) => f.kind !== "progressing" && f.kind !== "sales_vs_prior");
  const headline = changes.find((f) => f.severity === "risk") ?? changes[0] ?? null;
  const specific = r.metrics.filter((x) => x.scope === "initiative");
  const store = r.metrics.filter((x) => x.scope === "store");
  const provisional = r.evidenceBasis === "provisional";

  // Mode A — nothing is concluded until the context is complete.
  if (r.status === "needs_context") {
    return (
      <div className="space-y-4">
        {showPlan ? (
          <p className="text-sm text-muted-foreground">
            {r.title} · {fmt(r.period.start)} – {fmt(r.period.end)}
          </p>
        ) : null}
        <ContextCompletion context={r.context} locale={locale} href={mappingHref ?? null} />
      </div>
    );
  }

  // Mode B — Plan · Reality · What changed · Decision?
  const giftValue = gift ? (gift.value === null ? null : gift.note?.en.includes("days of cover") ? t(`${gift.value} ימים`, `${gift.value} days`) : gift.note?.[locale] ?? gift.value) : null;
  return (
    <div className="space-y-6">
      {showPlan ? (
        <section className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("התוכנית", "Plan")}</p>
          <p className="text-base font-semibold">{r.title}</p>
          <p className="text-sm text-muted-foreground">
            {fmt(r.period.start)} – {fmt(r.period.end)}
            {r.offer.discountPct !== null ? ` · ${r.offer.discountPct}%` : ""}
            {r.offer.couponCode ? ` · ${r.offer.couponCode}` : ""} · {t("יעד", "Goal")}: {r.goalNote[locale]}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("מציאות", "Reality")}</p>
          <span className="text-xs text-muted-foreground tabular-nums">{live ? t(`יום ${r.period.dayIndex} מתוך ${r.period.totalDays}`, `Day ${r.period.dayIndex} of ${r.period.totalDays}`) : r.period.start > r.period.today ? t("טרם התחיל", "Not started") : t("הסתיים", "Ended")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", st.cls)}>{isHe ? st.he : st.en}</span>
          {provisional ? <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">{t("מבוסס על התאמה אוטומטית · טרם אושר", "Based on automatic matches · not yet confirmed")}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Big value={m("revenue")?.value ?? null} label={t("מכירות", "Sales")} note={m("revenue")?.note?.[locale]} />
          <Big value={m("units")?.value ?? null} label={t("יחידות", "Units")} />
          <Big value={m("meta_spend")?.value ?? null} label={t("הוצאת Meta", "Meta spend")} note={m("meta_roas")?.value ? `ROAS ${m("meta_roas")!.value}` : undefined} />
          {gift ? <Big value={giftValue} label={t("מלאי מוצר המתנה", "Gift inventory")} note={giftUnits?.value ? t(`${giftUnits.value} ניתנו`, `${giftUnits.value} given`) : undefined} /> : <Big value={m("coupon_orders")?.value ?? null} label={t("הזמנות עם קופון", "Coupon orders")} />}
        </div>
        {r.inventory.atRisk > 0 ? (
          <p className="text-sm">
            <span className="font-medium text-warning">{t(`${r.inventory.atRisk} מוצרים בסיכון מלאי`, `${r.inventory.atRisk} product${r.inventory.atRisk === 1 ? "" : "s"} at inventory risk`)}</span>
            {r.inventory.worst ? <span className="text-muted-foreground"> · {t("הקריטי ביותר", "most critical")}: {r.inventory.worst.title} — {r.inventory.worst.label[locale]}</span> : null}
            {r.inventory.negative ? <span className="text-danger"> · {t(`${r.inventory.negative} עם מלאי שלילי — דורש בדיקת נתונים`, `${r.inventory.negative} with negative inventory — check the data`)}</span> : null}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {t("ביטחון", "Confidence")}: {r.confidence === "high" ? t("גבוה", "high") : r.confidence === "medium" ? t("בינוני", "medium") : t("נמוך", "low")} · {r.confidenceReason[locale]} · Shopify {ago(r.freshness.shopify, now, isHe)} · Meta {ago(r.freshness.meta, now, isHe)}
          {r.stale ? <span className="text-warning"> · {t("נתונים לא טריים", "stale data")}</span> : null}
        </p>
      </section>

      <section className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("מה השתנה", "What changed")}</p>
        <p className={cn("text-base font-semibold leading-snug", headline?.severity === "risk" ? "text-danger" : headline?.severity === "attention" ? "text-warning" : "")}>{headline ? headline.statement[locale] : r.statusReason[locale]}</p>
        {changes.length > 1 ? <p className="text-xs text-muted-foreground">{t(`ועוד ${changes.length - 1} ממצאים בפרטים.`, `And ${changes.length - 1} more finding${changes.length - 1 === 1 ? "" : "s"} in the details.`)}</p> : null}
      </section>

      <section className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("האם נדרשת החלטה?", "Does it require a decision?")}</p>
        {r.candidateFinding ? (
          <>
            <p className="text-base font-semibold">{r.candidateFinding.question[locale]}</p>
            <p className="text-xs text-muted-foreground">{t("מועמד להחלטה — מתחרה על תשומת לב מול שאר המועמדים; מגיע להיום רק אם הוא עובר את הסף.", "A decision candidate — competes for attention against every other candidate; reaches Today only if it passes the threshold.")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("לא. אין ממצא שמצדיק החלטה ניהולית כרגע.", "No. Nothing currently justifies a management decision.")}</p>
        )}
      </section>

      {r.context.rows.some((row) => row.action === "confirm") ? <ContextCompletion context={r.context} locale={locale} href={mappingHref ?? null} /> : null}

      <details className="text-sm">
        <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("פרטים: כל המדדים, המלאי לפי מוצר, המיפוי, הקשר כל החנות", "Details: every metric, inventory per product, the mapping, whole-store context")}</summary>
        <div className="mt-3 space-y-4">
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {specific.map((x) => (
              <div key={x.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
                <dt className="text-muted-foreground">{x.label[locale]}</dt>
                <dd className="text-end">
                  <span className={cn("font-semibold tabular-nums", x.value === null && "text-muted-foreground")}>{x.value ?? t("לא זמין", "unavailable")}</span>
                  <span className="ms-2 text-[11px] text-muted-foreground">{QUALITY[x.quality][locale]}</span>
                  {x.note ? <span className="block text-[11px] text-muted-foreground">{x.note[locale]}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
          {changes.length ? (
            <ul className="space-y-1">
              {changes.map((f, i) => (
                <li key={i} className={cn(f.severity === "risk" ? "text-danger" : f.severity === "attention" ? "text-warning" : "")}>
                  {f.statement[locale]}
                  {f.basis === "provisional" ? <span className="text-[11px] text-muted-foreground"> · {t("על התאמה אוטומטית", "on an automatic match")}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {store.length ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
              <span className="font-medium text-muted-foreground">{t("הקשר רחב — כל המותג (לא ביצועי היוזמה)", "Broader brand context — not initiative performance")}: </span>
              <span className="tabular-nums">{store.map((x) => `${x.label[locale]}: ${x.value}${x.note ? ` (${x.note[locale]})` : ""}`).join(" · ")}</span>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{r.mappings.map((k) => `${MAPPING_KIND_LABEL[k.kind][locale]}: ${k.detail[locale]}`).join(" · ")}</p>
          {r.missingEvidence.length ? <p className="text-xs text-muted-foreground">{t("ראיות חסרות", "Missing evidence")}: {r.missingEvidence.map((x) => x.label[locale]).join(" · ")}</p> : null}
          {mappingHref ? (
            <Link href={`${mappingHref}#audit` as never} className="text-xs font-semibold underline-offset-4 hover:underline">
              {t("ביקורת המיפוי", "Mapping audit")} {isHe ? "←" : "→"}
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}
