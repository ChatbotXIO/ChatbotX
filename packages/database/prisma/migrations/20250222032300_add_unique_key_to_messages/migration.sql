/*
  Warnings:

  - A unique constraint covering the columns `[chatbotId,sourceId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Message_chatbotId_sourceId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Message_chatbotId_sourceId_key" ON "Message"("chatbotId", "sourceId");
