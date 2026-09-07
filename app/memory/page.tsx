import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { StatusPill } from "@/components/decisions/status-pill";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { listDecisionMemory } from "@/lib/services/decision-inbox-service";
import { DECISION_STATE_LABEL, JUDGMENT_LABEL, displayDecisionId, type HumanChoice } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const HUMAN: Record<HumanChoice, { he: string; en: string }> = {
  pending: { he: "ממתין", en: "Pending" },
  approved: { he: "ההמלצה אושרה", en: "Approved recommendation" },
  alternative: { he: "נבחרה אפשרות אחרת", en: "Chose another option" },
  ignored: { he: "ללא שינוי", en: "No change" },
  auto_closed: { he: "נסגר אוטומטית — התנאי חלף", en: "Closed automatically — condition passed" }
};

// Memory — the decision timeline. Every decision Hiloomy raised, what the
// manager chose, and what happened next once it was measured. Learnings
// appear only when the ledger holds evidence for them.
export default async function MemoryPage() {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const lc = isHe ? "he" : "en";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard" as never);
  const [chrome, memory] = await Promise.all([getAppChromeData(), listDecisionMemory(storeId)]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(isHe ? "he-IL" : "en-US", { month: "short", day: "numeric" });

  return (
    <AppShell store={chrome.store}>
      <div className="space-y-8">
        <PageHead
          eyebrow={t("זיכרון", "Memory")}
          title={t("זיכרון ההחלטות", "Decision Memory")}
          description={t(
            "כל החלטה שהילומי העלתה, מה הוחלט, ומה קרה אחר כך. כך הילומי לומדת מה באמת עובד במותג הזה.",
            "Every decision Hiloomy raised, what was decided, and what happened next. This is how Hiloomy learns what actually works for this brand."
          )}
        />

        <Card className="space-y-3 p-6">
          <h2 className="text-xl font-semibold tracking-tight">{t("מה הילומי לומדת על המותג הזה", "What Hiloomy is learning about this brand")}</h2>
          {memory.learnings.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {t(
                "עדיין אין מספיק היסטוריית החלטות. תובנות יופיעו כאן רק כשיש להן ראיות בזיכרון — הילומי לא ממציאה לקחים.",
                "Not enough decision history yet. Learnings appear here only when the ledger holds evidence for them — Hiloomy does not invent lessons."
              )}
            </p>
          ) : (
            <ul className="space-y-2">
              {memory.learnings.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-6">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                  <span>{l[lc]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {memory.entries.length === 0 ? (
          <Card className="p-8 text-sm text-muted-foreground">
            {t("עדיין לא נרשמו החלטות. ההחלטה הראשונה תופיע כאן ברגע שתוצג בתיבת ההחלטות.", "No decisions recorded yet. The first one appears here as soon as it is raised in the inbox.")}
          </Card>
        ) : (
          <ol className="relative space-y-6 border-s border-border/70 ps-6">
            {memory.entries.map((e) => (
              <li key={e.id} className="relative">
                <span aria-hidden className="absolute -start-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground/70" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" suppressHydrationWarning>
                    {fmtDate(e.createdAt)}
                  </p>
                  <StatusPill status={e.status} locale={lc} />
                  <span className="text-[11px] text-muted-foreground">{displayDecisionId(e.id)}</span>
                  <span className="text-[11px] text-muted-foreground">· {DECISION_STATE_LABEL[e.state][lc]}</span>
                  {e.crossDomain ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("חוצה תחומים", "Cross-domain")}
                    </span>
                  ) : null}
                </div>
                <Link href={`/today/${e.id}` as never} className="mt-1.5 block text-base font-semibold leading-6 hover:underline">
                  {e.title[lc]}
                </Link>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">{t("המלצה", "Recommendation")}</dt>
                  <dd>{e.recommendation[lc]}</dd>
                  <dt className="text-muted-foreground">{t("החלטת המנהל/ת", "Manager decision")}</dt>
                  <dd className="font-medium">{HUMAN[e.human.choice][lc]}</dd>
                  {e.judgment ? (
                    <>
                      <dt className="text-muted-foreground">{t("שיפוט", "Judgment")}</dt>
                      <dd className="font-medium">
                        {e.judgment.tags.map((tag) => JUDGMENT_LABEL[tag][lc]).join(" · ") || "—"}
                        {e.judgment.changedDecision === true ? ` · ${t("שינה את ההחלטה", "changed the decision")}` : e.judgment.changedDecision === false ? ` · ${t("לא שינה את ההחלטה", "did not change the decision")}` : ""}
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">{t("תוצאה", "Outcome")}</dt>
                  <dd className={e.outcome ? "" : "text-muted-foreground"}>
                    {e.outcome
                      ? e.outcome.summary[lc]
                      : e.human.choice === "pending"
                        ? t("עדיין לא ידועה", "Not yet known")
                        : t("ממתין להערכה", "Awaiting evaluation")}
                  </dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}
