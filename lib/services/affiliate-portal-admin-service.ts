import { getDb } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import {
  buildAffiliateTrackingMethod,
  extractTrackingNoteAttribute,
  extractTrackingQueryValue,
  resolveAffiliateSourcePlatform,
  safeTrackingString
} from "@/lib/services/affiliate-attribution-source";
import { resolveOrCreateBaseStore } from "@/lib/services/creator-admin-service";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { createShopifyClient } from "@/lib/shopify/client";
import { DISCOUNT_CODE_BASIC_CREATE_MUTATION } from "@/lib/shopify/queries/discounts";

const DEFAULT_PROGRAM_NAME = "Affiliate Program";
const DEFAULT_COMMISSION_RATE = 0.1;
const MAX_DUPLICATE_RETRIES = 5;
const MAX_COUPON_CODE_LENGTH = 200;
const DISCOUNT_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-01";

type DiscountType = "percent" | "fixed";
type AssignmentMode = "single" | "bulk";
type DiscountCreationMode = "create" | "existing";
type PurchaseType = "both" | "one_time" | "subscription";
type AppliesToType = "all" | "products" | "collections";
type MinimumRequirementType = "none" | "subtotal" | "quantity";
type CustomerEligibilityType = "all" | "segments";

type CombinationRules = {
  productDiscounts?: boolean;
  orderDiscounts?: boolean;
  shippingDiscounts?: boolean;
};

type CouponInput = {
  storeId?: string;
  affiliateId: string;
  code: string;
  title: string;
  discountType: DiscountType;
  value: number;
  appliesOncePerCustomer?: boolean;
  redirectPath?: string;
  assignmentMode?: AssignmentMode;
  creationMode?: DiscountCreationMode;
  purchaseType?: PurchaseType;
  appliesToType?: AppliesToType;
  appliesToProductIds?: string[];
  appliesToCollectionIds?: string[];
  minimumRequirementType?: MinimumRequirementType;
  minimumSubtotal?: number | null;
  minimumQuantity?: number | null;
  customerEligibilityType?: CustomerEligibilityType;
  customerSegmentIds?: string[];
  usageLimit?: number | null;
  combinesWith?: CombinationRules;
};

type BulkCouponInput = {
  storeId?: string;
  affiliateIds: string[];
  title: string;
  codePrefix?: string;
  codeSuffix?: string;
  discountType: DiscountType;
  value: number;
  appliesOncePerCustomer?: boolean;
  redirectPath?: string;
  purchaseType?: PurchaseType;
  appliesToType?: AppliesToType;
  appliesToProductIds?: string[];
  appliesToCollectionIds?: string[];
  minimumRequirementType?: MinimumRequirementType;
  minimumSubtotal?: number | null;
  minimumQuantity?: number | null;
  customerEligibilityType?: CustomerEligibilityType;
  customerSegmentIds?: string[];
  usageLimit?: number | null;
  combinesWith?: CombinationRules;
};

type CouponAdminContext = Awaited<ReturnType<typeof getCouponAdminContext>>;

const COUPON_ASSIGNMENT_OPTIONS_QUERY = /* GraphQL */ `
  query CouponAssignmentOptions {
    collections(first: 50) {
      nodes {
        id
        title
      }
    }
    segments(first: 50, query: "") {
      nodes {
        id
        name
      }
    }
  }
`;

async function getStoreOrThrow(storeId?: string) {
  const db = getDb();
  if (!db) throw new AppError("Database client is not available.", 500);

  const store = storeId
    ? await db.store.findUnique({ where: { id: storeId } })
    : await resolveOrCreateBaseStore();

  if (!store) throw new AppError("Store was not found.", 404);
  return { db, store };
}

