/*
  Warnings:

  - You are about to drop the `TriggerCondition` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TriggerCondition" DROP CONSTRAINT "TriggerCondition_triggerId_fkey";

-- DropIndex
DROP INDEX "ContactCustomField_customFieldId_idx";

-- DropIndex
DROP INDEX "Trigger_chatbotId_name_key";

-- DropTable
DROP TABLE "TriggerCondition";

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "sourceId" TEXT,
    "operator" TEXT,
    "value" JSONB,
    "webhookId" TEXT,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "url" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Condition_type_sourceId_idx" ON "Condition"("type", "sourceId");

-- CreateIndex
CREATE INDEX "Condition_triggerId_idx" ON "Condition"("triggerId");

-- CreateIndex
CREATE INDEX "Condition_type_sourceId_triggerId_idx" ON "Condition"("type", "sourceId", "triggerId");

-- CreateIndex
CREATE INDEX "Webhook_chatbotId_idx" ON "Webhook"("chatbotId");

-- CreateIndex
CREATE INDEX "Webhook_folderId_idx" ON "Webhook"("folderId");

-- CreateIndex
CREATE INDEX "Webhook_chatbotId_active_idx" ON "Webhook"("chatbotId", "active");

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
