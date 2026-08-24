// Discount mechanism capture.
//
// Storing only (code, amount) made every discount look alike, which is how
// the BI analyst read a BOGO free-gift as a failing product: the gifted item
// books a near-total line discount while the revenue that paid for it sits
// on whatever triggered the promotion. These pin the fields that tell those
// cases apart, and — just as importantly — that an unknown mechanism stays
// null rather than defaulting to "percentage".

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapOrderNode } from "../../lib/shopify/mappers/shopify-mappers";

function orderWith(applications: unknown[]) {
  return {
    id: "gid://shopify/Order/1",
    name: "#1001",
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    currencyCode: "ILS",
    taxesIncluded: false,
    subtotalPriceSet: { shopMoney: { amount: "300.00" } },
    totalDiscountsSet: { shopMoney: { amount: "100.00" } },
    totalTaxSet: { shopMoney: { amount: "0.00" } },
    totalShippingPriceSet: { shopMoney: { amount: "0.00" } },
    totalPriceSet: { shopMoney: { amount: "200.00" } },
    discountApplications: { edges: applications.map((node) => ({ node })) },
    lineItems: {
      edges: [
        {
          node: {
            id: "gid://shopify/LineItem/1",
            title: "Base parfume",
            quantity: 1,
            originalUnitPriceSet: { shopMoney: { amount: "300.00" } },
            discountedUnitPriceSet: { shopMoney: { amount: "200.00" } },
            originalTotalSet: { shopMoney: { amount: "300.00" } },
            discountedTotalSet: { shopMoney: { amount: "200.00" } },
            taxLines: [],
            discountAllocations: []
          }
        }
      ]
    }
  };
}

const find = (mapped: { discounts: { code: string }[] }, code: string) =>
  mapped.discounts.find((d) => d.code === code);

test("a percentage code records its type and percentage", () => {
  const mapped = mapOrderNode(
    orderWith([
      {
        __typename: "DiscountCodeApplication",
        code: "LOVE10",
        allocationMethod: "ACROSS",
        targetSelection: "ALL",
        targetType: "LINE_ITEM",
        value: { __typename: "PricingPercentageValue", percentage: 10 }
      }
    ]),
    "store_1",
    0.4
  );
  const d = find(mapped, "LOVE10");
  assert.ok(d, "code should be captured");
  assert.equal(d.applicationType, "code");
  assert.equal(d.valueType, "percentage");
  assert.equal(Number(d.valuePercent), 10);
  assert.equal(d.valueAmount, null);
  assert.equal(d.targetSelection, "ALL");
});

test("a manual staff discount is distinguishable from a code", () => {
  // This is the one that matters: "הנחה מותאמת אישית" is not a code and
  // cannot be switched off — advising the merchant to disable it is wrong.
  const mapped = mapOrderNode(
    orderWith([
      {
        __typename: "ManualDiscountApplication",
        title: "הנחה מותאמת אישית",
        allocationMethod: "ACROSS",
        targetSelection: "ALL",
        targetType: "LINE_ITEM",
        value: { __typename: "MoneyV2", amount: "100.00", currencyCode: "ILS" }
      }
    ]),
    "store_1",
    0.4
  );
  const d = find(mapped, "הנחה מותאמת אישית");
  assert.ok(d);
  assert.equal(d.applicationType, "manual", "manual discounts must not look like codes");
  assert.equal(d.valueType, "fixed_amount");
  assert.equal(Number(d.valueAmount), 100);
  assert.equal(d.valuePercent, null);
});

test("a free-gift promotion is identifiable by its shape", () => {
  const mapped = mapOrderNode(
    orderWith([
      {
        __typename: "DiscountCodeApplication",
        code: "BASE",
        allocationMethod: "EACH",
        targetSelection: "ENTITLED",
        targetType: "LINE_ITEM",
        value: { __typename: "PricingPercentageValue", percentage: 100 }
      }
    ]),
    "store_1",
    0.4
  );
  const d = find(mapped, "BASE");
  assert.ok(d);
  // 100% off, applied EACH, scoped to ENTITLED products = a gift, not a
  // store-wide markdown. Readers key off exactly this combination.
  assert.equal(Number(d.valuePercent), 100);
  assert.equal(d.allocationMethod, "EACH");
  assert.equal(d.targetSelection, "ENTITLED");
});

test("automatic discounts carry their title", () => {
  const mapped = mapOrderNode(
    orderWith([
      {
        __typename: "AutomaticDiscountApplication",
        title: "Summer bundle",
        allocationMethod: "ACROSS",
        targetSelection: "ENTITLED",
        targetType: "LINE_ITEM",
        value: { __typename: "PricingPercentageValue", percentage: 15 }
      }
    ]),
    "store_1",
    0.4
  );
  const d = find(mapped, "Summer bundle");
  assert.ok(d);
  assert.equal(d.applicationType, "automatic");
  assert.equal(d.title, "Summer bundle");
});

test("an unknown mechanism stays null and never defaults to percentage", () => {
  // Bulk sync reshapes a flat `discountCodes` list and has no mechanism to
  // give. Guessing here would be worse than admitting ignorance — a null
  // reads as "unknown", a wrong "percentage" reads as fact.
  const mapped = mapOrderNode(orderWith([{ __typename: "DiscountCodeApplication", code: "LEGACY" }]), "store_1", 0.4);
  const d = find(mapped, "LEGACY");
  assert.ok(d);
  assert.equal(d.applicationType, "code");
  assert.equal(d.valueType, null);
  assert.equal(d.valuePercent, null);
  assert.equal(d.valueAmount, null);
  assert.equal(d.allocationMethod, null);
});

test("two codes on one order keep their own mechanisms", () => {
  const mapped = mapOrderNode(
    orderWith([
      {
        __typename: "DiscountCodeApplication",
        code: "PCT",
        value: { __typename: "PricingPercentageValue", percentage: 20 }
      },
      {
        __typename: "ManualDiscountApplication",
        title: "goodwill",
        value: { __typename: "MoneyV2", amount: "50.00" }
      }
    ]),
    "store_1",
    0.4
  );
  assert.equal(find(mapped, "PCT")?.applicationType, "code");
  assert.equal(find(mapped, "goodwill")?.applicationType, "manual");
  assert.equal(find(mapped, "PCT")?.valueType, "percentage");
  assert.equal(find(mapped, "goodwill")?.valueType, "fixed_amount");
});
