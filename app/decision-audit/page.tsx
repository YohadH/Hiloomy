// Decision audit — read-only. Answers "why did Hiloomy show me this stock
// decision instead of something about campaigns, discounts, affiliates, the
// plan or the market?" from the recorded candidate runs. Shadow data only:
// nothing here feeds Today. ?days=14 · ?exclude=inventory,paid_media (ablation).

import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/dashboard-v2/section-head";
import { getAppChromeData } from "@/lib/services/analytics-service";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { buildCandidateAuditReport } from "@/lib/services/decision-candidate-audit-service";
import { CANDIDATE_DOMAINS, CANDIDATE_DOMAIN_LABEL, PRIOR_DIMENSIONS, SCORE_DIMENSIONS, SCORE_DIMENSION_LABEL, type CandidateDomain } from "@/lib/domain/decision-candidate";
import { displayDecisionId } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CLASS_LABEL: Record<string, { he: string; en: string; cls: string }> = {
  NO_EVIDENCE_OF_BIAS: { he: "אין עדות להטיה", en: "No evidence of bias", cls: "text-success" },
  GENERATION_BIAS: { he: "הטיית ייצור — תחומים אחרים לא מציעים מועמדים", en: "Generation bias — other domains produce no candidates", cls: "text-warning" },
  RANKING_BIAS: { he: "הטיית דירוג — מלאי מנצח בניקוד אך מסומן מובן מאליו", en: "Ranking bias — inventory wins the score but is judged obvious", cls: "text-danger" },
  REAL_BUSINESS_CONDITION: { he: "מצב עסקי אמיתי — מלאי מנצח ומסומן מועיל", en: "Real business condition — inventory wins and is judged useful", cls: "text-success" },
  INCONCLUSIVE: { he: "לא חד-משמעי", en: "Inconclusive", cls: "text-muted-foreground" }
};

