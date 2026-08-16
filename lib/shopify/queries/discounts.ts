export const DISCOUNT_CODE_BASIC_CREATE_MUTATION = /* GraphQL */ `
  mutation DiscountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            shareableUrls {
              url
            }
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

export const ACTIVE_CODE_DISCOUNTS_QUERY = /* GraphQL */ `
  query ActiveCodeDiscounts($first: Int!, $query: String) {
    codeDiscountNodes(first: $first, query: $query) {
      nodes {
        id
        codeDiscount {
          __typename
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            summary
            appliesOncePerCustomer
            usageLimit
            asyncUsageCount
            combinesWith {
              productDiscounts
              orderDiscounts
              shippingDiscounts
            }
            codes(first: 5) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeBxgy {
            title
            status
            startsAt
            endsAt
            summary
            appliesOncePerCustomer
            usageLimit
            asyncUsageCount
            combinesWith {
              productDiscounts
              orderDiscounts
              shippingDiscounts
            }
            codes(first: 5) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeFreeShipping {
            title
            status
            startsAt
            endsAt
            summary
            appliesOncePerCustomer
            usageLimit
            asyncUsageCount
            combinesWith {
              productDiscounts
              orderDiscounts
              shippingDiscounts
            }
            codes(first: 5) {
              nodes {
                code
              }
            }
          }
        }
      }
    }
  }
`;
