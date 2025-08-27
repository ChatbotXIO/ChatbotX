/*
  Warnings:

  - You are about to drop the column `messages` on the `AIAgent` table. All the data in the column will be lost.
  - You are about to drop the column `prompt` on the `AIAgent` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "public"."InboxType" ADD VALUE 'OMNICHANNEL';

-- AlterEnum
ALTER TYPE "public"."IntegrationType" ADD VALUE 'GEMINI';

-- AlterTable
ALTER TABLE "public"."AIAgent" DROP COLUMN "messages",
DROP COLUMN "prompt",
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messagePrompts" JSONB[],
ADD COLUMN     "systemPrompt" TEXT;

-- CreateTable
CREATE TABLE "public"."AIFile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "AIFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIFunction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "dataCollect" JSONB,
    "outputMessage" TEXT,
    "triggerFlowId" TEXT,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "AIFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIMCPServer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "auth" JSONB NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "AIMCPServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationGemini" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auth" JSONB NOT NULL,
    "aiAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "IntegrationGemini_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_AIAgentToAIFile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AIAgentToAIFile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."_AIAgentToAIFunction" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AIAgentToAIFunction_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "public"."_AIAgentToAIMCPServer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AIAgentToAIMCPServer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGemini_chatbotId_key" ON "public"."IntegrationGemini"("chatbotId");

-- CreateIndex
CREATE INDEX "_AIAgentToAIFile_B_index" ON "public"."_AIAgentToAIFile"("B");

-- CreateIndex
CREATE INDEX "_AIAgentToAIFunction_B_index" ON "public"."_AIAgentToAIFunction"("B");

-- CreateIndex
CREATE INDEX "_AIAgentToAIMCPServer_B_index" ON "public"."_AIAgentToAIMCPServer"("B");

-- AddForeignKey
ALTER TABLE "public"."AIFile" ADD CONSTRAINT "AIFile_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIFunction" ADD CONSTRAINT "AIFunction_triggerFlowId_fkey" FOREIGN KEY ("triggerFlowId") REFERENCES "public"."Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIFunction" ADD CONSTRAINT "AIFunction_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIMCPServer" ADD CONSTRAINT "AIMCPServer_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationGemini" ADD CONSTRAINT "IntegrationGemini_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_AIAgentToAIFile" ADD CONSTRAINT "_AIAgentToAIFile_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."AIAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_AIAgentToAIFile" ADD CONSTRAINT "_AIAgentToAIFile_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."AIFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_AIAgentToAIFunction" ADD CONSTRAINT "_AIAgentToAIFunction_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."AIAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_AIAgentToAIFunction" ADD CONSTRAINT "_AIAgentToAIFunction_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."AIFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_AIAgentToAIMCPServer" ADD CONSTRAINT "_AIAgentToAIMCPServer_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."AIAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_AIAgentToAIMCPServer" ADD CONSTRAINT "_AIAgentToAIMCPServer_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."AIMCPServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
