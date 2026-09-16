"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DECISION_STATE_LABEL,
  JUDGMENT_LABEL,
  MATERIALITY_LABEL,
  QUALITY_LABEL,
  displayDecisionId,
  type Decision,
  type HumanChoice,
  type JudgmentTag
} from "@/lib/domain/decision";
import { StatusPill, ConfidenceTag } from "./status-pill";
import { EvidenceGroups, QualityTag } from "./evidence";
import { InitiativeRealityPanel } from "@/components/plan/initiative-reality-panel";
import { DiagnosisBlock, AlternativesBlock, QuestionsBlock, IntentBlock } from "@/components/plan/decision-brief";
import { formatWhen } from "./decision-card";

type Locale = "he" | "en";
export type DecideChoice = "approve" | "alternative" | "ignore";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  );
}

const HUMAN_LABEL: Record<HumanChoice, { he: string; en: string }> = {
  pending: { he: "ממתין", en: "Pending" },
  approved: { he: "ההמלצה אושרה", en: "Recommendation approved" },
  alternative: { he: "נבחרה אפשרות אחרת", en: "Another option chosen" },
  ignored: { he: "התעלמות", en: "Ignored" },
  auto_closed: { he: "נסגר אוטומטית — התנאי חלף", en: "Closed automatically — condition passed" },
  expired: { he: "פג תוקף — לא התקבלה החלטה", en: "Expired — no decision was made" }
};

const JUDGMENT_TAGS: JudgmentTag[] = ["useful", "obvious", "wrong", "missing_context"];