function sanitizeCouponCodeSegment(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeCouponCode(value: string) {
  const normalized = sanitizeCouponCodeSegment(value);
  if (!normalized) throw new AppError("Coupon code is required.", 400);
  return normalized.slice(0, MAX_COUPON_CODE_LENGTH);
}

function buildRetryCouponCode(baseCode: string) {
  const suffix = `${Math.floor(1000 + Math.random() * 9000)}`;
  const budget = Math.max(1, MAX_COUPON_CODE_LENGTH - suffix.length - 1);
  return `${baseCode.slice(0, budget)}-${suffix}`;
}

function buildBulkCouponCode(
  affiliate: { affiliateCode: string; firstName: string; lastName: string },
  input: BulkCouponInput
) {
  const prefix = sanitizeCouponCodeSegment(input.codePrefix ?? "");
  const suffix = sanitizeCouponCodeSegment(input.codeSuffix ?? "");
  const core = sanitizeCouponCodeSegment(
    affiliate.affiliateCode || `${affiliate.firstName}${affiliate.lastName}`
  );

  return normalizeCouponCode(
    [prefix, core, suffix].filter(Boolean).join("-") || `${core}-${Math.round(input.value)}`
  );
}

function isDuplicateCouponError(messages: string[]) {
  return messages.some((message) => /code/i.test(message) && /(already|exists|taken|duplicate)/i.test(message));
}

function normalizeDiscountValue(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError("Discount value must be greater than zero.", 400);
  }
  return numeric;
}

function normalizeOptionalPositiveInt(value: number | null | undefined) {
  if (value == null) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError("Usage limits and minimum quantities must be greater than zero.", 400);
  }
  return Math.floor(numeric);
}

function normalizeOptionalPositiveNumber(value: number | null | undefined, label: string) {
  if (value == null) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError(`${label} must be greater than zero.`, 400);
  }
  return numeric;
}

function normalizeTitle(value: string, fallbackCode: string) {
  const trimmed = value.trim();
  return trimmed || fallbackCode;
}

