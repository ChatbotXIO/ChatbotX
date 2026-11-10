ALTER TABLE "IntegrationSmtp" ADD COLUMN "inboundToken" text;--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationSmtp_inboundToken_key" ON "IntegrationSmtp" ("inboundToken");