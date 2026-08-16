"use client";

// Client-only Konva canvas. Lives in its own file so the parent editor can
// import it via next/dynamic({ ssr: false }) as a single component — importing
// each react-konva primitive separately with next/dynamic breaks under
// React 19 ("Cannot use 'in' operator to search for 'default' in Layer").
//
// Rendering layout:
//   ┌──────────────────────────────────────┐
//   │  <img>   ← native browser scaling    │  (sharp downscale, full quality)
//   │  ┌────────────────────────────────┐  │
//   │  │  <Stage>   ← transparent       │  │  (overlays only, drag/drop)
//   │  │   <Layer>                      │  │
//   │  │     overlays                   │  │
//   │  │   </Layer>                     │  │
//   │  └────────────────────────────────┘  │
//   └──────────────────────────────────────┘
//
// The source image used to live inside the Konva Stage as a KonvaImage. That
// looked pixelated at display sizes because canvas drawImage downscales with
// low-quality smoothing by default. Putting the image in a plain <img> tag
// lets the browser do the high-quality resampling it normally does.

import { useEffect, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Rect as KonvaRect } from "react-konva";
import {
  isImageOverlay,
  isTextOverlay,
  type CanvasOverlay,
  type ImageOverlay,
  type TextOverlay
} from "@/lib/domain/creative-types";

interface EditorCanvasProps {
  image: HTMLImageElement;
  overlays: CanvasOverlay[];
  selectedId: string | null;
  stageSize: { width: number; height: number };
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<CanvasOverlay>) => void;
}

export default function EditorCanvas({
  image,
  overlays,
  selectedId,
  stageSize,
  onSelect,
  onChange
}: EditorCanvasProps) {
  return (
    <div
      className="relative"
      style={{ width: stageSize.width, height: stageSize.height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt="canvas source"
        width={stageSize.width}
        height={stageSize.height}
        className="absolute inset-0 block h-full w-full select-none"
        style={{ imageRendering: "auto" }}
        draggable={false}
      />
      <div className="absolute inset-0">
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={(event: any) => {
            if (event.target === event.target.getStage()) onSelect(null);
          }}
        >
          <Layer>
            {overlays.map((overlay) => {
              if (isImageOverlay(overlay)) {
                return (
                  <ImageOverlayShape
                    key={overlay.id}
                    overlay={overlay}
                    stageSize={stageSize}
                    isSelected={overlay.id === selectedId}
                    onSelect={() => onSelect(overlay.id)}
                    onChange={(patch) => onChange(overlay.id, patch as Partial<ImageOverlay>)}
                  />
                );
              }
              if (isTextOverlay(overlay)) {
                return (
                  <TextOverlayShape
                    key={overlay.id}
                    overlay={overlay}
                    stageSize={stageSize}
                    isSelected={overlay.id === selectedId}
                    onSelect={() => onSelect(overlay.id)}
                    onChange={(patch) => onChange(overlay.id, patch as Partial<TextOverlay>)}
                  />
                );
              }
              return null;
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

function TextOverlayShape({
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

  const padding = Math.round(overlay.fontSizePx * 0.4);
  const lineHeight = Math.round(overlay.fontSizePx * 1.15);
  const bgWidth = widthPx + padding * 2;
  const bgHeight = lineHeight + padding * 2;

  const opacity =
    typeof overlay.backgroundOpacity === "number"
      ? clamp(overlay.backgroundOpacity, 0, 1)
      : 0.6;
  const bgFill = overlay.backgroundColor || "#000000";

  return (
    <>
      {overlay.backgroundEnabled ? (
        <KonvaRect
          x={xPx - padding}
          y={yPx - padding - Math.round(overlay.fontSizePx * 0.8)}
          width={bgWidth}
          height={bgHeight}
          fill={bgFill}
          opacity={opacity}
          cornerRadius={Math.round(padding * 0.5)}
          listening={false}
        />
      ) : null}
      {isSelected ? (
        <KonvaRect
          x={xPx - 8}
          y={yPx - overlay.fontSizePx * 0.8 - 8}
          width={widthPx + 16}
          height={overlay.fontSizePx * 2.6}
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
        fontSize={overlay.fontSizePx}
        fontStyle={overlay.fontWeight && overlay.fontWeight >= 600 ? "bold" : "normal"}
        fill={overlay.color}
        align={overlay.align}
        textDecoration={overlay.linkUrl ? "underline" : ""}
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

function ImageOverlayShape({
  overlay,
  stageSize,
  isSelected,
  onSelect,
  onChange
}: {
  overlay: ImageOverlay;
  stageSize: { width: number; height: number };
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ImageOverlay>) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new window.Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.src = overlay.dataUrl;
  }, [overlay.dataUrl]);

  if (!img) return null;

  const widthPx = overlay.widthPct * stageSize.width;
  const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
  const heightPx = widthPx * aspect;
  const xPx = overlay.xPct * stageSize.width;
  const yPx = overlay.yPct * stageSize.height;

  return (
    <>
      {isSelected ? (
        <KonvaRect
          x={xPx - 4}
          y={yPx - 4}
          width={widthPx + 8}
          height={heightPx + 8}
          stroke="#6366f1"
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
        />
      ) : null}
      <KonvaImage
        image={img}
        x={xPx}
        y={yPx}
        width={widthPx}
        height={heightPx}
        opacity={typeof overlay.opacity === "number" ? clamp(overlay.opacity, 0, 1) : 1}
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
