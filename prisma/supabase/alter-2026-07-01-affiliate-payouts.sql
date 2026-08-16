-- Affiliate portal — BixGrow-like commission tracking.
--
-- Adds payout state to attributions + per-affiliate commission overrides +
-- payout instrument fields on the member.
--
-- All idempotent; safe to re-run.

-- ─── AffiliateAttribution payout state ─────────────────────────────────
ALTER TABLE "AffiliateAttribution"
  ADD COLUMN IF NOT EXISTS "payoutStatus" TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "paidAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payoutNote"    TEXT,
  ADD COLUMN IF NOT EXISTS "manualEntry"   BOOLEAN NOT NULL DEFAULT FALSE;

-- Payout queue lookup: WHERE storeId = $ AND payoutStatus = 'approved'
CREATE INDEX IF NOT EXISTS "AffiliateAttribution_storeId_payoutStatus_idx"
  ON "AffiliateAttribution"("storeId", "payoutStatus");

-- ─── AffiliateMember commission + payout instrument ────────────────────
ALTER TABLE "AffiliateMember"
  ADD COLUMN IF NOT EXISTS "commissionRateOverride" DECIMAL(5, 4),
  ADD COLUMN IF NOT EXISTS "payoutMethod"           TEXT,
  ADD COLUMN IF NOT EXISTS "payoutDetails"          TEXT;
