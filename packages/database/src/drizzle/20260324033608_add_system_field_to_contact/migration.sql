ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "ref" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "country" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "state" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "location" jsonb;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "locale" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "timezone" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "subscribedAt" timestamp(6) with time zone;
