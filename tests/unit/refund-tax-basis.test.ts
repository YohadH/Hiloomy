// Refund line items must be persisted on the same tax basis as sale lines.
//
// Every other amount the mapper stores is ex-VAT (Shopify "Gross sales"
// parity). RefundLineItem.subtotalSet is tax-INCLUSIVE on tax-inclusive
// stores, and it was stored raw — so refunds were the one VAT-inclusive term
// in an ex-VAT contribution walk, over-stating returns vs Shopify's own
// net-of-tax "Returns" (the constant +₪518 the QA found, R-03). These pin
// the basis for both the per-refund total and the per-line attribution.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapOrderNode } from "../../lib/shopify/mappers/shopify-mappers";

function refundedOrder(taxesIncluded: boolean) {
  return {
    id: "gid://shopify/Order/9",
    name: "#1009",
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-27T10:00:00Z",
    currencyCode: "ILS",
    taxesIncluded,
    subtotalPriceSet: { shopMoney: { amount: "236.00" } },
    totalDiscountsSet: { shopMoney: { amount: "0.00" } },
    totalTaxSet: { shopMoney: { amount: "36.00" } },
    totalShippingPriceSet: { shopMoney: { amount: "0.00" } },
    totalPriceSet: { shopMoney: { amount: "236.00" } },
    discountApplications: { edges: [] },
    lineItems: {
      edges: [
        {
          node: {
            id: "gid://shopify/LineItem/9",
            title: "Eau de parfum",
            quantity: 2,
            originalUnitPriceSet: { shopMoney: { amount: "118.00" } },
            discountedUnitPriceSet: { shopMoney: { amount: "118.00" } },
            originalTotalSet: { shopMoney: { amount: "236.00" } },
            discountedTotalSet: { shopMoney: { amount: "236.00" } },
            taxLines: [{ priceSet: { shopMoney: { amount: "36.00" } } }],
            discountAllocations: []
          }
        }
      ]
    },
    refunds: [
      {
        id: "gid://shopify/Refund/77",
        createdAt: "2026-08-27T09:00:00Z",
        totalRefundedSet: { shopMoney: { amount: "118.00" } },
        refundLineItems: {
          edges: [
            {
              node: {
                quantity: 1,
                lineItem: { id: "gid://shopify/LineItem/9" },
                // One unit at the tax-inclusive price; ₪18 of it is VAT.
                subtotalSet: { shopMoney: { amount: "118.00" } },
                totalTaxSet: { shopMoney: { amount: "18.00" } }
              }
            }
          ]
        }
      }
    ]
  };
}

test("tax-inclusive store: refund line value is stored ex-VAT", () => {
  const mapped = mapOrderNode(refundedOrder(true), "store_1", 0.4);
  assert.equal(mapped.refunds.length, 1);
  // 118 inclusive − 18 VAT = 100 net, the value Shopify's Returns metric uses.
  assert.equal(mapped.refunds[0].refundedLineItemsAmount, 100);
  // The money actually returned stays the full amount.
  assert.equal(mapped.refunds[0].refundedAmount, 118);
  // Per-line attribution uses the same basis as the sale line (100 net
  // per unit ⇒ 200 lineSubtotal, 100 refunded).
  assert.equal(mapped.lineItems[0].lineSubtotal, 200);
  assert.equal(mapped.lineItems[0].refundedQuantity, 1);
  assert.equal(mapped.lineItems[0].refundedSubtotal, 100);
});

test("tax-exclusive store: refund line value is stored as-is", () => {
  const mapped = mapOrderNode(refundedOrder(false), "store_1", 0.4);
  assert.equal(mapped.refunds[0].refundedLineItemsAmount, 118);
  assert.equal(mapped.lineItems[0].refundedSubtotal, 118);
});
