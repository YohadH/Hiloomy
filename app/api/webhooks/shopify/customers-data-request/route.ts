import { createGdprWebhookHandler } from "@/lib/server/shopify-gdpr-webhook";
import { processCustomersDataRequest } from "@/lib/services/shopify-gdpr-service";

// Shopify mandatory compliance webhook — see lib/services/shopify-gdpr-service.
export const POST = createGdprWebhookHandler(processCustomersDataRequest);
