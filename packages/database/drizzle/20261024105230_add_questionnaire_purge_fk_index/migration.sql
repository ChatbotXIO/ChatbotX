DROP INDEX CONCURRENTLY IF EXISTS "MiniAppUpload_contactId_idx";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MiniAppUpload_contactId_idx"') AND NOT indisvalid) THEN DROP INDEX "MiniAppUpload_contactId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MiniAppUpload_contactId_idx" ON "MiniAppUpload" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"QuestionnaireSubmission_currentQuestionId_idx"') AND NOT indisvalid) THEN DROP INDEX "QuestionnaireSubmission_currentQuestionId_idx"; END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_currentQuestionId_idx" ON "QuestionnaireSubmission" ("currentQuestionId") WHERE "currentQuestionId" IS NOT NULL;