"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n";
import type { SprintApprovalMode } from "@/lib/services/creative-sprint/sprint-service";

// New-sprint launcher form.
//
// Layout: two columns on desktop — left = config, right = live cost
// preview + summary card. The preview updates as the operator changes
// values, so they see "this sprint costs ~$X gen + ~₪Y ad spend" before
// committing.

interface Props {
  locale: AppLocale;
  storeName: string;
  storeCurrency: string;
}

const TARGET_COUNT_PRESETS = [10, 25, 50, 100];
const APPROVAL_MODES: Array<{ value: SprintApprovalMode; labelHe: string; labelEn: string; descHe: string; descEn: string }> = [
  { value: "review_both", labelHe: "אישור תקצירים + נכסים (מומלץ לספרינט הראשון)", labelEn: "Review both (recommended for sprint #1)", descHe: "תאשרו את התקצירים, לאחר מכן את הנכסים, ורק אז יתבצע הפרסום.", descEn: "Approve briefs, then approve assets, then publish." },
  { value: "review_briefs", labelHe: "אישור תקצירים בלבד", labelEn: "Review briefs only", descHe: "הנכסים מתפרסמים אוטומטית לאחר שתאשרו את התקצירים.", descEn: "Assets auto-publish once you approve briefs." },
  { value: "review_assets", labelHe: "אישור נכסים בלבד", labelEn: "Review assets only", descHe: "התקצירים נוצרים אוטומטית; תאשרו את הנכסים לפני הפרסום.", descEn: "Briefs auto-generate; you approve assets before publish." },
  { value: "full_auto", labelHe: "אוטומטי לחלוטין (ללא אישור אנושי)", labelEn: "Full auto (no human gate)", descHe: "סיכון: מודעות מתפרסמות בלי שתראו אותן.", descEn: "Risk: ads publish without you seeing them." }
];

export function NewSprintForm({ locale, storeName, storeCurrency }: Props) {
  const t = locale === "he";
  const router = useRouter();

  const [name, setName] = useState(t ? `ספרינט ${storeName}` : `${storeName} sprint`);
  const [targetCount, setTargetCount] = useState(100);
  const [dailyBudgetPerAd, setDailyBudgetPerAd] = useState(10);
  const [approvalMode, setApprovalMode] = useState<SprintApprovalMode>("review_both");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estHiggsfieldUsd = useMemo(() => Number((targetCount * 0.05).toFixed(2)), [targetCount]); // image-default estimate
  const estAdSpend3d = useMemo(() => targetCount * dailyBudgetPerAd * 3, [targetCount, dailyBudgetPerAd]); // 3-day evaluation
  const estAdSpend1d = targetCount * dailyBudgetPerAd;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/creative-sprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          targetCount,
          dailyBudgetPerAd,
          approvalMode,
          notes: notes || null,
          currency: storeCurrency
        })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/creative/sprint/${body.id}` as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* ── Config column ──────────────────────────────────────────── */}
      <div className="space-y-6 lg:col-span-2">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="block text-sm font-medium">{t ? "שם הספרינט" : "Sprint name"}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="block text-sm font-medium">{t ? "כמה מודעות?" : "How many ads?"}</label>
          <div className="flex flex-wrap gap-2">
            {TARGET_COUNT_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTargetCount(n)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  targetCount === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted/40"
                }`}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={500}
              value={targetCount}
              onChange={(e) => setTargetCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t
              ? "10 הוא הגודל המומלץ להרצת ניסיון ראשונה. 100 הוא ברירת המחדל לריצה מלאה."
              : "10 is the recommended size for first-time smoke testing. 100 is the production default."}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="block text-sm font-medium">
            {t ? `תקציב יומי לכל מודעה (${storeCurrency})` : `Daily budget per ad (${storeCurrency})`}
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={dailyBudgetPerAd}
            onChange={(e) => setDailyBudgetPerAd(Math.max(1, Number(e.target.value) || 1))}
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t
              ? "Meta יחלק את התקציב על פני 24 שעות. בחלון של 6 שעות כל מודעה תוציא כרבע מהתקציב."
              : "Meta paces this across 24h, so in 6h each ad will spend roughly a quarter of this."}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="block text-sm font-medium">{t ? "מצב אישור" : "Approval mode"}</label>
          <div className="space-y-2">
            {APPROVAL_MODES.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                  approvalMode === m.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="approvalMode"
                  checked={approvalMode === m.value}
                  onChange={() => setApprovalMode(m.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">{t ? m.labelHe : m.labelEn}</div>
                  <div className="text-xs text-muted-foreground">{t ? m.descHe : m.descEn}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="block text-sm font-medium">{t ? "הערות (אופציונלי)" : "Notes (optional)"}</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t ? "למה אתם מריצים את הספרינט הזה? לאיזה מוצר?" : "Why are you running this sprint? Which product?"}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? (t ? "יוצר…" : "Creating…") : t ? "צרו ספרינט" : "Create sprint"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            {t ? "ביטול" : "Cancel"}
          </Button>
        </div>
      </div>

      {/* ── Cost preview column ────────────────────────────────────── */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t ? "אומדן עלות" : "Cost estimate"}
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t ? "ייצור Higgsfield" : "Higgsfield generation"}</dt>
              <dd className="font-medium tabular-nums">~${estHiggsfieldUsd.toFixed(2)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t ? "תקציב יומי כולל" : "Daily ad spend ceiling"}</dt>
              <dd className="font-medium tabular-nums">
                {storeCurrency} {estAdSpend1d.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="text-muted-foreground">{t ? "תקציב כולל ל3 ימי הערכה" : "Total across 3-day eval"}</dt>
              <dd className="font-semibold tabular-nums">
                {storeCurrency} {estAdSpend3d.toLocaleString()}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            {t
              ? "התקציב היומי הוא תקרה: רוב המודעות ייעצרו בשלב 1 (6 שעות) ויפסיקו להוציא. ההוצאה בפועל היא בדרך כלל 30%-50% מהתקרה."
              : "Daily ceiling — most ads get killed at stage 1 (6h) and stop spending. Actual spend is usually 30-50% of the ceiling."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t ? "תוכנית סינון מדורג" : "Cascade plan"}
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">+6h</span>
              <span>
                CTR · {t ? "עצירת 70% התחתונים" : "kill bottom 70%"}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">+24h</span>
              <span>
                CPC · {t ? "עצירת 50% התחתונים" : "kill bottom 50%"}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">+72h</span>
              <span>
                CPA · {t ? "עצירת 50% התחתונים" : "kill bottom 50%"}
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            {t
              ? "ברירת מחדל. ניתן יהיה לשנות לכל ספרינט בעתיד."
              : "Default plan. Editable per sprint later."}
          </p>
        </div>
      </aside>
    </form>
  );
}
