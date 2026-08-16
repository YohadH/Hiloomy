export const CUSTOMERS_QUERY = /* GraphQL */ `
  query CustomersPage($cursor: String, $query: String) {
    customers(first: 100, after: $cursor, sortKey: UPDATED_AT, query: $query) {
      edges {
        cursor
        node {
          id
          firstName
          lastName
          email
          createdAt
          updatedAt
          numberOfOrders
          amountSpent {
            amount
            currencyCode
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
