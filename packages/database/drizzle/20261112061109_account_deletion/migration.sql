-- These foreign-key indexes protect User deletion from scans of high-volume
-- child tables. Build them without blocking writes; this migration is therefore
-- intentionally run outside a transaction. Every concurrent index cleans up an
-- invalid leftover so a canceled build remains retryable.
ALTER TYPE "resourceDeletionResourceType" ADD VALUE IF NOT EXISTS 'user';--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "scheduledDeletionAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ResourceDeletionLog" ALTER COLUMN "workspaceId" DROP NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"User_scheduledDeletionAt_idx"') AND NOT indisvalid) THEN
    DROP INDEX "User_scheduledDeletionAt_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_scheduledDeletionAt_idx" ON "User" ("scheduledDeletionAt") WHERE "scheduledDeletionAt" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ContactNote_createdById_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ContactNote_createdById_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactNote_createdById_idx" ON "ContactNote" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"Conversation_assignedUserId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "Conversation_assignedUserId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Conversation_assignedUserId_idx" ON "Conversation" ("assignedUserId") WHERE "assignedUserId" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"ConversationParticipant_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "ConversationParticipant_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ConversationParticipant_userId_idx" ON "ConversationParticipant" ("userId");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"AuditLog_userId_idx"') AND NOT indisvalid) THEN
    DROP INDEX "AuditLog_userId_idx";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog" ("userId") WHERE "userId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactNote" DROP CONSTRAINT IF EXISTS "ContactNote_createdById_User_id_fkey";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ContactNote_createdById_User_id_fkey'
      AND conrelid = '"ContactNote"'::regclass
  ) THEN
    ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "ContactNote" VALIDATE CONSTRAINT "ContactNote_createdById_User_id_fkey";