"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Scissors,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n";
import type { TextOverlay } from "@/lib/domain/creative-types";

// Konva loaded SSR-off (touches `window`). Same pattern as the image editor.
const Stage = dynamic(() => import("react-konva").then((m) => m.Stage), { ssr: false });
const Layer = dynamic(() => import("react-konva").then((m) => m.Layer), { ssr: false });
const KonvaImage = dynamic(() => import("react-konva").then((m) => m.Image), { ssr: false });
const KonvaText = dynamic(() => import("react-konva").then((m) => m.Text), { ssr: false });
const KonvaRect = dynamic(() => import("react-konva").then((m) => m.Rect), { ssr: false });

const CANVAS_MAX_WIDTH = 720;
const FONT_PRESETS = [
  "Inter, system-ui, sans-serif",
  "Georgia, serif",
  "Helvetica, Arial, sans-serif",
  "Times New Roman, serif",
  "Courier New, monospace"
];
const COLOR_PRESETS = ["#ffffff", "#0f172a", "#dc2626", "#f59e0b", "#10b981", "#6366f1"];

function makeOverlayId(): string {
  return `ov_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultOverlay(): TextOverlay {
  return {
    id: makeOverlayId(),
    text: "Headline",
    xPct: 0.15,
    yPct: 0.78,
    widthPct: 0.7,
    fontFamily: "Inter, system-ui, sans-serif",
    fontSizePx: 56,
    fontWeight: 700,
    color: "#ffffff",
    align: "center"
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function VideoEditor({
  projectId,
  assetId,
  videoUrl,
  posterUrl,
  initialOverlays,
  initialDurationMs,
  locale
}: {
  projectId: string;
  assetId: string;
  videoUrl: string;
  posterUrl: string | null;
  initialOverlays: TextOverlay[];
  initialDurationMs: number | null;
  locale: AppLocale;
}) {
  const router = useRouter();
  const isHe = locale === "he";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number>(
    initialDurationMs ? initialDurationMs / 1000 : 0
  );
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState<number>(initialDurationMs ? initialDurationMs / 1000 : 0);
  const [intrinsic, setIntrinsic] = useState<{ width: number; height: number } | null>(null);

  // Poster (the source frame) is what the Konva canvas paints behind the
  // overlays so the user can position text against the actual look of the
  // clip. If no poster yet, fall back to a blank dark frame.
  const [posterImage, setPosterImage] = useState<HTMLImageElement | null>(null);
  const [overlays, setOverlays] = useState<TextOverlay[]>(initialOverlays);
  const [selectedId, setSelectedId] = useState<string | null>(initialOverlays[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!posterUrl) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPosterImage(img);
    img.src = posterUrl;
  }, [posterUrl]);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setIntrinsic({ width: v.videoWidth, height: v.videoHeight });
    // Initial trim = full clip the first time the video loads.
    if (trimEnd === 0 || trimEnd > v.duration) setTrimEnd(v.duration);
  }, [trimEnd]);

  const stageSize = useMemo(() => {
    const w = intrinsic?.width ?? posterImage?.naturalWidth ?? CANVAS_MAX_WIDTH;
    const h = intrinsic?.height ?? posterImage?.naturalHeight ?? CANVAS_MAX_WIDTH;
    const aspect = h / Math.max(1, w);
    const width = CANVAS_MAX_WIDTH;
    return { width, height: Math.round(width * aspect) };
  }, [intrinsic, posterImage]);

  const selectedOverlay = overlays.find((o) => o.id === selectedId) ?? null;

  const updateSelected = useCallback(
    (patch: Partial<TextOverlay>) => {
      setOverlays((current) =>
        current.map((o) => (o.id === selectedId ? { ...o, ...patch } : o))
      );
    },
    [selectedId]
  );

  const addOverlay = useCallback(() => {
    const next = defaultOverlay();
    setOverlays((current) => [...current, next]);
    setSelectedId(next.id);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setOverlays((current) => current.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const seekTo = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, seconds);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/creative/projects/${projectId}/assets/${assetId}/video-edit`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trim: { startSec: trimStart, endSec: trimEnd },
            overlays,
            width: intrinsic?.width,
            height: intrinsic?.height
          })
        }
      );
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
  }, [projectId, assetId, trimStart, trimEnd, overlays, intrinsic, router, isHe]);

  const trimDuration = Math.max(0, trimEnd - trimStart);

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
        <Button onClick={save} disabled={saving || duration === 0}>
          {saving ? (
            <>
              <Loader2 className={cn("h-4 w-4 animate-spin", isHe ? "ms-2" : "me-2")} />
              {isHe ? "מעבד…" : "Rendering…"}
            </>
          ) : (
            <>
              <Save className={cn("h-4 w-4", isHe ? "ms-2" : "me-2")} />
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
            <CardTitle>{isHe ? "תצוגה מקדימה" : "Preview"}</CardTitle>
            <CardDescription>
              {isHe
                ? "הנגן מציג את הקובץ המקורי. הטקסט והחיתוך מוצגים מעל הפריים — והם יוטמעו בפלט הסופי."
                : "Player shows the source clip. Trim and text overlay render above; they're burned into the output."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <video
                ref={videoRef}
                src={videoUrl}
                poster={posterUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={onLoadedMetadata}
                className="aspect-video w-full max-w-[720px] bg-black"
              />
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <Scissors className="h-4 w-4 text-indigo-600" aria-hidden />
                  {isHe ? "חיתוך" : "Trim"}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {formatTime(trimStart)} → {formatTime(trimEnd)}{" "}
                  <span className="mx-1">·</span>
                  {trimDuration.toFixed(1)}s
                </div>
              </div>

              <TrimSlider
                duration={duration}
                start={trimStart}
                end={trimEnd}
                onChangeStart={(v) => {
                  setTrimStart(v);
                  seekTo(v);
                }}
                onChangeEnd={(v) => {
                  setTrimEnd(v);
                  seekTo(v);
                }}
              />

              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) setTrimStart(Math.min(trimEnd - 0.1, v.currentTime));
                  }}
                >
                  {isHe ? "קבעו התחלה כאן" : "Set start here"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) setTrimEnd(Math.max(trimStart + 0.1, v.currentTime));
                  }}
                >
                  {isHe ? "קבעו סוף כאן" : "Set end here"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.currentTime = trimStart;
                    void v.play();
                  }}
                >
                  <Play className="h-3 w-3 me-1" /> {isHe ? "צפייה בחיתוך" : "Preview trim"}
                </Button>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="overflow-hidden rounded-2xl ring-1 ring-border" style={{ width: stageSize.width }}>
                <Stage
                  width={stageSize.width}
                  height={stageSize.height}
                  onMouseDown={(event: any) => {
                    if (event.target === event.target.getStage()) setSelectedId(null);
                  }}
                >
                  <Layer>
                    {posterImage ? (
                      <KonvaImage image={posterImage} width={stageSize.width} height={stageSize.height} />
                    ) : (
                      <KonvaRect x={0} y={0} width={stageSize.width} height={stageSize.height} fill="#1e293b" />
                    )}
                    {overlays.map((overlay) => (
                      <OverlayShape
                        key={overlay.id}
                        overlay={overlay}
                        stageSize={stageSize}
                        isSelected={overlay.id === selectedId}
                        onSelect={() => setSelectedId(overlay.id)}
                        onChange={(patch) =>
                          setOverlays((current) =>
                            current.map((o) => (o.id === overlay.id ? { ...o, ...patch } : o))
                          )
                        }
                      />
                    ))}
                  </Layer>
                </Stage>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{isHe ? "טקסט" : "Text overlay"}</CardTitle>
            <CardDescription>
              {isHe
                ? "הוסיפו שכבת טקסט. היא תוטמע בכל פריים בסרטון."
                : "Add a text layer. It's burned onto every frame of the output clip."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={addOverlay}>
                <Plus className={cn("h-3.5 w-3.5", isHe ? "ms-1.5" : "me-1.5")} />
                {isHe ? "הוספת שכבה" : "Add text"}
              </Button>
              {selectedOverlay ? (
                <Button variant="ghost" size="sm" onClick={deleteSelected}>
                  <Trash2 className={cn("h-3.5 w-3.5", isHe ? "ms-1.5" : "me-1.5")} />
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
                        "w-full truncate rounded-xl border px-3 py-2 text-start text-xs",
                        selectedId === overlay.id
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-border hover:border-indigo-300"
                      )}
                    >
                      {overlay.text || (isHe ? "(ריק)" : "(empty)")}
                    </button>
                  </li>
                ))
              )}
            </ul>

            {selectedOverlay ? (
              <div className="space-y-3 border-t border-border pt-3">
                <FieldLabel>{isHe ? "טקסט" : "Text"}</FieldLabel>
                <textarea
                  className="min-h-[64px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedOverlay.text}
                  onChange={(event) => updateSelected({ text: event.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>{isHe ? "גודל" : "Size"}</FieldLabel>
                    <input
                      type="range"
                      min={16}
                      max={140}
                      step={2}
                      value={selectedOverlay.fontSizePx}
                      onChange={(event) => updateSelected({ fontSizePx: Number(event.target.value) })}
                      className="w-full"
                    />
                    <p className="text-[11px] text-muted-foreground">{selectedOverlay.fontSizePx}px</p>
                  </div>
                  <div>
                    <FieldLabel>{isHe ? "רוחב (%)" : "Width (%)"}</FieldLabel>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={Math.round(selectedOverlay.widthPct * 100)}
                      onChange={(event) => updateSelected({ widthPct: Number(event.target.value) / 100 })}
                      className="w-full"
                    />
                    <p className="text-[11px] text-muted-foreground">{Math.round(selectedOverlay.widthPct * 100)}%</p>
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
                        onClick={() => updateSelected({ align: value })}
                        className={cn(
                          "flex h-8 flex-1 items-center justify-center rounded-lg border",
                          selectedOverlay.align === value
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-border hover:border-indigo-300"
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel>{isHe ? "צבע" : "Color"}</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelected({ color: c })}
                        className={cn(
                          "h-7 w-7 rounded-full ring-2 ring-offset-2",
                          selectedOverlay.color === c ? "ring-indigo-500" : "ring-transparent"
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                    <input
                      type="color"
                      value={selectedOverlay.color}
                      onChange={(event) => updateSelected({ color: event.target.value })}
                      className="h-7 w-12 cursor-pointer rounded border border-border"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>{isHe ? "גופן" : "Font"}</FieldLabel>
                  <select
                    className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
                    value={selectedOverlay.fontFamily}
                    onChange={(event) => updateSelected({ fontFamily: event.target.value })}
                  >
                    {FONT_PRESETS.map((f) => (
                      <option key={f} value={f}>
                        {f.split(",")[0]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
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

function TrimSlider({
  duration,
  start,
  end,
  onChangeStart,
  onChangeEnd
}: {
  duration: number;
  start: number;
  end: number;
  onChangeStart: (v: number) => void;
  onChangeEnd: (v: number) => void;
}) {
  // We use two stacked range inputs with the same range. Visually we draw an
  // active band between them.
  if (duration <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Waiting for video metadata…
      </p>
    );
  }
  const startPct = (start / duration) * 100;
  const endPct = (end / duration) * 100;
  return (
    <div className="relative h-10 select-none">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-indigo-500"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <input
        type="range"
        min={0}
        max={duration}
        step={0.05}
        value={start}
        onChange={(event) => {
          const v = Number(event.target.value);
          if (Number.isFinite(v) && v < end - 0.1) onChangeStart(v);
        }}
        className="trim-handle absolute inset-0 w-full"
        style={{ zIndex: 2 }}
      />
      <input
        type="range"
        min={0}
        max={duration}
        step={0.05}
        value={end}
        onChange={(event) => {
          const v = Number(event.target.value);
          if (Number.isFinite(v) && v > start + 0.1) onChangeEnd(v);
        }}
        className="trim-handle absolute inset-0 w-full"
        style={{ zIndex: 3 }}
      />
      <style jsx>{`
        .trim-handle {
          appearance: none;
          background: transparent;
          pointer-events: none;
        }
        .trim-handle::-webkit-slider-thumb {
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 999px;
          background: #4f46e5;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          pointer-events: auto;
        }
        .trim-handle::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 999px;
          background: #4f46e5;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}

function OverlayShape({
  overlay,
  stageSize,
  isSelected,
  onSelect,
  onChange
}: {
  overlay: TextOverlay;
  stageSize: { width: number; height: number };
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<TextOverlay>) => void;
}) {
  const widthPx = overlay.widthPct * stageSize.width;
  const xPx = overlay.xPct * stageSize.width;
  const yPx = overlay.yPct * stageSize.height;
  // The SVG compositor draws a translucent backdrop behind each overlay.
  // Mirror it in the preview so users see the same legibility shim that
  // will end up on the rendered video.
  const fontSizeScale = stageSize.width / 1080;
  const previewFontSize = Math.max(8, Math.round(overlay.fontSizePx * fontSizeScale));
  return (
    <>
      {isSelected ? (
        <KonvaRect
          x={xPx - 8}
          y={yPx - previewFontSize * 0.8 - 8}
          width={widthPx + 16}
          height={previewFontSize * 2.6}
          stroke="#6366f1"
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
        />
      ) : null}
      <KonvaText
        text={overlay.text || " "}
        x={xPx}
        y={yPx}
        width={widthPx}
        fontFamily={overlay.fontFamily}
        fontSize={previewFontSize}
        fontStyle={overlay.fontWeight && overlay.fontWeight >= 600 ? "bold" : "normal"}
        fill={overlay.color}
        align={overlay.align}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={onSelect}
        onDragEnd={(event: any) => {
          const node = event.target;
          onChange({
            xPct: clamp(node.x() / stageSize.width, 0, 1),
            yPct: clamp(node.y() / stageSize.height, 0, 1)
          });
        }}
      />
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
