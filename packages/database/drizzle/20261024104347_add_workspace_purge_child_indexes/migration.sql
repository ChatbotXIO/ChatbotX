DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AnalyticsEmailTopic_contactId_idx"') AND NOT indisvalid) THEN DROP INDEX "AnalyticsEmailTopic_contactId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEmailTopic_contactId_idx" ON "AnalyticsEmailTopic" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AnalyticsEmailTopic_conversationId_idx"') AND NOT indisvalid) THEN DROP INDEX "AnalyticsEmailTopic_conversationId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEmailTopic_conversationId_idx" ON "AnalyticsEmailTopic" ("conversationId") WHERE "conversationId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AnalyticsEmailTopic_contactInboxId_idx"') AND NOT indisvalid) THEN DROP INDEX "AnalyticsEmailTopic_contactInboxId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEmailTopic_contactInboxId_idx" ON "AnalyticsEmailTopic" ("contactInboxId") WHERE "contactInboxId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FacebookLeadAdsLead_contactId_idx"') AND NOT indisvalid) THEN DROP INDEX "FacebookLeadAdsLead_contactId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FacebookLeadAdsLead_contactId_idx" ON "FacebookLeadAdsLead" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MiniAppUpload_contactId_idx"') AND NOT indisvalid) THEN DROP INDEX "MiniAppUpload_contactId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MiniAppUpload_contactId_idx" ON "MiniAppUpload" ("contactId");--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MinigameContact_referrerContactId_idx"') AND NOT indisvalid) THEN DROP INDEX "MinigameContact_referrerContactId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MinigameContact_referrerContactId_idx" ON "MinigameContact" ("referrerContactId") WHERE "referrerContactId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MinigameContact_contactInboxId_idx"') AND NOT indisvalid) THEN DROP INDEX "MinigameContact_contactInboxId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MinigameContact_contactInboxId_idx" ON "MinigameContact" ("contactInboxId") WHERE "contactInboxId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"QuestionnaireSubmission_contactId_idx"') AND NOT indisvalid) THEN DROP INDEX "QuestionnaireSubmission_contactId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_contactId_idx" ON "QuestionnaireSubmission" ("contactId");--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"QuestionnaireSubmission_conversationId_idx"') AND NOT indisvalid) THEN DROP INDEX "QuestionnaireSubmission_conversationId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_conversationId_idx" ON "QuestionnaireSubmission" ("conversationId") WHERE "conversationId" IS NOT NULL;