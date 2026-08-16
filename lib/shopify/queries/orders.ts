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
          discountApplications(first: 20) {
            edges {
              node {
                __typename
                ... on DiscountCodeApplication {
                  code
                }
                ... on ManualDiscountApplication {
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
