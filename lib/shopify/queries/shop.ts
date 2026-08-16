export const SHOP_QUERY = /* GraphQL */ `
  query ShopMetadata {
    shop {
      id
      name
      myshopifyDomain
      currencyCode
      billingAddress {
        countryCodeV2
      }
      plan {
        displayName
      }
      ianaTimezone
    }
  }
`;
