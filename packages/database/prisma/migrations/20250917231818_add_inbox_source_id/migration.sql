/*
  Warnings:

  - A unique constraint covering the columns `[chatbotId,inboxType,sourceId]` on the table `Inbox` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sourceId` to the `Inbox` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Inbox" ADD COLUMN     "sourceId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Inbox_chatbotId_inboxType_sourceId_key" ON "public"."Inbox"("chatbotId", "inboxType", "sourceId");
