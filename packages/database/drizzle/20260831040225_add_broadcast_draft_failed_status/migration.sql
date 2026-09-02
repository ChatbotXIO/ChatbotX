ALTER TYPE "broadcastStatus" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "broadcastStatus" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "handoffCompletedAt" timestamp(6) with time zone;
