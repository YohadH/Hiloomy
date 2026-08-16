import { getAnalyticsRepository } from "@/lib/repositories";
import type { GrowthFinding, GrowthProductRecommendation } from "@/lib/domain/growth-agent-types";
import { AppError } from "@/lib/server/errors";
import { createShopifyClient } from "@/lib/shopify/client";
import { PRODUCT_CREATE_MUTATION } from "@/lib/shopify/queries/product-create";
import { buildGrowthActionsFromFindings } from "@/lib/services/growth-agent-action-engine";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { getGrowthAgentSettings, getGrowthAgentStoreContext, getGrowthFindings, replaceGrowthFindings, saveGrowthPlatformConnection } from "@/lib/services/growth-agent-service";

interface CrawlCandidate {
  title: string;
  url: string;
  description?: string;
  imageUrl?: string | null;
  price?: number | null;
  supplier?: string | null;
}

function splitList(input: string) {
  return input
    .split(/[\n,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueWords(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length >= 3)));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeUrl(candidateUrl: string, baseUrl: string) {
  try {
    return new URL(candidateUrl, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function titleTokens(title: string) {
  return uniqueWords(title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function extractPrice(text: string) {
  const match = text.match(/[$€£]\s?(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function extractJsonLdCandidates(html: string, sourceUrl: string): CrawlCandidate[] {
  const matches = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const candidates: CrawlCandidate[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const record = node as Record<string, unknown>;
    const nodeType = Array.isArray(record["@type"]) ? String((record["@type"] as unknown[])[0] ?? "") : String(record["@type"] ?? "");
    if (nodeType.toLowerCase().includes("product") && typeof record.name === "string") {
      const offers = Array.isArray(record.offers) ? record.offers[0] : record.offers;
      const offerPrice = offers && typeof offers === "object" ? toNumber((offers as Record<string, unknown>).price) : null;
      const image = Array.isArray(record.image) ? String(record.image[0] ?? "") : typeof record.image === "string" ? record.image : null;
      const brand = record.brand && typeof record.brand === "object" ? String((record.brand as Record<string, unknown>).name ?? "") : typeof record.brand === "string" ? record.brand : null;
      candidates.push({
        title: String(record.name),
        url: normalizeUrl(String(record.url ?? sourceUrl), sourceUrl),
        description: typeof record.description === "string" ? stripHtml(record.description) : undefined,
        imageUrl: image ? normalizeUrl(image, sourceUrl) : null,
        price: offerPrice,
        supplier: brand || null
      });
    }

    Object.values(record).forEach(walk);
  }

  for (const match of matches) {
    try {
      walk(JSON.parse(match[1]));
    } catch {
      // Ignore malformed blocks.
    }
  }

  return candidates;
}

function extractHtmlCandidates(html: string, sourceUrl: string): CrawlCandidate[] {
  const candidates = extractJsonLdCandidates(html, sourceUrl);
  if (candidates.length) return candidates;

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const image = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
  const maybePrice = extractPrice(html);
  const resolvedTitle = decodeHtml(ogTitle ?? title ?? "");

  if (!resolvedTitle) return [];

  return [{
    title: resolvedTitle,
    url: sourceUrl,
    description: description ? decodeHtml(description) : undefined,
    imageUrl: image ? normalizeUrl(image, sourceUrl) : null,
    price: maybePrice,
    supplier: new URL(sourceUrl).hostname.replace(/^www\./, "")
  }];
}

function extractXmlCandidates(xml: string, sourceUrl: string): CrawlCandidate[] {
  const items = Array.from(xml.matchAll(/<(item|entry)>([\s\S]*?)<\/(item|entry)>/gi));
  return items.map(([, , block]) => {
    const title = decodeHtml(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = decodeHtml(block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? sourceUrl);
    const description = decodeHtml(block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "");
    return {
      title,
      url: normalizeUrl(link, sourceUrl),
      description: stripHtml(description),
      price: extractPrice(description),
      supplier: new URL(sourceUrl).hostname.replace(/^www\./, "")
    } satisfies CrawlCandidate;
  }).filter((item) => item.title);
}

function extractJsonCandidates(payload: unknown, sourceUrl: string): CrawlCandidate[] {
  const candidates: CrawlCandidate[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const record = node as Record<string, unknown>;
    const title = typeof record.title === "string"
      ? record.title
      : typeof record.name === "string"
        ? record.name
        : null;
    const link = typeof record.url === "string"
      ? record.url
      : typeof record.link === "string"
        ? record.link
        : typeof record.handle === "string"
          ? `/${record.handle}`
          : null;
    const price = toNumber(record.price)
      ?? toNumber(record.price_min)
      ?? toNumber(record.amount);

    if (title && link) {
      candidates.push({
        title,
        url: normalizeUrl(link, sourceUrl),
        description: typeof record.description === "string" ? stripHtml(record.description) : typeof record.body_html === "string" ? stripHtml(record.body_html) : undefined,
        imageUrl: typeof record.image === "string"
          ? normalizeUrl(record.image, sourceUrl)
          : record.image && typeof record.image === "object" && typeof (record.image as Record<string, unknown>).src === "string"
            ? normalizeUrl(String((record.image as Record<string, unknown>).src), sourceUrl)
            : null,
        price,
        supplier: typeof record.vendor === "string" ? record.vendor : null
      });
    }

    Object.values(record).forEach(walk);
  }

  walk(payload);
  return candidates;
}

async function crawlSource(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": process.env.GROWTH_AGENT_PRODUCT_CRAWLER_USER_AGENT || "ShopifyProfitOpsBot/0.1",
        Accept: "text/html,application/json,application/xml,text/xml;q=0.9,*/*;q=0.8"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Source returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (contentType.includes("application/json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
      return extractJsonCandidates(JSON.parse(body), sourceUrl);
    }

    if (contentType.includes("xml") || body.trim().startsWith("<?xml") || body.includes("<rss") || body.includes("<feed")) {
      return extractXmlCandidates(body, sourceUrl);
    }

    return extractHtmlCandidates(body, sourceUrl);
  } finally {
    clearTimeout(timeout);
  }
}

function scoreCandidate(candidate: CrawlCandidate, storeTitleTokens: Set<string>, keywordHints: string[], averageStorePrice: number | null) {
  const candidateTokens = titleTokens(candidate.title);
  const overlap = candidateTokens.filter((token) => storeTitleTokens.has(token)).length;
  if (overlap >= Math.max(2, Math.ceil(candidateTokens.length * 0.6))) {
    return null;
  }

  const haystack = `${candidate.title} ${candidate.description ?? ""}`.toLowerCase();
  const matchedKeywords = keywordHints.filter((keyword) => haystack.includes(keyword));
  const priceFit = candidate.price && averageStorePrice
    ? Math.max(0, 20 - Math.min(20, Math.abs(candidate.price - averageStorePrice)))
    : 8;
  const descriptiveScore = Math.min(18, (candidate.description?.length ?? 0) / 12);
  const score = 35 + matchedKeywords.length * 18 + priceFit + descriptiveScore - overlap * 12;

  return {
    score,
    matchedKeywords
  };
}

export async function getGrowthAgentProductRecommendations(storeId?: string): Promise<GrowthProductRecommendation[]> {
  const { store } = await getGrowthAgentStoreContext(storeId);
  const settings = await getGrowthAgentSettings(store.id);
  if (!settings.productResearch.enabled) return [];

  const configuredUrls = settings.productResearch.sourceUrls.trim() || process.env.GROWTH_AGENT_PRODUCT_CRAWLER_DEFAULT_URLS || "";
  const sourceUrls = Array.from(new Set(configuredUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))).slice(0, 8);
  if (!sourceUrls.length) return [];

  const repository = await getAnalyticsRepository();
  const storeProducts = await repository.getProducts(store.id);
  const storeTitleTokens = new Set(storeProducts.flatMap((product) => titleTokens(product.title)));
  const averageStorePrice = storeProducts.length
    ? storeProducts.reduce((sum, product) => sum + Number(product.price ?? 0), 0) / storeProducts.length
    : null;
  const keywordHints = uniqueWords([
    ...splitList(settings.productResearch.nicheKeywords),
    ...storeProducts.flatMap((product) => splitList(`${product.collection},${product.productType ?? ""},${product.vendor ?? ""}`))
  ]);

  const crawled = await Promise.all(sourceUrls.map(async (sourceUrl) => {
    try {
      return await crawlSource(sourceUrl);
    } catch {
      return [] as CrawlCandidate[];
    }
  }));

  const rawRecommendations: GrowthProductRecommendation[] = [];
  for (const candidate of crawled.flat()) {
    const scored = scoreCandidate(candidate, storeTitleTokens, keywordHints, averageStorePrice);
    if (!scored) continue;
    const sourceDomain = new URL(candidate.url).hostname.replace(/^www\./, "");
    rawRecommendations.push({
      id: `product-rec-${slug(candidate.title)}-${slug(sourceDomain)}`,
      title: candidate.title,
      sourceUrl: candidate.url,
      sourceDomain,
      supplier: candidate.supplier ?? sourceDomain,
      imageUrl: candidate.imageUrl ?? null,
      price: candidate.price ?? null,
      score: Math.round(scored.score),
      summary: candidate.description?.slice(0, 180) || `Potential match from ${sourceDomain} based on your current store catalog and keywords.`,
      matchedKeywords: scored.matchedKeywords
    });
  }

  const recommendations = rawRecommendations
    .sort((left, right) => right.score - left.score)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.title.toLowerCase() === item.title.toLowerCase()) === index)
    .slice(0, Math.max(1, Math.min(12, settings.productResearch.maxRecommendations)));

  const connectionStatus = recommendations.length ? "connected" : sourceUrls.length ? "degraded" : "stub";
  const healthMessage = recommendations.length
    ? `Crawler checked ${sourceUrls.length} source${sourceUrls.length === 1 ? "" : "s"} and found ${recommendations.length} candidate product${recommendations.length === 1 ? "" : "s"}.`
    : sourceUrls.length
      ? "Crawler ran but did not find enough product candidates from the configured sources."
      : "Add supplier, catalog, or product-listing URLs to enable product discovery.";

  await saveGrowthPlatformConnection({
    platform: "productCrawler",
    status: connectionStatus,
    healthMessage,
    lastSyncAt: new Date().toISOString(),
    config: {
      sourceCount: sourceUrls.length,
      maxRecommendations: settings.productResearch.maxRecommendations,
      keywordCount: keywordHints.length
    }
  }, store.id);

  return recommendations;
}

function recommendationToFinding(recommendation: GrowthProductRecommendation): GrowthFinding {
  return {
    id: `finding-product-${recommendation.id}`,
    findingType: "product_opportunity",
    severity: "info",
    metricName: recommendation.title,
    summary: `Potential product opportunity found: ${recommendation.title}.`,
    possibleCauses: [
      `Matched source: ${recommendation.sourceDomain}`,
      recommendation.price ? `Observed price point: ${recommendation.price}` : "No public price detected"
    ],
    recommendedActions: [
      `Review supplier page: ${recommendation.sourceUrl}`,
      recommendation.matchedKeywords.length ? `Matched keywords: ${recommendation.matchedKeywords.join(", ")}` : "Compare this product against your current catalog positioning"
    ],
    confidenceScore: Math.min(0.96, Math.max(0.61, recommendation.score / 100)),
    timestamp: new Date().toISOString(),
    sourceData: {
      recommendation,
      sourceUrl: recommendation.sourceUrl,
      sourceDomain: recommendation.sourceDomain
    }
  };
}

function buildDraftProductInput(recommendation: GrowthProductRecommendation) {
  const tags = Array.from(new Set([
    "growth-agent",
    "crawler-import",
    recommendation.sourceDomain,
    ...recommendation.matchedKeywords.slice(0, 5)
  ].map((value) => value.trim()).filter(Boolean)));

  const descriptionParts = [
    `<p>${escapeHtml(recommendation.summary)}</p>`,
    recommendation.price ? `<p><strong>Observed source price:</strong> ${escapeHtml(String(recommendation.price))}</p>` : "",
    `<p><strong>Source URL:</strong> <a href="${escapeHtml(recommendation.sourceUrl)}">${escapeHtml(recommendation.sourceUrl)}</a></p>`,
    recommendation.matchedKeywords.length ? `<p><strong>Matched keywords:</strong> ${escapeHtml(recommendation.matchedKeywords.join(", "))}</p>` : ""
  ].filter(Boolean);

  return {
    title: recommendation.title,
    descriptionHtml: descriptionParts.join(""),
    vendor: recommendation.supplier || recommendation.sourceDomain,
    productType: recommendation.matchedKeywords[0] || "Imported recommendation",
    status: "DRAFT",
    tags
  };
}

export async function importGrowthAgentRecommendationToShopify(
  recommendation: GrowthProductRecommendation,
  storeId?: string
) {
  const { store } = await getGrowthAgentStoreContext(storeId);
  const credentials = await getStoredShopifyCredentials(store.id);
  const client = createShopifyClient(credentials);
  const payload = await client.request<{
    productCreate: {
      product: { id: string; title: string; status: string } | null;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(PRODUCT_CREATE_MUTATION, {
    product: buildDraftProductInput(recommendation)
  });

  const userErrors = payload.productCreate.userErrors ?? [];
  if (userErrors.length || !payload.productCreate.product) {
    throw new AppError(userErrors.map((item) => item.message).join("; ") || "Shopify did not create the draft product.", 400, userErrors);
  }

  return {
    ok: true,
    storeId: store.id,
    shopDomain: credentials.shopDomain,
    productId: payload.productCreate.product.id,
    title: payload.productCreate.product.title,
    status: payload.productCreate.product.status
  };
}

export async function runGrowthAgentProductRecommendationScan(storeId?: string) {
  const { store } = await getGrowthAgentStoreContext(storeId);
  const recommendations = await getGrowthAgentProductRecommendations(store.id);
  const existingFindings = await getGrowthFindings(store.id);
  const preservedFindings = existingFindings.filter((finding) => finding.findingType !== "product_opportunity");
  const productFindings = recommendations.map(recommendationToFinding);

  await replaceGrowthFindings([...preservedFindings, ...productFindings], store.id);
  const actions = await buildGrowthActionsFromFindings(productFindings, store.id);

  return {
    ok: true,
    storeId: store.id,
    recommendationCount: recommendations.length,
    findingsCount: productFindings.length,
    actionsCreated: actions.length,
    recommendations,
    scannedAt: new Date().toISOString()
  };
}

