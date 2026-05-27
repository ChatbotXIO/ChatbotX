ALTER TABLE "User" ADD COLUMN "activityStatus" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "lastActiveAt" timestamp with time zone;