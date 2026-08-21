ALTER TABLE "IntegrationInstagram" ADD COLUMN "coexistAiReadsSyncedHistory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "coexistAiReadsSyncedHistory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "coexistAiReadsSyncedHistory" boolean DEFAULT false NOT NULL;