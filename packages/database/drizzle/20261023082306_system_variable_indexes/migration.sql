-- Latest lead of a contact ({{last_lead_id}} and friends) and latest completed questionnaire submission of a contact
-- ({{last_points}}). Their own migration because CONCURRENTLY cannot run in a transaction, and keeping the builds out of
-- the migration that ALTERs the hot ContactInbox table means that table's lock is never held across an index build
-- (same precedent as 20261019070504_conversation_response_due_index).
-- If this fails midway it leaves an INVALID index that IF NOT EXISTS would skip on a rerun:
-- check pg_index.indisvalid and DROP INDEX CONCURRENTLY the index (FacebookLeadAdsLead_contactId_createdAt_idx or
-- QuestionnaireSubmission_workspaceId_contactId_completedAt_idx) first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FacebookLeadAdsLead_contactId_createdAt_idx" ON "FacebookLeadAdsLead" ("contactId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuestionnaireSubmission_workspaceId_contactId_completedAt_idx" ON "QuestionnaireSubmission" ("workspaceId","contactId","completedAt" DESC);
