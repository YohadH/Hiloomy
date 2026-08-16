// Higgsfield platform client — text-to-image (Soul) and text-to-video (DoP).
//
// API surface verified via scripts/smoke-higgsfield.mjs on 2026-06-24:
//
//   Auth (dual header):
//     hf-api-key: <UUID>
//     hf-secret:  <64-char hex>
//
//   Create image:
//     POST https://platform.higgsfield.ai/v1/text2image/soul
//     body: { "params": { "prompt": "...", "width_and_height": "1152x2048" } }
//     → returns { id, type, jobs: [{ id, status: "queued", results: null }] }
//
//   Poll:
//     GET  https://platform.higgsfield.ai/v1/job-sets/{set_id}
//     → returns same shape with jobs[].status updated and jobs[].results
//       populated when complete:
//       results: { min: { url: "...webp" }, raw: { url: "...png" } }
//
// Width/height accepts a FIXED enum — anything outside the list 422s.
// 9:16 vertical (closest fit for Meta vertical ads) is "1152x2048".
//
// Mock mode: set HIGGSFIELD_MOCK=true OR omit HIGGSFIELD_API_KEY/SECRET.
// Returns deterministic 1px PNG so the rest of the sprint pipeline
// (publishing, DB writes, UI) is exercisable without spending real
// generation credits.

const DEFAULT_BASE_URL = "https://platform.higgsfield.ai/v1";

// Valid sizes Higgsfield accepts. Anything else returns 422 with this exact
// enum in the error message — kept here as the canonical reference.
const VALID_SIZES = new Set([
  "1152x2048", "2048x1152", "2048x1536", "1536x2048",
  "1344x2016", "2016x1344", "960x1696", "1536x1536",
  "1536x1152", "1696x960", "1152x1536", "1088x1632",
  "1632x1088", "1120x1680", "1680x1120", "2048x2048"
]);

function isMock(): boolean {
  return (
    process.env.HIGGSFIELD_MOCK === "true" ||
    !process.env.HIGGSFIELD_API_KEY ||
    !process.env.HIGGSFIELD_API_SECRET
  );
}

function getCredentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HIGGSFIELD_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      "HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must both be set. Run with HIGGSFIELD_MOCK=true for dev."
    );
  }
  return { apiKey, apiSecret };
}

