ALTER TABLE "WhatsappMessageTemplate" ADD COLUMN IF NOT EXISTS components JSONB NOT NULL DEFAULT '[]'::jsonb;
DROP INDEX IF EXISTS "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key";
CREATE UNIQUE INDEX "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key" ON "WhatsappMessageTemplate" ("integrationWhatsappId" text_ops,"sourceId" text_ops);

ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "templateId" text;
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "integrationWhatsappId" text;
ALTER TABLE "Broadcast" ALTER COLUMN "flowId" DROP NOT NULL;
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "templateData" jsonb NOT NULL DEFAULT '{}';

ALTER TABLE "Broadcast" DROP CONSTRAINT IF EXISTS "Broadcast_integrationWhatsappId_fkey";
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_integrationWhatsappId_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "public"."IntegrationWhatsapp"("id") ON DELETE SET NULL ON UPDATE cascade;
