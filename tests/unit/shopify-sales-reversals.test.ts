// Shopify Analytics parity for Total sales (Take a Nap reconciliation,
// 2026-09-23). Shopify books a RETURN as the ex-VAT value of goods that came
// back (restockType RETURN / CANCEL) at refund date — not the money refunded;
// it nets refunded tax out of "Taxes" and shows shipping net of shipping
// discounts. The store exchanges at the till, so money refunded (₪8K) and
// goods returned (₪45K) differ by a factor of five. These pin the mapper
// fields the Total sales walk now relies on.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapOrderNode } from "../../lib/shopify/mappers/shopify-mappers";

function order() {
  return {
    id: "gid://shopify/Order/64988",
    name: "#64988",
    createdAt: "2026-09-05T10:00:00Z",
    updatedAt: "2026-09-08T10:00:00Z",
    currencyCode: "ILS",
    taxesIncluded: true,
    subtotalPriceSet: { shopMoney: { amount: "1228.00" } },
    totalDiscountsSet: { shopMoney: { amount: "0.00" } },
    totalTaxSet: { shopMoney: { amount: "187.32" } },
    totalShippingPriceSet: { shopMoney: { amount: "29.00" } },
    // Free-shipping code: the customer paid nothing for shipping.
    shippingLine: { originalPriceSet: { shopMoney: { amount: "29.00" } }, discountedPriceSet: { shopMoney: { amount: "0.00" } } },
    totalPriceSet: { shopMoney: { amount: "1228.00" } },
    discountApplications: { edges: [] },
    lineItems: {
      edges: [
        { node: { id: "gid://shopify/LineItem/1", title: "מעיל", quantity: 1, originalUnitPriceSet: { shopMoney: { amount: "899.00" } }, discountedUnitPriceSet: { shopMoney: { amount: "899.00" } }, originalTotalSet: { shopMoney: { amount: "899.00" } }, discountedTotalSet: { shopMoney: { amount: "899.00" } }, taxLines: [{ priceSet: { shopMoney: { amount: "137.13" } } }], discountAllocations: [] } },
        { node: { id: "gid://shopify/LineItem/2", title: "צעיף", quantity: 1, originalUnitPriceSet: { shopMoney: { amount: "329.00" } }, discountedUnitPriceSet: { shopMoney: { amount: "329.00" } }, originalTotalSet: { shopMoney: { amount: "329.00" } }, discountedTotalSet: { shopMoney: { amount: "329.00" } }, taxLines: [{ priceSet: { shopMoney: { amount: "50.19" } } }], discountAllocations: [] } }
      ]
    },
    refunds: [
      {
        // A till exchange: both items came back, no money moved.
        id: "gid://shopify/Refund/1",
        createdAt: "2026-09-08T09:00:00Z",
        totalRefundedSet: { shopMoney: { amount: "0.00" } },
        refundLineItems: {
          edges: [
            { node: { quantity: 1, restockType: "RETURN", lineItem: { id: "gid://shopify/LineItem/1" }, subtotalSet: { shopMoney: { amount: "899.00" } }, totalTaxSet: { shopMoney: { amount: "137.13" } } } },
            { node: { quantity: 1, restockType: "NO_RESTOCK", lineItem: { id: "gid://shopify/LineItem/2" }, subtotalSet: { shopMoney: { amount: "329.00" } }, totalTaxSet: { shopMoney: { amount: "50.19" } } } }
          ]
        }
      }
    ]
  };
}

test("returned goods are counted ex-VAT by restock type, separately from money refunded", () => {
  const mapped = mapOrderNode(order(), "store-1", 0.4);
  const refund = mapped.refunds[0];
  assert.equal(refund.refundedAmount, 0, "an exchange refunds no money");
  // Both lines, ex-VAT: (899 − 137.13) + (329 − 50.19)
  assert.equal(refund.refundedLineItemsAmount, 1040.68);
  // Only the RETURN line is a Shopify sales reversal; NO_RESTOCK is not.
  assert.equal(refund.restockedLineItemsAmount, 761.87);
  assert.equal(refund.refundedTaxAmount, 187.32);
});

test("CANCEL lines count as reversals; unknown restock types do not", () => {
  const o = order();
  o.refunds[0].refundLineItems.edges[1].node.restockType = "CANCEL";
  assert.equal(mapOrderNode(o, "store-1", 0.4).refunds[0].restockedLineItemsAmount, 1040.68);
  o.refunds[0].refundLineItems.edges[1].node.restockType = "LEGACY_RESTOCK";
  assert.equal(mapOrderNode(o, "store-1", 0.4).refunds[0].restockedLineItemsAmount, 761.87);
});

test("shipping discount is the gap between the shipping line's original and discounted price", () => {
  const mapped = mapOrderNode(order(), "store-1", 0.4);
  assert.equal(mapped.order.totalShippingDiscount, 29);
  const o = order();
  delete (o as any).shippingLine; // bulk rows synced before the field existed
  assert.equal(mapOrderNode(o, "store-1", 0.4).order.totalShippingDiscount, 0);
});
