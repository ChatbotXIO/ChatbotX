ALTER TABLE "WhatsappFlow" ADD COLUMN IF NOT EXISTS "categories" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ADD COLUMN IF NOT EXISTS "validationErrors" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ADD COLUMN IF NOT EXISTS "completedCount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ADD COLUMN IF NOT EXISTS "screens" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "WhatsappFlow" DROP COLUMN IF EXISTS "isCompleted";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappFlow_integrationWhatsappId_sourceId_key" ON "WhatsappFlow" ("integrationWhatsappId","sourceId");
