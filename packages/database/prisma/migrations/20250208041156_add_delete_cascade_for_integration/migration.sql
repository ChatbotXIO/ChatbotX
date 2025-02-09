/*
  Warnings:

  - The values [OpenAi] on the enum `IntegrationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "IntegrationType_new" AS ENUM ('ChatWidget', 'GoogleSheets', 'Instagram', 'Messenger', 'OpenAI', 'Whatsapp');
ALTER TABLE "Integration" ALTER COLUMN "integrationType" TYPE "IntegrationType_new" USING ("integrationType"::text::"IntegrationType_new");
ALTER TYPE "IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "IntegrationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "IntegrationGoogleSheets" DROP CONSTRAINT "IntegrationGoogleSheets_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationOpenAi" DROP CONSTRAINT "IntegrationOpenAi_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationWhatsapp" DROP CONSTRAINT "IntegrationWhatsapp_inboxId_fkey";

-- AlterTable
ALTER TABLE "IntegrationOpenAi" ALTER COLUMN "temperature" DROP DEFAULT,
ALTER COLUMN "maximumOutputTokens" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAi" ADD CONSTRAINT "IntegrationOpenAi_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGoogleSheets" ADD CONSTRAINT "IntegrationGoogleSheets_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
