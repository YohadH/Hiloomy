// Bulk Operations query builders for large-store sync.
//
// Shopify Bulk Operations stream an entire connection to a JSONL file instead of
// requiring hundreds of serial paginated GraphQL calls. The rules these queries
// respect (validated against the live Admin schema, 2025-10):
//   - A single top-level connection, max 5 connections total, max 2 nesting levels.
//   - Connections must implement the Node interface. `DiscountApplication` does NOT
//     (it has no `id`), so it CANNOT be a bulk connection — we use the inline
//     `Order.discountCodes` scalar list instead, then re-shape it into the
//     `discountApplications.edges[].node.code` form the shared mapper expects.
//   - `first`/`after` pagination arguments are forbidden — Shopify paginates for us.
//   - `Order.refunds` is queried as an inline list (no `edges`) so it stays embedded
//     in the order object rather than being flattened into separate JSONL lines.
//     We omit the nested `refundLineItems` connection in bulk mode (a connection
//     inside an inline list would be flattened against a parent that never appears
//     as its own root line). Consequence: per-line refund attribution and per-refund
//     `refundedLineItemsAmount` are 0 in bulk mode; order-level `totalRefunds` stays
//     exact. The incremental paginated sync backfills full refund detail.

function escapeForGraphqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Builds the optional `(query: "updated_at:>=<iso>")` argument for incremental
// bulk runs. Returns an empty string for a full (initial) bulk export.
function updatedAfterArg(updatedAfter?: Date | null): string {
  if (!updatedAfter) return "";
  const iso = escapeForGraphqlString(updatedAfter.toISOString());
  return `(query: "updated_at:>=${iso}")`;
}

export function bulkOrdersQuery(updatedAfter?: Date | null): string {
  return `
{
  orders${updatedAfterArg(updatedAfter)} {
    edges {
      node {
        id
        name
        createdAt
        updatedAt
        processedAt
        currencyCode
        taxesIncluded
        cancelledAt
        test
        subtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount } }
        displayFinancialStatus
        displayFulfillmentStatus
        sourceName
        discountCodes
        customerJourneySummary { firstVisit { landingPage referrerUrl } }
        customer { id }
        refunds {
          id
          createdAt
          totalRefundedSet { shopMoney { amount } }
        }
        lineItems {
          edges {
            node {
              id
              title
              quantity
              discountedUnitPriceSet { shopMoney { amount } }
              originalUnitPriceSet { shopMoney { amount } }
              discountedTotalSet { shopMoney { amount } }
              originalTotalSet { shopMoney { amount } }
              taxLines { priceSet { shopMoney { amount } } }
              discountAllocations { allocatedAmountSet { shopMoney { amount } } }
              product { id }
              variant { id }
            }
          }
        }
      }
    }
  }
}`;
}

export function bulkProductsQuery(updatedAfter?: Date | null): string {
  return `
{
  products${updatedAfterArg(updatedAfter)} {
    edges {
      node {
        id
        title
        handle
        vendor
        productType
        status
        createdAt
        updatedAt
        variants {
          edges {
            node {
              id
              sku
              barcode
              title
              price
              compareAtPrice
              inventoryQuantity
            }
          }
        }
      }
    }
  }
}`;
}

export function bulkCustomersQuery(updatedAfter?: Date | null): string {
  return `
{
  customers${updatedAfterArg(updatedAfter)} {
    edges {
      node {
        id
        firstName
        lastName
        email
        createdAt
        updatedAt
        numberOfOrders
        amountSpent { amount currencyCode }
      }
    }
  }
}`;
}

export const BULK_RUN_MUTATION = /* GraphQL */ `
  mutation BulkRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// `currentBulkOperation` is the universally-available poll surface: it is native
// in the app's configured API version (2025-01) and still functions (deprecated)
// in 2026-01+. `type: QUERY` scopes it to our export operation, never a mutation.
export const BULK_POLL_QUERY = /* GraphQL */ `
  query CurrentBulkQuery {
    currentBulkOperation(type: QUERY) {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
`;

export const BULK_CANCEL_MUTATION = /* GraphQL */ `
  mutation BulkCancel($id: ID!) {
    bulkOperationCancel(id: $id) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;
