/*
  Warnings:

  - The values [CHAT_WIDGET] on the enum `InboxType` will be removed. If these variants are still used in the database, this will fail.
  - The values [CHAT_WIDGET] on the enum `IntegrationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `IntegrationChatWidget` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."InboxType_new" AS ENUM ('OMNICHANNEL', 'WEBCHAT', 'INSTAGRAM', 'MESSENGER', 'WHATSAPP');
ALTER TABLE "public"."Inbox" ALTER COLUMN "inboxType" TYPE "public"."InboxType_new" USING ("inboxType"::text::"public"."InboxType_new");
ALTER TABLE "public"."Broadcast" ALTER COLUMN "inboxType" TYPE "public"."InboxType_new" USING ("inboxType"::text::"public"."InboxType_new");
ALTER TYPE "public"."InboxType" RENAME TO "InboxType_old";
ALTER TYPE "public"."InboxType_new" RENAME TO "InboxType";
DROP TYPE "public"."InboxType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "public"."IntegrationType_new" AS ENUM ('WEBCHAT', 'GOOGLE_SHEETS', 'INSTAGRAM', 'MESSENGER', 'OPENAI', 'GEMINI', 'WHATSAPP');
ALTER TABLE "public"."Integration" ALTER COLUMN "integrationType" TYPE "public"."IntegrationType_new" USING ("integrationType"::text::"public"."IntegrationType_new");
ALTER TYPE "public"."IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "public"."IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "public"."IntegrationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."IntegrationChatWidget" DROP CONSTRAINT "IntegrationChatWidget_chatbotId_fkey";

-- DropForeignKey
ALTER TABLE "public"."IntegrationChatWidget" DROP CONSTRAINT "IntegrationChatWidget_inboxId_fkey";

-- DropTable
DROP TABLE "public"."IntegrationChatWidget";

-- CreateTable
CREATE TABLE "public"."IntegrationWebchat" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auth" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "enable" BOOLEAN NOT NULL DEFAULT true,
    "authorizedDomains" TEXT[],
    "conversationStarters" JSONB[],
    "persistentMenus" JSONB[],
    "brandColor" TEXT NOT NULL DEFAULT '#007bff',
    "showHeader" BOOLEAN NOT NULL DEFAULT true,
    "showPersonalLogo" BOOLEAN NOT NULL DEFAULT false,
    "showMessageInput" BOOLEAN NOT NULL DEFAULT true,
    "customCss" TEXT,
    "chatbotId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "welcomeFlowId" TEXT,

    CONSTRAINT "IntegrationWebchat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebchat_inboxId_key" ON "public"."IntegrationWebchat"("inboxId");

-- CreateIndex
CREATE INDEX "IntegrationWebchat_chatbotId_idx" ON "public"."IntegrationWebchat"("chatbotId");

-- CreateIndex
CREATE INDEX "IntegrationWebchat_inboxId_idx" ON "public"."IntegrationWebchat"("inboxId");

-- CreateIndex
CREATE INDEX "IntegrationWebchat_welcomeFlowId_idx" ON "public"."IntegrationWebchat"("welcomeFlowId");

-- AddForeignKey
ALTER TABLE "public"."IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_welcomeFlowId_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "public"."Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
