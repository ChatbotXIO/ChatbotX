/*
  Warnings:

  - You are about to drop the `IntegrationOpenAi` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AiTriggerToIntegrationOpenAi` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "IntegrationOpenAi" DROP CONSTRAINT "IntegrationOpenAi_aiAgentId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationOpenAi" DROP CONSTRAINT "IntegrationOpenAi_aiAssistantId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationOpenAi" DROP CONSTRAINT "IntegrationOpenAi_chatbotId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationOpenAi" DROP CONSTRAINT "IntegrationOpenAi_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAi" DROP CONSTRAINT "_AiTriggerToIntegrationOpenAi_A_fkey";

-- DropForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAi" DROP CONSTRAINT "_AiTriggerToIntegrationOpenAi_B_fkey";

-- DropTable
DROP TABLE "IntegrationOpenAi";

-- DropTable
DROP TABLE "_AiTriggerToIntegrationOpenAi";

-- CreateTable
CREATE TABLE "IntegrationOpenAI" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "auth" JSONB NOT NULL,
    "automatedResponse" BOOLEAN NOT NULL,
    "automatedVoiceResponse" BOOLEAN NOT NULL DEFAULT false,
    "voice" TEXT,
    "prompt" TEXT,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maximumOutputTokens" INTEGER NOT NULL,
    "aiAssistantId" TEXT,
    "aiAgentId" TEXT,

    CONSTRAINT "IntegrationOpenAI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AiTriggerToIntegrationOpenAI" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AiTriggerToIntegrationOpenAI_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOpenAI_integrationId_key" ON "IntegrationOpenAI"("integrationId");

-- CreateIndex
CREATE INDEX "_AiTriggerToIntegrationOpenAI_B_index" ON "_AiTriggerToIntegrationOpenAI"("B");

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAssistantId_fkey" FOREIGN KEY ("aiAssistantId") REFERENCES "AiAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAI" ADD CONSTRAINT "_AiTriggerToIntegrationOpenAI_A_fkey" FOREIGN KEY ("A") REFERENCES "AiTrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAI" ADD CONSTRAINT "_AiTriggerToIntegrationOpenAI_B_fkey" FOREIGN KEY ("B") REFERENCES "IntegrationOpenAI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
