/*
  Warnings:

  - The values [Image,Audio,Video,File] on the enum `AttachmentType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `startNodeId` to the `FlowVersion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AttachmentType_new" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'FILE');
ALTER TYPE "AttachmentType" RENAME TO "AttachmentType_old";
ALTER TYPE "AttachmentType_new" RENAME TO "AttachmentType";
DROP TYPE "AttachmentType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "currentFlowRunId" TEXT;

-- AlterTable
ALTER TABLE "FlowVersion" ADD COLUMN     "startNodeId" TEXT;

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowVersionId" TEXT NOT NULL,
    "conversationId" TEXT,

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
