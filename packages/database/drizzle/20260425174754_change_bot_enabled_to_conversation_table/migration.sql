ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "botResumeAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "botEnabled" SET DEFAULT true;
