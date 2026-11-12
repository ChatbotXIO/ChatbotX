-- These foreign-key indexes protect User deletion from scans of high-volume
-- child tables. Build them without blocking writes; this migration is therefore
-- intentionally run outside a transaction.
ALTER TYPE "resourceDeletionResourceType" ADD VALUE IF NOT EXISTS 'user';--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "scheduledDeletionAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ResourceDeletionLog" ALTER COLUMN "workspaceId" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_scheduledDeletionAt_idx" ON "User" ("scheduledDeletionAt") WHERE "scheduledDeletionAt" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactNote_createdById_idx" ON "ContactNote" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_assignedUserId_idx" ON "Conversation" ("assignedUserId") WHERE "assignedUserId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConversationParticipant_userId_idx" ON "ConversationParticipant" ("userId");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog" ("userId") WHERE "userId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactNote" DROP CONSTRAINT "ContactNote_createdById_User_id_fkey", ADD CONSTRAINT "ContactNote_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;