function normalizeIdList(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeRedirectTarget(redirectPath?: string) {
  const trimmed = redirectPath?.trim() ?? "";
  if (!trimmed) return "/";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildApplyLink(storeDomain: string, code: string, affiliateCode: string, redirectPath?: string) {
  const redirect = normalizeRedirectTarget(redirectPath);
  return `https://${storeDomain}/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(
    redirect
  )}&ref=${encodeURIComponent(affiliateCode)}`;
}

async function getCouponAdminContext(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);
  await ensureAffiliateProgramSeed(store.id);

  if (!db.affiliateMember || !db.affiliateCoupon) {
    throw new AppError("Affiliate tables are not ready. Run Prisma generate and db push first.", 500);
  }

  const credentials = await getStoredShopifyCredentials(store.id);
  const client = createShopifyClient({
    ...credentials,
    apiVersion: DISCOUNT_API_VERSION
  });

  return { db, store, client };
}

async function resolveAffiliateOrThrow(context: CouponAdminContext, affiliateId: string) {
  // Scope to the context's store — an affiliateId from another tenant must
  // read as "not found", not attach coupons across stores.
  const affiliate = await context.db.affiliateMember.findFirst({
    where: { id: affiliateId, storeId: context.store.id }
  });
  if (!affiliate) throw new AppError("Affiliate was not found.", 404);
  return affiliate;
}

function buildDiscountValuePayload(input: Pick<CouponInput, "discountType" | "value">) {
  return input.discountType === "percent"
    ? { percentage: Math.max(0.0001, Math.min(1, input.value / 100)) }
    : { discountAmount: { amount: input.value, appliesOnEachItem: false } };
}

function buildDiscountItemsPayload(input: Pick<CouponInput, "appliesToType" | "appliesToProductIds" | "appliesToCollectionIds">) {
  const appliesToType = input.appliesToType ?? "all";
  const productIds = normalizeIdList(input.appliesToProductIds);
  const collectionIds = normalizeIdList(input.appliesToCollectionIds);

  if (appliesToType === "products") {
    if (!productIds.length) {
      throw new AppError("Choose at least one product when the discount applies to specific products.", 400);
    }
    return {
      products: {
        productsToAdd: productIds
      }
    };
  }

  if (appliesToType === "collections") {
    if (!collectionIds.length) {
      throw new AppError("Choose at least one collection when the discount applies to specific collections.", 400);
    }
    return {
      collections: {
        add: collectionIds
      }
    };
  }

  return { all: true };
}

function buildMinimumRequirementPayload(
  input: Pick<CouponInput, "minimumRequirementType" | "minimumSubtotal" | "minimumQuantity">
) {
  const minimumRequirementType = input.minimumRequirementType ?? "none";

  if (minimumRequirementType === "subtotal") {
    const subtotal = normalizeOptionalPositiveNumber(input.minimumSubtotal, "Minimum subtotal");
    if (!subtotal) {
      throw new AppError("Enter a minimum subtotal amount.", 400);
    }
    return {
      subtotal: {
        greaterThanOrEqualToSubtotal: subtotal
      }
    };
  }

  if (minimumRequirementType === "quantity") {
    const quantity = normalizeOptionalPositiveInt(input.minimumQuantity);
    if (!quantity) {
      throw new AppError("Enter a minimum quantity.", 400);
    }
    return {
      quantity: {
        greaterThanOrEqualToQuantity: quantity
      }
    };
  }

  return undefined;
}

function buildContextPayload(input: Pick<CouponInput, "customerEligibilityType" | "customerSegmentIds">) {
  const customerEligibilityType = input.customerEligibilityType ?? "all";

  if (customerEligibilityType === "segments") {
    const segmentIds = normalizeIdList(input.customerSegmentIds);
    if (!segmentIds.length) {
      throw new AppError("Choose at least one customer segment.", 400);
    }
    return {
      customerSegments: {
        add: segmentIds
      }
    };
  }

  return {
    all: "ALL"
  };
}

function buildCustomerGetsPayload(input: CouponInput) {
  const purchaseType = input.purchaseType ?? "both";
  return {
    value: buildDiscountValuePayload(input),
    items: buildDiscountItemsPayload(input),
    appliesOnOneTimePurchase: purchaseType !== "subscription",
    appliesOnSubscription: purchaseType !== "one_time"
  };
}

function buildCombinesWithPayload(input: CombinationRules | undefined) {
  return {
    productDiscounts: Boolean(input?.productDiscounts),
    orderDiscounts: Boolean(input?.orderDiscounts),
    shippingDiscounts: Boolean(input?.shippingDiscounts)
  };
}

async function createShopifyDiscountWithRetry(
  context: CouponAdminContext,
  input: CouponInput
) {
  let nextCode = normalizeCouponCode(input.code);

  for (let attempt = 0; attempt < MAX_DUPLICATE_RETRIES; attempt += 1) {
    const result = await context.client.request<{
      discountCodeBasicCreate: {
        codeDiscountNode?: {
          id: string;
          codeDiscount?: {
            title?: string;
            status?: string;
            shareableUrls?: { url: string }[];
            codes?: { nodes?: { code: string }[] };
          };
        };
        userErrors: { message: string }[];
      };
    }>(DISCOUNT_CODE_BASIC_CREATE_MUTATION, {
      basicCodeDiscount: {
        title: normalizeTitle(input.title, nextCode),
        code: nextCode,
        startsAt: new Date().toISOString(),
        appliesOncePerCustomer: input.appliesOncePerCustomer ?? false,
        usageLimit: normalizeOptionalPositiveInt(input.usageLimit) ?? null,
        combinesWith: buildCombinesWithPayload(input.combinesWith),
        minimumRequirement: buildMinimumRequirementPayload(input) ?? null,
        context: buildContextPayload(input),
        customerGets: buildCustomerGetsPayload(input)
      }
    });

    const userErrors = result.discountCodeBasicCreate.userErrors ?? [];
    if (!userErrors.length) {
      const discountNode = result.discountCodeBasicCreate.codeDiscountNode;
      const createdCode = discountNode?.codeDiscount?.codes?.nodes?.[0]?.code ?? nextCode;
      const shareableUrl = discountNode?.codeDiscount?.shareableUrls?.[0]?.url ?? null;

      return { createdCode, discountNode, shareableUrl };
    }

    const messages = userErrors.map((item) => item.message);
    if (attempt < MAX_DUPLICATE_RETRIES - 1 && isDuplicateCouponError(messages)) {
      nextCode = buildRetryCouponCode(normalizeCouponCode(input.code));
      continue;
    }

    throw new AppError(messages.join("; "), 400);
  }

  throw new AppError("Coupon creation failed after multiple retry attempts.", 400);
}

async function syncAffiliateCurrentCoupon(context: CouponAdminContext, affiliateId: string) {
  const latestCoupon = await context.db.affiliateCoupon.findFirst({
    where: { storeId: context.store.id, affiliateMemberId: affiliateId, status: "active" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  await context.db.affiliateMember.update({
    where: { id: affiliateId },
    data: { couponCode: latestCoupon?.code ?? null }
  });
}

async function persistCouponAssignment(
  context: CouponAdminContext,
  affiliate: any,
  input: CouponInput,
  createdCode: string,
  applyLink: string,
  connectionSource: "shopify_create" | "existing_coupon",
  shopifyDiscountId?: string | null
) {
  const existingCoupon = await context.db.affiliateCoupon.findUnique({
    where: { storeId_code: { storeId: context.store.id, code: createdCode } }
  });
  const previousAffiliateId = existingCoupon?.affiliateMemberId ?? null;

  const title = normalizeTitle(input.title, createdCode);
  const normalizedValue =
    connectionSource === "existing_coupon"
      ? Number.isFinite(Number(input.value)) ? Number(input.value) : 0
      : normalizeDiscountValue(input.value);

  const coupon = await context.db.affiliateCoupon.upsert({
    where: { storeId_code: { storeId: context.store.id, code: createdCode } },
    update: {
      affiliateMemberId: affiliate.id,
      shopifyDiscountId: shopifyDiscountId ?? null,
      title,
      discountType: input.discountType,
      discountValue: normalizedValue,
      appliesOncePerCustomer: input.appliesOncePerCustomer ?? false,
      applyLink,
      status: "active"
    },
    create: {
      storeId: context.store.id,
      affiliateMemberId: affiliate.id,
      shopifyDiscountId: shopifyDiscountId ?? null,
      title,
      code: createdCode,
      discountType: input.discountType,
      discountValue: normalizedValue,
      appliesOncePerCustomer: input.appliesOncePerCustomer ?? false,
      applyLink,
      status: "active"
    }
  });

  if (context.db.affiliateCouponAssignment) {
    await context.db.affiliateCouponAssignment.create({
      data: {
        storeId: context.store.id,
        affiliateMemberId: affiliate.id,
        affiliateCouponId: coupon.id,
        couponCode: createdCode,
        couponTitle: title,
        discountType: input.discountType,
        discountValue: normalizedValue,
        applyLink,
        assignmentMode: input.assignmentMode ?? "single",
        connectionSource
      }
    });
  }

  if (previousAffiliateId && previousAffiliateId !== affiliate.id) {
    await syncAffiliateCurrentCoupon(context, previousAffiliateId);
  }
  await syncAffiliateCurrentCoupon(context, affiliate.id);

  return coupon;
}

async function createAffiliateCouponWithContext(
  context: CouponAdminContext,
  input: CouponInput,
  preloadedAffiliate?: any
) {
  const affiliate = preloadedAffiliate ?? (await resolveAffiliateOrThrow(context, input.affiliateId));
  const { createdCode, discountNode } = await createShopifyDiscountWithRetry(context, input);
  const applyLink = buildApplyLink(context.store.domain, createdCode, affiliate.affiliateCode, input.redirectPath);
  const coupon = await persistCouponAssignment(
    context,
    affiliate,
    input,
    createdCode,
    applyLink,
    "shopify_create",
    discountNode?.id ?? null
  );

  return {
    ok: true,
    couponId: coupon.id,
    affiliateId: affiliate.id,
    affiliateName: `${affiliate.firstName} ${affiliate.lastName}`,
    code: createdCode,
    applyLink,
    shopifyDiscountId: discountNode?.id ?? null
  };
}

async function attachExistingAffiliateCouponWithContext(
  context: CouponAdminContext,
  input: CouponInput
) {
  const affiliate = await resolveAffiliateOrThrow(context, input.affiliateId);
  const createdCode = normalizeCouponCode(input.code);
  const applyLink = buildApplyLink(context.store.domain, createdCode, affiliate.affiliateCode, input.redirectPath);
  const coupon = await persistCouponAssignment(
    context,
    affiliate,
    {
      ...input,
      title: normalizeTitle(input.title, createdCode)
    },
    createdCode,
    applyLink,
    "existing_coupon",
    null
  );

  return {
    ok: true,
    couponId: coupon.id,
    affiliateId: affiliate.id,
    affiliateName: `${affiliate.firstName} ${affiliate.lastName}`,
    code: createdCode,
    applyLink,
    shopifyDiscountId: null
  };
}

function normalizeSingleCouponInput(input: CouponInput): CouponInput {
  const creationMode = input.creationMode ?? "create";
  const code = normalizeCouponCode(input.code);
  const title = normalizeTitle(input.title, code);

  return {
    ...input,
    creationMode,
    code,
    title,
    value: creationMode === "existing" ? Number(input.value ?? 0) : normalizeDiscountValue(input.value),
    discountType: input.discountType === "fixed" ? "fixed" : "percent",
    purchaseType: input.purchaseType ?? "both",
    appliesToType: input.appliesToType ?? "all",
    minimumRequirementType: input.minimumRequirementType ?? "none",
    customerEligibilityType: input.customerEligibilityType ?? "all"
  };
}

function normalizeBulkCouponInput(input: BulkCouponInput) {
  const title = input.title.trim();
  if (!title) {
    throw new AppError("Discount title is required.", 400);
  }

  const discountType: DiscountType = input.discountType === "fixed" ? "fixed" : "percent";

  return {
    ...input,
    title,
    value: normalizeDiscountValue(input.value),
    discountType,
    purchaseType: input.purchaseType ?? "both",
    appliesToType: input.appliesToType ?? "all",
    minimumRequirementType: input.minimumRequirementType ?? "none",
    customerEligibilityType: input.customerEligibilityType ?? "all"
  };
}

export async function getAffiliateCouponBuilderOptions(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);

  const products = db.product
    ? await db.product.findMany({
        where: { storeId: store.id },
        select: { shopifyProductId: true, title: true },
        orderBy: { title: "asc" },
        take: 250
      }).catch(() => [])
    : [];

  let collections: Array<{ id: string; title: string }> = [];
  let customerSegments: Array<{ id: string; name: string }> = [];

  try {
    const credentials = await getStoredShopifyCredentials(store.id);
    const client = createShopifyClient({
      ...credentials,
      apiVersion: DISCOUNT_API_VERSION
    });

    const result = await client.request<{
      collections?: { nodes?: Array<{ id: string; title: string }> };
      segments?: { nodes?: Array<{ id: string; name: string }> };
    }>(COUPON_ASSIGNMENT_OPTIONS_QUERY);

    collections = result.collections?.nodes ?? [];
    customerSegments = result.segments?.nodes ?? [];
  } catch {
    // Keep the page usable even if optional Shopify lookups fail.
  }

  return {
    products: products.map((product: any) => ({
      id: `gid://shopify/Product/${product.shopifyProductId}`,
      title: product.title
    })),
    collections,
    customerSegments
  };
}

export async function ensureAffiliateProgramSeed(storeId?: string) {
  const { db, store } = await getStoreOrThrow(storeId);

  if (db.affiliateProgram) {
    await db.affiliateProgram.upsert({
      where: { id: `${store.id}-default-program` },
      // Ensure-exists ONLY. This runs on every coupon action and every cron
      // tick — resetting name/status/commissionRate here silently reverted
      // merchant edits to the program.
      update: {},
      create: {
        id: `${store.id}-default-program`,
        storeId: store.id,
        name: DEFAULT_PROGRAM_NAME,
        status: "active",
        commissionRate: DEFAULT_COMMISSION_RATE,
        signUpLink: `https://${store.domain}/pages/affiliate-signup`
      }
    });
  }

  return { ok: true, storeId: store.id };
}

export async function createAffiliateCouponInShopify(input: CouponInput) {
  const context = await getCouponAdminContext(input.storeId);
  const normalized = normalizeSingleCouponInput(input);

  if (normalized.creationMode === "existing") {
    return attachExistingAffiliateCouponWithContext(context, normalized);
  }

  return createAffiliateCouponWithContext(context, {
    ...normalized,
    assignmentMode: normalized.assignmentMode ?? "single"
  });
}

export async function createAffiliateCouponsInBulk(input: BulkCouponInput) {
  const affiliateIds = Array.from(new Set(input.affiliateIds.filter(Boolean)));
  if (!affiliateIds.length) {
    throw new AppError("Select at least one affiliate for bulk assignment.", 400);
  }

  const normalized = normalizeBulkCouponInput(input);
  const context = await getCouponAdminContext(input.storeId);
  const affiliates = await context.db.affiliateMember.findMany({
    where: { storeId: context.store.id, id: { in: affiliateIds } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
  });

  if (!affiliates.length) {
    throw new AppError("No matching affiliates were found for bulk assignment.", 404);
  }

  const coupons = [];
  for (const affiliate of affiliates) {
    const code = buildBulkCouponCode(affiliate, normalized);
    const result = await createAffiliateCouponWithContext(
      context,
      {
        storeId: context.store.id,
        affiliateId: affiliate.id,
        code,
        title: normalized.title,
        discountType: normalized.discountType,
        value: normalized.value,
        appliesOncePerCustomer: normalized.appliesOncePerCustomer,
        redirectPath: normalized.redirectPath,
        assignmentMode: "bulk",
        creationMode: "create",
        purchaseType: normalized.purchaseType,
        appliesToType: normalized.appliesToType,
        appliesToProductIds: normalized.appliesToProductIds,
        appliesToCollectionIds: normalized.appliesToCollectionIds,
        minimumRequirementType: normalized.minimumRequirementType,
        minimumSubtotal: normalized.minimumSubtotal,
        minimumQuantity: normalized.minimumQuantity,
        customerEligibilityType: normalized.customerEligibilityType,
        customerSegmentIds: normalized.customerSegmentIds,
        usageLimit: normalized.usageLimit,
        combinesWith: normalized.combinesWith
      },
      affiliate
    );
    coupons.push(result);
  }

  return {
    ok: true,
    assignedCount: coupons.length,
    coupons
  };
}

// Pure matcher for the attribution backfill. EXACT matches only — substring
// matching ("ANA" inside "BANANA10") attributed unrelated store-wide promos
// to affiliates, and this heuristic runs unattended on the cron.
// `orderCodes` must already be uppercased.
export function matchAffiliateMemberForOrder(input: {
  members: any[];
  coupons: any[];
  orderCodes: string[];
  refCode?: string | null;
}) {
  const { members, coupons, orderCodes, refCode } = input;
  return (
    members.find((member: any) => {
      const memberCode = member.couponCode?.toUpperCase();
      const affiliateCode = member.affiliateCode?.toUpperCase();
      const couponMatch = memberCode && orderCodes.includes(memberCode);
      const couponTableMatch = coupons.some(
        (coupon: any) =>
          coupon.affiliateMemberId === member.id &&
          orderCodes.includes(String(coupon.code).toUpperCase())
      );
      const affiliateCodeMatch = affiliateCode && orderCodes.includes(affiliateCode);
      const refCodeMatch = affiliateCode && refCode && affiliateCode === String(refCode).toUpperCase();
      return couponMatch || couponTableMatch || affiliateCodeMatch || refCodeMatch;
    }) ?? null
  );
}

export async function syncAffiliateAttributionFromOrders(
  storeId?: string,
  options?: { since?: Date }
) {
  const { db, store } = await getStoreOrThrow(storeId);
  await ensureAffiliateProgramSeed(store.id);

  if (!db.affiliateMember || !db.order || !db.affiliateAttribution) {
    throw new AppError("Affiliate tables are not ready. Run Prisma generate and db push first.", 500);
  }

  // Most stores have zero affiliates — skip the expensive order/webhook
  // scan entirely instead of loading the whole order table for nothing.
  const memberCount = await db.affiliateMember.count({ where: { storeId: store.id } });
  if (memberCount === 0) {
    return { ok: true, syncedOrders: 0, affiliatesMatched: 0 };
  }

  const [members, coupons, orders] = await Promise.all([
    db.affiliateMember.findMany({ where: { storeId: store.id }, include: { program: true } }),
    db.affiliateCoupon.findMany({ where: { storeId: store.id } }).catch(() => []),
    db.order.findMany({
      where: {
        storeId: store.id,
        // Cancelled orders must not accrue commission.
        cancelledAt: null,
        ...(options?.since ? { createdAt: { gte: options.since } } : {})
      },
      include: { discountUsages: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const webhookRows = db.webhookEvent
    ? await db.webhookEvent.findMany({
        where: {
          storeId: store.id,
          platform: "shopify",
          externalId: { in: orders.map((order: any) => order.shopifyOrderId) }
        },
        select: { externalId: true, payload: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      }).catch(() => [])
    : [];

  // Rows that already exist (webhook, BixGrow, manual entry) carry better
  // commission data than this heuristic backfill — never overwrite them.
  const existingPairs = new Set<string>();
  {
    const rows = (await db.affiliateAttribution.findMany({
      where: { storeId: store.id },
      select: { affiliateMemberId: true, orderId: true }
    })) as Array<{ affiliateMemberId: string; orderId: string | null }>;
    for (const row of rows) {
      if (row.orderId) existingPairs.add(`${row.affiliateMemberId}:${row.orderId}`);
    }
  }
  const webhookByOrderId = new Map<string, any>();
  for (const webhook of webhookRows as any[]) {
    if (webhook.externalId && !webhookByOrderId.has(webhook.externalId)) {
      webhookByOrderId.set(webhook.externalId, webhook);
    }
  }

  let synced = 0;

  for (const order of orders) {
    const orderCodes = (order.discountUsages ?? [])
      .map((item: any) => item.code?.toUpperCase())
      .filter(Boolean);
    const webhookPayload = webhookByOrderId.get(order.shopifyOrderId)?.payload ?? null;
    const landingSite = safeTrackingString(webhookPayload?.landing_site);
    const referringSite = safeTrackingString(webhookPayload?.referring_site);
    const bgRefCode = extractTrackingNoteAttribute(webhookPayload, "bg_ref")
      ?? extractTrackingQueryValue(landingSite, "bg_ref")
      ?? extractTrackingQueryValue(referringSite, "bg_ref");
    const refCode = extractTrackingNoteAttribute(webhookPayload, "ref")
      ?? bgRefCode
      ?? extractTrackingQueryValue(landingSite, "ref")
      ?? extractTrackingQueryValue(referringSite, "ref");
    const sourcePlatform = resolveAffiliateSourcePlatform({
      landingSite,
      referringSite,
      bgRefCode
    });

    const matchedMember = matchAffiliateMemberForOrder({ members, coupons, orderCodes, refCode });

    if (!matchedMember) continue;
    if (existingPairs.has(`${matchedMember.id}:${order.id}`)) continue;

    const commissionRate = Number(
      matchedMember.commissionRateOverride
        ?? matchedMember.program?.commissionRate
        ?? DEFAULT_COMMISSION_RATE
    );
    const commissionAmount = Number(order.totalPrice) * commissionRate;
    const hasLinkSignal = Boolean(refCode || sourcePlatform === "bixgrow");
    const trackingMethod = buildAffiliateTrackingMethod({
      hasClickSignal: hasLinkSignal,
      hasCouponSignal: orderCodes.length > 0,
      sourcePlatform
    });
    const sourceType = hasLinkSignal ? "link" : "coupon";
    const sourceUrl = landingSite ?? referringSite ?? null;

    await db.affiliateAttribution.create({
      data: {
        storeId: store.id,
        affiliateMemberId: matchedMember.id,
        orderId: order.id,
        sourceType,
        trackingMethod,
        sourceUrl,
        salesAmount: order.totalPrice,
        commissionAmount,
        ordersCount: 1,
        occurredAt: order.createdAt
      }
    });
    existingPairs.add(`${matchedMember.id}:${order.id}`);

    synced += 1;
  }

  const attributionRows = await db.affiliateAttribution.findMany({ where: { storeId: store.id } });

  for (const member of members) {
    const memberRows = attributionRows.filter((row: any) => row.affiliateMemberId === member.id);
    const salesTotal = memberRows.reduce((sum: number, row: any) => sum + Number(row.salesAmount ?? 0), 0);
    const commissionTotal = memberRows.reduce((sum: number, row: any) => sum + Number(row.commissionAmount ?? 0), 0);
    const ordersTotal = memberRows.reduce((sum: number, row: any) => sum + Number(row.ordersCount ?? 0), 0);
    // approvedBalance = money still owed. Paid/cancelled/refunded rows must
    // not resurrect into the balance (commissionTotal stays lifetime).
    const approvedBalance = memberRows
      .filter((row: any) => row.payoutStatus === "unpaid" || row.payoutStatus === "approved")
      .reduce((sum: number, row: any) => sum + Number(row.commissionAmount ?? 0), 0);

    await db.affiliateMember.update({
      where: { id: member.id },
      data: {
        salesTotal,
        commissionTotal,
        approvedBalance,
        ordersTotal
      }
    });
  }

  return {
    ok: true,
    syncedOrders: synced,
    affiliatesMatched: new Set(attributionRows.map((row: any) => row.affiliateMemberId)).size
  };
}
