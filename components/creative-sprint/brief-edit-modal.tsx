"use client";

// BriefEditModal — opens when the operator clicks an ad tile in the sprint
// matrix. Shows the full brief text (which the tile truncates) and lets
// them edit headline / body / CTA / visualPrompt before approving the
// batch. PATCHes /api/creative-sprint/{id}/briefs/{slot} on save.
//
// Read-only fields shown for context: angle, variantLabel, slotIndex.
// The visualPrompt edit is the highest-leverage one — it's what gets
// sent straight to Higgsfield, so wording changes here directly shape
// the asset that comes back.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n";
import type { SprintAdSummary } from "@/lib/services/creative-sprint/sprint-service";

interface Props {
  sprintId: string;
  ad: SprintAdSummary;
  locale: AppLocale;
  // Whether brief fields are editable (true while sprint is in brief-
  // approval phase; false later — modal still shows the full text for
  // reference but disables inputs).
  editable: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function BriefEditModal({ sprintId, ad, locale, editable, onClose, onSaved }: Props) {
  const t = locale === "he";
  const [headline, setHeadline] = useState(ad.headline);
  const [body, setBody] = useState(ad.body);
  const [cta, setCta] = useState(ad.cta);
  const [visualPrompt, setVisualPrompt] = useState(ad.visualPrompt);
  const [assetType, setAssetType] = useState<"image" | "video">(ad.assetType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync state when the parent passes a different ad in (e.g. clicking
  // tile #2 right after closing the modal for tile #1).
  useEffect(() => {
    setHeadline(ad.headline);
    setBody(ad.body);
    setCta(ad.cta);
    setVisualPrompt(ad.visualPrompt);
    setAssetType(ad.assetType);
  }, [ad.id, ad.headline, ad.body, ad.cta, ad.visualPrompt, ad.assetType]);

  const dirty =
    headline !== ad.headline ||
    body !== ad.body ||
    cta !== ad.cta ||
    visualPrompt !== ad.visualPrompt ||
    assetType !== ad.assetType;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/creative-sprint/${sprintId}/briefs/${ad.slotIndex}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headline, body, cta, visualPrompt, assetType })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4" onClick={() => !saving && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t ? `מודעה #${ad.slotIndex} · ${ad.angle}` : `Ad #${ad.slotIndex} · ${ad.angle}`}
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {ad.variantLabel || (t ? "תקציר" : "Brief")}
            </h2>
          </div>
          <span className={`text-xs ${editable ? "text-emerald-700" : "text-muted-foreground"}`}>
            {editable ? (t ? "ניתן לעריכה" : "Editable") : t ? "קריאה בלבד" : "Read-only"}
          </span>
        </div>

        <div className="mt-6 space-y-4 text-sm">
          <label className="block">
            <span className="font-medium">{t ? "כותרת" : "Headline"}</span>
            <textarea
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              disabled={!editable}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="font-medium">{t ? "גוף הטקסט" : "Body copy"}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!editable}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-medium">CTA</span>
              <input
                type="text"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                disabled={!editable}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="font-medium">{t ? "סוג נכס" : "Asset type"}</span>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as "image" | "video")}
                disabled={!editable}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-60"
              >
                <option value="image">{t ? "תמונה" : "Image"}</option>
                <option value="video">{t ? "סרטון" : "Video"}</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="font-medium">{t ? "פרומפט חזותי (נשלח לHiggsfield)" : "Visual prompt (sent to Higgsfield)"}</span>
            <textarea
              value={visualPrompt}
              onChange={(e) => setVisualPrompt(e.target.value)}
              disabled={!editable}
              rows={5}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs disabled:opacity-60"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {t
                ? "זהו הטקסט שממנו תיווצר התמונה. ככל שתדייקו יותר, כך התוצאה תהיה קרובה יותר למה שדמיינתם."
                : "This is the text the image model sees. The more specific, the closer the output to what you imagined."}
            </span>
          </label>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t ? "סגירה" : "Close"}
          </Button>
          {editable ? (
            <Button type="button" onClick={save} disabled={saving || !dirty}>
              {saving ? (t ? "שומר…" : "Saving…") : t ? "שמרו שינויים" : "Save changes"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
