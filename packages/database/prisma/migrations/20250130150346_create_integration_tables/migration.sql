/*
  Warnings:

  - You are about to drop the column `detailId` on the `Integration` table. All the data in the column will be lost.
  - You are about to drop the column `detailType` on the `Integration` table. All the data in the column will be lost.
  - You are about to drop the column `aiTriggerIds` on the `IntegrationOpenAi` table. All the data in the column will be lost.
  - You are about to drop the column `assistantId` on the `IntegrationOpenAi` table. All the data in the column will be lost.
  - You are about to drop the `IntegrationOpenAiAgent` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[integrationId]` on the table `IntegrationGoogleSheets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[integrationId]` on the table `IntegrationOpenAi` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `integrationType` to the `Integration` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InboxType" AS ENUM ('ChatWidget', 'Instagram', 'Messenger', 'Whatsapp');

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'ChatWidget';

-- DropForeignKey
ALTER TABLE "IntegrationOpenAiAgent" DROP CONSTRAINT "IntegrationOpenAiAgent_chatbotId_fkey";

-- AlterTable
ALTER TABLE "Integration" DROP COLUMN "detailId",
DROP COLUMN "detailType",
ADD COLUMN     "integrationType" "IntegrationType" NOT NULL;

-- AlterTable
ALTER TABLE "IntegrationOpenAi" DROP COLUMN "aiTriggerIds",
DROP COLUMN "assistantId",
ADD COLUMN     "aiAgentId" TEXT,
ADD COLUMN     "aiAssistantId" TEXT;

-- DropTable
DROP TABLE "IntegrationOpenAiAgent";

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxType" "InboxType" NOT NULL,

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTrigger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "description" TEXT,
    "flowId" TEXT,
    "questions" JSONB[],
    "finalMessage" TEXT,

    CONSTRAINT "AiTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWhatsapp" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "auth" JSONB NOT NULL,

    CONSTRAINT "IntegrationWhatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AiTriggerToIntegrationOpenAi" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AiTriggerToIntegrationOpenAi_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWhatsapp_inboxId_key" ON "IntegrationWhatsapp"("inboxId");

-- CreateIndex
CREATE INDEX "_AiTriggerToIntegrationOpenAi_B_index" ON "_AiTriggerToIntegrationOpenAi"("B");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGoogleSheets_integrationId_key" ON "IntegrationGoogleSheets"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOpenAi_integrationId_key" ON "IntegrationOpenAi"("integrationId");

-- AddForeignKey
ALTER TABLE "AiTrigger" ADD CONSTRAINT "AiTrigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAi" ADD CONSTRAINT "IntegrationOpenAi_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAi" ADD CONSTRAINT "IntegrationOpenAi_aiAssistantId_fkey" FOREIGN KEY ("aiAssistantId") REFERENCES "AiAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAi" ADD CONSTRAINT "IntegrationOpenAi_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGoogleSheets" ADD CONSTRAINT "IntegrationGoogleSheets_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAi" ADD CONSTRAINT "_AiTriggerToIntegrationOpenAi_A_fkey" FOREIGN KEY ("A") REFERENCES "AiTrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAi" ADD CONSTRAINT "_AiTriggerToIntegrationOpenAi_B_fkey" FOREIGN KEY ("B") REFERENCES "IntegrationOpenAi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
