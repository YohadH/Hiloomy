import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Storage abstraction for Creative assets. Two backends:
//   - "local": writes under CREATIVE_STORAGE_LOCAL_DIR (default ./.creative-storage)
//             and serves via /api/creative/files/[...key]. Dev default — works
//             with no setup so the feature can be exercised before R2 creds
//             are provisioned.
//   - "r2"/"s3": Cloudflare R2 (S3-compatible) or AWS S3 via env config.
//
// Always interact through this module — keys never leak to the client; the
// client only ever sees signed/proxy URLs returned from getReadableUrl().

type Backend = "local" | "s3";

function resolveBackend(): Backend {
  const value = (process.env.CREATIVE_STORAGE_BACKEND ?? "local").toLowerCase();
  return value === "s3" || value === "r2" ? "s3" : "local";
}

const LOCAL_DIR = process.env.CREATIVE_STORAGE_LOCAL_DIR
  ? path.resolve(process.env.CREATIVE_STORAGE_LOCAL_DIR)
  : path.resolve(process.cwd(), ".creative-storage");

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h
const LOCAL_PROXY_PREFIX = "/api/creative/files/";

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  const endpoint = process.env.CREATIVE_S3_ENDPOINT;
  const region = process.env.CREATIVE_S3_REGION ?? "auto";
  const accessKeyId = process.env.CREATIVE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CREATIVE_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "CREATIVE_S3_ACCESS_KEY_ID / CREATIVE_S3_SECRET_ACCESS_KEY must be set when CREATIVE_STORAGE_BACKEND is r2/s3."
    );
  }
  s3Client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint), // R2 / MinIO want path-style addressing
    credentials: { accessKeyId, secretAccessKey }
  });
  return s3Client;
}

function getBucket(): string {
  const bucket = process.env.CREATIVE_BUCKET;
  if (!bucket) {
    throw new Error("CREATIVE_BUCKET must be set when using s3/r2 storage backend.");
  }
  return bucket;
}

function localPathFor(key: string): string {
  // Block traversal: keys are server-controlled but be defensive.
  const safe = key.replace(/\\/g, "/").replace(/(^|\/)\.\.(\/|$)/g, "$1$2");
  return path.join(LOCAL_DIR, safe);
}

export interface StorageKeyParts {
  storeId: string;
  // sub-namespace under the store: sources | projects | thumbs
  scope: "sources" | "assets" | "thumbs";
  // free-form additional segments (projectId/assetId/etc.)
  segments: string[];
  // Filename (with extension)
  filename: string;
}

/**
 * Build a storage key under the project's keying convention:
 *   creative/<storeId>/<scope>/<segments...>/<filename>
 *
 * Callers can append a random suffix to `filename` for uniqueness.
 */
export function buildStorageKey(parts: StorageKeyParts): string {
  const segments = parts.segments.filter(Boolean).map((s) => s.replace(/[/\\]/g, ""));
  return ["creative", parts.storeId, parts.scope, ...segments, parts.filename].join("/");
}

export function suggestFilename(originalName: string | null, fallbackExt = "bin"): string {
  const cleanedExt = (() => {
    if (originalName) {
      const ext = path.extname(originalName).replace(".", "").toLowerCase();
      if (/^[a-z0-9]{1,8}$/.test(ext)) return ext;
    }
    return fallbackExt;
  })();
  return `${randomUUID()}.${cleanedExt}`;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export async function putObject(input: PutObjectInput): Promise<void> {
  const backend = resolveBackend();
  if (backend === "local") {
    const filePath = localPathFor(input.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.body);
    return;
  }
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  const backend = resolveBackend();
  if (backend === "local") {
    try {
      await fs.unlink(localPathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return;
  }
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/**
 * Returns a URL the browser can fetch the object from. For local storage this
 * is a proxy route (/api/creative/files/...). For S3/R2 it's a presigned URL.
 */
export async function getReadableUrl(key: string): Promise<string> {
  const backend = resolveBackend();
  if (backend === "local") {
    return `${LOCAL_PROXY_PREFIX}${encodeURI(key)}`;
  }
  const client = getS3Client();
  return await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}

/**
 * Server-side read of an object as a Buffer. Used by the local-file proxy
 * route and by the AI provider when uploading product images.
 */
export async function readObject(key: string): Promise<{ body: Buffer; contentType: string }> {
  const backend = resolveBackend();
  if (backend === "local") {
    const filePath = localPathFor(key);
    const body = await fs.readFile(filePath);
    return { body, contentType: guessContentType(filePath) };
  }
  const client = getS3Client();
  const result = await client.send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key })
  );
  const chunks: Buffer[] = [];
  const stream = result.Body as NodeJS.ReadableStream | undefined;
  if (!stream) throw new Error(`No body returned for key ${key}`);
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    body: Buffer.concat(chunks),
    contentType: result.ContentType ?? "application/octet-stream"
  };
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

export function getStorageBackend(): Backend {
  return resolveBackend();
}
