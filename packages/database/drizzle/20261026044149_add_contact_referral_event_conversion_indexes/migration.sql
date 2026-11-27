-- Partial indexes on the referralEventId columns plus validation of the FKs added
-- NOT VALID in contact_referral_event. CREATE INDEX CONCURRENTLY cannot run in a
-- transaction, so this file runs unwrapped and every statement is re-runnable:
-- each index is preceded by a guard that drops a leftover INVALID build, and
-- VALIDATE CONSTRAINT is a no-op once the constraint is valid. The session
-- lock_timeout (this file is not wrapped, so not SET LOCAL) bounds the wait of
-- the invalid-index cleanup, which takes a lock that blocks writes.
SET lock_timeout = '5s';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AdsConversionEvent_referralEventId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AdsConversionEvent_referralEventId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdsConversionEvent_referralEventId_idx" ON "AdsConversionEvent" ("referralEventId") WHERE "referralEventId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"GoogleAdsConversionEvent_referralEventId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "GoogleAdsConversionEvent_referralEventId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GoogleAdsConversionEvent_referralEventId_idx" ON "GoogleAdsConversionEvent" ("referralEventId") WHERE "referralEventId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" VALIDATE CONSTRAINT "AdsConversionEvent_referralEventId_ContactReferralEvent_id_fkey";--> statement-breakpoint
ALTER TABLE "GoogleAdsConversionEvent" VALIDATE CONSTRAINT "GoogleAdsConversionEvent_0EWR38dBZsuA_fkey";--> statement-breakpoint
RESET lock_timeout;
