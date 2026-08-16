import { roundCurrency } from "@/lib/server/numbers";
import { isAnalyticsDiscountCode } from "@/lib/server/analytics-order-rules";

function stripGid(gid?: string | null) {
  if (!gid) return null;
  return gid.split("/").pop() ?? gid;
}

function amount(value?: { amount?: string | null } | null) {
  return roundCurrency(Number(value?.amount ?? 0));
}

function integer(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

/**
 * Title-case a label, preserving non-Latin scripts (e.g. Hebrew) untouched.
 * "INCENSE PARFUMS" → "Incense Parfums"
 * "amber" → "Amber"
 * "מארז זוגי" → "מארז זוגי"
 */
export function titleCaseLabel(value: string): string {
  return value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "") return part;
      // Only adjust case for tokens that contain ASCII letters
      if (!/[A-Za-z]/.test(part)) return part;
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function normalizeCollection(productType?: string | null, vendor?: string | null): string {
  const type = (productType ?? "").trim();
  const ven = (vendor ?? "").trim();
  const raw = type || ven || "";
  if (!raw) return "Uncategorized";
  return titleCaseLabel(raw);
}

export function mapShopMetadata(shop: any) {
  return {
    shopifyShopId: stripGid(shop.id),
    name: shop.name,
    domain: shop.myshopifyDomain,
    currency: shop.currencyCode ?? "USD",
    timezone: shop.ianaTimezone ?? "UTC",
    planName: shop.plan?.displayName ?? null
  };
}

export function mapProductNode(product: any, storeId: string) {
  const variants = product.variants?.edges?.map((edge: any) => edge.node) ?? [];
  const primaryPrice = Number(variants[0]?.price ?? 0);

  return {
    product: {
      storeId,
      shopifyProductId: stripGid(product.id),
      title: product.title,
      handle: product.handle,
      vendor: product.vendor ?? null,
      productType: product.productType ?? null,
      status: product.status ?? null,
      collection: normalizeCollection(product.productType, product.vendor),
      price: primaryPrice,
      estimatedCost: 0,
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt)
    },
    variants: variants.map((variant: any) => ({
      storeId,
      shopifyVariantId: stripGid(variant.id),
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      title: variant.title,
      price: variant.price ? Number(variant.price) : null,
      compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
      inventoryQuantity: variant.inventoryQuantity ?? null
    }))
  };
}

export function mapCustomerNode(customer: any, storeId: string) {
  const firstName = customer.firstName ?? null;
  const lastName = customer.lastName ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const totalOrders = integer(customer.numberOfOrders);

  return {
    storeId,
    shopifyCustomerId: stripGid(customer.id),
    email: customer.email ?? null,
    firstName,
    lastName,
    name: fullName || customer.email || "Unknown customer",
    createdAt: new Date(customer.createdAt),
    updatedAt: new Date(customer.updatedAt),
    totalOrders,
    lifetimeValue: amount(customer.amountSpent),
    isReturning: totalOrders > 1
  };
}

