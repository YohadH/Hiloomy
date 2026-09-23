-- Shopify Analytics parity for Total sales (2026-09-23):
--  * Refund.refundedTaxAmount        — tax portion of refunded lines (netted out of "Taxes")
--  * Refund.restockedLineItemsAmount — ex-VAT value of RETURN/CANCEL lines ("Returns")
--  * Order.totalShippingDiscount     — free-shipping codes ("Shipping charges" is net of it)
-- Additive, idempotent; existing rows default to 0 until the next re-sync.
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "refundedTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "restockedLineItemsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "totalShippingDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
