ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "firstInteractionAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "lastOutboundMessageAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "referral" jsonb;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "lastCommentMessageId" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "lastCommentMessageAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "consecutiveFailedReply" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "lastInputFailure" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "lastErrorLog" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "lastBtnTitle" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN IF NOT EXISTS "webchatParentUrl" text;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "lastStep" text;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "currentStep" text;
