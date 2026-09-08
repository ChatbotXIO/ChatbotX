CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_referral_source_adId_idx" ON "ContactInbox" (("referral"->>'source'),("referral"->>'adId')) WHERE "referral"->>'adId' IS NOT NULL;
