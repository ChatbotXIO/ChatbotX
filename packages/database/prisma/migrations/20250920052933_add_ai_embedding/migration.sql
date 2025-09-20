/*
  Warnings:

  - You are about to drop the column `showHeader` on the `ChannelWebWidget` table. All the data in the column will be lost.
  - You are about to drop the column `showMessageInput` on the `ChannelWebWidget` table. All the data in the column will be lost.
  - You are about to drop the column `showPersonalLogo` on the `ChannelWebWidget` table. All the data in the column will be lost.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "public"."ChannelWebWidget" DROP COLUMN "showHeader",
DROP COLUMN "showMessageInput",
DROP COLUMN "showPersonalLogo",
ADD COLUMN     "hideHeader" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hideMessageInput" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showLogo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."AIEmbedding" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector,
    "chatbotId" TEXT NOT NULL,
    "aiFileId" TEXT NOT NULL,

    CONSTRAINT "AIEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIEmbedding_chatbotId_idx" ON "public"."AIEmbedding"("chatbotId");

-- AddForeignKey
ALTER TABLE "public"."AIEmbedding" ADD CONSTRAINT "AIEmbedding_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIEmbedding" ADD CONSTRAINT "AIEmbedding_aiFileId_fkey" FOREIGN KEY ("aiFileId") REFERENCES "public"."AIFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
