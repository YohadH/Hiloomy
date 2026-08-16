// GET /api/products?q=<search>&limit=<n>
//
// Lists products for the active store. Resolution order:
//   1. Local DB (Product table) — fast, no extra Shopify call
//   2. If DB returns 0 rows AND we have Shopify creds, fall back to a
//      live Shopify GraphQL search — catches the "Shopify connected but
//      sync hasn't populated DB yet" case + stale-DB issues
//
// Image URLs are always fetched live from Shopify (we don't store them
// in the Product table). One GraphQL call per picker-load covers all N
// products via the `nodes(ids:)` bulk lookup.
//
// Search fields: title, vendor, handle, AND variant SKU (so operators
// can type a SKU like "702" and find the product).

import { NextResponse } from "next/server";
import { AppError, toErrorMessage } from "@/lib/server/errors";
import { resolveActiveStoreId } from "@/lib/services/offline-sales-service";
import { assertStoreInActiveOrg } from "@/lib/auth/guards";
import { getDb } from "@/lib/server/db";
import { decryptSecret } from "@/lib/security/encryption";
import { ShopifyGraphQLClient } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";

export interface ProductPickerRow {
  id: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  vendor: string | null;
  productType: string | null;
  price: string;
  imageUrl: string | null;
  description: string | null;
  // Where this row came from. Useful for the picker UI to show "live
  // from Shopify" vs "from local cache" if we want to differentiate.
  source: "db" | "shopify";
}

// Image lookup uses Shopify's modern `media` / `featuredMedia` surface.
// `Product.images` and `Product.featuredImage` are deprecated in newer
// Admin API versions — `media` is the supported path and returns image
// URLs via `MediaImage.image.url`.
//
// We ask for `featuredMedia` first (designated main image) and fall back
// to the first IMAGE-type media node. Filtering by `media_type:IMAGE`
// skips videos / 3D models cleanly.
const NODES_QUERY = /* GraphQL */ `
  query GetProductImages($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        description
        featuredMedia {
          ... on MediaImage { image { url } }
        }
        media(first: 1, query: "media_type:IMAGE") {
          nodes {
            ... on MediaImage { image { url } }
          }
        }
      }
    }
  }
`;

// Live Shopify search — used when the local DB doesn't have what the
// operator is looking for. Returns Shopify's native product results
// matching the query string.
const LIVE_SEARCH_QUERY = /* GraphQL */ `
  query LiveSearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          vendor
          productType
          description
          featuredMedia {
            ... on MediaImage { image { url } }
          }
          media(first: 1, query: "media_type:IMAGE") {
            nodes {
              ... on MediaImage { image { url } }
            }
          }
          priceRangeV2 { minVariantPrice { amount } }
          variants(first: 3) { edges { node { sku } } }
        }
      }
    }
  }
`;

// Shape the modern `media` / `featuredMedia` queries return — a wrapped
// `image { url }` rather than a flat `url` field.
type MediaImageNode = { image?: { url?: string | null } | null } | null | undefined;

// Pull the best available image URL from a product node, preferring the
// designated featured media and falling back to the first IMAGE node.
function extractImageUrl(node: {
  featuredMedia?: MediaImageNode;
  media?: { nodes?: MediaImageNode[] } | null;
}): string | null {
  return (
    node.featuredMedia?.image?.url ??
    node.media?.nodes?.[0]?.image?.url ??
    null
  );
}

function gidForProduct(shopifyProductId: string): string {
  if (shopifyProductId.startsWith("gid://")) return shopifyProductId;
  return `gid://shopify/Product/${shopifyProductId.replace(/\D+/g, "")}`;
}

