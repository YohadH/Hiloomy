import { AppError } from "@/lib/server/errors";
import { getStoredShopifyCredentials } from "@/lib/services/shopify-connection-service";
import { createShopifyClient } from "@/lib/shopify/client";
import { ACTIVE_CODE_DISCOUNTS_QUERY, DISCOUNT_CODE_BASIC_CREATE_MUTATION } from "@/lib/shopify/queries/discounts";

type CombinePolicy = {
  productDiscounts: boolean;
  orderDiscounts: boolean;
  shippingDiscounts: boolean;
};

type DiscountValueType = "percent" | "fixed";

export interface ShopifyPlannerDiscountRule {
  id: string;
  type: "basic" | "bxgy" | "free_shipping" | "unknown";
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  summary: string;
  appliesOncePerCustomer: boolean;
  usageLimit: number | null;
  usageCount: number;
  combinePolicy: CombinePolicy;
  codes: string[];
}

export interface CreateMarketingPlannerDiscountInput {
  storeId: string;
  code: string;
  title: string;
  valueType: DiscountValueType;
  value: number;
  startsAt: string;
  endsAt?: string | null;
  appliesOncePerCustomer?: boolean;
  combinePolicy?: Partial<CombinePolicy>;
}

function normalizeCode(code: string) {
  const normalized = String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new AppError("A discount code is required before creating it in Shopify.", 400);
  }

  return normalized.slice(0, 200);
}

function normalizeTitle(title: string, code: string) {
  return String(title ?? "").trim() || code;
}

function normalizeStartsAt(dateKey: string) {
  const startsAt = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(startsAt.getTime())) {
    throw new AppError("The planned discount start date is invalid.", 400);
  }
  return startsAt.toISOString();
}

function normalizeEndsAt(dateKey?: string | null) {
  if (!dateKey) return null;
  const endsAt = new Date(`${dateKey}T23:59:59.999Z`);
  if (Number.isNaN(endsAt.getTime())) {
    throw new AppError("The planned discount end date is invalid.", 400);
  }
  return endsAt.toISOString();
}

function buildCombinePolicy(input?: Partial<CombinePolicy>): CombinePolicy {
  return {
    productDiscounts: Boolean(input?.productDiscounts),
    orderDiscounts: Boolean(input?.orderDiscounts),
    shippingDiscounts: Boolean(input?.shippingDiscounts)
  };
}

function buildDiscountValue(valueType: DiscountValueType, value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError("Discount value must be greater than zero.", 400);
  }

  if (valueType === "percent") {
    return {
      percentage: Math.max(0.0001, Math.min(1, numeric / 100))
    };
  }

  return {
    discountAmount: {
      amount: numeric,
      appliesOnEachItem: false
    }
  };
}

function mapRuleType(value: string) {
  if (value === "DiscountCodeBasic") return "basic";
  if (value === "DiscountCodeBxgy") return "bxgy";
  if (value === "DiscountCodeFreeShipping") return "free_shipping";
  return "unknown";
}

export async function getActiveShopifyCodeDiscountRules(storeId: string): Promise<ShopifyPlannerDiscountRule[]> {
  const credentials = await getStoredShopifyCredentials(storeId);
  const client = createShopifyClient(credentials);
  const data = await client.request<{
    codeDiscountNodes: {
      nodes: Array<{
        id: string;
        codeDiscount: {
          __typename: string;
          title?: string | null;
          status?: string | null;
          startsAt?: string | null;
          endsAt?: string | null;
          summary?: string | null;
          appliesOncePerCustomer?: boolean | null;
          usageLimit?: number | null;
          asyncUsageCount?: number | null;
          combinesWith?: {
            productDiscounts?: boolean | null;
            orderDiscounts?: boolean | null;
            shippingDiscounts?: boolean | null;
          } | null;
          codes?: {
            nodes?: Array<{ code?: string | null }>;
          } | null;
        } | null;
      }>;
    };
  }>(ACTIVE_CODE_DISCOUNTS_QUERY, { first: 100, query: "status:active" });

  return (data.codeDiscountNodes.nodes ?? [])
    .map((node) => {
      const discount = node.codeDiscount;
      const codes = (discount?.codes?.nodes ?? [])
        .map((entry) => String(entry.code ?? "").trim())
        .filter(Boolean);

      return {
        id: node.id,
        type: mapRuleType(discount?.__typename ?? ""),
        title: String(discount?.title ?? "").trim(),
        status: String(discount?.status ?? "UNKNOWN"),
        startsAt: discount?.startsAt ?? null,
        endsAt: discount?.endsAt ?? null,
        summary: String(discount?.summary ?? "").trim(),
        appliesOncePerCustomer: Boolean(discount?.appliesOncePerCustomer),
        usageLimit: discount?.usageLimit == null ? null : Number(discount.usageLimit),
        usageCount: Number(discount?.asyncUsageCount ?? 0),
        combinePolicy: buildCombinePolicy(discount?.combinesWith
          ? {
              productDiscounts: Boolean(discount.combinesWith.productDiscounts),
              orderDiscounts: Boolean(discount.combinesWith.orderDiscounts),
              shippingDiscounts: Boolean(discount.combinesWith.shippingDiscounts)
            }
          : undefined),
        codes
      } satisfies ShopifyPlannerDiscountRule;
    })
    .filter((rule) => rule.codes.length > 0);
}

export async function createMarketingPlannerDiscountInShopify(input: CreateMarketingPlannerDiscountInput) {
  const credentials = await getStoredShopifyCredentials(input.storeId);
  const client = createShopifyClient(credentials);
  const code = normalizeCode(input.code);
  const result = await client.request<{
    discountCodeBasicCreate: {
      codeDiscountNode?: {
        id: string;
        codeDiscount?: {
          shareableUrls?: Array<{ url?: string | null }>;
          codes?: {
            nodes?: Array<{ code?: string | null }>;
          } | null;
        } | null;
      } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(DISCOUNT_CODE_BASIC_CREATE_MUTATION, {
    basicCodeDiscount: {
      title: normalizeTitle(input.title, code),
      code,
      startsAt: normalizeStartsAt(input.startsAt),
      endsAt: normalizeEndsAt(input.endsAt),
      appliesOncePerCustomer: Boolean(input.appliesOncePerCustomer),
      combinesWith: buildCombinePolicy(input.combinePolicy),
      context: { all: "ALL" },
      customerGets: {
        value: buildDiscountValue(input.valueType, input.value),
        items: { all: true },
        appliesOnOneTimePurchase: true,
        appliesOnSubscription: true
      }
    }
  });

  const messages = result.discountCodeBasicCreate.userErrors.map((entry) => entry.message).filter(Boolean);
  if (messages.length) {
    throw new AppError(messages.join("; "), 400);
  }

  const node = result.discountCodeBasicCreate.codeDiscountNode;
  return {
    ok: true,
    shopifyDiscountId: node?.id ?? null,
    code: node?.codeDiscount?.codes?.nodes?.[0]?.code ?? code,
    shareableUrl: node?.codeDiscount?.shareableUrls?.[0]?.url ?? null
  };
}
