"use client";

// "מה רצינו להשיג" — the manager states, in under a minute, what the
// initiative is meant to sell (a hero product, or a set built from several
// products), where, to whom, and one target. Stored as a plan override
// (`intents`) and the initiative is re-evaluated at once. Nothing here is
// inferred: an empty form means "not set", never a guess.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InitiativeIntent, IntentAudience, IntentChannel, IntentGoalKind, IntentTargetMode } from "@/lib/domain/intent-fulfillment";

// One checkbox per product TITLE. A catalogue can hold the same product
// under two Shopify ids; the option carries every id so both count.
export interface IntentProductOption {
  ids: string[];
  title: string;
  role: "product" | "gift";
}

export function IntentForm({ sheetId, initiativeId, products, intent, locale, compact = false }: { sheetId: string; initiativeId: string; products: IntentProductOption[]; intent: InitiativeIntent | null; locale: "he" | "en"; compact?: boolean }) {
  const isHe = locale === "he";
  const t = (he: string, en: string) => (isHe ? he : en);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(!intent && !compact);
  const mainProducts = useMemo(() => products.filter((p) => p.role === "product"), [products]);
  const [targets, setTargets] = useState<string[]>(intent?.targetProductIds ?? (mainProducts.length === 1 ? [...mainProducts[0].ids] : []));
  const [mode, setMode] = useState<IntentTargetMode>(intent?.targetMode ?? "any");
  const [label, setLabel] = useState(intent?.targetLabel ?? "");
  const [channel, setChannel] = useState<IntentChannel | "">(intent?.channel ?? "");
  const [audience, setAudience] = useState<IntentAudience | "">(intent?.audience ?? "");
  const [goalKind, setGoalKind] = useState<IntentGoalKind>(intent?.goal?.kind ?? "revenue");
  const [goalValue, setGoalValue] = useState(intent?.goal ? String(intent.goal.value) : "");
  const [note, setNote] = useState(intent?.note ?? "");

  const isChecked = (o: IntentProductOption) => o.ids.some((id) => targets.includes(id));
  const toggle = (o: IntentProductOption) => setTargets((cur) => (o.ids.some((id) => cur.includes(id)) ? cur.filter((x) => !o.ids.includes(x)) : [...cur, ...o.ids]));
  const checkedGroups = mainProducts.filter(isChecked).length;
  const canSave = targets.length > 0 || channel !== "" || audience !== "" || (goalValue.trim() !== "" && Number(goalValue) > 0);

  const post = (body: Record<string, unknown>) =>
    start(async () => {
      setErr(null);
      try {
        const res = await fetch(`/api/gantt/${sheetId}/plan/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json?.error ?? "failed");
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  const save = () => {
    const value = Number(goalValue);
    post({
      op: "set_intent",
      initiativeId,
      intent: {
        targetProductIds: targets,
        targetMode: checkedGroups > 1 ? mode : "any",
        targetLabel: label.trim() || null,
        channel: channel || null,
        audience: audience || null,
        goal: goalValue.trim() && Number.isFinite(value) && value > 0 ? { kind: goalKind, value } : null,
        note: note.trim() || null
      }
    });
  };

  const inputCls = "rounded-md border border-border bg-background px-2 py-1 text-sm";
  const btn = "rounded-md border border-foreground px-3 py-1 text-xs font-semibold hover:bg-foreground hover:text-background disabled:opacity-50";

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => setOpen(true)} className="font-semibold underline-offset-4 hover:underline">
          {intent ? t("לעדכן את הכוונה", "Edit the intent") : t("ספרו ל-Hiloomy מה היוזמה נועדה להשיג", "Tell Hiloomy what the initiative was meant to achieve")}
        </button>
        {intent ? (
          <button type="button" disabled={pending} onClick={() => post({ op: "clear_intent", initiativeId })} className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">
            {t("לנקות", "Clear")}
          </button>
        ) : null}
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
      <div className="space-y-2">
        <p className="font-medium">{t("מה רצינו שהלקוחות יקנו?", "What did we intend customers to buy?")}</p>
        {mainProducts.length ? (
          <ul className="grid gap-1 sm:grid-cols-2">
            {mainProducts.map((p) => (
              <li key={p.ids.join("|")}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={isChecked(p)} onChange={() => toggle(p)} />
                  <span>{p.title}</span>
                  {p.ids.length > 1 ? <span className="text-[10px] text-muted-foreground">{t(`×${p.ids.length} בקטלוג`, `×${p.ids.length} in catalogue`)}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t("אין עדיין מוצרים מקושרים ליוזמה — קשרו מוצרים קודם, או הגדירו רק ערוץ, קהל ויעד.", "No products are linked to the initiative yet — link products first, or state only channel, audience and goal.")}</p>
        )}
        {checkedGroups > 1 ? (
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "any"} onChange={() => setMode("any")} />
              {t("כל אחד מהם נחשב (מוצר הירו)", "Any of them counts (hero products)")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "together"} onChange={() => setMode("together")} />
              {t("כולם יחד באותה הזמנה (סט)", "All together in one order (a set)")}
            </label>
          </div>
        ) : null}
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("במילים שלכם: סט מלא + כרית טיסה במתנה", "In your words: full set + travel pillow gift")} className={`${inputCls} w-full`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("ערוץ", "Channel")}</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as IntentChannel | "")} className={`${inputCls} w-full`}>
            <option value="">{t("לא משנה", "Any")}</option>
            <option value="online">{t("אונליין", "Online")}</option>
            <option value="offline">{t("חנויות", "Stores")}</option>
            <option value="both">{t("שניהם", "Both")}</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("קהל", "Audience")}</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as IntentAudience | "")} className={`${inputCls} w-full`}>
            <option value="">{t("לא משנה", "Any")}</option>
            <option value="new">{t("לקוחות חדשים", "New customers")}</option>
            <option value="existing">{t("לקוחות קיימים", "Existing customers")}</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("יעד אחד", "One goal")}</span>
          <div className="flex gap-1">
            <select value={goalKind} onChange={(e) => setGoalKind(e.target.value as IntentGoalKind)} className={inputCls}>
              <option value="revenue">₪</option>
              <option value="units">{t("יח׳", "units")}</option>
              <option value="orders">{t("הזמנות", "orders")}</option>
            </select>
            <input dir="ltr" inputMode="numeric" value={goalValue} onChange={(e) => setGoalValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder="50000" className={`${inputCls} w-full`} />
          </div>
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("הערה (לא חובה)", "Note (optional)")} className={`${inputCls} w-full`} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !canSave} onClick={save} className={btn}>
          {t("שמירה", "Save")}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          {t("ביטול", "Cancel")}
        </button>
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
    </div>
  );
}