function numericIdFromGid(gid: string): string {
  return gid.replace(/^gid:\/\/shopify\/Product\//, "");
}

export async function GET(request: Request) {
  try {
    const storeId = await resolveActiveStoreId();
    if (!storeId) throw new AppError("No active store.", 400);
    await assertStoreInActiveOrg(storeId);

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const qLower = q.toLowerCase();
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, limitParam) : 20;

    const db = getDb();

    // ── DB query ──────────────────────────────────────────────────────
    // No status filter — different stores set product.status differently
    // (some sync sets it null, others "active", others use Shopify's
    // string). Filtering by status was hiding genuine products. We exclude
    // explicitly-archived ones only.
    const products = await db.product.findMany({
      where: {
        storeId,
        NOT: { status: "archived" },
        ...(qLower
          ? {
              OR: [
                { title: { contains: qLower, mode: "insensitive" as const } },
                { vendor: { contains: qLower, mode: "insensitive" as const } },
                { handle: { contains: qLower, mode: "insensitive" as const } },
                // SKU search via the variants relation — catches operators
                // typing internal SKUs like "702" or barcode fragments.
                { variants: { some: { sku: { contains: qLower, mode: "insensitive" as const } } } },
                { variants: { some: { barcode: { contains: qLower, mode: "insensitive" as const } } } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        shopifyProductId: true,
        title: true,
        handle: true,
        vendor: true,
        productType: true,
        price: true
      }
    });
    console.log(`[api/products] storeId=${storeId} query="${q}" dbCount=${products.length}`);

    const connection = await db.shopifyConnection.findUnique({ where: { storeId } });
    const hasShopify = Boolean(connection?.adminAccessTokenEnc);
    const shopifyClient = hasShopify
      ? new ShopifyGraphQLClient({
          shopDomain: connection!.shopDomain,
          adminAccessToken: decryptSecret(connection!.adminAccessTokenEnc),
          apiVersion: connection!.apiVersion
        })
      : null;

    let rows: ProductPickerRow[] = [];
    // Diagnostic captures — surfaced in the JSON response so we can debug
    // "no images / no descriptions" without tailing Render logs.
    let enrichmentError: string | null = null;
    let enrichmentAttempted = false;
    let nodesReturned = 0;
    let nodesWithImage = 0;
    let nodesWithDescription = 0;
    let firstNodeRaw: unknown = null;
    let firstGidSent: string | null = null;
    // Map of DB row index → enrichment payload. We zip positionally instead
    // of by `node.id` because Shopify's response could (rarely) normalize
    // the GID differently from what we sent — `nodes(ids:)` guarantees
    // SAME-ORDER output with nulls for missing.
    const enrichmentByIndex = new Map<number, { imageUrl: string | null; description: string | null }>();

    if (products.length > 0) {
      if (shopifyClient) {
        enrichmentAttempted = true;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gids = products.map((p: any) => gidForProduct(p.shopifyProductId));
          firstGidSent = gids[0] ?? null;
          const result = await shopifyClient.request<{
            nodes: Array<{
              id: string;
              description?: string | null;
              featuredMedia?: MediaImageNode;
              media?: { nodes?: MediaImageNode[] } | null;
            } | null>;
          }>(NODES_QUERY, { ids: gids });
          const nodes = result.nodes ?? [];
          nodesReturned = nodes.filter(Boolean).length;
          firstNodeRaw = nodes[0] ?? null;
          let missingImages = 0;
          nodes.forEach((node, i) => {
            if (!node) return;
            const url = extractImageUrl(node);
            const desc = node.description ?? null;
            if (!url) missingImages += 1;
            if (url) nodesWithImage += 1;
            if (desc && desc.trim()) nodesWithDescription += 1;
            enrichmentByIndex.set(i, { imageUrl: url, description: desc });
          });
          console.log(
            `[api/products] enriched ${nodesReturned} products: ${nodesWithImage} with images, ${nodesWithDescription} with descriptions, ${missingImages} missing images`
          );
        } catch (err) {
          enrichmentError = err instanceof Error ? err.message : String(err);
          console.warn("[api/products] failed to fetch images from Shopify:", err);
        }
      } else {
        enrichmentError = "No Shopify connection — install/reconnect Shopify to enable product images and descriptions.";
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows = products.map((p: any, i: number) => {
        const enrichment = enrichmentByIndex.get(i);
        return {
          id: p.id,
          shopifyProductId: p.shopifyProductId,
          title: p.title,
          handle: p.handle,
          vendor: p.vendor,
          productType: p.productType,
          price: p.price.toString(),
          imageUrl: enrichment?.imageUrl ?? null,
          description: enrichment?.description ?? null,
          source: "db" as const
        };
      });
    }

    // ── Live Shopify fallback ─────────────────────────────────────────
    // Fires whenever local DB has fewer than `limit` rows — covers both:
    //   (a) empty DB (Shopify sync hasn't populated Product table yet)
    //   (b) sparse DB (operator searches for something not synced)
    // When no query is given we just fetch recent products from Shopify;
    // this means the picker always has SOMETHING to show even on a fresh
    // install.
    if (rows.length < limit && shopifyClient) {
      try {
        // Shopify search syntax — when q is empty, just sort by updated.
        // When q is given, search title/vendor/SKU/handle in OR.
        const shopifyQuery = q
          ? `title:*${q}* OR vendor:*${q}* OR sku:*${q}* OR handle:*${q}*`
          : "status:active";
        const result = await shopifyClient.request<{
          products?: {
            edges?: Array<{
              node: {
                id: string;
                title: string;
                handle: string;
                vendor?: string | null;
                productType?: string | null;
                description?: string | null;
                featuredMedia?: MediaImageNode;
                media?: { nodes?: MediaImageNode[] } | null;
                priceRangeV2?: { minVariantPrice?: { amount?: string } };
                variants?: { edges?: Array<{ node: { sku?: string | null } }> };
              };
            }>;
          };
        }>(LIVE_SEARCH_QUERY, { query: shopifyQuery, first: limit });

        const existingGids = new Set(rows.map((r) => gidForProduct(r.shopifyProductId)));
        let liveCount = 0;
        let liveMissingImages = 0;
        for (const edge of result.products?.edges ?? []) {
          const n = edge.node;
          if (existingGids.has(n.id)) continue; // already in DB results
          const imageUrl = extractImageUrl(n);
          if (!imageUrl) liveMissingImages += 1;
          rows.push({
            id: numericIdFromGid(n.id), // synthetic id (we don't have a local row)
            shopifyProductId: numericIdFromGid(n.id),
            title: n.title,
            handle: n.handle,
            vendor: n.vendor ?? null,
            productType: n.productType ?? null,
            price: n.priceRangeV2?.minVariantPrice?.amount ?? "0",
            imageUrl,
            description: n.description ?? null,
            source: "shopify"
          });
          liveCount += 1;
          if (rows.length >= limit) break;
        }
        console.log(`[api/products] Shopify fallback added ${liveCount} rows (${liveMissingImages} without images)`);
      } catch (err) {
        console.warn("[api/products] live Shopify search failed:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      products: rows,
      diagnostics: {
        storeId,
        dbCount: products.length,
        totalReturned: rows.length,
        hasShopifyConnection: hasShopify,
        shopDomain: connection?.shopDomain ?? null,
        // Enrichment outcome — explains "all cards show no image" cases:
        //   - enrichmentError set → Shopify call failed (read message)
        //   - enrichmentAttempted=false → no Shopify creds for this store
        //   - nodesReturned=0 → Shopify silently returned no nodes (token scope?)
        //   - nodesWithImage=0 → call worked but Shopify products genuinely
        //     have no media uploaded (check Products admin)
        enrichment: {
          attempted: enrichmentAttempted,
          error: enrichmentError,
          nodesReturned,
          nodesWithImage,
          nodesWithDescription,
          // Raw first node from Shopify's response — lets us see if Shopify
          // is returning the fields at all, and if their shape matches what
          // we expect (e.g. `featuredImage: null` vs the key being absent).
          firstGidSent,
          firstNodeRaw
        }
      }
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ ok: false, error: toErrorMessage(error) }, { status });
  }
}