// The Decision Receipt — the full, explainable record behind a card. Reads
// top to bottom as: the question, why now, the evidence with sources, what
// was connected (as business logic), the exposure in three dimensions, the
// options, the recommendation, how sure we are, what is missing, what would
// change it, the manager's decision, their judgment of the decision, and the
// receipt footer that starts Decision Memory.
export function DecisionReceipt({
  decision,
  locale,
  onDecide,
  busy,
  error
}: {
  decision: Decision;
  locale: Locale;
  onDecide?: (choice: DecideChoice, optionKey?: string) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const d = decision;
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const [choosing, setChoosing] = useState(false);
  const [optionKey, setOptionKey] = useState<string>(d.options.find((o) => !o.recommended)?.key ?? "");
  const decided = d.human.choice !== "pending";

  // Judgment is independent of approve/ignore and saved on its own.
  const [tags, setTags] = useState<JudgmentTag[]>(d.judgment?.tags ?? []);
  const [changed, setChanged] = useState<boolean | null>(d.judgment?.changedDecision ?? null);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [judgeSaved, setJudgeSaved] = useState<boolean>(Boolean(d.judgment));
  const [judgeError, setJudgeError] = useState<string | null>(null);

  const saveJudgment = async (nextTags: JudgmentTag[], nextChanged: boolean | null) => {
    setJudgeBusy(true);
    setJudgeError(null);
    try {
      const res = await fetch(`/api/decisions/${d.id}/judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags, changedDecision: nextChanged })
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("שמירת השיפוט נכשלה.", "Saving the judgment failed."));
      setJudgeSaved(true);
    } catch (e) {
      setJudgeError(e instanceof Error ? e.message : t("אירעה שגיאה.", "Something went wrong."));
    } finally {
      setJudgeBusy(false);
    }
  };
  const toggleTag = (tag: JudgmentTag) => {
    const next = tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag];
    setTags(next);
    if (next.length > 0 || changed !== null) void saveJudgment(next, changed);
  };
  const setChangedAndSave = (value: boolean) => {
    setChanged(value);
    void saveJudgment(tags, value);
  };

  const askHiloomy = () => {
    const question = t(
      `לגבי ההחלטה ${displayDecisionId(d.id)} — "${d.title.he}": ${d.question.he} מה עוד כדאי לבדוק לפני שמחליטים?`,
      `About decision ${displayDecisionId(d.id)} — "${d.title.en}": ${d.question.en} What else should be checked before deciding?`
    );
    window.dispatchEvent(new CustomEvent("hiloomy:ask", { detail: { text: question } }));
  };

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusPill status={d.status} locale={locale} />
          <span className="text-xs font-medium text-muted-foreground">{displayDecisionId(d.id)}</span>
          <span className="text-xs text-muted-foreground">· {DECISION_STATE_LABEL[d.ledger.state][locale]}</span>
        </div>
        <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{d.title[locale]}</h2>
      </header>

      {/* ── 1. What Hiloomy thinks happened ───────────────────────────── */}
      <Section title={t("מה הילומי חושבת שקרה", "What Hiloomy thinks happened")}>
        <p className="text-lg font-semibold leading-7">{d.brief ? d.brief.diagnosis.headline[locale] : d.connected.conclusion[locale]}</p>
        {!d.brief ? <p className="text-sm leading-6 text-muted-foreground">{d.connected.statement[locale]}</p> : null}
        <p className="text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">{t("ההחלטה: ", "The decision: ")}</span>
          {d.question[locale]}
        </p>
      </Section>

      {/* ── 2. The campaign behind it ─────────────────────────────────── */}
      {d.brief ? (
        <Section title={t("הקמפיין שקשור ליוזמה", "The campaign behind the initiative")}>
          {d.brief.campaign && d.brief.campaign.confirmed.length ? (
            <div className="rounded-xl border border-border/80 p-4 text-sm">
              <p className="font-semibold">{d.brief.campaign.confirmed.map((c) => c.name).join(" · ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("מאושר על ידי המנהל", "Confirmed by the manager")} · {d.brief.diagnosis.paid.evidence[locale]}
              </p>
            </div>
          ) : d.brief.campaign && (d.brief.campaign.likely || d.brief.campaign.alternatives.length) ? (
            <div className="space-y-2">
              {[...(d.brief.campaign.likely ? [{ c: d.brief.campaign.likely, likely: true }] : []), ...d.brief.campaign.alternatives.map((c) => ({ c, likely: false }))].map(({ c, likely }) => (
                <div key={c.id} className={cn("rounded-xl border p-4 text-sm", likely ? "border-foreground/40 bg-muted/30" : "border-border/80")}>
                  <p className="font-semibold">
                    <span className="me-2 tabular-nums">{Math.round(c.score * 100)}%</span>
                    {c.name}
                    {likely ? <span className="ms-2 rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">{t("סביר", "likely")}</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.reasons.map((r) => r[locale]).join(" · ")}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {t("אישור הקמפיין נעשה בעמוד היוזמה. עד אז יעילות Meta 'לא ידועה' — ואף המלצה לא מזיזה קמפיין שלא הוכח שהוא מנוע הביקוש.", "The campaign is confirmed on the initiative page. Until then Meta effectiveness is 'unknown' — and no recommendation moves a campaign that was not shown to drive the demand.")}{" "}
                <a href={`/plan/initiative/${d.brief.episode.intent.initiativeId}#campaign`} className="font-semibold underline-offset-4 hover:underline">
                  {t("לעמוד היוזמה", "Initiative page")} {isHe ? "←" : "→"}
                </a>
              </p>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">{d.brief.diagnosis.paid.evidence[locale]}</p>
          )}
        </Section>
      ) : null}

      {/* ── 3. What we meant to sell vs what people bought ────────────── */}
      {d.brief ? (
        <Section title={t("מה רצינו למכור — ומה אנשים קנו", "What we meant to sell — and what people bought")}>
          {d.brief.diagnosis.fulfillment && d.brief.diagnosis.fulfillment.defined ? (
            <IntentBlock f={d.brief.diagnosis.fulfillment} locale={locale} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {t("הכוונה המסחרית של היוזמה לא הוגדרה — Hiloomy מודדת מכירות, לא הצלחה.", "The initiative's commercial intent is not set — Hiloomy measures sales, not success.")}{" "}
              <a href={`/plan/initiative/${d.brief.episode.intent.initiativeId}#intent`} className="font-semibold underline-offset-4 hover:underline">
                {t("להגדיר בעמוד היוזמה", "Set it on the initiative page")} {isHe ? "←" : "→"}
              </a>
            </p>
          )}
        </Section>
      ) : null}

      {/* ── 4. What to do ─────────────────────────────────────────────── */}
      <Section title={d.blocked ? t("ההערכה חסומה", "Evaluation blocked") : t("מה לעשות", "What to do")}>
        {d.blocked ? (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
            <p className="text-base font-semibold leading-7">{d.blocked.line[locale]}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d.blocked.missing[locale]}</p>
            <a href={d.blocked.href} className="mt-3 inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
              {d.blocked.cta[locale]} {isHe ? "←" : "→"}
            </a>
            <p className="mt-2 text-xs text-muted-foreground">{t("זו פעולה תפעולית שנדרשת כדי להגיע להמלצה — לא המלצה עסקית.", "An operational step needed to reach a recommendation — not a business recommendation.")}</p>
          </div>
        ) : (
          <blockquote className="border-s-2 border-primary/60 ps-4">
            <p className="text-base font-semibold leading-7">{d.recommendation[locale]}</p>
            {d.reason ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">{t("סיבה: ", "Reason: ")}</span>
                {d.reason[locale]}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("ביטחון", "Confidence")}: {d.confidence === "high" ? t("גבוה", "high") : d.confidence === "medium" ? t("בינוני", "medium") : t("נמוך", "low")} · {d.confidenceReason[locale]}
            </p>
          </blockquote>
        )}
        {d.brief && d.brief.recommendation.questions.length ? (
          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold">{t("שאלה שמשנה את ההמלצה", "A question that changes the recommendation")}</p>
            <QuestionsBlock rec={d.brief.recommendation} locale={locale} sheetId={d.brief.sheetId} initiativeId={d.brief.episode.intent.initiativeId} coverDays={d.initiative?.inventory.worst?.coverDays ?? null} />
          </div>
        ) : null}
        {d.prepared ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold">{d.prepared.title[locale]}</p>
            <ul className="mt-2 space-y-1">
              {d.prepared.lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-6">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                  <span>{line[locale]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{d.prepared.note[locale]}</p>
          </div>
        ) : null}
        <div className="space-y-1 pt-2">
          <p className="text-sm font-semibold">{t("מה ישנה את ההחלטה?", "What would change this decision?")}</p>
          <ul className="space-y-1.5">
            {d.wouldChange.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-6">
                <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
                <span>{w[locale]}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── Evidence & reasoning — everything the four blocks rest on ─── */}
      <details className="rounded-xl border border-border/80 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold">{t("ראיות ונימוקים", "Evidence & reasoning")}</summary>
        <div className="mt-5 space-y-8">
          {d.initiative ? (
            <Section title={t("מצב היוזמה — המספרים", "Initiative reality — the numbers")}>
              <InitiativeRealityPanel r={d.initiative} locale={locale} now={new Date()} mappingHref={`/plan/initiative/${d.initiative.initiativeId}`} />
            </Section>
          ) : null}

          {d.brief ? (
            <Section title={t("אבחון עסקי — ממד אחר ממד", "Business diagnosis — dimension by dimension")}>
              <DiagnosisBlock d={d.brief.diagnosis} locale={locale} />
            </Section>
          ) : null}

          <Section title={t("טריגר", "Trigger")}>
            <p className="text-sm leading-6 text-muted-foreground">{d.trigger[locale]}</p>
          </Section>

          <Section title={t("מה הילומי חיברה", "What Hiloomy connected")}>
            <div className="rounded-xl border border-border/80 bg-muted/30 p-5">
              <p className="text-base font-semibold leading-7">{d.connected.statement[locale]}</p>
              <p className="mt-1 text-base leading-7">
                <span className="text-muted-foreground">= </span>
                <span className="font-semibold">{d.connected.conclusion[locale]}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("מקורות", "Sources")}:</span>
                {d.connected.inputs.map((input, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {i > 0 ? <span aria-hidden className="text-border">×</span> : null}
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 text-foreground/80">{input[locale]}</span>
                  </span>
                ))}
              </div>
              {d.materiality ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{t("מהותיות הקמפיין", "Campaign materiality")}: {MATERIALITY_LABEL[d.materiality.level][locale]}</span>
                  {" · "}
                  {d.materiality.detail[locale]}
                </p>
              ) : null}
            </div>
          </Section>

          <Section title={t("חשיפה מסחרית", "Commercial exposure")}>
            <div className="grid gap-3 sm:grid-cols-3">
              {d.exposure.map((x, i) => (
                <div key={i} className={cn("rounded-xl border p-4", x.value === null ? "border-dashed border-border" : "border-border/80 bg-background/60")}>
                  <p className="text-xs font-medium text-muted-foreground">{x.label[locale]}</p>
                  <p className={cn("mt-1 text-xl font-semibold tabular-nums", x.value === null && "text-muted-foreground")}>
                    {x.value === null ? QUALITY_LABEL.unavailable[locale] : x.value}
                  </p>
                  {x.note ? <p className="text-xs text-muted-foreground">{x.note[locale]}</p> : null}
                  <QualityTag quality={x.quality} locale={locale} className="mt-2" />
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("ראיות", "Evidence")}>
            <EvidenceGroups evidence={d.evidence} locale={locale} />
          </Section>

          <Section title={t("אפשרויות שנשקלו", "Options considered")}>
            <ol className="space-y-2">
              {d.options.map((o, i) => (
                <li
                  key={o.key}
                  className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", o.recommended ? "border-primary/40 bg-primary/5 font-semibold" : "border-border/80")}
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 leading-6">{o.label[locale]}</span>
                  {o.recommended ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <Check className="h-3 w-3" aria-hidden />
                      {t("מומלץ", "Recommended")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </Section>

          {d.brief && d.brief.recommendation.alternatives.length ? (
            <Section title={t("מרחב ההחלטה — החלופות ומתי כל אחת עדיפה", "Decision space — the alternatives and when each is better")}>
              <AlternativesBlock rec={d.brief.recommendation} locale={locale} />
              <p className="mt-2 text-xs text-muted-foreground">{t("דירוג איכותי: זמינות קודם, רווחיות שנייה, ביקוש שלישי, ואז ערוץ, המרה, ישימות והפיכות. לא ציון חזוי.", "Qualitative ranking: fulfilment first, profitability second, demand third, then channel, conversion, feasibility and reversibility. Not a predicted score.")}</p>
            </Section>
          ) : null}

          <Section title={t("ביטחון", "Confidence")}>
            <ConfidenceTag confidence={d.confidence} locale={locale} className="text-sm" />
            <p className="text-sm leading-6 text-muted-foreground">{d.confidenceReason[locale]}</p>
            {d.unknown ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">{t("מה הילומי לא יודעת", "What Hiloomy doesn't know")}</p>
                <p className="mt-1 leading-6">{d.unknown[locale]}</p>
              </div>
            ) : null}
          </Section>

          <Section title={t("ראיות חסרות", "Missing evidence")}>
            {d.missingEvidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("אין ראיות חסרות מהותיות.", "No material evidence is missing.")}</p>
            ) : (
              <ul className="space-y-1.5">
                {d.missingEvidence.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <span>
                      {m[locale]} <span className="text-muted-foreground">— {t("לא זמין", "unavailable")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </details>

      <Section title={t("החלטת המנהל/ת", "Human decision")}>
        {decided ? (
          <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm">
            <p className="font-semibold">{HUMAN_LABEL[d.human.choice][locale]}</p>
            {d.human.optionKey ? <p className="mt-1 text-muted-foreground">{d.options.find((o) => o.key === d.human.optionKey)?.label[locale] ?? d.human.optionKey}</p> : null}
            {d.human.decidedAt ? (
              <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
                {formatWhen(d.human.decidedAt, locale)}
                {d.human.decidedBy ? ` · ${d.human.decidedBy}` : ""}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {choosing ? (
              <div className="space-y-2 rounded-xl border border-border/80 p-4">
                {d.options.map((o) => (
                  <label key={o.key} className="flex cursor-pointer items-center gap-3 text-sm">
                    <input type="radio" name="decision-option" value={o.key} checked={optionKey === o.key} onChange={() => setOptionKey(o.key)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    <span>{o.label[locale]}</span>
                  </label>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" disabled={busy || !optionKey} onClick={() => onDecide?.("alternative", optionKey)}>
                    {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
                    {t("לאשר את הבחירה", "Confirm choice")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChoosing(false)}>
                    {t("ביטול", "Cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !onDecide} onClick={() => onDecide?.("approve")}>
                {busy ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Check className="me-1.5 h-4 w-4" aria-hidden />}
                {t("לאשר את ההמלצה", "Approve recommendation")}
              </Button>
              <Button variant="secondary" disabled={busy || !onDecide} onClick={() => setChoosing((v) => !v)}>
                {t("לבחור אפשרות אחרת", "Choose another option")}
              </Button>
              <Button variant="ghost" disabled={busy || !onDecide} onClick={() => onDecide?.("ignore")}>
                {t("להתעלם", "Ignore")}
              </Button>
              <Button variant="ghost" onClick={askHiloomy}>
                <MessageCircle className="me-1.5 h-4 w-4" aria-hidden />
                {t("לשאול את הילומי", "Ask Hiloomy")}
              </Button>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        )}
      </Section>

      {/* The wedge measurement: was this worth a manager's attention, and
          did it change anything? Saved on every click, no submit button. */}
      <Section title={t("השיפוט שלכם על ההחלטה", "Your judgment of this decision")}>
        <div className="space-y-3 rounded-xl border border-border/80 p-4">
          <div className="flex flex-wrap gap-2">
            {JUDGMENT_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  disabled={judgeBusy}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {JUDGMENT_LABEL[tag][locale]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-muted-foreground">{t("האם זה שינה את ההחלטה או את תשומת הלב שלכם?", "Did this change your decision or where you looked?")}</span>
            <div className="flex gap-1.5">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  disabled={judgeBusy}
                  onClick={() => setChangedAndSave(v)}
                  aria-pressed={changed === v}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    changed === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v ? t("כן", "Yes") : t("לא", "No")}
                </button>
              ))}
            </div>
            {judgeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden /> : judgeSaved ? <span className="text-xs text-muted-foreground">{t("נשמר", "Saved")}</span> : null}
          </div>
          {judgeError ? <p className="text-sm text-danger">{judgeError}</p> : null}
        </div>
      </Section>

      <footer className="rounded-xl border border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("קבלת החלטה", "Decision receipt")}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          <dt>{t("מזהה החלטה", "Decision ID")}</dt>
          <dd className="font-semibold text-foreground sm:col-span-2">{displayDecisionId(d.id)}</dd>
          <dt>{t("זוהה", "Detected")}</dt>
          <dd className="font-semibold text-foreground sm:col-span-2" suppressHydrationWarning>
            {formatWhen(d.detectedAt, locale)}
          </dd>
          <dt>{t("מצב", "State")}</dt>
          <dd className="font-semibold text-foreground sm:col-span-2">
            {DECISION_STATE_LABEL[d.ledger.state][locale]}
            {d.ledger.snapshots.length > 0 ? ` · ${t(`${d.ledger.snapshots.length} תמונות ראיות`, `${d.ledger.snapshots.length} evidence snapshot${d.ledger.snapshots.length === 1 ? "" : "s"}`)}` : ""}
          </dd>
          <dt>{t("תמונת ראיות", "Evidence snapshot")}</dt>
          <dd className="font-semibold text-foreground sm:col-span-2">{t("נשמרה", "Saved")}</dd>
          <dt>{t("החלטת המנהל/ת", "Human decision")}</dt>
          <dd className="font-semibold text-foreground sm:col-span-2">{HUMAN_LABEL[d.human.choice][locale]}</dd>
          <dt>{t("תוצאה", "Outcome")}</dt>
          <dd className="font-semibold text-foreground sm:col-span-2">{d.outcome ? d.outcome.summary[locale] : t("עדיין לא ידועה", "Not yet known")}</dd>
        </dl>
      </footer>
    </div>
  );
}