export function mapOrderNode(order: any, storeId: string, defaultCostRatio: number) {
  const refunds = order.refunds ?? [];
  const lineItems = order.lineItems?.edges?.map((edge: any) => edge.node) ?? [];
  const seenLineItemIds = new Set<string>();
  const taxesIncluded = Boolean(order.taxesIncluded);
  const refundAmount = refunds.reduce(
    (total: number, refund: any) => total + amount(refund.totalRefundedSet?.shopMoney),
    0
  );

  // Match Shopify reports: gross sales = price × quantity, EXCLUDING tax.
  // For tax-inclusive stores (e.g. Israel/EU), originalTotalSet / discountedTotalSet
  // are tax-inclusive. We strip the tax portion before persisting so every
  // downstream aggregation (analytics, marketing planner, affiliate portal,
  // offline sales) sees Shopify-parity numbers.
  function stripTax(amountInclusiveOrExclusive: number, lineTax: number) {
    if (!taxesIncluded) return amountInclusiveOrExclusive;
    return roundCurrency(Math.max(0, amountInclusiveOrExclusive - lineTax));
  }

  // Pre-compute per-line refunded quantity/value keyed by the line's Shopify
  // GID so we can attribute refunds back to the line that was refunded
  // instead of pro-rating at analytics time.
  const refundedByLine = new Map<string, { quantity: number; subtotal: number; tax: number }>();
  for (const refund of refunds) {
    const refundLineItems = refund.refundLineItems?.edges?.map((edge: any) => edge.node) ?? [];
    for (const rli of refundLineItems) {
      const lineGid = rli.lineItem?.id;
      if (!lineGid) continue;
      const current = refundedByLine.get(lineGid) ?? { quantity: 0, subtotal: 0, tax: 0 };
      current.quantity += Number(rli.quantity ?? 0);
      current.subtotal += amount(rli.subtotalSet?.shopMoney);
      current.tax += amount(rli.totalTaxSet?.shopMoney);
      refundedByLine.set(lineGid, current);
    }
  }

  const mappedOrder = {
    storeId,
    shopifyOrderId: stripGid(order.id),
    orderNumber: order.name,
    displayName: order.name,
    createdAt: new Date(order.createdAt),
    processedAt: order.processedAt ? new Date(order.processedAt) : null,
    currency: order.currencyCode ?? "USD",
    subtotalPrice: amount(order.subtotalPriceSet?.shopMoney),
    totalDiscounts: amount(order.totalDiscountsSet?.shopMoney),
    totalTax: amount(order.totalTaxSet?.shopMoney),
    totalShipping: amount(order.totalShippingPriceSet?.shopMoney),
    totalRefunds: refundAmount,
    totalPrice: amount(order.totalPriceSet?.shopMoney),
    taxesIncluded,
    financialStatus: order.displayFinancialStatus ?? null,
    fulfillmentStatus: order.displayFulfillmentStatus ?? null,
    cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null,
    test: Boolean(order.test),
    sourceName: order.sourceName ?? null,
    // First-visit attribution. Pulled from Shopify's customerJourneySummary
    // when the app has the `read_customer_journey` scope; null otherwise.
    // The downstream channel-performance engine treats null as "unknown".
    landingSiteRef: order.customerJourneySummary?.firstVisit?.landingPage ?? null,
    referringSite: order.customerJourneySummary?.firstVisit?.referrerUrl ?? null,
    updatedAt: new Date(order.updatedAt),
    shopifyCustomerId: stripGid(order.customer?.id)
  };

  // Shopify often returns per-line `taxLines` empty when prices are
  // tax-inclusive (the tax then only appears at order level). Without it,
  // stripTax() below is a no-op and persisted "gross" amounts stay
  // tax-inclusive — which inflated product revenue by ~VAT (e.g. LA FLAMME
  // showing higher than Shopify's Gross sales). When the per-line tax is
  // missing, prorate the order's total tax across lines by their original
  // (pre-discount) total so lineSubtotal is genuinely ex-tax.
  const orderTotalTax = amount(order.totalTaxSet?.shopMoney);
  const sumOriginalTotal = lineItems.reduce(
    (total: number, li: any) => total + amount(li.originalTotalSet?.shopMoney),
    0
  );
  const sumLineTax = lineItems.reduce(
    (total: number, li: any) =>
      total +
      (li.taxLines ?? []).reduce(
        (sub: number, tl: any) => sub + amount(tl.priceSet?.shopMoney),
        0
      ),
    0
  );
  const prorateOrderTax = taxesIncluded && sumLineTax <= 0 && orderTotalTax > 0 && sumOriginalTotal > 0;

  const mappedLineItems = lineItems.flatMap((lineItem: any) => {
    const shopifyLineItemId = stripGid(lineItem.id);
    if (shopifyLineItemId && seenLineItemIds.has(shopifyLineItemId)) {
      return [];
    }

    if (shopifyLineItemId) {
      seenLineItemIds.add(shopifyLineItemId);
    }

    // discountAllocations covers BOTH line-level AND order-level discounts
    // allocated to this line. Shopify's per-product Discounts column uses
    // this; the older originalTotal − discountedTotal math only captured the
    // line-level slice and missed cart-level discounts entirely.
    const allocationsSum = (lineItem.discountAllocations ?? []).reduce(
      (total: number, allocation: any) => total + amount(allocation.allocatedAmountSet?.shopMoney),
      0
    );
    const originalTotal = amount(lineItem.originalTotalSet?.shopMoney);
    const discountedTotalFromShopify = amount(lineItem.discountedTotalSet?.shopMoney);
    const lineDiscountFallback = roundCurrency(Math.max(0, originalTotal - discountedTotalFromShopify));
    const totalLineDiscount = allocationsSum > 0 ? roundCurrency(allocationsSum) : lineDiscountFallback;

    // Tax allocated to this line. Prefer Shopify's per-line taxLines; fall
    // back to a proportional slice of the order tax when that array is empty
    // so tax is actually stripped below (tax-inclusive stores).
    const taxFromLines = (lineItem.taxLines ?? []).reduce(
      (total: number, line: any) => total + amount(line.priceSet?.shopMoney),
      0
    );
    const taxAmount = prorateOrderTax
      ? roundCurrency(orderTotalTax * (originalTotal / sumOriginalTotal))
      : taxFromLines;

    // Strip tax so persisted amounts match Shopify's "Gross sales" definition.
    const lineSubtotal = stripTax(originalTotal, taxAmount);
    // Ex-tax discounted total: remove the same tax proportion the gross had so
    // estimated cost / profit isn't computed off a tax-inclusive base.
    const discountedInclusive = roundCurrency(Math.max(0, originalTotal - totalLineDiscount));
    const discountedTotal =
      taxesIncluded && originalTotal > 0
        ? roundCurrency(discountedInclusive * (lineSubtotal / originalTotal))
        : discountedInclusive;
    const originalUnitPriceRaw = amount(lineItem.originalUnitPriceSet?.shopMoney);
    const discountedUnitPriceRaw = amount(lineItem.discountedUnitPriceSet?.shopMoney);
    const quantity = Number(lineItem.quantity ?? 0);
    const unitTax = quantity > 0 ? taxAmount / quantity : 0;
    const originalUnitPrice = taxesIncluded ? roundCurrency(Math.max(0, originalUnitPriceRaw - unitTax)) : originalUnitPriceRaw;
    const discountedUnitPrice = taxesIncluded ? roundCurrency(Math.max(0, discountedUnitPriceRaw - unitTax)) : discountedUnitPriceRaw;
    const estimatedCostAmount = roundCurrency(discountedTotal * defaultCostRatio);

    const refundForLine = shopifyLineItemId ? refundedByLine.get(lineItem.id) : undefined;
    const refundedQuantity = refundForLine?.quantity ?? 0;
    const refundedSubtotal = refundForLine
      ? stripTax(roundCurrency(refundForLine.subtotal), refundForLine.tax)
      : 0;

    return [{
      storeId,
      shopifyLineItemId,
      shopifyProductId: stripGid(lineItem.product?.id),
      shopifyVariantId: stripGid(lineItem.variant?.id),
      title: lineItem.title,
      quantity,
      originalUnitPrice,
      discountedUnitPrice,
      lineSubtotal,
      lineDiscountAmount: taxesIncluded
        ? roundCurrency(Math.max(0, totalLineDiscount - (totalLineDiscount > 0 ? (totalLineDiscount / originalTotal) * taxAmount : 0)))
        : roundCurrency(totalLineDiscount),
      taxAmount: roundCurrency(taxAmount),
      refundedQuantity,
      refundedSubtotal,
      estimatedCostAmount
    }];
  });

  const mappedDiscounts = Array.from(new Set(
    order.discountApplications?.edges
      ?.map((edge: any) => edge.node)
      ?.map((discount: any) => String(discount.code ?? discount.title ?? "Untitled discount").trim())
      ?.filter((code: string) => isAnalyticsDiscountCode(code)) ?? []
  )).map((code) => ({ code }));

  const mappedRefunds = refunds.map((refund: any) => ({
    shopifyRefundId: stripGid(refund.id),
    refundedAmount: amount(refund.totalRefundedSet?.shopMoney),
    refundedLineItemsAmount:
      refund.refundLineItems?.edges?.reduce(
        (total: number, edge: any) => total + amount(edge.node.subtotalSet?.shopMoney),
        0
      ) ?? 0,
    createdAt: new Date(refund.createdAt)
  }));

  return {
    order: mappedOrder,
    lineItems: mappedLineItems,
    discounts: mappedDiscounts,
    refunds: mappedRefunds
  };
}
