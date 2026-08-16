"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";

interface PublishResult {
  mediaId: string | null;
  mediaUrl: string | null;
  productId: string;
}

export function PublishToShopifyDialog({
  projectId,
  assetId,
  open,
  onClose,
  locale
}: {
  projectId: string;
  assetId: string;
  open: boolean;
  onClose: () => void;
  locale: AppLocale;
}) {
  const isHe = locale === "he";
  const [productId, setProductId] = useState("");
  const [altText, setAltText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  // Reset state every time the dialog re-opens so the user doesn't see a
  // stale success/error from a previous publish.
  useEffect(() => {
    if (open) {
      setError(null);
      setResult(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = productId.trim();
    if (!trimmed) {
      setError(isHe ? "הזינו מזהה מוצר Shopify." : "Enter a Shopify product id.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(
        `/api/creative/projects/${projectId}/assets/${assetId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: trimmed,
            altText: altText.trim() || undefined
          })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || (isHe ? "הפרסום נכשל." : "Publish failed."));
      }
      setResult({
        mediaId: payload.mediaId ?? null,
        mediaUrl: payload.mediaUrl ?? null,
        productId: payload.productId
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? "שגיאה לא צפויה." : "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">
              {isHe ? "פרסום לShopify" : "Publish to Shopify"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isHe
                ? "הקובץ יועלה דרך Shopify Files לגלריית המדיה של המוצר שתבחרו."
                : "Pushes this asset into the chosen product's media gallery via Shopify Files."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {isHe ? "פורסם בהצלחה" : "Published successfully"}
            </div>
            <p className="text-[11px] opacity-80 break-all">
              {isHe ? "מוצר: " : "Product: "}
              <span className="font-mono">{result.productId}</span>
            </p>
            {result.mediaUrl ? (
              <a
                href={result.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[11px] font-medium underline"
              >
                {isHe ? "צפייה בקובץ בShopify" : "View on Shopify"}
              </a>
            ) : null}
            <div className="pt-1">
              <Button variant="secondary" size="sm" onClick={onClose}>
                {isHe ? "סיום" : "Done"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isHe ? "מזהה מוצר Shopify" : "Shopify product id"}
              </span>
              <input
                type="text"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                placeholder="gid://shopify/Product/1234567890 or admin URL"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[11px] leading-4 text-muted-foreground">
                {isHe
                  ? "ניתן להזין מזהה מספרי, GID או כתובת admin מלאה."
                  : "Accepts a numeric id, GID, or full /admin/products/… URL."}
              </p>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isHe ? "תיאור Alt (אופציונלי)" : "Alt text (optional)"}
              </span>
              <input
                type="text"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                placeholder={isHe ? "תיאור תמונה לSEO" : "Image description for SEO"}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={submitting}>
                {isHe ? "ביטול" : "Cancel"}
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className={cn("h-3.5 w-3.5 animate-spin", isHe ? "ml-1.5" : "mr-1.5")} />
                    {isHe ? "מפרסם…" : "Publishing…"}
                  </>
                ) : (
                  <>
                    <Send className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                    {isHe ? "פרסום" : "Publish"}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
