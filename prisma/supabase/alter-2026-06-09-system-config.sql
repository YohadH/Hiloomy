-- Incremental migration: add SystemConfig table for storing global app
-- credentials (Shopify Partner app Client ID + Secret) that aren't tied
-- to a single tenant. Run this ONCE in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS "SystemConfig" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "encrypted" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
