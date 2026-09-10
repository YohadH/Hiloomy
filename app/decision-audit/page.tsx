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
import { ACTION_FAMILY_LABEL, CANDIDATE_DOMAINS, CANDIDATE_DOMAIN_LABEL, PRIOR_DIMENSIONS, SCORE_DIMENSIONS, SCORE_DIMENSION_LABEL, type CandidateDomain } from "@/lib/domain/decision-candidate";
import { displayDecisionId } from "@/lib/domain/decision";
import { getAppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CLASS_LABEL: Record<string, { he: string; en: string; cls: string }> = {
  NO_EVIDENCE_OF_BIAS: { he: "אין עדות להטיה", en: "No evidence of bias", cls: "text-success" },
  SIGNAL_VOLUME_IMBALANCE: { he: "עודף אותות — הרבה התראות SKU, מעט החלטות נפרדות (תקין)", en: "Signal volume imbalance — many SKU alerts, few distinct decisions (benign)", cls: "text-muted-foreground" },
  CANDIDATE_GENERATION_BIAS: { he: "הטיית ייצור מועמדים — תחומים אחרים כשירים אך שותקים", en: "Candidate generation bias — other domains eligible but silent", cls: "text-warning" },
  RANKING_BIAS: { he: "הטיית דירוג — מלאי מנצח בניקוד אך מסומן מובן מאליו", en: "Ranking bias — inventory wins the score but is judged obvious", cls: "text-danger" },
  REAL_BUSINESS_CONDITION: { he: "מצב עסקי אמיתי — מלאי מנצח ומסומן מועיל", en: "Real business condition — inventory wins and is judged useful", cls: "text-success" },
  MIXED: { he: "מעורב — יותר מממצא אחד", en: "Mixed — more than one finding", cls: "text-warning" },
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
          {inv.findings.length > 1 ? <p className="mt-1 text-xs text-muted-foreground">{t("ממצאים", "Findings")}: {inv.findings.map((f) => (isHe ? CLASS_LABEL[f].he : CLASS_LABEL[f].en)).join(" · ")}</p> : null}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
            {[
              [t("מהאותות הגולמיים", "of raw signals"), pct(inv.signalShare)],
              [t("מהמועמדים הניהוליים", "of management candidates"), pct(inv.candidateShare)],
              [t("מדירוגי top-3 (מקובץ)", "of clustered top-3"), pct(inv.top3Share)],
              [t("מההחלטות שהוצגו", "of surfaced"), pct(inv.surfacedShare)],
              [t("מובן מאליו", "obvious rate"), pct(inv.obviousRate)],
              [t("מועיל", "useful rate"), pct(inv.usefulRate)],
              [t("היום #1 ≠ מקובץ #1", "Today #1 ≠ clustered #1"), pct(report.disagreement.clusteredTopDiffersRate ?? report.disagreement.topDiffersRate)],
              [t("קיבוץ שינה את #1", "Clustering changed #1"), pct(report.clusteringDisagreement.changedTopRate)]
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Three levels: raw signals → management candidates → top-ranked */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{t("אותות → מועמדים ניהוליים → דירוג", "Signals → management candidates → ranking")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("דחיסת תשומת לב", "Attention compression")}: {report.compression.rawSignals} → {report.compression.managementCandidates}
              {report.compression.ratio !== null ? ` (×${report.compression.ratio})` : ""} · {t("צפיפות החלטות", "Decision density")}: {report.decisionDensity ?? "—"} {t("מועמדים לתחום כשיר", "candidates per eligible domain")} · {report.runsWithClustering}/{report.runs} {t("ריצות עם קיבוץ", "runs clustered")}
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[t("תחום", "Domain"), t("אותות גולמיים", "Raw signals"), t("מועמדים אחרי קיבוץ", "Candidates after clustering"), t("דחיסה", "Compression"), t("top-3 מקובץ", "Clustered top-3"), t("הוצג בצל", "Shadow surfaced"), t("הוצג בהיום", "Surfaced on Today"), t("מועיל", "Useful"), t("מובן מאליו", "Obvious")].map((h) => (
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
                    <td className="px-3 py-2">{d.rawSignals}</td>
                    <td className="px-3 py-2">{d.managementCandidates}</td>
                    <td className="px-3 py-2">{d.compression !== null ? `×${d.compression}` : "—"}</td>
                    <td className="px-3 py-2">{d.clusteredTop3Share}%</td>
                    <td className="px-3 py-2">{d.shadowSurfaced}</td>
                    <td className="px-3 py-2">{d.distinctSurfaced}</td>
                    <td className="px-3 py-2">{d.feedback.judged ? d.feedback.useful : "—"}</td>
                    <td className="px-3 py-2">{d.feedback.judged ? d.feedback.obvious : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("משוב קיים רק על החלטות שהוצגו בהיום; מועמדים מקובצים בצל לא מקבלים משוב — ולא ממציאים להם.", "Feedback exists only for decisions shown on Today; clustered shadow candidates receive none and none is fabricated.")}</p>
        </section>

        {/* Domain summary */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("לפי תחום — רמת האותות", "By domain — signal level")}</h2>
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
            {report.latest.narrative ? (
              <Card className="p-5 text-sm">
                <h3 className="font-semibold">{t("למה החלטת מלאי אחת ולא התראות נפרדות", "Why one inventory decision instead of separate stock alerts")}</h3>
                <p className="mt-1 text-muted-foreground">{report.latest.narrative[locale]}</p>
              </Card>
            ) : null}

            {report.latest.clustered ? (
              <>
                <h3 className="text-sm font-semibold">{t("מועמדים ניהוליים — הדירוג המקובץ", "Management candidates — clustered ranking")}</h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        {["#", t("תחום", "Domain"), t("מועמד", "Candidate"), t("חברים", "Members"), t("ניקוד", "Score"), ...SCORE_DIMENSIONS.map((k) => `${SCORE_DIMENSION_LABEL[k][locale]}${PRIOR_DIMENSIONS.includes(k) ? "*" : ""}`), t("הוצג בצל", "Shadow")].map((h) => (
                          <th key={h} className="px-3 py-2 text-start font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.latest.candidates.map((c) => (
                        <tr key={c.id} className="border-t border-border align-top">
                          <td className="px-3 py-2">{c.rank ?? "—"}</td>
                          <td className="px-3 py-2">{CANDIDATE_DOMAIN_LABEL[c.domain][locale]}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{c.title[locale]}</div>
                            {c.managementQuestion ? <div className="text-xs text-muted-foreground">{c.managementQuestion[locale]}</div> : null}
                            {c.actionFamily ? <div className="text-xs text-muted-foreground">{ACTION_FAMILY_LABEL[c.actionFamily][locale]}</div> : null}
                            {c.cluster && c.memberCount > 1 ? (
                              <details className="mt-1 text-xs">
                                <summary className="cursor-pointer text-muted-foreground">{t(`${c.memberCount} אותות — פירוט`, `${c.memberCount} signals — detail`)}</summary>
                                <div className="mt-1 space-y-1">
                                  <div>
                                    <span className="font-medium">{t("מוביל", "Lead")}:</span> {c.cluster.lead.title}
                                    {c.cluster.lead.daysCover !== null ? ` · ${c.cluster.lead.daysCover.toFixed(1)}d` : ""}
                                    {c.cluster.lead.revenue14 !== null ? ` · ₪${Math.round(c.cluster.lead.revenue14).toLocaleString("en-US")}` : ""}
                                  </div>
                                  <ul className="list-disc ps-5">
                                    {c.cluster.members
                                      .filter((m) => m.signalId !== c.cluster!.lead.signalId)
                                      .map((m) => (
                                        <li key={m.signalId}>
                                          {m.title}
                                          {m.daysCover !== null ? ` · ${m.daysCover.toFixed(1)}d` : ""}
                                          {m.revenue14 !== null ? ` · ₪${Math.round(m.revenue14).toLocaleString("en-US")}` : ""}
                                          {m.surfacedOnToday ? ` · ${t("הוצג בהיום", "shown on Today")}` : ""}
                                        </li>
                                      ))}
                                  </ul>
                                  <div>
                                    <span className="font-medium">{t("למה קובצו", "Why grouped")}:</span> {c.cluster.reasons[locale].join(" · ")}
                                  </div>
                                  <div className="text-muted-foreground">{c.evidenceSummary.join(" · ")}</div>
                                </div>
                              </details>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{c.memberCount}</td>
                          <td className="px-3 py-2 font-semibold">{c.globalScore}</td>
                          {SCORE_DIMENSIONS.map((k) => (
                            <td key={k} className="px-3 py-2">
                              {c.scores[k]}
                            </td>
                          ))}
                          <td className="px-3 py-2">{c.surfaced ? t("כן", "yes") : t("לא", "no")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="text-sm font-semibold">{t("אותות גולמיים — הדירוג הלא מקובץ", "Raw signals — unclustered ranking")}</h3>
              </>
            ) : null}
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
