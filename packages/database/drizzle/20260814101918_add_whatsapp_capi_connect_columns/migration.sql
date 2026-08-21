ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "capiAccessToken" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "capiDisconnectedAt" timestamp(6) with time zone;