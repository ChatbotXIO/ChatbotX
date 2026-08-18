ALTER TABLE "IntegrationInstagram" ADD COLUMN "coexistSkipAiContext" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "coexistSkipAiContext" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "coexistSkipAiContext" boolean DEFAULT false NOT NULL;