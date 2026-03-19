CREATE TYPE "AnalyticsStatus" AS ENUM('processing', 'ingested', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AnalyticsManifestStatus" (
	"objectKey" varchar(255) PRIMARY KEY,
	"status" "AnalyticsStatus" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ingestedAt" timestamp,
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "InboxContactStats" (
	"inboxId" text PRIMARY KEY,
	"totalContacts" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "InboxContactStats" DROP CONSTRAINT IF EXISTS "InboxContactStats_inboxId_fkey";
ALTER TABLE "InboxContactStats" ADD CONSTRAINT "InboxContactStats_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
