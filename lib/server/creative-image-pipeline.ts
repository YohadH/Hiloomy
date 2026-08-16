import sharp from "sharp";
import {
  isImageOverlay,
  isTextOverlay,
  type CanvasOverlay,
  type ImageOverlay,
  type TextOverlay
} from "@/lib/domain/creative-types";

// Server-side image compositor. Given a base image buffer + the JSON list of
// canvas overlays the user arranged in the Konva editor, produces a new image
// buffer with the overlays burned in.
//
// Text is rendered via an SVG layer that we then rasterize and composite over
// the base; image overlays are decoded from their data URL and composited as
// real raster layers. The Konva canvas in the browser must use the same
// percentage-based coordinate system (xPct/yPct/widthPct, fontSizePx) so the
// preview matches the rendered output 1:1.

export interface CompositeImageInput {
  baseImage: Buffer;
  overlays: CanvasOverlay[];
  // Output format. WebP is our default — small, good quality, supported by
  // every browser we care about.
  outputFormat?: "webp" | "png" | "jpeg";
}

export interface CompositeImageOutput {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
}

export async function compositeImage(input: CompositeImageInput): Promise<CompositeImageOutput> {
  const format = input.outputFormat ?? "webp";
  const baseMeta = await sharp(input.baseImage).metadata();
  const width = baseMeta.width ?? 1024;
  const height = baseMeta.height ?? 1024;

  const overlayBuffers: { input: Buffer; left: number; top: number }[] = [];

  for (const overlay of input.overlays) {
    if (isImageOverlay(overlay)) {
      const composited = await buildImageOverlayBuffer(overlay, width, height);
      if (composited) overlayBuffers.push(composited);
      continue;
    }
    if (isTextOverlay(overlay)) {
      if (!overlay.text || !overlay.text.trim()) continue;
      const svg = buildOverlaySvg(overlay, width, height);
      overlayBuffers.push({ input: Buffer.from(svg, "utf8"), left: 0, top: 0 });
    }
  }

  let pipeline = sharp(input.baseImage);
  if (overlayBuffers.length > 0) {
    pipeline = pipeline.composite(overlayBuffers);
  }

  switch (format) {
    case "png":
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
    case "jpeg":
      pipeline = pipeline.jpeg({ quality: 90 });
      break;
    default:
      pipeline = pipeline.webp({ quality: 90 });
  }

  const buffer = await pipeline.toBuffer();
  return {
    buffer,
    contentType: format === "jpeg" ? "image/jpeg" : `image/${format}`,
    width,
    height
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Image overlays
// ─────────────────────────────────────────────────────────────────────────

async function buildImageOverlayBuffer(
  overlay: ImageOverlay,
  canvasWidth: number,
  canvasHeight: number
): Promise<{ input: Buffer; left: number; top: number } | null> {
  const decoded = decodeDataUrl(overlay.dataUrl);
  if (!decoded) return null;
  const targetWidthPx = Math.max(
    8,
    Math.round(clamp(overlay.widthPct, 0.01, 1) * canvasWidth)
  );
  // Preserve aspect ratio of the source asset.
  const meta = await sharp(decoded).metadata();
  const sourceWidth = meta.width ?? targetWidthPx;
  const sourceHeight = meta.height ?? targetWidthPx;
  const aspect = sourceHeight / Math.max(1, sourceWidth);
  const targetHeightPx = Math.max(8, Math.round(targetWidthPx * aspect));

  const opacity = clamp(overlay.opacity ?? 1, 0, 1);
  let resized = sharp(decoded).resize({
    width: targetWidthPx,
    height: targetHeightPx,
    fit: "inside"
  });
  if (opacity < 1) {
    resized = resized.ensureAlpha().composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in"
      }
    ]);
  }
  const buffer = await resized.png().toBuffer();

  const left = Math.round(clamp(overlay.xPct, 0, 1) * canvasWidth);
  const top = Math.round(clamp(overlay.yPct, 0, 1) * canvasHeight);
  return { input: buffer, left, top };
}

function decodeDataUrl(dataUrl: string): Buffer | null {
  // data:image/png;base64,iVBORw0...
  const match = /^data:image\/[a-zA-Z+.-]+;base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Text overlays
// ─────────────────────────────────────────────────────────────────────────

function buildOverlaySvg(overlay: TextOverlay, canvasWidth: number, canvasHeight: number): string {
  const x = clamp(overlay.xPct, 0, 1) * canvasWidth;
  const y = clamp(overlay.yPct, 0, 1) * canvasHeight;
  const wrapWidth = Math.max(40, clamp(overlay.widthPct, 0.05, 1) * canvasWidth);
  const fontSize = Math.max(8, Math.round(overlay.fontSizePx));
  const fontWeight = overlay.fontWeight ?? 600;
  const fontFamily = escapeXml(overlay.fontFamily || "Inter, system-ui, sans-serif");
  const color = escapeXml(overlay.color || "#ffffff");
  const textAnchor = overlay.align === "center" ? "middle" : overlay.align === "right" ? "end" : "start";
  const anchorX = overlay.align === "center" ? x + wrapWidth / 2 : overlay.align === "right" ? x + wrapWidth : x;

  // Manually wrap text to lines. SVG doesn't have native wrapping; we
  // approximate with a per-character width that's good enough for typical
  // sans-serif headlines.
  const approxCharWidth = fontSize * 0.55;
  const maxCharsPerLine = Math.max(4, Math.floor(wrapWidth / approxCharWidth));
  const lines = wrapText(overlay.text, maxCharsPerLine);
  const lineHeight = Math.round(fontSize * 1.15);

  const tspans = lines
    .map(
      (line, idx) =>
        `<tspan x="${anchorX}" dy="${idx === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  // Conditional backdrop. Old behaviour was an always-on translucent box; now
  // the editor decides whether/how to render it.
  let backdrop = "";
  if (overlay.backgroundEnabled) {
    const padding = Math.round(fontSize * 0.4);
    const backdropHeight = Math.max(lineHeight, lines.length * lineHeight) + padding * 2;
    const opacity = clamp(overlay.backgroundOpacity ?? 0.6, 0, 1);
    const fill = escapeXml(overlay.backgroundColor || "#000000");
    backdrop = `<rect x="${x - padding}" y="${y - padding - Math.round(fontSize * 0.8)}" width="${wrapWidth + padding * 2}" height="${backdropHeight}" rx="${Math.round(padding * 0.5)}" fill="${fill}" fill-opacity="${opacity}"/>`;
  }

  const transform = overlay.rotation
    ? `transform="rotate(${overlay.rotation} ${anchorX} ${y})"`
    : "";

  // text-decoration on <text> renders an underline in librsvg.
  const decoration = overlay.linkUrl ? ' text-decoration="underline"' : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
${backdrop}
<text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="${textAnchor}" x="${anchorX}" y="${y}"${decoration} ${transform}>${tspans}</text>
</svg>`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
