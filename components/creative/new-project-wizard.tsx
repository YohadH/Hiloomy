"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Loader2, Upload, Box, ImageIcon, Film, Megaphone, Sparkles, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import {
  CREATIVE_ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  type CreativeAspectRatio,
  type CreativeProvider,
  type CreativeRealismLevel,
  type CreativeSourceRole,
  type CreativeType
} from "@/lib/domain/creative-types";
import type { CreativeProviderStatus } from "@/lib/services/creative-provider-availability";
import { ProductPicker, type SelectedProduct } from "@/components/shared/product-picker";

const PROVIDER_INFO: Record<CreativeProvider, { labelEn: string; labelHe: string; blurbEn: string; blurbHe: string }> = {
  replicate: {
    labelEn: "Replicate — Flux",
    labelHe: "Replicate — Flux",
    blurbEn: "Flux 1.1 Pro for quality, Flux Schnell for big batches.",
    blurbHe: "Flux 1.1 Pro לאיכות גבוהה, Flux Schnell לאצוות גדולות."
  },
  higgsfield: {
    labelEn: "Higgsfield — Soul / DoP",
    labelHe: "Higgsfield — Soul / DoP",
    blurbEn: "Soul for images, DoP for video. Supports video out of the box.",
    blurbHe: "Soul לתמונות, DoP לסרטונים. תומך גם בווידאו."
  },
  nanobanana: {
    labelEn: "Nano Banana — Gemini",
    labelHe: "Nano Banana — Gemini",
    blurbEn: "Google's Gemini 2.5 Flash Image. Strong product fidelity, images only.",
    blurbHe: "Gemini 2.5 Flash Image של גוגל. נאמנות גבוהה למוצר, תמונות בלבד."
  },
  openai: {
    labelEn: "OpenAI — gpt-image-1",
    labelHe: "OpenAI — gpt-image-1",
    blurbEn: "OpenAI's gpt-image-1. Edits when a reference is uploaded, otherwise text-to-image. Images only.",
    blurbHe: "gpt-image-1 של OpenAI. עורך מתמונת ייחוס או יוצר מטקסט. תמונות בלבד."
  }
};

type TypeChoice = {
  id: CreativeType;
  icon: typeof Sparkles;
  labelEn: string;
  labelHe: string;
  blurbEn: string;
  blurbHe: string;
};

const CHOICES: TypeChoice[] = [
  {
    id: "PACKSHOT",
    icon: Box,
    labelEn: "Packshot",
    labelHe: "פאקשוט",
    blurbEn: "Clean studio shot of the product on a polished background.",
    blurbHe: "תמונת סטודיו נקייה של המוצר על רקע מלוטש."
  },
  {
    id: "INSTAGRAM_POST",
    icon: ImageIcon,
    labelEn: "Instagram post",
    labelHe: "פוסט אינסטגרם",
    blurbEn: "Lifestyle composition with space for a headline overlay.",
    blurbHe: "קומפוזיציית לייפסטייל עם מקום לכותרת בעריכה."
  },
  {
    id: "UGC_VIDEO",
    icon: Film,
    labelEn: "UGC content",
    labelHe: "תוכן UGC",
    blurbEn: "Authentic, handheld-style frame. Video generation arrives in M3.",
    blurbHe: "פריים אותנטי בסגנון צילום ידני. ייצור וידאו יתווסף בM3."
  },
  {
    id: "META_AD",
    icon: Megaphone,
    labelEn: "Meta ad",
    labelHe: "מודעה לMeta",
    blurbEn: "High-contrast, scroll-stopping creative.",
    blurbHe: "קריאייטיב בניגודיות גבוהה שבולט בפיד."
  }
];

