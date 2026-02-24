-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key" ON "WhatsappMessageTemplate"("integrationWhatsappId", "sourceId");

ALTER TABLE "WhatsappMessageTemplate" ADD COLUMN components JSONB NOT NULL DEFAULT '[]'::jsonb;
