export const PRODUCTS_QUERY = /* GraphQL */ `
  query ProductsPage($cursor: String, $query: String) {
    products(first: 100, after: $cursor, sortKey: UPDATED_AT, query: $query) {
      edges {
        cursor
        node {
          id
          title
          handle
          vendor
          productType
          status
          createdAt
          updatedAt
          variants(first: 100) {
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
