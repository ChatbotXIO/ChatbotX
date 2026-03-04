ALTER TABLE "WhatsappMessageTemplate" ADD COLUMN components JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key" ON "WhatsappMessageTemplate" ("integrationWhatsappId" text_ops,"sourceId" text_ops);
