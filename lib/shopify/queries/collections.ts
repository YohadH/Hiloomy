export const COLLECTIONS_QUERY = /* GraphQL */ `
  query CollectionsPage($cursor: String) {
    collections(first: 50, after: $cursor, sortKey: UPDATED_AT) {
      edges {
        cursor
        node {
          id
          title
          handle
          updatedAt
          productsCount {
            count
          }
          ruleSet {
            rules {
              column
            }
          }
          products(first: 250) {
            edges {
              node {
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
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

export const COLLECTION_PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query CollectionProductsPage($collectionId: ID!, $cursor: String) {
    collection(id: $collectionId) {
      id
      products(first: 250, after: $cursor) {
        edges {
          cursor
          node {
            id
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;
