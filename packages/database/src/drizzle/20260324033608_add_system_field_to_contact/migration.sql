ALTER TABLE "Contact" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "location" jsonb;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN "subscribedAt" timestamp(6) with time zone;
