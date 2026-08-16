"use client";

// "Quick batch via Creative Agent" entry point. Opens a small inline form
// where the operator types a campaign theme; we hand it to the Creative
// agent → 5 visual prompts → 5 Higgsfield renders → 1 CreativeProject
// with 5 assets. The new project appears in the /creative list when the
// router refreshes.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import { ProductPicker, type SelectedProduct } from "@/components/shared/product-picker";

export function QuickBatchButton({ locale }: { locale: AppLocale }) {
  const isHe = locale === "he";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(isHe ? "קמפיין בושם קיץ" : "Summer perfume campaign");
  // Product picked from the store's catalog. Its title pre-fills the
  // agent's product-name context; its featuredImage URL becomes the
  // Higgsfield reference for every slot.
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  // Operator-uploaded reference files — mood-board / vibe images that
  // aren't in the catalog. Appended to the picked product's image to
  // give Higgsfield richer reference material.
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ projectId: string; succeeded: number; failed: number } | null>(null);

  const product = selectedProducts[0] ?? null;

  function addFiles(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files).filter((f) => f.type.startsWith("image/") && f.size < 12 * 1024 * 1024);
    setUploadedFiles((prev) => [...prev, ...accepted].slice(0, 10));
  }
  function removeFile(idx: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      // Build multipart so we can attach uploaded files (vibe references)
      // alongside the picked-product URLs. The backend round-robins all
      // references across the N generated slots so each ad gets real
      // references — not just a text prompt.
      const form = new FormData();
      form.set("theme", theme);
      form.set("count", String(count));
      form.set("aspectRatio", "9:16");
      if (product?.title) form.set("productName", product.title);
      if (product?.description) form.set("brandNotes", product.description);
      // Picked-product image(s) — already public URLs.
      for (const p of selectedProducts) {
        if (p.imageUrl) form.append("referenceImageUrls", p.imageUrl);
      }
      // Operator-uploaded vibe images — server uploads each to R2 and
      // builds a presigned URL.
      for (const f of uploadedFiles) {
        form.append("files", f, f.name);
      }
      const res = await fetch("/api/creative/quick-batch", {
        method: "POST",
        body: form
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setResult({ projectId: body.projectId, succeeded: body.succeeded, failed: body.failed });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Sparkles className={cn("h-4 w-4", isHe ? "ml-2" : "mr-2")} />
        {isHe ? "ייצור מהיר עם סוכן הקריאייטיב" : "Quick batch via Creative Agent"}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" onClick={() => !submitting && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">
              {isHe ? "ייצור מהיר עם סוכן הקריאייטיב" : "Quick batch via Creative Agent"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isHe
                ? "ספרו לסוכן על הקמפיין; הוא יבחר רעיונות חזותיים שונים והמערכת תייצר אותם דרך Higgsfield."
                : "Describe the campaign — the agent will pick distinct visual concepts and we render each via Higgsfield."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4 text-sm">
              <label className="block">
                <span className="font-medium">{isHe ? "נושא הקמפיין" : "Campaign theme"}</span>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                  placeholder={isHe ? "לדוגמה: קמפיין בושם קיץ" : "e.g. Summer perfume campaign"}
                  required
                />
              </label>

              <div>
                <span className="font-medium">
                  {isHe ? "מוצר מהחנות (התמונה תשמש כרפרנס)" : "Product from store (image used as reference)"}
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {isHe
                    ? "בחירת מוצר תעביר את תמונת המוצר לHiggsfield כרפרנס — המודעות יציגו את המוצר האמיתי שלכם."
                    : "Selecting a product passes its image to Higgsfield as a reference — the ads will feature your actual product."}
                </p>
                <div className="mt-2">
                  <ProductPicker
                    locale={locale}
                    selected={selectedProducts}
                    onChange={setSelectedProducts}
                    mode="single"
                    limit={24}
                  />
                </div>
              </div>

              {/* Optional vibe / mood-board uploads. These ride alongside
                  the product image as additional Higgsfield references —
                  good for "make it feel like this Pinterest mood-board"
                  cases that the catalog can't supply. */}
              <div>
                <span className="font-medium">
                  {isHe ? "תמונות אווירה / רפרנס נוספות (אופציונלי)" : "Vibe / extra reference images (optional)"}
                </span>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {isHe
                    ? "לדוגמה: מצב רוח, סגנון, פלטת צבעים. עד 10 קבצים, כל אחד עד 12MB."
                    : "Mood, style, palette inspiration. Up to 10 files, 12MB each."}
                </p>
                <div className="mt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => addFiles(e.target.files)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-xs hover:bg-muted"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {isHe ? "בחרו קבצים…" : "Choose files…"}
                  </button>
                  {uploadedFiles.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {uploadedFiles.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          <span className="max-w-[160px] truncate" title={f.name}>{f.name}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="text-muted-foreground hover:text-rose-600"
                            title={isHe ? "הסרה" : "Remove"}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <label className="block">
                <span className="font-medium">{isHe ? "כמה תמונות?" : "How many images"}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="mt-1 w-24 rounded-lg border border-border bg-background px-3 py-2"
                />
                {/* Cost estimate. When a reference image is provided we
                    route through OpenAI gpt-image-1 edits (preserves the
                    product) — that's ~$0.17 per gen at high quality.
                    Without a reference, Higgsfield ($0.05). */}
                <span className="ms-2 text-xs text-muted-foreground">
                  {(() => {
                    const usingOpenAi = product !== null || uploadedFiles.length > 0;
                    const perGen = usingOpenAi ? 0.17 : 0.05;
                    const total = (count * perGen).toFixed(2);
                    const providerLabel = usingOpenAi
                      ? isHe ? "OpenAI (שומר על המוצר)" : "OpenAI (preserves product)"
                      : isHe ? "Higgsfield" : "Higgsfield";
                    return isHe ? `~$${total} ב-${providerLabel}` : `~$${total} on ${providerLabel}`;
                  })()}
                </span>
              </label>

              {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              ) : null}

              {result ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {isHe
                    ? `הושלם: ${result.succeeded} הצליחו, ${result.failed} נכשלו.`
                    : `Done: ${result.succeeded} succeeded, ${result.failed} failed.`}
                  <a href={`/creative/${result.projectId}`} className="ms-2 underline">
                    {isHe ? "פתחו את הפרויקט" : "Open project"}
                  </a>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                  {result ? (isHe ? "סגירה" : "Close") : isHe ? "ביטול" : "Cancel"}
                </Button>
                {!result ? (
                  <Button type="submit" disabled={submitting || !theme.trim()}>
                    {submitting ? (
                      <>
                        <Loader2 className={cn("h-4 w-4 animate-spin", isHe ? "ml-2" : "mr-2")} />
                        {isHe ? "מייצר…" : "Generating…"}
                      </>
                    ) : isHe ? (
                      `ייצור ${count} תמונות`
                    ) : (
                      `Generate ${count} images`
                    )}
                  </Button>
                ) : null}
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                {isHe
                  ? "ייצור 5 תמונות נמשך כ60-120 שניות. אל תסגרו את החלון."
                  : "5-image generation takes ~60-120 seconds. Don't close this window."}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
