-- Leading indexes on the foreign keys that workspace purge cascades through.
-- Deleting a parent row fires `DELETE FROM <child> WHERE <fk> = $1` per row;
-- without an index on <fk> every check seq-scans the child table. Nullable
-- FKs use a partial index (`WHERE <fk> IS NOT NULL`) so NULL rows add no size.
--
-- Every index is built CONCURRENTLY, so drizzle's runner executes this file
-- outside a transaction (see scripts/run-migrations.mjs) and a failed build must
-- be safely re-runnable: each statement is preceded by a guard that drops only a
-- leftover INVALID index of the same name, and the build is `IF NOT EXISTS`.
-- HASH-partitioned tables are handled separately in
-- 20261025020711_add_workspace_purge_partitioned_indexes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIConversationEmbedding_lookup_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIConversationEmbedding_lookup_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIConversationEmbedding_lookup_idx" ON "AIConversationEmbedding" ("workspaceId", "conversationId", "sourceId", "status");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIEmbedding_aiFileId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIEmbedding_aiFileId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIEmbedding_aiFileId_idx" ON "AIEmbedding" ("aiFileId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ContactToTag_tagId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ContactToTag_tagId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactToTag_tagId_idx" ON "ContactToTag" ("tagId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowRun_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowRun_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowRun_workspaceId_idx" ON "FlowRun" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowRun_flowId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowRun_flowId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowRun_flowId_idx" ON "FlowRun" ("flowId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowRun_flowVersionId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowRun_flowVersionId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowRun_flowVersionId_idx" ON "FlowRun" ("flowVersionId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowVersion_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowVersion_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowVersion_workspaceId_idx" ON "FlowVersion" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FlowVersion_flowId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FlowVersion_flowId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FlowVersion_flowId_idx" ON "FlowVersion" ("flowId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"LeaderboardParticipant_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "LeaderboardParticipant_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LeaderboardParticipant_workspaceId_idx" ON "LeaderboardParticipant" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"LeaderboardParticipant_referrerContactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "LeaderboardParticipant_referrerContactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LeaderboardParticipant_referrerContactId_idx" ON "LeaderboardParticipant" ("referrerContactId") WHERE "referrerContactId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"CommentAutomationReply_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "CommentAutomationReply_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CommentAutomationReply_workspaceId_idx" ON "CommentAutomationReply" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"LeaderboardAuditLog_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "LeaderboardAuditLog_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LeaderboardAuditLog_workspaceId_idx" ON "LeaderboardAuditLog" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIAgent_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIAgent_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIAgent_workspaceId_idx" ON "AIAgent" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AIFile_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AIFile_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AIFile_workspaceId_idx" ON "AIFile" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Flow_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Flow_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Flow_workspaceId_idx" ON "Flow" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"InboxTeam_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "InboxTeam_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InboxTeam_workspaceId_idx" ON "InboxTeam" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"SavedReply_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "SavedReply_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SavedReply_workspaceId_idx" ON "SavedReply" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"SavedReplyImage_workspaceId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "SavedReplyImage_workspaceId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SavedReplyImage_workspaceId_idx" ON "SavedReplyImage" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AnalyticsEmailTopic_contactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AnalyticsEmailTopic_contactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEmailTopic_contactId_idx" ON "AnalyticsEmailTopic" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AnalyticsEmailTopic_conversationId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AnalyticsEmailTopic_conversationId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEmailTopic_conversationId_idx" ON "AnalyticsEmailTopic" ("conversationId") WHERE "conversationId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AnalyticsEmailTopic_contactInboxId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AnalyticsEmailTopic_contactInboxId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEmailTopic_contactInboxId_idx" ON "AnalyticsEmailTopic" ("contactInboxId") WHERE "contactInboxId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"FacebookLeadAdsLead_contactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "FacebookLeadAdsLead_contactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FacebookLeadAdsLead_contactId_idx" ON "FacebookLeadAdsLead" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MiniAppUpload_contactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "MiniAppUpload_contactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MiniAppUpload_contactId_idx" ON "MiniAppUpload" ("contactId") WHERE "contactId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MinigameContact_referrerContactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "MinigameContact_referrerContactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MinigameContact_referrerContactId_idx" ON "MinigameContact" ("referrerContactId") WHERE "referrerContactId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"MinigameContact_contactInboxId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "MinigameContact_contactInboxId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MinigameContact_contactInboxId_idx" ON "MinigameContact" ("contactInboxId") WHERE "contactInboxId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"QuestionnaireSubmission_contactId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "QuestionnaireSubmission_contactId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_contactId_idx" ON "QuestionnaireSubmission" ("contactId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"QuestionnaireSubmission_conversationId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "QuestionnaireSubmission_conversationId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_conversationId_idx" ON "QuestionnaireSubmission" ("conversationId") WHERE "conversationId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"QuestionnaireSubmission_currentQuestionId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "QuestionnaireSubmission_currentQuestionId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_currentQuestionId_idx" ON "QuestionnaireSubmission" ("currentQuestionId") WHERE "currentQuestionId" IS NOT NULL;
