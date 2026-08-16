"use client";

// GenerateBriefsModal — opens when the operator clicks "Generate briefs"
// on a draft sprint. Replaces the old window.prompt() flow with:
//   1. Product picker (pulls from the store's Shopify catalog)
//   2. Optional "campaign vibe" text input (e.g. "summer / beach /
//      golden hour", default empty → agent picks)
//   3. Submit → calls /api/creative-sprint/{id}/generate-briefs with
//      full product context + vibe so the Creative agent has everything
//      it needs to write distinct, on-brand briefs.
//
// The store's brand name comes from chrome (passed in by the parent),
// not from a text input — the connected store IS the brand.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductPicker, type SelectedProduct } from "@/components/shared/product-picker";
import type { AppLocale } from "@/lib/i18n";

interface Props {
  sprintId: string;
  storeName: string;
  locale: AppLocale;
  onClose: () => void;
  onGenerated: () => void;
}

export function GenerateBriefsModal({ sprintId, storeName, locale, onClose, onGenerated }: Props) {
  const t = locale === "he";
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [vibe, setVibe] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = selected[0] ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) {
      setError(t ? "בחרו מוצר תחילה" : "Pick a product first");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Build the rich product context the Creative agent uses to
      // distinguish 100 ad concepts. The product image URL becomes a
      // Higgsfield reference downstream (once the brief→asset stage runs).
      const res = await fetch(`/api/creative-sprint/${sprintId}/generate-briefs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          store: {
            brandName: storeName,
            // Vibe goes into "voice" so the brief prompt frames the angle
            // selection — passing empty string is fine; the prompt has
            // sensible defaults.
            voice: vibe || undefined,
            language: locale === "he" ? "he" : "en"
          },
          product: {
            title: product.title,
            description: product.description ?? undefined,
            priceDisplay: `₪${Number(product.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            tagline: product.vendor ?? undefined,
            imageUrl: product.imageUrl ?? undefined
          }
        })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4" onClick={() => !submitting && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">
          {t ? "יצירת תקצירים לספרינט" : "Generate sprint briefs"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t
            ? `סוכן הקריאייטיב יכתוב תקצירים עבור ${storeName}. הוא צריך לדעת איזה מוצר לקדם — בחרו מוצר מהחנות.`
            : `The Creative agent will write briefs for ${storeName}. It needs to know which product to promote — pick one from your store.`}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5 text-sm">
          <div>
            <span className="font-medium">{t ? "בחרו מוצר" : "Pick a product"} *</span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t
                ? "פרטי המוצר המלאים (שם, תיאור, מחיר, תמונה) ישולבו בתקצירים. תמונת המוצר תשמש כרפרנס לHiggsfield בשלב הבא."
                : "The full product info (title, description, price, image) feeds the briefs. The product image becomes the Higgsfield reference at the next stage."}
            </p>
            <div className="mt-2">
              <ProductPicker
                locale={locale}
                selected={selected}
                onChange={setSelected}
                mode="single"
                limit={24}
              />
            </div>
          </div>

          <label className="block">
            <span className="font-medium">{t ? "אווירת הקמפיין (אופציונלי)" : "Campaign vibe (optional)"}</span>
            <input
              type="text"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder={t ? "לדוגמה: קיץ, חוף, אור זהוב" : "e.g. summer, beach, golden hour"}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {t
                ? "השאירו ריק והסוכן יבחר אווירה לפי המוצר. ככל שתפרטו יותר, כך התקצירים יהיו ממוקדים יותר."
                : "Leave blank for the agent to pick. The more specific you go, the more focused the briefs."}
            </span>
          </label>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t ? "ביטול" : "Cancel"}
            </Button>
            <Button type="submit" disabled={submitting || !product}>
              {submitting ? (t ? "מייצר…" : "Generating…") : t ? "יצירה" : "Generate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
