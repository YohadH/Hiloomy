import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { TextOverlay } from "@/lib/domain/creative-types";

// Server-side video editor pipeline. One pure function:
//   trimAndOverlay({ baseVideo, trim, overlays }) -> { video, thumbnail }
//
// We write the input + overlay PNG to a temp dir, run ffmpeg, read the
// output bytes, and clean up. The overlay is rendered as an SVG (same
// schema as the image pipeline, so the editor preview matches the burned-in
// result) then rasterized to a transparent PNG so ffmpeg can composite it
// onto every frame with the `overlay` filter.

interface FfmpegStaticModule {
  default?: string;
  path?: string;
}

interface FluentFfmpegStatic {
  // Minimal surface we actually use.
  (input?: string): FluentFfmpegInstance;
  setFfmpegPath(p: string): void;
  ffprobe(input: string, cb: (err: Error | null, data: FfprobeData) => void): void;
}
interface FluentFfmpegInstance {
  input(input: string): this;
  inputOptions(opts: string[] | string): this;
  outputOptions(opts: string[] | string): this;
  output(target: string): this;
  on(event: string, handler: (...args: unknown[]) => void): this;
  run(): this;
}
interface FfprobeData {
  format?: { duration?: number };
  streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
}

let ffmpegModulePromise: Promise<FluentFfmpegStatic> | null = null;
async function getFfmpeg(): Promise<FluentFfmpegStatic> {
  if (!ffmpegModulePromise) {
    ffmpegModulePromise = (async () => {
      // Dynamic + cast so Next's static analysis doesn't flag the CommonJS shape.
      const fluentMod = (await import("fluent-ffmpeg")) as unknown as {
        default?: FluentFfmpegStatic;
      } & FluentFfmpegStatic;
      const fluent = (fluentMod.default ?? fluentMod) as FluentFfmpegStatic;

      const staticMod = (await import("ffmpeg-static")) as unknown as FfmpegStaticModule;
      const binaryPath = staticMod.default ?? staticMod.path ?? null;
      if (binaryPath) fluent.setFfmpegPath(binaryPath);
      return fluent;
    })();
  }
  return ffmpegModulePromise;
}

export interface TrimSpec {
  // Start/end in seconds from the beginning of the source video. End must be
  // > start. We clamp to the actual source duration in the runner.
  startSec: number;
  endSec: number;
}

export interface TrimAndOverlayInput {
  baseVideo: Buffer;
  trim: TrimSpec;
  overlays: TextOverlay[];
  // Output dimensions matter for the overlay rasterization. We pass them in
  // from the editor (it knows the source video's intrinsic size from the
  // HTMLVideoElement metadata). Optional — pipeline probes if missing.
  width?: number;
  height?: number;
}

export interface TrimAndOverlayOutput {
  video: Buffer;
  thumbnail: Buffer; // first frame of the trimmed output (jpeg)
  durationMs: number;
  width: number;
  height: number;
}

