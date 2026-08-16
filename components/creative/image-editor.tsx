"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Type as TypeIcon,
  Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import {
  isImageOverlay,
  isTextOverlay,
  type CanvasOverlay,
  type ImageOverlay,
  type TextOverlay
} from "@/lib/domain/creative-types";

// Konva touches `window` so the entire react-konva tree must be loaded with
// SSR off. React 19 + next/dynamic chokes when each Konva primitive is loaded
// via its own dynamic() call ("Cannot use 'in' operator to search for 'default'
// in Layer"), so we import a single client-only canvas component instead.
const EditorCanvas = dynamic(() => import("./image-editor-canvas"), { ssr: false });

const CANVAS_MAX_WIDTH = 720;
// Capped at ~512 KB raw — anything larger should go through proper upload
// storage rather than living inside overlaysJson as a base64 blob.
const MAX_IMAGE_OVERLAY_BYTES = 512 * 1024;

const FONT_PRESETS = [
  "Inter, system-ui, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Georgia, serif",
  "Times New Roman, serif",
  "Courier New, monospace",
  "Verdana, Geneva, sans-serif",
  "Tahoma, Geneva, sans-serif",
  "Trebuchet MS, sans-serif",
  "Palatino, serif",
  "Garamond, serif",
  "Lucida Console, monospace",
  "Impact, Charcoal, sans-serif",
  "Brush Script MT, cursive",
  "Comic Sans MS, cursive"
];

// 24-swatch curated palette — neutrals, brand-ish jewel tones, candy accents.
// The native color picker stays for full-spectrum custom values.
const COLOR_PALETTE = [
  "#ffffff", "#f1f5f9", "#cbd5e1", "#64748b", "#334155", "#0f172a",
  "#000000", "#fef3c7", "#fde68a", "#f59e0b", "#d97706", "#92400e",
  "#fee2e2", "#fca5a5", "#ef4444", "#dc2626", "#7f1d1d", "#fce7f3",
  "#f472b6", "#db2777", "#86efac", "#10b981", "#0e7490", "#6366f1"
];

