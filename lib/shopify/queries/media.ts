// Shopify Admin GraphQL mutations for media upload.
//
// Flow:
//   1. stagedUploadsCreate → get a temporary upload URL + parameters
//   2. PUT/POST the bytes to that URL (multipart form data per Shopify's spec)
//   3. productCreateMedia with the resourceUrl returned in step 1
//
// References:
//   https://shopify.dev/docs/api/admin-graphql/latest/mutations/stagedUploadsCreate
//   https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreateMedia

export const STAGED_UPLOADS_CREATE_MUTATION = /* GraphQL */ `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const PRODUCT_CREATE_MEDIA_MUTATION = /* GraphQL */ `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        alt
        mediaContentType
        status
        ... on MediaImage {
          id
          image {
            url
          }
        }
        ... on Video {
          id
          sources {
            url
          }
        }
      }
      mediaUserErrors {
        code
        field
        message
      }
      product {
        id
      }
    }
  }
`;