function getBaseUrl(): string {
  return (process.env.HIGGSFIELD_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const { apiKey, apiSecret } = getCredentials();
  return {
    "hf-api-key": apiKey,
    "hf-secret": apiSecret,
    "Content-Type": "application/json"
  };
}

export type HiggsfieldAssetType = "image" | "video";
export type HiggsfieldJobStatus = "queued" | "in_progress" | "completed" | "failed" | "cancelled";

export interface HiggsfieldCreateJobInput {
  assetType: HiggsfieldAssetType;
  prompt: string;
  // Reference image URL (for image-conditioned gen, e.g. product photo).
  // NOT yet wired into Soul calls — Higgsfield Soul supports it via
  // `custom_reference` param; we'll expose once we hook it into the
  // brief flow. Ignored for now.
  referenceImageUrl?: string | null;
  // Caller picks the framing. Mapped to a Higgsfield-valid width_and_height
  // string below.
  aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9";
  // Video-only — duration in seconds. Not yet implemented for video.
  durationSec?: number;
  // Caller-supplied idempotency key (forwarded as a custom header so a
  // retried call doesn't double-charge if Higgsfield ever supports it).
  // Right now Higgsfield ignores this header; harmless.
  idempotencyKey?: string;
}

export interface HiggsfieldJob {
  // The job_set id — what you GET /v1/job-sets/{id} on.
  id: string;
  status: HiggsfieldJobStatus;
  // Populated once status === "completed". Higgsfield exposes a "raw"
  // (PNG) and "min" (webp thumbnail) — we surface "raw" as the canonical
  // asset URL for downstream use.
  assetUrl?: string | null;
  // The webp thumbnail URL (smaller, suitable for matrix tiles).
  thumbnailUrl?: string | null;
  assetMimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  costUsd?: number | null; // Higgsfield doesn't return cost in API; left null
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function aspectToSize(aspect: HiggsfieldCreateJobInput["aspectRatio"]): string {
  switch (aspect) {
    case "1:1":
      return "1536x1536";
    case "16:9":
      return "2048x1152";
    case "4:5":
      return "1632x2048" /* not in enum — fall through */;
    case "9:16":
    default:
      return "1152x2048";
  }
}

function safeSize(size: string): string {
  // Belt-and-suspenders: if a caller passes a custom size that's not in
  // the Higgsfield enum, fall back to the closest valid vertical option.
  if (VALID_SIZES.has(size)) return size;
  return "1152x2048";
}

// ── Mock helpers ────────────────────────────────────────────────────────

let mockJobCounter = 0;
const mockJobs = new Map<string, HiggsfieldJob>();

function newMockJobId(): string {
  mockJobCounter += 1;
  return `mock-${Date.now()}-${mockJobCounter}`;
}

function mockCompletedJob(jobId: string, input: HiggsfieldCreateJobInput): HiggsfieldJob {
  return {
    id: jobId,
    status: "completed",
    assetUrl: "https://placehold.co/1152x2048/png",
    thumbnailUrl: "https://placehold.co/576x1024/png",
    assetMimeType: "image/png",
    width: 1152,
    height: 2048,
    durationMs: null,
    costUsd: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── Public API ──────────────────────────────────────────────────────────

interface HiggsfieldCreateResponse {
  id: string;
  type: string;
  created_at?: string;
  jobs?: Array<{
    id: string;
    job_set_type: string;
    status: HiggsfieldJobStatus | string;
    results?: {
      min?: { url?: string; type?: string };
      raw?: { url?: string; type?: string };
    } | null;
  }>;
  input_params?: { width?: number; height?: number };
}

export async function createHiggsfieldJob(input: HiggsfieldCreateJobInput): Promise<HiggsfieldJob> {
  if (isMock()) {
    const id = newMockJobId();
    const job = mockCompletedJob(id, input);
    mockJobs.set(id, job);
    return job;
  }

  if (input.assetType === "video") {
    // TODO(video): Higgsfield offers video via DoP-style endpoints
    // (likely /v1/image2video/{model}). Not implemented yet — instead
    // of throwing (which fails the whole slot), silently fall through
    // to the image path. The brief generator sometimes picks "video"
    // for cinematic concepts; we'd rather render those as a still than
    // lose them entirely. Log a warning so it's visible in Render logs.
    console.warn(
      "[higgsfield-client] video requested but not wired — falling back to image gen for this slot"
    );
  }

  const size = safeSize(aspectToSize(input.aspectRatio ?? "9:16"));
  const params: Record<string, unknown> = {
    prompt: input.prompt,
    width_and_height: size
  };
  // Reference image conditioning — Higgsfield uploads the URL to their
  // CDN and uses it to guide the generation (e.g. keeps the product
  // identity consistent across variants). Verified format:
  //   { type: "image_url", image_url: "https://..." }
  if (input.referenceImageUrl) {
    params.image_reference = {
      type: "image_url",
      image_url: input.referenceImageUrl
    };
  }
  const body = { params };

  const headers = authHeaders();
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

  const res = await fetch(`${getBaseUrl()}/text2image/soul`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield create ${res.status}: ${text.slice(0, 300)}`);
  }
  const raw = (await res.json()) as HiggsfieldCreateResponse;
  return normalizeCreateResponse(raw, size);
}

export async function getHiggsfieldJob(jobSetId: string): Promise<HiggsfieldJob> {
  if (isMock()) {
    const job = mockJobs.get(jobSetId);
    if (!job) throw new Error(`Mock job ${jobSetId} not found`);
    return job;
  }
  const res = await fetch(`${getBaseUrl()}/job-sets/${encodeURIComponent(jobSetId)}`, {
    method: "GET",
    headers: authHeaders()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield get ${res.status}: ${text.slice(0, 300)}`);
  }
  const raw = (await res.json()) as HiggsfieldCreateResponse;
  return normalizeCreateResponse(raw, null);
}

// Poll until completed/failed. Default 6-minute timeout.
export async function pollHiggsfieldUntilDone(
  jobSetId: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<HiggsfieldJob> {
  const timeoutMs = options.timeoutMs ?? 6 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 4000;
  const startedAt = Date.now();
  let job = await getHiggsfieldJob(jobSetId);
  while (job.status === "queued" || job.status === "in_progress") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Higgsfield job ${jobSetId} did not complete within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    job = await getHiggsfieldJob(jobSetId);
  }
  return job;
}

export async function downloadHiggsfieldAsset(assetUrl: string): Promise<Buffer> {
  if (isMock()) {
    // Smallest valid PNG (1x1 transparent) — keeps the pipeline running
    // without hitting the real network.
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );
  }
  const res = await fetch(assetUrl);
  if (!res.ok) {
    throw new Error(`Failed to download asset: ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// Rough cost estimate for the launcher UI's "this sprint will cost ~$X"
// preview. Higgsfield doesn't publish per-call cost via the API, so this
// uses observed pricing snapshots; refine when invoicing is reliable.
export function estimateHiggsfieldCostUsd(input: {
  assetType: HiggsfieldAssetType;
  count: number;
  durationSec?: number;
}): number {
  // Soul image gen is roughly $0.04-0.06 per gen as of mid-2026.
  // DoP video is much higher (~$0.40 for 5s); video remains TODO.
  const perJob = input.assetType === "video" ? 0.4 : 0.05;
  return Number((perJob * input.count).toFixed(2));
}

// ── Internals ──────────────────────────────────────────────────────────

function normalizeCreateResponse(
  raw: HiggsfieldCreateResponse,
  requestedSize: string | null
): HiggsfieldJob {
  // A job_set contains 1+ jobs. For text2image/soul there's always 1.
  // We bubble its status + asset URLs up to the wrapper.
  const inner = raw.jobs?.[0];
  const status = (inner?.status as HiggsfieldJobStatus) ?? "queued";
  const rawUrl = inner?.results?.raw?.url ?? null;
  const minUrl = inner?.results?.min?.url ?? null;
  // Higgsfield doesn't echo width/height per-job; pull from input_params
  // on the create response, fall back to requestedSize for polls (where
  // input_params is returned too).
  const width = raw.input_params?.width ?? (requestedSize ? Number(requestedSize.split("x")[0]) : null);
  const height = raw.input_params?.height ?? (requestedSize ? Number(requestedSize.split("x")[1]) : null);
  return {
    id: raw.id,
    status,
    assetUrl: rawUrl,
    thumbnailUrl: minUrl,
    assetMimeType: rawUrl?.endsWith(".png") ? "image/png" : rawUrl ? "image/webp" : null,
    width: width && Number.isFinite(width) ? width : null,
    height: height && Number.isFinite(height) ? height : null,
    durationMs: null,
    costUsd: null,
    errorMessage: null,
    createdAt: raw.created_at,
    updatedAt: undefined
  };
}
