/*
  Warnings:

  - A unique constraint covering the columns `[chatbotId,sourceId]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Conversation_chatbotId_idx";

-- DropIndex
DROP INDEX "Message_sourceId_idx";

-- DropIndex
DROP INDEX "Message_sourceId_key";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_chatbotId_sourceId_key" ON "Contact"("chatbotId", "sourceId");

-- CreateIndex
CREATE INDEX "Conversation_chatbotId_sourceId_idx" ON "Conversation"("chatbotId", "sourceId");

-- CreateIndex
CREATE INDEX "Message_chatbotId_sourceId_idx" ON "Message"("chatbotId", "sourceId");
