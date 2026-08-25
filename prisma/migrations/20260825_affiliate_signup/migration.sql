-- In-app affiliate signup + branding (HLA-12/B1).
-- Authored WITH the schema change (F-043 lesson). Idempotent — safe on a
-- dev DB already aligned via `prisma db push`.

ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "signupSlug" TEXT;
ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "autoApprove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "brandLogoUrl" TEXT;
ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "brandAccentColor" TEXT;
ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "signupHeadline" TEXT;
ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "signupCopy" TEXT;
ALTER TABLE "AffiliateProgram" ADD COLUMN IF NOT EXISTS "termsText" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateProgram_signupSlug_key"
  ON "AffiliateProgram"("signupSlug");