function makeOverlayId(): string {
  return `ov_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultTextOverlay(centerX: number, centerY: number): TextOverlay {
  return {
    type: "text",
    id: makeOverlayId(),
    text: "Headline",
    xPct: Math.max(0.05, centerX - 0.3),
    yPct: Math.max(0.05, centerY - 0.05),
    widthPct: 0.6,
    fontFamily: "Inter, system-ui, sans-serif",
    fontSizePx: 64,
    fontWeight: 700,
    color: "#ffffff",
    align: "center",
    backgroundEnabled: false,
    backgroundColor: "#000000",
    backgroundOpacity: 0.6
  };
}

function defaultImageOverlay(dataUrl: string): ImageOverlay {
  return {
    type: "image",
    id: makeOverlayId(),
    xPct: 0.6,
    yPct: 0.05,
    widthPct: 0.25,
    dataUrl,
    opacity: 1
  };
}

export function ImageEditor({
  projectId,
  assetId,
  imageUrl,
  initialOverlays,
  locale
}: {
  projectId: string;
  assetId: string;
  imageUrl: string;
  initialOverlays: CanvasOverlay[];
  locale: AppLocale;
}) {
  const router = useRouter();
  const isHe = locale === "he";

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [overlays, setOverlays] = useState<CanvasOverlay[]>(initialOverlays);
  const [selectedId, setSelectedId] = useState<string | null>(initialOverlays[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.onerror = () => setError(isHe ? "טעינת התמונה נכשלה." : "Failed to load image.");
    img.src = imageUrl;
  }, [imageUrl, isHe]);

  const stageSize = useMemo(() => {
    if (!image) return { width: CANVAS_MAX_WIDTH, height: CANVAS_MAX_WIDTH };
    const aspect = image.naturalHeight / image.naturalWidth;
    const width = CANVAS_MAX_WIDTH;
    const height = Math.round(CANVAS_MAX_WIDTH * aspect);
    return { width, height };
  }, [image]);

  const selectedOverlay = overlays.find((o) => o.id === selectedId) ?? null;
  const selectedText = selectedOverlay && isTextOverlay(selectedOverlay) ? selectedOverlay : null;
  const selectedImage = selectedOverlay && isImageOverlay(selectedOverlay) ? selectedOverlay : null;

  const updateSelected = useCallback(
    (patch: Partial<CanvasOverlay>) => {
      setOverlays((current) =>
        current.map((o) => (o.id === selectedId ? ({ ...o, ...patch } as CanvasOverlay) : o))
      );
    },
    [selectedId]
  );

  const addTextOverlay = useCallback(() => {
    const next = defaultTextOverlay(0.5, 0.5);
    setOverlays((current) => [...current, next]);
    setSelectedId(next.id);
  }, []);

  const onPickImageFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (file.size > MAX_IMAGE_OVERLAY_BYTES) {
        setError(
          isHe
            ? `הקובץ גדול מ${Math.round(MAX_IMAGE_OVERLAY_BYTES / 1024)}KB. השתמשו בלוגו קטן יותר.`
            : `File is bigger than ${Math.round(MAX_IMAGE_OVERLAY_BYTES / 1024)}KB — please pick a smaller logo or badge.`
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl.startsWith("data:image/")) return;
        const next = defaultImageOverlay(dataUrl);
        setOverlays((current) => [...current, next]);
        setSelectedId(next.id);
      };
      reader.readAsDataURL(file);
    },
    [isHe]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setOverlays((current) => current.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/creative/projects/${projectId}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overlays })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || (isHe ? "השמירה נכשלה." : "Save failed."));
      }
      router.push(`/creative/${projectId}` as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : isHe ? "שגיאה לא צפויה." : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  }, [overlays, projectId, assetId, router, isHe]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/creative/${projectId}` as any}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className={cn("h-4 w-4", isHe ? "rotate-180" : "")} aria-hidden />
          {isHe ? "חזרה לפרויקט" : "Back to project"}
        </Link>
        <Button onClick={save} disabled={saving || !image}>
          {saving ? (
            <>
              <Loader2 className={cn("h-4 w-4 animate-spin", isHe ? "ml-2" : "mr-2")} />
              {isHe ? "שומר…" : "Saving…"}
            </>
          ) : (
            <>
              <Save className={cn("h-4 w-4", isHe ? "ml-2" : "mr-2")} />
              {isHe ? "שמירה" : "Save"}
            </>
          )}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{isHe ? "תצוגה מקדימה" : "Canvas"}</CardTitle>
            <CardDescription>
              {isHe
                ? "גררו כדי להזיז, לחצו על שכבה כדי לבחור."
                : "Drag to move. Click an overlay to select it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {!image ? (
              <div className="flex h-[480px] w-full max-w-[720px] items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl ring-1 ring-border" style={{ width: stageSize.width }}>
                <EditorCanvas
                  image={image}
                  overlays={overlays}
                  selectedId={selectedId}
                  stageSize={stageSize}
                  onSelect={setSelectedId}
                  onChange={(id, patch) =>
                    setOverlays((current) =>
                      current.map((o) => (o.id === id ? ({ ...o, ...patch } as CanvasOverlay) : o))
                    )
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{isHe ? "שכבות" : "Overlays"}</CardTitle>
            <CardDescription>
              {isHe
                ? "טקסט ותמונות יוטמעו על גבי התמונה בעת השמירה."
                : "Text and images are burned into the saved file."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={addTextOverlay}>
                <TypeIcon className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                {isHe ? "טקסט" : "Text"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                {isHe ? "תמונה" : "Image"}
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={onPickImageFile}
              />
              {selectedOverlay ? (
                <Button variant="ghost" size="sm" onClick={deleteSelected}>
                  <Trash2 className={cn("h-3.5 w-3.5", isHe ? "ml-1.5" : "mr-1.5")} />
                  {isHe ? "מחיקה" : "Delete"}
                </Button>
              ) : null}
            </div>

            <ul className="space-y-1.5">
              {overlays.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  {isHe ? "אין עדיין שכבות." : "No overlays yet."}
                </li>
              ) : (
                overlays.map((overlay) => (
                  <li key={overlay.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(overlay.id)}
                      className={cn(
                        "flex w-full items-center gap-2 truncate rounded-xl border px-3 py-2 text-start text-xs",
                        selectedId === overlay.id
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-border hover:border-indigo-300"
                      )}
                    >
                      {isImageOverlay(overlay) ? (
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="truncate">
                        {isImageOverlay(overlay)
                          ? isHe
                            ? "שכבת תמונה"
                            : "Image overlay"
                          : overlay.text || (isHe ? "(ריק)" : "(empty)")}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {selectedText ? (
              <TextOverlayControls overlay={selectedText} update={updateSelected} isHe={isHe} />
            ) : null}
            {selectedImage ? (
              <ImageOverlayControls overlay={selectedImage} update={updateSelected} isHe={isHe} />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TextOverlayControls({
  overlay,
  update,
  isHe
}: {
  overlay: TextOverlay;
  update: (patch: Partial<TextOverlay>) => void;
  isHe: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <FieldLabel>{isHe ? "טקסט" : "Text"}</FieldLabel>
      <textarea
        className="min-h-[64px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={overlay.text}
        onChange={(event) => update({ text: event.target.value })}
      />

      <div>
        <FieldLabel>
          <span className="inline-flex items-center gap-1.5">
            <LinkIcon className="h-3 w-3" aria-hidden />
            {isHe ? "קישור (אופציונלי)" : "Link URL (optional)"}
          </span>
        </FieldLabel>
        <input
          type="url"
          className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={overlay.linkUrl ?? ""}
          placeholder="https://example.com/product"
          onChange={(event) => update({ linkUrl: event.target.value || undefined })}
        />
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {isHe
            ? "טקסט מקושר יוצג עם קו תחתון. הכתובת תישמר ותשמש בעת הפרסום."
            : "Text is underlined when a link is set. The URL is stored and used by the publish flow."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>{isHe ? "גודל" : "Size"}</FieldLabel>
          <input
            type="range"
            min={16}
            max={160}
            step={2}
            value={overlay.fontSizePx}
            onChange={(event) => update({ fontSizePx: Number(event.target.value) })}
            className="w-full"
          />
          <p className="text-[11px] text-muted-foreground">{overlay.fontSizePx}px</p>
        </div>
        <div>
          <FieldLabel>{isHe ? "רוחב (%)" : "Width (%)"}</FieldLabel>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={Math.round(overlay.widthPct * 100)}
            onChange={(event) => update({ widthPct: Number(event.target.value) / 100 })}
            className="w-full"
          />
          <p className="text-[11px] text-muted-foreground">{Math.round(overlay.widthPct * 100)}%</p>
        </div>
      </div>

      <div>
        <FieldLabel>{isHe ? "יישור" : "Align"}</FieldLabel>
        <div className="flex gap-1.5">
          {([
            { value: "left", Icon: AlignLeft },
            { value: "center", Icon: AlignCenter },
            { value: "right", Icon: AlignRight }
          ] as const).map(({ value, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => update({ align: value })}
              className={cn(
                "flex h-8 flex-1 items-center justify-center rounded-lg border",
                overlay.align === value
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-border hover:border-indigo-300"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <ColorRow
        labelEn="Text color"
        labelHe="צבע טקסט"
        isHe={isHe}
        value={overlay.color}
        onChange={(c) => update({ color: c })}
      />

      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={Boolean(overlay.backgroundEnabled)}
            onChange={(event) => update({ backgroundEnabled: event.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          {isHe ? "רקע מאחורי הטקסט" : "Background behind text"}
        </label>
        {overlay.backgroundEnabled ? (
          <>
            <ColorRow
              labelEn="Background color"
              labelHe="צבע רקע"
              isHe={isHe}
              value={overlay.backgroundColor ?? "#000000"}
              onChange={(c) => update({ backgroundColor: c })}
            />
            <div>
              <FieldLabel>{isHe ? "שקיפות" : "Opacity"}</FieldLabel>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((overlay.backgroundOpacity ?? 0.6) * 100)}
                onChange={(event) =>
                  update({ backgroundOpacity: Number(event.target.value) / 100 })
                }
                className="w-full"
              />
              <p className="text-[11px] text-muted-foreground">
                {Math.round((overlay.backgroundOpacity ?? 0.6) * 100)}%
              </p>
            </div>
          </>
        ) : null}
      </div>

      <div>
        <FieldLabel>{isHe ? "גופן" : "Font"}</FieldLabel>
        <select
          className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
          value={overlay.fontFamily}
          onChange={(event) => update({ fontFamily: event.target.value })}
          style={{ fontFamily: overlay.fontFamily }}
        >
          {FONT_PRESETS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f.split(",")[0]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ImageOverlayControls({
  overlay,
  update,
  isHe
}: {
  overlay: ImageOverlay;
  update: (patch: Partial<ImageOverlay>) => void;
  isHe: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="overflow-hidden rounded-xl ring-1 ring-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={overlay.dataUrl} alt="overlay preview" className="block w-full" />
      </div>
      <div>
        <FieldLabel>{isHe ? "רוחב (%)" : "Width (%)"}</FieldLabel>
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(overlay.widthPct * 100)}
          onChange={(event) => update({ widthPct: Number(event.target.value) / 100 })}
          className="w-full"
        />
        <p className="text-[11px] text-muted-foreground">{Math.round(overlay.widthPct * 100)}%</p>
      </div>
      <div>
        <FieldLabel>{isHe ? "שקיפות" : "Opacity"}</FieldLabel>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round((overlay.opacity ?? 1) * 100)}
          onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
          className="w-full"
        />
        <p className="text-[11px] text-muted-foreground">
          {Math.round((overlay.opacity ?? 1) * 100)}%
        </p>
      </div>
    </div>
  );
}

function ColorRow({
  labelEn,
  labelHe,
  isHe,
  value,
  onChange
}: {
  labelEn: string;
  labelHe: string;
  isHe: boolean;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{isHe ? labelHe : labelEn}</FieldLabel>
      <div className="grid grid-cols-12 gap-1.5">
        {COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              "aspect-square w-full rounded-md ring-1 ring-border",
              value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-indigo-500 ring-offset-1" : ""
            )}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-24 rounded-lg border border-border bg-background px-2 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}
