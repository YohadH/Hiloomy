-- Short share links hiloomy.com/l/{token} (owner request 2026-08-26).
-- Authored WITH the schema change (F-043 lesson). Idempotent — safe on a
-- dev DB already aligned via `prisma db push`.

CREATE TABLE IF NOT EXISTS "AffiliateShortLink" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "affiliateMemberId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "couponCode" TEXT,
    "destinationPath" TEXT NOT NULL DEFAULT '/',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateShortLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateShortLink_token_key"
  ON "AffiliateShortLink"("token");
CREATE INDEX IF NOT EXISTS "AffiliateShortLink_storeId_affiliateMemberId_idx"
  ON "AffiliateShortLink"("storeId", "affiliateMemberId");

-- Foreign keys, guarded for idempotency (Postgres has no IF NOT EXISTS for
-- ADD CONSTRAINT).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateShortLink_storeId_fkey') THEN
    ALTER TABLE "AffiliateShortLink" ADD CONSTRAINT "AffiliateShortLink_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateShortLink_affiliateMemberId_fkey') THEN
    ALTER TABLE "AffiliateShortLink" ADD CONSTRAINT "AffiliateShortLink_affiliateMemberId_fkey"
      FOREIGN KEY ("affiliateMemberId") REFERENCES "AffiliateMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