export default async function DecisionAuditPage({ searchParams }: { searchParams: Promise<{ days?: string; exclude?: string }> }) {
  const locale = await getAppLocale();
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const storeId = await resolveActiveStoreId();
  if (!storeId) redirect("/dashboard");
  const params = await searchParams;
  const days = Math.min(90, Math.max(1, Number(params.days) || 14));
  const exclude = String(params.exclude ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is CandidateDomain => (CANDIDATE_DOMAINS as string[]).includes(s));
  const [chrome, report] = await Promise.all([getAppChromeData(), buildCandidateAuditReport(storeId, days, exclude)]);
  const inv = report.inventory;
  const cls = CLASS_LABEL[inv.classification];
  const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

  return (
    <AppShell store={chrome.store} controls={chrome.controls}>
      <div className="space-y-8" dir={isHe ? "rtl" : "ltr"}>
        <PageHead
          eyebrow={t("כלים", "Tools")}
          title={t("למה היום מראה את מה שהוא מראה", "Why Today shows what it shows")}
          description={t(
            `כל ריצת מנועים רושמת את המועמד החזק ביותר מכל תחום, מנקדת את כולם באותם שבעה ממדים ומדרגת גלובלית. זה צל בלבד — היום לא משתנה. ${report.runs} ריצות ב-${days} ימים.`,
            `Every engine pass records the strongest candidate from each domain, scores all of them on the same seven dimensions and ranks them globally. Shadow only — Today does not change. ${report.runs} runs in ${days} days.`
          )}
        />

        {report.runs === 0 ? (
          <Card className="p-5 text-sm text-muted-foreground">{t("עדיין אין ריצות מתועדות. פתחו את היום פעם אחת או חכו לקרון של 05:00.", "No recorded runs yet. Open Today once or wait for the 05:00 cron.")}</Card>
        ) : null}

        {/* Inventory bias diagnostic */}
        <Card className="p-5">
          <h2 className="text-base font-semibold">{t("אבחון הטיית מלאי", "Inventory bias diagnostic")}</h2>
          <p className={cn("mt-1 text-sm font-semibold", cls.cls)}>{isHe ? cls.he : cls.en}</p>
          <p className="mt-1 text-sm text-muted-foreground">{inv.because}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t("מהמועמדים", "of candidates"), pct(inv.candidateShare)],
              [t("מדירוגי top-3", "of top-3 ranks"), pct(inv.top3Share)],
              [t("מההחלטות שהוצגו", "of surfaced"), pct(inv.surfacedShare)],
              [t("מובן מאליו", "obvious rate"), pct(inv.obviousRate)],
              [t("מועיל", "useful rate"), pct(inv.usefulRate)],
              [t("היום #1 ≠ גלובלי #1", "Today #1 ≠ global #1"), pct(report.disagreement.topDiffersRate)]
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Domain summary */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("לפי תחום", "By domain")}</h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[t("תחום", "Domain"), t("ריצות כשירות", "Eligible runs"), t("מועמדים", "Candidates"), t("הוצגו", "Surfaced"), t("המרה", "Conversion"), t("ניקוד", "Avg score"), t("ללא הנחות V0", "Observable"), t("דירוג ממוצע", "Avg rank"), t("חידוש", "Novelty"), "top-3", t("נשפטו", "Judged"), t("מועיל", "Useful"), t("מובן מאליו", "Obvious"), t("שגוי", "Wrong"), t("שינה החלטה", "Changed"), t("ערך גבוה", "High value"), t("דיכוי עיקרי", "Top suppression")].map((h) => (
                    <th key={h} className="px-3 py-2 text-start font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.domains.map((d) => (
                  <tr key={d.domain} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{CANDIDATE_DOMAIN_LABEL[d.domain][locale]}</td>
                    <td className="px-3 py-2">{d.eligibleRuns}/{d.runs}</td>
                    <td className="px-3 py-2">{d.candidates}</td>
                    <td className="px-3 py-2">{d.distinctSurfaced}/{d.distinctDecisions}</td>
                    <td className="px-3 py-2">{pct(d.conversion)}</td>
                    <td className="px-3 py-2">{d.avgScore ?? "—"}</td>
                    <td className="px-3 py-2">{d.avgObservableScore ?? "—"}</td>
                    <td className="px-3 py-2">{d.avgRank ?? "—"}</td>
                    <td className="px-3 py-2">{d.avgNovelty ?? "—"}</td>
                    <td className="px-3 py-2">{d.top3Share}%</td>
                    <td className="px-3 py-2">{d.feedback.judged}</td>
                    <td className="px-3 py-2">{d.feedback.useful}</td>
                    <td className="px-3 py-2">{d.feedback.obvious}</td>
                    <td className="px-3 py-2">{d.feedback.wrong}</td>
                    <td className="px-3 py-2">{d.feedback.changed}</td>
                    <td className="px-3 py-2">{d.feedback.highValue}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.topSuppression.map((s) => `${s.reason} ×${s.n}`).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "ערך גבוה = מועיל ולא מובן מאליו. 'ללא הנחות V0' = ניקוד מארבעת הממדים הנמדדים בלבד (מהותיות, דחיפות, ביטחון, ישימות); שיקול דעת ניהולי, חידוש וחיבור בין תחומים הם הנחות V0 לפי סוג החלטה.",
              "High value = useful and not obvious. 'Observable' = score from the four measured dimensions only (materiality, urgency, confidence, actionability); management judgment, novelty and cross-domain are V0 priors per decision kind."
            )}
          </p>
        </section>

        {/* Latest run */}
        {report.latest ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                {t("הריצה האחרונה", "Latest run")} · {new Date(report.latest.runAt).toLocaleString(isHe ? "he-IL" : "en-US")} · {report.latest.trigger}
              </h2>
              <form className="flex items-center gap-2 text-xs" method="get">
                <input type="hidden" name="days" value={days} />
                <label htmlFor="exclude" className="text-muted-foreground">
                  {t("בלי התחום", "Without")}
                </label>
                <select id="exclude" name="exclude" defaultValue={exclude[0] ?? ""} className="h-7 rounded-md border border-border bg-background px-1">
                  <option value="">—</option>
                  {CANDIDATE_DOMAINS.filter((d) => d !== "returns").map((d) => (
                    <option key={d} value={d}>
                      {CANDIDATE_DOMAIN_LABEL[d][locale]}
                    </option>
                  ))}
                </select>
                <button type="submit" className="h-7 rounded-md border border-border px-2 hover:bg-accent">
                  {t("חשב מחדש", "Recompute")}
                </button>
              </form>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {["#", t("תחום", "Domain"), t("מועמד", "Candidate"), t("ניקוד", "Score"), ...SCORE_DIMENSIONS.map((k) => `${SCORE_DIMENSION_LABEL[k][locale]}${PRIOR_DIMENSIONS.includes(k) ? "*" : ""}`), t("היום", "Today"), t("הוצג", "Shown"), t("סיבה", "Reason")].map((h) => (
                      <th key={h} className="px-3 py-2 text-start font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.latest.rows.map((c) => (
                    <tr key={c.id} className={cn("border-t border-border", c.kind === "none" && "text-muted-foreground")}>
                      <td className="px-3 py-2">{c.rank ?? "—"}</td>
                      <td className="px-3 py-2">{CANDIDATE_DOMAIN_LABEL[c.domain][locale]}</td>
                      <td className="px-3 py-2">
                        {c.title[locale]}
                        {c.relatedDecisionId ? <span className="ms-2 text-xs text-muted-foreground">{displayDecisionId(c.relatedDecisionId)}</span> : null}
                        {c.inputs.engineGate ? <div className="text-xs text-muted-foreground">{t("שער המנוע", "engine gate")}: {c.inputs.engineGate}</div> : null}
                      </td>
                      <td className="px-3 py-2 font-semibold">{c.kind === "none" ? "—" : c.globalScore}</td>
                      {SCORE_DIMENSIONS.map((k) => (
                        <td key={k} className="px-3 py-2">
                          {c.kind === "none" ? "—" : c.scores[k]}
                        </td>
                      ))}
                      <td className="px-3 py-2">{c.todayRank ?? "—"}</td>
                      <td className="px-3 py-2">{c.surfaced ? t("כן", "yes") : t("לא", "no")}</td>
                      <td className="px-3 py-2 text-xs">{c.suppressionReason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("* הנחת V0 לפי סוג החלטה, לא מדידה.", "* V0 prior per decision kind, not a measurement.")}</p>

            {report.latest.explanations.length ? (
              <Card className="space-y-3 p-5 text-sm">
                <h3 className="font-semibold">{t("למה זה הוצג", "Why this was shown")}</h3>
                {report.latest.explanations.map((x) => (
                  <div key={x.title}>
                    <p className="font-medium">
                      {x.title} <span className="text-xs text-muted-foreground">({CANDIDATE_DOMAIN_LABEL[x.domain][locale]})</span>
                    </p>
                    <p className="text-muted-foreground">{x.strengths.join(" · ")}</p>
                    {x.outranked.length ? (
                      <ul className="mt-1 list-disc ps-5 text-muted-foreground">
                        {x.outranked.map((o) => (
                          <li key={o.title}>
                            {t("עקף", "Outranked")} {CANDIDATE_DOMAIN_LABEL[o.domain][locale]} „{o.title}” — {o.because} ({t("פער", "gap")} {o.gap})
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </Card>
            ) : null}

            {report.latest.ablation ? (
              <Card className="p-5 text-sm">
                <h3 className="font-semibold">
                  {t("בלי", "Without")} {report.latest.ablation.exclude.map((d) => CANDIDATE_DOMAIN_LABEL[d][locale]).join(", ")}
                </h3>
                <ol className="mt-2 list-decimal ps-5">
                  {report.latest.ablation.rows.map((r) => (
                    <li key={r.rank}>
                      {CANDIDATE_DOMAIN_LABEL[r.domain][locale]} — {r.score} · {r.title}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">{t("ניתוח בלבד — הפנקס לא השתנה.", "Analysis only — the ledger was not touched.")}</p>
              </Card>
            ) : null}
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("דיכויים עיקריים בחלון", "Top suppression reasons in the window")}: {report.topSuppression.map((s) => `${s.reason} ×${s.n}`).join(" · ") || "—"}
        </p>
      </div>
    </AppShell>
  );
}
