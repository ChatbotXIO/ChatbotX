ALTER TYPE "resourceDeletionResourceType" ADD VALUE 'user';--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "scheduledDeletionAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ResourceDeletionLog" ALTER COLUMN "workspaceId" DROP NOT NULL;