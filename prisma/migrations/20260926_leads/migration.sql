-- Marketing leads table for the public /creators landing (additive, idempotent).
CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT NOT NULL,
  "site" TEXT,
  "creators" TEXT NOT NULL,
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT '/creators',
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt");