export function NewProjectWizard({
  locale,
  providerAvailability,
  videoSettings
}: {
  locale: AppLocale;
  providerAvailability: CreativeProviderStatus[];
  videoSettings: { enabled: boolean; maxBatch: number };
}) {
  const router = useRouter();
  const isHe = locale === "he";

  const providerStatusByName = useMemo(() => {
    const map: Partial<Record<CreativeProvider, CreativeProviderStatus>> = {};
    for (const status of providerAvailability) map[status.provider] = status;
    return map;
  }, [providerAvailability]);

  // Default the picker to the first configured provider so users land on
  // something that actually works. Fall back to "replicate" if none are.
  const defaultProvider = useMemo<CreativeProvider>(() => {
    const firstConfigured = providerAvailability.find((s) => s.configured);
    return firstConfigured?.provider ?? "replicate";
  }, [providerAvailability]);

  const [creativeType, setCreativeType] = useState<CreativeType>("PACKSHOT");
  const [aspectRatio, setAspectRatio] = useState<CreativeAspectRatio>(DEFAULT_ASPECT_RATIO.PACKSHOT);
  const [provider, setProvider] = useState<CreativeProvider>(defaultProvider);
  const [targetCount, setTargetCount] = useState<number>(1);
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  // Optional pre-fill from the store's Shopify catalog. Selecting here
  // auto-populates productName + productDescription + project name (only
  // when those fields are empty — never overwrites manual edits).
  const [pickedProducts, setPickedProducts] = useState<SelectedProduct[]>([]);
  const [tone, setTone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fileRoles, setFileRoles] = useState<CreativeSourceRole[]>([]);
  const [fileLabels, setFileLabels] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [realism, setRealism] = useState<CreativeRealismLevel>("ultra");
  // Default ON. When on, the Creative agent rewrites the prompt before
  // generation (using product/tone/brand notes). When off, falls back to
  // the deterministic template — the legacy behavior.
  const [useAgentPrompt, setUseAgentPrompt] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewAgentText, setPreviewAgentText] = useState<string | null>(null);
  const [previewAgentError, setPreviewAgentError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAgentLoading, setPreviewAgentLoading] = useState(false);

  const buildPreviewBody = (useAgent: boolean) => ({
    creativeType,
    aspectRatio,
    brief: {
      productName: productName || undefined,
      productDescription: productDescription || undefined,
      tone: tone || undefined,
      customPrompt: customPrompt || undefined,
      realism
    },
    // Full per-file role breakdown — agent needs this so it can write
    // "preserve THIS, take inspiration from THAT" instructions instead
    // of the generic "there's a reference image" hint.
    images: files.map((_, i) => ({
      role: (fileRoles[i] ?? "reference") as "product" | "reference",
      label: fileLabels[i] ?? null
    })),
    // Legacy: only labels of reference (non-product) uploads.
    referenceLabels: files
      .map((_, i) => ({ role: fileRoles[i] ?? "reference", label: fileLabels[i] ?? "" }))
      .filter((x) => x.role === "reference")
      .map((x) => x.label),
    index: 0,
    useAgent,
    hasReferenceImage: fileRoles.includes("product") || files.length > 0
  });

  const loadTemplatePreview = async () => {
    setPreviewLoading(true);
    try {
      const resp = await fetch("/api/creative/prompt-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPreviewBody(false))
      });
      const body = await resp.json().catch(() => ({}));
      setPreviewText(body?.ok && typeof body.prompt === "string" ? body.prompt : null);
    } catch {
      setPreviewText(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const togglePreview = async () => {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    await loadTemplatePreview();
  };

  const generateAgentPrompt = async () => {
    if (!previewOpen) setPreviewOpen(true);
    setPreviewAgentLoading(true);
    setPreviewAgentError(null);
    try {
      const resp = await fetch("/api/creative/prompt-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPreviewBody(true))
      });
      const body = await resp.json().catch(() => ({}));
      if (body?.ok) {
        const agent = typeof body.agentPrompt === "string" ? body.agentPrompt.trim() : "";
        const finalText = typeof body.prompt === "string" ? body.prompt : null;
        setPreviewAgentText(agent || null);
        setPreviewText(finalText);
        setPreviewAgentError(
          !agent && typeof body.agentError === "string" ? body.agentError : null
        );
      } else {
        setPreviewAgentError(
          isHe ? "הסוכן לא הצליח לכתוב פרומפט." : "Agent failed to write a prompt."
        );
      }
    } catch (err) {
      setPreviewAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewAgentLoading(false);
    }
  };

  const isVideoProject = creativeType === "UGC_VIDEO";
  const videoCapInEffect = isVideoProject ? videoSettings.maxBatch : 100;

  const handleTypeChange = (next: CreativeType) => {
    setCreativeType(next);
    setAspectRatio(DEFAULT_ASPECT_RATIO[next]);
    if (next === "UGC_VIDEO") {
      // Pull the count down if it exceeds the video cap.
      if (targetCount > videoSettings.maxBatch) setTargetCount(videoSettings.maxBatch);
      // Bounce off image-only providers automatically.
      const current = providerStatusByName[provider];
      if (current && !current.supportsVideo) {
        const fallback = providerAvailability.find((s) => s.supportsVideo);
        if (fallback) setProvider(fallback.provider);
      }
    }
  };

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    // Allow re-picking the same file later — input keeps the previous value
    // by default, which suppresses `change` events for the same selection.
    event.target.value = "";
    if (picked.length === 0) return;

    // Compute the new arrays once from the current state. Doing it inside a
    // setState updater would re-run under React Strict Mode and double-append
    // any non-pure sideffects (e.g. URL.createObjectURL) — which is what was
    // creating duplicate preview rows.
    const seen = new Set(files.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
    const fresh: File[] = [];
    for (const f of picked) {
      const key = `${f.name}|${f.size}|${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(f);
    }
    if (fresh.length === 0) return;

    const nextFiles = [...files, ...fresh];
    const nextPreviews = [...previews, ...fresh.map((f) => URL.createObjectURL(f))];
    const nextRoles: CreativeSourceRole[] = [
      ...fileRoles,
      ...fresh.map(() => "reference" as CreativeSourceRole)
    ];
    if (!nextRoles.includes("product") && nextRoles.length > 0) nextRoles[0] = "product";
    const nextLabels = [...fileLabels, ...fresh.map(() => "")];

    setFiles(nextFiles);
    setPreviews(nextPreviews);
    setFileRoles(nextRoles);
    setFileLabels(nextLabels);
  };

  const removeAt = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
    setPreviews((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed);
      return current.filter((_, i) => i !== index);
    });
    setFileRoles((current) => {
      const next = current.filter((_, i) => i !== index);
      // If we just removed the only product, promote whatever's first so the
      // server doesn't need to guess.
      if (next.length > 0 && !next.includes("product")) next[0] = "product";
      return next;
    });
    setFileLabels((current) => current.filter((_, i) => i !== index));
  };

  const setRoleAt = (index: number, role: CreativeSourceRole) => {
    setFileRoles((current) => {
      const next = current.slice();
      // Only one upload can be the "product" — flipping one to product
      // demotes any other product entries to reference.
      if (role === "product") {
        return next.map((_, i) => (i === index ? "product" : "reference"));
      }
      next[index] = "reference";
      // If we just demoted the only product, leave them all as reference —
      // the server will promote the first one on submit.
      return next;
    });
  };

  const setLabelAt = (index: number, value: string) => {
    setFileLabels((current) => {
      const next = current.slice();
      next[index] = value;
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (files.length === 0) {
      setError(isHe ? "העלו תמונה אחת לפחות." : "Please upload at least one image.");
      return;
    }
    // If the user previewed an agent prompt, that's what they expect to be
    // sent — confirm before submitting so they aren't surprised by a
    // different prompt running. The agent isn't deterministic, so re-running
    // it server-side could produce a different result than what they
    // reviewed. The pinned-prompt path (below) avoids the re-run entirely.
    if (previewAgentText && previewOpen) {
      const ok =
        typeof window !== "undefined"
          ? window.confirm(
              isHe
                ? `הפרומפט המעודכן של הסוכן יישלח כפי שהוא:\n\n${previewAgentText.slice(0, 400)}${previewAgentText.length > 400 ? "…" : ""}\n\nלהמשיך?`
                : `The agent prompt you previewed will be sent as-is:\n\n${previewAgentText.slice(0, 400)}${previewAgentText.length > 400 ? "…" : ""}\n\nContinue?`
            )
          : true;
      if (!ok) return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name || (productName ? productName : isHe ? "פרויקט חדש" : "Untitled creative"));
      formData.append("creativeType", creativeType);
      formData.append("aspectRatio", aspectRatio);
      formData.append("provider", provider);
      formData.append("targetCount", String(Math.max(1, Math.min(videoCapInEffect, targetCount))));
      if (productName) formData.append("productName", productName);
      if (productDescription) formData.append("productDescription", productDescription);
      if (tone) formData.append("tone", tone);

      // PIN the agent's previewed prompt. When the user clicked "Generate
      // prompt with agent" and reviewed the result, we send that exact text
      // as customPrompt and set useAgentPrompt=0 so the server skips its
      // own agent call. Without this, the server re-runs the agent on
      // submit and produces a (possibly) different prompt than what was
      // shown to the user — surprising and not what they signed off on.
      const pinAgentPrompt = Boolean(previewAgentText && previewAgentText.trim());
      const effectiveCustomPrompt = pinAgentPrompt
        ? previewAgentText!.trim()
        : customPrompt.trim();
      if (effectiveCustomPrompt) formData.append("customPrompt", effectiveCustomPrompt);
      formData.append("realism", realism);
      formData.append(
        "useAgentPrompt",
        pinAgentPrompt ? "0" : useAgentPrompt ? "1" : "0"
      );

      files.forEach((file, i) => {
        formData.append("files", file);
        formData.append("fileRoles", fileRoles[i] ?? "reference");
        formData.append("fileLabels", fileLabels[i] ?? "");
      });

      const response = await fetch("/api/creative/projects", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        const message = typeof payload?.error === "string"
          ? payload.error
          : isHe
            ? "יצירת הפרויקט נכשלה."
            : "Failed to create project.";
        // Still navigate if we at least got a projectId — user can review the failed asset.
        if (payload?.projectId) {
          router.push(`/creative/${payload.projectId}` as any);
          return;
        }
        throw new Error(message);
      }
      router.push(`/creative/${payload.projectId}` as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? "שגיאה לא צפויה." : "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{isHe ? "סוג הנכס" : "Choose an asset type"}</CardTitle>
          <CardDescription>
            {isHe
              ? "כל סוג מפעיל פרומפט וסגנון שונים."
              : "Each type runs a different prompt + style template."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CHOICES.map((choice) => {
              const Icon = choice.icon;
              const selected = creativeType === choice.id;
              return (
                <button
                  type="button"
                  key={choice.id}
                  onClick={() => handleTypeChange(choice.id)}
                  className={cn(
                    "flex h-full flex-col items-start gap-2 rounded-2xl border p-4 text-start transition-colors",
                    selected
                      ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200"
                      : "border-border hover:border-indigo-300 hover:bg-muted/30"
                  )}
                >
                  <Icon className={cn("h-6 w-6", selected ? "text-indigo-600" : "text-muted-foreground")} aria-hidden />
                  <p className="text-sm font-semibold">{isHe ? choice.labelHe : choice.labelEn}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {isHe ? choice.blurbHe : choice.blurbEn}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isHe ? "תמונות מקור" : "Source images"}</CardTitle>
          <CardDescription>
            {isHe
              ? "העלו תמונה אחת או יותר של המוצר. ככל שהאיכות גבוהה יותר, התוצאה תהיה טובה יותר."
              : "Upload one or more product photos. Higher source quality = better generations."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center hover:border-indigo-400 hover:bg-indigo-50/30">
            <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              {isHe ? "לחצו לבחירה או גררו לכאן" : "Click to choose or drop files here"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isHe ? "PNG, JPG, WEBP — עד 10 קבצים" : "PNG, JPG, WEBP — up to 10 files"}
            </p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={handleFilesChange}
            />
          </label>

          {previews.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[11px] leading-4 text-muted-foreground">
                {isHe
                  ? "סמנו תמונה אחת כ\"מוצר\" — היא תועבר למודל כתמונת ייחוס. השאר ישמשו כהשראה בלבד; כתבו תווית קצרה כדי שהפרומפט יידע מה כל אחת מייצגת (לדוגמה: \"דוגמן/דוגמנית\", \"תאורה\", \"רקע\")."
                  : "Mark one image as the Product — that's what's passed to the model as the visual reference. The rest are inspiration only; add a short label so the prompt knows what they represent (e.g. \"model\", \"lighting\", \"background\")."}
              </p>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {previews.map((src, idx) => {
                  const role = fileRoles[idx] ?? "reference";
                  const isProduct = role === "product";
                  return (
                    <li
                      key={src}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-3",
                        isProduct ? "border-indigo-500 bg-indigo-50/40" : "border-border"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`source ${idx + 1}`}
                        className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-border"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRoleAt(idx, "product")}
                            className={cn(
                              "h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
                              isProduct
                                ? "border-indigo-500 bg-indigo-600 text-white"
                                : "border-border bg-background text-muted-foreground hover:border-indigo-300"
                            )}
                          >
                            {isHe ? "מוצר" : "Product"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRoleAt(idx, "reference")}
                            className={cn(
                              "h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
                              !isProduct
                                ? "border-slate-400 bg-slate-100 text-slate-800"
                                : "border-border bg-background text-muted-foreground hover:border-slate-300"
                            )}
                          >
                            {isHe ? "השראה" : "Reference"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAt(idx)}
                            className={cn(
                              "ms-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                            )}
                            title={isHe ? "הסרה" : "Remove"}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <input
                          type="text"
                          disabled={isProduct}
                          value={isProduct ? "" : fileLabels[idx] ?? ""}
                          onChange={(event) => setLabelAt(idx, event.target.value)}
                          placeholder={
                            isProduct
                              ? isHe
                                ? "תמונת המוצר עצמו"
                                : "The product itself"
                              : isHe
                                ? "למה זה משמש? לדוגמה: דוגמנית, רקע, תאורה"
                                : "What is this for? e.g. model, background, lighting"
                          }
                          className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isHe ? "תקציר" : "Creative brief"}</CardTitle>
          <CardDescription>
            {isHe
              ? "כל השדות אופציונליים. מה שתכתבו ישולב בפרומפט."
              : "All fields optional — what you write here is folded into the AI prompt."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product picker — selecting a real product from the connected
              store auto-fills name + description. The operator can still
              edit the fields afterwards. Image upload below is unaffected;
              if the picker provides an image we'll wire it as a reference
              once Phase B (custom uploads) lands. */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isHe ? "בחרו מוצר מהחנות (מילוי אוטומטי)" : "Pick a product from your store (auto-fill)"}
            </p>
            <ProductPicker
              locale={locale}
              selected={pickedProducts}
              onChange={(next) => {
                setPickedProducts(next);
                const p = next[0];
                if (p) {
                  if (!productName) setProductName(p.title);
                  if (!productDescription && p.description) setProductDescription(p.description);
                  if (!name) setName(p.title);
                }
              }}
              mode="single"
              limit={24}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={isHe ? "שם הפרויקט" : "Project name"}
              value={name}
              onChange={setName}
              placeholder={isHe ? "סדרת קמפיין סתיו" : "Autumn campaign batch"}
            />
            <Field
              label={isHe ? "שם המוצר" : "Product name"}
              value={productName}
              onChange={setProductName}
              placeholder={isHe ? "נר ניחוח כוכב הצפון" : "Northern Star scented candle"}
            />
          </div>
          <Field
            label={isHe ? "תיאור המוצר" : "Product description"}
            value={productDescription}
            onChange={setProductDescription}
            placeholder={
              isHe
                ? "חומרים, גודל וכל מה שכדאי שיופיע בקומפוזיציה"
                : "Materials, size, anything that should show up in the composition"
            }
            textarea
          />
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isHe ? "פרומפט מותאם (אופציונלי)" : "Custom prompt (optional)"}
            </label>
            <textarea
              className="min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              placeholder={
                isHe
                  ? "כתבו בעברית או באנגלית — הטקסט יתווסף בסוף הפרומפט שנשלח למודל. אפשר להשאיר ריק."
                  : "Write anything you want appended to the AI prompt — overrides template defaults when they conflict. Leave empty to use the template alone."
              }
            />
            <p className="text-[11px] leading-4 text-muted-foreground">
              {isHe
                ? "טיפ: ציינו את תפקיד תמונות ההשראה (למשל \"שמרו על תנוחת הדוגמנית מהתמונה השנייה\")."
                : "Tip: reference your inspiration images by their label (e.g. \"keep the model pose from the second reference\")."}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isHe ? "ריאליזם" : "Realism"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: "ultra",
                    labelEn: "Ultra — photorealistic",
                    labelHe: "מקסימלי — מציאותי",
                    descEn: "Pushes real skin texture, natural lighting, anti-AI-artifact guards. Best for product + model shots.",
                    descHe: "טקסטורת עור אמיתית, תאורה טבעית, מניעת ארטיפקטים של AI. מומלץ לתמונות מוצר+דוגמנית."
                  },
                  {
                    value: "balanced",
                    labelEn: "Balanced",
                    labelHe: "מאוזן",
                    descEn: "Lets the style template lead. Best when you want a stylised editorial look.",
                    descHe: "התבנית הסגנונית מובילה. מתאים לסגנון אדיטוריאלי מעוצב."
                  }
                ] as const
              ).map((opt) => {
                const selected = realism === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRealism(opt.value as CreativeRealismLevel)}
                    className={cn(
                      "rounded-2xl border p-3 text-start transition-colors",
                      selected
                        ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-200"
                        : "border-border hover:border-indigo-300"
                    )}
                  >
                    <p className="text-xs font-semibold">{isHe ? opt.labelHe : opt.labelEn}</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {isHe ? opt.descHe : opt.descEn}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Creative agent toggle — defaults ON. When on, the Creative
              agent rewrites the prompt before generation based on the
              product/tone/brand-notes fields, then the template wraps it
              with the stable style notes. */}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 text-sm hover:border-indigo-300">
            <input
              type="checkbox"
              checked={useAgentPrompt}
              onChange={(e) => setUseAgentPrompt(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <div>
              <p className="font-semibold">
                {isHe ? "תנו לסוכן הקריאייטיב לכתוב את הפרומפט" : "Let the Creative agent write the prompt"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {isHe
                  ? "ברירת מחדל: פעיל. הסוכן יקבל את שדות הטופס (מוצר, תיאור, טון, הערות) ויחבר פרומפט מותאם לHiggsfield. כבו כדי להשתמש בתבנית ברירת המחדל בלבד."
                  : "Default: on. The agent receives the form fields (product, description, tone, notes) and writes a Higgsfield-optimised prompt. Turn off to use only the deterministic template."}
              </p>
            </div>
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={togglePreview}
                className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              >
                <span>{previewOpen ? "▾" : "▸"}</span>
                {isHe
                  ? previewOpen
                    ? "הסתרת הפרומפט הסופי"
                    : "הצגת הפרומפט הסופי לפני היצירה"
                  : previewOpen
                    ? "Hide final prompt"
                    : "Preview the final prompt that will be sent to the AI"}
              </button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={generateAgentPrompt}
                disabled={previewAgentLoading}
                className="h-7 gap-1.5 px-2.5 text-[11px]"
              >
                {previewAgentLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    {isHe ? "כותב…" : "Writing…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" aria-hidden />
                    {isHe ? "צרו פרומפט עם הסוכן" : "Generate prompt with agent"}
                  </>
                )}
              </Button>
              {previewOpen && previewText && !previewLoading ? (
                <button
                  type="button"
                  onClick={loadTemplatePreview}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  title={isHe ? "טעינה מחדש של הטקסט מהטופס" : "Reload from current form fields"}
                >
                  {isHe ? "רענון" : "Refresh"}
                </button>
              ) : null}
            </div>
            {previewOpen ? (
              <div className="space-y-3">
                {previewAgentText || previewAgentError || previewAgentLoading ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {isHe ? "הסוכן כתב:" : "Agent wrote:"}
                      </p>
                      {previewAgentText && !previewAgentLoading ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                          {isHe ? "ננעל לשליחה" : "Pinned for submit"}
                        </span>
                      ) : null}
                    </div>
                    {previewAgentLoading ? (
                      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        {isHe
                          ? "הסוכן עובד… זה עשוי להימשך 5-30 שניות."
                          : "Agent thinking… 5–30 seconds."}
                      </p>
                    ) : previewAgentText ? (
                      <>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-slate-900">
                          {previewAgentText}
                        </pre>
                        <p className="mt-2 text-[10px] leading-4 text-emerald-800">
                          {isHe
                            ? "כשתלחצו ״צרו עכשיו״ הטקסט הזה יישלח בדיוק כפי שהוא — הסוכן לא ירוץ שוב בצד השרת. לחצו ״צרו פרומפט עם הסוכן״ שוב לקבלת ניסוח חדש."
                            : "When you click \"Generate now\", this exact text will be sent — the server will not re-run the agent. Click \"Generate prompt with agent\" again to get a new draft."}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-rose-700">
                        {previewAgentError ??
                          (isHe ? "הסוכן לא החזיר טקסט." : "Agent returned no text.")}
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                    {isHe
                      ? previewAgentText
                        ? "הטקסט המלא שיישלח למודל (כולל פלט הסוכן):"
                        : "הטקסט המלא שיישלח למודל (תבנית בלבד):"
                      : previewAgentText
                        ? "Full text sent to the model (template + agent output):"
                        : "Full text sent to the model (template only):"}
                  </p>
                  {previewLoading ? (
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      {isHe ? "טוען תצוגה מקדימה…" : "Building prompt…"}
                    </p>
                  ) : previewText ? (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-900">
                      {previewText}
                    </pre>
                  ) : (
                    <p className="text-[11px] text-rose-700">
                      {isHe
                        ? "טעינת התצוגה המקדימה נכשלה. נסו שוב."
                        : "Couldn't build a preview. Try again."}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                    {isHe
                      ? "אחרי שינוי בשדות למעלה, לחצו \"רענון\" או \"צרו פרומפט עם הסוכן\" כדי לראות את הטקסט המעודכן."
                      : "Edit fields above and click \"Refresh\" or \"Generate prompt with agent\" to see the updated text."}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={isHe ? "טון / סגנון" : "Tone / style"}
              value={tone}
              onChange={setTone}
              placeholder={isHe ? "מינימליסטי ופרימיום" : "Minimal, premium"}
            />
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {isHe ? "יחס תמונה" : "Aspect ratio"}
              </label>
              <select
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value as CreativeAspectRatio)}
              >
                {CREATIVE_ASPECT_RATIOS.map((ar) => (
                  <option key={ar} value={ar}>
                    {ar}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isHe ? "ספק AI" : "AI provider"}
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {providerAvailability.map((status) => {
                const info = PROVIDER_INFO[status.provider];
                const isSelected = provider === status.provider;
                // Disable providers that don't support video on UGC_VIDEO.
                const supportsThisType = isVideoProject ? status.supportsVideo : status.supportsImage;
                const disabled = !supportsThisType;
                return (
                  <button
                    type="button"
                    key={status.provider}
                    disabled={disabled}
                    onClick={() => !disabled && setProvider(status.provider)}
                    className={cn(
                      "flex h-full flex-col gap-2 rounded-2xl border p-3 text-start transition-colors",
                      isSelected && !disabled
                        ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200"
                        : "border-border hover:border-indigo-300 hover:bg-muted/30",
                      !status.configured && "opacity-90",
                      disabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{isHe ? info.labelHe : info.labelEn}</p>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          status.configured
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {status.configured ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                        ) : (
                          <AlertCircle className="h-3 w-3" aria-hidden />
                        )}
                        {status.configured
                          ? isHe
                            ? "מוגדר"
                            : "Configured"
                          : isHe
                            ? "לא מוגדר"
                            : "Not configured"}
                      </span>
                    </div>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      {isHe ? info.blurbHe : info.blurbEn}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {status.supportsImage ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {isHe ? "תמונות" : "Images"}
                        </span>
                      ) : null}
                      {status.supportsVideo ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {isHe ? "וידאו" : "Video"}
                        </span>
                      ) : null}
                      {!status.configured ? (
                        <span className="ms-auto font-mono">{status.envVar}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {!(providerStatusByName[provider]?.configured ?? false) ? (
              <p className="text-[11px] leading-4 text-amber-700">
                {isHe
                  ? `הספק שבחרתם אינו מוגדר. הוסיפו את משתנה הסביבה ${providerStatusByName[provider]?.envVar ?? ""} ל.env והפעילו מחדש את השרת.`
                  : `The selected provider isn't configured. Set ${providerStatusByName[provider]?.envVar ?? ""} in .env and restart the server.`}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isHe ? "כמה גרסאות לייצר?" : "How many to generate?"}
                </label>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {targetCount === 1
                    ? isHe
                      ? "תוצאה אחת באיכות גבוהה. רצה באופן סינכרוני."
                      : "One high-quality result. Runs synchronously."
                    : isHe
                      ? `${targetCount} גרסאות שירוצו ברקע. ההתקדמות תוצג בעמוד הפרויקט.`
                      : `${targetCount} versions, queued and run in the background with live progress.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {[1, 5, 10, 20, 50]
                  .filter((preset) => preset <= videoCapInEffect)
                  .map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTargetCount(preset)}
                      className={cn(
                        "h-9 rounded-xl border px-3 text-sm font-semibold transition-colors",
                        targetCount === preset
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-border bg-background hover:border-indigo-300"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                <input
                  type="number"
                  min={1}
                  max={videoCapInEffect}
                  className="h-9 w-20 rounded-xl border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={targetCount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next))
                      setTargetCount(Math.max(1, Math.min(videoCapInEffect, Math.floor(next))));
                  }}
                />
              </div>
            </div>
            {isVideoProject ? (
              <p className="text-[11px] leading-4 text-muted-foreground">
                {isHe
                  ? `מגבלת אצוות וידאו: ${videoSettings.maxBatch} סרטונים. ניתן לשנות באמצעות CREATIVE_MAX_VIDEO_BATCH.`
                  : `Video batches are capped at ${videoSettings.maxBatch} clips (override via CREATIVE_MAX_VIDEO_BATCH).`}
              </p>
            ) : null}
          </div>

          {isVideoProject ? (
            videoSettings.enabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
                <p className="font-semibold">
                  {isHe
                    ? `הערכת עלות: כ$${(targetCount * 0.4).toFixed(2)} ל${targetCount} סרטונים`
                    : `Cost estimate: ≈ $${(targetCount * 0.4).toFixed(2)} for ${targetCount} clip${targetCount === 1 ? "" : "s"}`}
                </p>
                <p className="text-[12px] leading-5">
                  {isHe
                    ? "ייצור וידאו איטי ויקר ביחס לתמונות. ייצור כל סרטון נמשך כ60 שניות אצל הספק."
                    : "Video generation is slow and expensive vs images. Each clip takes ~60 seconds at the provider."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900">
                <p className="font-semibold">
                  {isHe ? "ייצור וידאו מושבת" : "Video generation is disabled"}
                </p>
                <p className="text-[12px] leading-5">
                  {isHe
                    ? "הגדירו CREATIVE_VIDEO_ENABLED=1 ב.env והפעילו מחדש את השרת כדי לייצר UGC."
                    : "Set CREATIVE_VIDEO_ENABLED=1 in .env and restart the server to enable UGC video."}
                </p>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {targetCount === 1
            ? isHe
              ? "כמות 1 רצה סינכרונית; כל ערך גבוה יותר נכנס לתור ורץ ברקע."
              : "Count 1 runs synchronously; anything higher is queued and runs in the background."
            : isHe
              ? "האצווה תתחיל ברגע שתלחצו ותתקדם ברקע (ניתן לעקוב אחר ההתקדמות בעמוד הפרויקט)."
              : "The batch starts immediately and progresses in the background (you'll watch it on the project page)."}
        </p>
        <Button type="submit" disabled={submitting || files.length === 0}>
          {submitting ? (
            <>
              <Loader2 className={cn("h-4 w-4 animate-spin", isHe ? "ms-2" : "me-2")} />
              {isHe ? "מתחיל…" : "Starting…"}
            </>
          ) : (
            <>
              <Sparkles className={cn("h-4 w-4", isHe ? "ms-2" : "me-2")} />
              {targetCount === 1
                ? isHe
                  ? "צרו עכשיו"
                  : "Generate now"
                : isHe
                  ? `שלחו ${targetCount} לתור`
                  : `Queue ${targetCount} generations`}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea
          className="min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