export async function trimAndOverlay(input: TrimAndOverlayInput): Promise<TrimAndOverlayOutput> {
  const ffmpeg = await getFfmpeg();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `creative-video-${randomUUID()}-`));
  const sourcePath = path.join(workDir, "source.mp4");
  const overlayPath = path.join(workDir, "overlay.png");
  const outputPath = path.join(workDir, "output.mp4");
  const thumbPath = path.join(workDir, "thumb.jpg");

  try {
    await fs.writeFile(sourcePath, input.baseVideo);

    const probe = await probeVideo(ffmpeg, sourcePath);
    const sourceDuration = probe.durationSec;
    const width = input.width ?? probe.width ?? 1080;
    const height = input.height ?? probe.height ?? 1920;

    const startSec = clamp(input.trim.startSec, 0, Math.max(0, sourceDuration - 0.1));
    const endSec = clamp(input.trim.endSec, startSec + 0.1, sourceDuration);
    const durationSec = endSec - startSec;

    const hasOverlay = input.overlays.some((o) => o.text && o.text.trim().length > 0);
    if (hasOverlay) {
      const svg = buildOverlaySvg(input.overlays, width, height);
      const png = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
      await fs.writeFile(overlayPath, png);
    }

    await runFfmpeg(ffmpeg, (cmd) => {
      cmd
        .input(sourcePath)
        .inputOptions([`-ss ${startSec.toFixed(3)}`, `-t ${durationSec.toFixed(3)}`]);
      if (hasOverlay) {
        cmd.input(overlayPath);
        // overlay filter: place the rasterized PNG at (0,0). Because the PNG
        // canvas spans the full video frame, individual overlay positions
        // are encoded inside the PNG itself.
        cmd.outputOptions(["-filter_complex", "[0:v][1:v]overlay=0:0:format=auto"]);
      }
      cmd
        .outputOptions([
          "-c:v libx264",
          "-preset veryfast",
          "-crf 23",
          "-c:a aac",
          "-b:a 128k",
          "-movflags +faststart",
          "-pix_fmt yuv420p"
        ])
        .output(outputPath);
    });

    // Extract the first frame of the trimmed output as a thumbnail.
    await runFfmpeg(ffmpeg, (cmd) => {
      cmd
        .input(outputPath)
        .outputOptions(["-frames:v 1", "-q:v 3", "-update 1"])
        .output(thumbPath);
    });

    const [videoBytes, thumbBytes] = await Promise.all([
      fs.readFile(outputPath),
      fs.readFile(thumbPath)
    ]);

    return {
      video: videoBytes,
      thumbnail: thumbBytes,
      durationMs: Math.round(durationSec * 1000),
      width,
      height
    };
  } finally {
    // Best-effort cleanup; never blocks on it.
    fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function probeVideo(
  ffmpeg: FluentFfmpegStatic,
  filePath: string
): Promise<{ durationSec: number; width: number | null; height: number | null }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const videoStream = (data.streams ?? []).find((s) => s.codec_type === "video");
      resolve({
        durationSec: Number(data.format?.duration ?? 0),
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null
      });
    });
  });
}

async function runFfmpeg(
  ffmpeg: FluentFfmpegStatic,
  configure: (cmd: FluentFfmpegInstance) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    configure(cmd);
    cmd
      .on("error", (err) => reject(err instanceof Error ? err : new Error(String(err))))
      .on("end", () => resolve())
      .run();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Overlay rendering — shared schema with the image pipeline. Kept inline
// here (instead of imported) so the two pipelines can evolve independently;
// the SVG layout is intentionally similar to creative-image-pipeline.ts.
// ─────────────────────────────────────────────────────────────────────────

function buildOverlaySvg(overlays: TextOverlay[], width: number, height: number): string {
  const parts: string[] = [];
  for (const overlay of overlays) {
    if (!overlay.text || !overlay.text.trim()) continue;
    parts.push(renderOverlay(overlay, width, height));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
}

function renderOverlay(overlay: TextOverlay, canvasWidth: number, canvasHeight: number): string {
  const x = clamp(overlay.xPct, 0, 1) * canvasWidth;
  const y = clamp(overlay.yPct, 0, 1) * canvasHeight;
  const wrapWidth = Math.max(40, clamp(overlay.widthPct, 0.05, 1) * canvasWidth);
  const fontSize = Math.max(8, Math.round(overlay.fontSizePx));
  const fontWeight = overlay.fontWeight ?? 600;
  const fontFamily = escapeXml(overlay.fontFamily || "Inter, system-ui, sans-serif");
  const color = escapeXml(overlay.color || "#ffffff");
  const align = overlay.align === "center" ? "middle" : overlay.align === "right" ? "end" : "start";
  const anchorX = align === "middle" ? x + wrapWidth / 2 : align === "end" ? x + wrapWidth : x;

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

  const padding = Math.round(fontSize * 0.4);
  const backdropHeight = Math.max(lineHeight, lines.length * lineHeight) + padding * 2;
  const backdrop = `<rect x="${x - padding}" y="${y - padding - Math.round(fontSize * 0.8)}" width="${wrapWidth + padding * 2}" height="${backdropHeight}" rx="${Math.round(padding * 0.5)}" fill="rgba(0,0,0,0.35)"/>`;
  return `${backdrop}<text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" text-anchor="${align}" x="${anchorX}" y="${y}">${tspans}</text>`;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
