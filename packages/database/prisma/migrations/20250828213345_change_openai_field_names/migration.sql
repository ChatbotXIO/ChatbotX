/*
  Warnings:

  - You are about to drop the column `aiAutoReply` on the `IntegrationGemini` table. All the data in the column will be lost.
  - You are about to drop the column `automatedResponse` on the `IntegrationOpenAI` table. All the data in the column will be lost.
  - You are about to drop the column `automatedVoiceResponse` on the `IntegrationOpenAI` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationGemini" RENAME COLUMN "aiAutoReply" TO "autoReply";

-- AlterTable
ALTER TABLE "public"."IntegrationOpenAI" RENAME COLUMN "automatedResponse" TO "autoReply";
ALTER TABLE "public"."IntegrationOpenAI" RENAME COLUMN "automatedVoiceResponse" TO "autoReplyVoice";
ALTER TABLE "public"."IntegrationOpenAI" ALTER COLUMN "autoReply" SET DEFAULT true;