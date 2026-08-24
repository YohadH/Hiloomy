export const ORDERS_QUERY = /* GraphQL */ `
  query OrdersPage($cursor: String, $query: String) {
    orders(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true, query: $query) {
      edges {
        cursor
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
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
          sourceName
          customerJourneySummary {
            firstVisit {
              landingPage
              referrerUrl
            }
          }
          customer {
            id
          }
          # These interface fields are what let us tell a percentage code
          # from a free-gift (BOGO) promotion, and a real code from a manual
          # discount typed in by staff. Without them every discount looked
          # like the same thing, and per-product margin was unreadable —
          # a BOGO gift books as a ~100% line discount on the gifted product
          # while the revenue sits on whatever triggered it.
          discountApplications(first: 20) {
            edges {
              node {
                __typename
                allocationMethod
                targetSelection
                targetType
                value {
                  __typename
                  ... on PricingPercentageValue {
                    percentage
                  }
                  ... on MoneyV2 {
                    amount
                    currencyCode
                  }
                }
                ... on DiscountCodeApplication {
                  code
                }
                ... on ManualDiscountApplication {
                  title
                  description
                }
                ... on AutomaticDiscountApplication {
                  title
                }
                ... on ScriptDiscountApplication {
                  title
                }
              }
            }
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                discountedUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }
                taxLines {
                  priceSet {
                    shopMoney {
                      amount
                    }
                  }
                }
                discountAllocations {
                  allocatedAmountSet {
                    shopMoney {
                      amount
                    }
                  }
                  # index ties the allocation back to the order's
                  # discountApplications entry, so each CODE gets its own
                  # real amount instead of an even split.
                  discountApplication {
                    index
                  }
                }
                product {
                  id
                }
                variant {
                  id
                }
              }
            }
          }
          refunds(first: 20) {
            id
            createdAt
            refundLineItems(first: 50) {
              edges {
                node {
                  quantity
                  lineItem {
                    id
                  }
                  subtotalSet {
                    shopMoney {
                      amount
                    }
                  }
                  totalTaxSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
