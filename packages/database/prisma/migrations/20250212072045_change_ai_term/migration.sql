/*
  Warnings:

  - You are about to drop the `AiAgent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiAssistant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiTrigger` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_AiTriggerToIntegrationOpenAI` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AiAgent" DROP CONSTRAINT "AiAgent_chatbotId_fkey";

-- DropForeignKey
ALTER TABLE "AiAssistant" DROP CONSTRAINT "AiAssistant_chatbotId_fkey";

-- DropForeignKey
ALTER TABLE "AiTrigger" DROP CONSTRAINT "AiTrigger_chatbotId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationOpenAI" DROP CONSTRAINT "IntegrationOpenAI_aiAgentId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationOpenAI" DROP CONSTRAINT "IntegrationOpenAI_aiAssistantId_fkey";

-- DropForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAI" DROP CONSTRAINT "_AiTriggerToIntegrationOpenAI_A_fkey";

-- DropForeignKey
ALTER TABLE "_AiTriggerToIntegrationOpenAI" DROP CONSTRAINT "_AiTriggerToIntegrationOpenAI_B_fkey";

-- DropTable
DROP TABLE "AiAgent";

-- DropTable
DROP TABLE "AiAssistant";

-- DropTable
DROP TABLE "AiTrigger";

-- DropTable
DROP TABLE "_AiTriggerToIntegrationOpenAI";

-- CreateTable
CREATE TABLE "AIAgent" (
    "id" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT,
    "messages" JSONB[],

    CONSTRAINT "AIAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAssistant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "aiTriggerIds" TEXT[],
    "attachmentIds" TEXT[],
    "temperature" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AIAssistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITrigger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flowId" TEXT,
    "questions" JSONB[],
    "finalMessage" TEXT,

    CONSTRAINT "AITrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AITriggerToIntegrationOpenAI" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AITriggerToIntegrationOpenAI_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AITriggerToIntegrationOpenAI_B_index" ON "_AITriggerToIntegrationOpenAI"("B");

-- AddForeignKey
ALTER TABLE "AIAgent" ADD CONSTRAINT "AIAgent_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAssistant" ADD CONSTRAINT "AIAssistant_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrigger" ADD CONSTRAINT "AITrigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAssistantId_fkey" FOREIGN KEY ("aiAssistantId") REFERENCES "AIAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AITriggerToIntegrationOpenAI" ADD CONSTRAINT "_AITriggerToIntegrationOpenAI_A_fkey" FOREIGN KEY ("A") REFERENCES "AITrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AITriggerToIntegrationOpenAI" ADD CONSTRAINT "_AITriggerToIntegrationOpenAI_B_fkey" FOREIGN KEY ("B") REFERENCES "IntegrationOpenAI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
