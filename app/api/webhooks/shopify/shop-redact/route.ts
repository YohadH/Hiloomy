import { createGdprWebhookHandler } from "@/lib/server/shopify-gdpr-webhook";
import { processShopRedact } from "@/lib/services/shopify-gdpr-service";

// Shopify mandatory compliance webhook — see lib/services/shopify-gdpr-service.
export const POST = createGdprWebhookHandler(processShopRedact);
