import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { createShopifyClient } from "@/lib/shopify/client";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import {
  PRODUCT_CREATE_MEDIA_MUTATION,
  STAGED_UPLOADS_CREATE_MUTATION
} from "@/lib/shopify/queries/media";
import { readObject } from "@/lib/services/creative-storage-service";

// Pushes a Creative asset into a Shopify product's media gallery.
//
// Shopify can't fetch from our local storage backend (localhost) and our
// signed R2 URLs are short-lived, so we always upload through Shopify's
// staged-upload pipeline. That gives us a Shopify-hosted resource URL that
// productCreateMedia can ingest.

interface StagedUploadParameter {
  name: string;
  value: string;
}

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: StagedUploadParameter[];
}

interface StagedUploadsCreateData {
  stagedUploadsCreate: {
    stagedTargets: StagedTarget[];
    userErrors: { field: string[] | null; message: string }[];
  };
}

interface ProductCreateMediaData {
  productCreateMedia: {
    media: Array<{
      mediaContentType: string;
      status: string;
      alt?: string | null;
      id?: string;
      image?: { url?: string };
      sources?: { url: string }[];
    }>;
    mediaUserErrors: { code?: string; field?: string[]; message: string }[];
    product: { id: string };
  };
}

export interface PublishAssetInput {
  storeId: string;
  assetId: string;
  targetProductId: string; // GID like "gid://shopify/Product/1234" or numeric id
  altText?: string;
}

export interface PublishAssetResult {
  mediaId: string | null;
  mediaUrl: string | null;
  productId: string;
}

function normalizeProductGid(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("gid://shopify/Product/")) return trimmed;
  // Allow the user to paste an admin URL like
  // https://shop.myshopify.com/admin/products/1234567890
  const adminMatch = trimmed.match(/\/products\/(\d+)/);
  if (adminMatch) return `gid://shopify/Product/${adminMatch[1]}`;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  throw new AppError(
    `Invalid Shopify product id: "${raw}". Provide a numeric id, GID, or admin URL.`,
    400
  );
}

function mediaContentTypeFor(mime: string): "IMAGE" | "VIDEO" {
  return mime.startsWith("video/") ? "VIDEO" : "IMAGE";
}

function fileResourceFor(mime: string): "IMAGE" | "VIDEO" | "FILE" {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  return "FILE";
}

export async function publishAssetToShopify(input: PublishAssetInput): Promise<PublishAssetResult> {
  const db = getDb();
  const asset = await db.creativeAsset.findFirst({
    where: { id: input.assetId, project: { storeId: input.storeId } },
    include: { project: { select: { storeId: true, name: true } } }
  });
  if (!asset) throw new AppError("Asset not found for this store.", 404);
  if (!asset.storageKey) throw new AppError("Asset has no rendered file to publish.", 400);
  if (asset.status !== "ready") {
    throw new AppError(`Asset is not ready (status=${asset.status}).`, 400);
  }

  const productGid = normalizeProductGid(input.targetProductId);

  const { body: bytes, contentType } = await readObject(asset.storageKey);
  const credentials = await getStoredShopifyCredentials(input.storeId);
  const client = createShopifyClient(credentials);

  // Step 1 — stage upload.
  const filename = `${asset.id}.${extFromMime(contentType)}`;
  const staged = await client.request<StagedUploadsCreateData>(STAGED_UPLOADS_CREATE_MUTATION, {
    input: [
      {
        filename,
        mimeType: contentType,
        resource: fileResourceFor(contentType),
        httpMethod: "POST",
        fileSize: String(bytes.length)
      }
    ]
  });
  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length) {
    throw new AppError(`Shopify stagedUploadsCreate failed: ${errors.map((e) => e.message).join("; ")}`, 502);
  }
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new AppError("Shopify did not return a staged upload target.", 502);

  // Step 2 — POST the file to the staged URL. Shopify's staged uploads use a
  // multipart/form-data POST: every parameter from `parameters` is a form
  // field, then `file` last with the bytes.
  const form = new FormData();
  for (const param of target.parameters) {
    form.append(param.name, param.value);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = new Blob([bytes as any], { type: contentType });
  form.append("file", blob, filename);
  const uploadResponse = await fetch(target.url, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => "");
    throw new AppError(
      `Shopify staged upload failed: ${uploadResponse.status} ${text.slice(0, 300)}`,
      502
    );
  }

  // Step 3 — attach the staged file to the product as media.
  const productMedia = await client.request<ProductCreateMediaData>(PRODUCT_CREATE_MEDIA_MUTATION, {
    productId: productGid,
    media: [
      {
        originalSource: target.resourceUrl,
        alt: input.altText ?? asset.project?.name ?? "Creative asset",
        mediaContentType: mediaContentTypeFor(contentType)
      }
    ]
  });
  const mediaErrors = productMedia.productCreateMedia.mediaUserErrors;
  if (mediaErrors.length) {
    throw new AppError(
      `Shopify productCreateMedia failed: ${mediaErrors.map((e) => e.message).join("; ")}`,
      502
    );
  }
  const media = productMedia.productCreateMedia.media[0];
  const mediaUrl = media?.image?.url ?? media?.sources?.[0]?.url ?? null;

  // Best-effort: record where we published. Doesn't matter if it fails.
  try {
    const meta = (asset.metaJson as Record<string, unknown> | null) ?? {};
    await db.creativeAsset.update({
      where: { id: asset.id },
      data: {
        metaJson: {
          ...meta,
          publishedToShopify: {
            productId: productGid,
            mediaId: media?.id ?? null,
            mediaUrl,
            publishedAt: new Date().toISOString()
          }
        }
      }
    });
  } catch {
    /* don't block on bookkeeping */
  }

  return {
    mediaId: media?.id ?? null,
    mediaUrl,
    productId: productGid
  };
}

function extFromMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("quicktime") || lower.includes("mov")) return "mov";
  return "bin";
}
