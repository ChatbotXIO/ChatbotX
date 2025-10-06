-- AlterEnum
ALTER TYPE "public"."InboxType" ADD VALUE 'ZALO';

-- AlterEnum
ALTER TYPE "public"."IntegrationType" ADD VALUE 'ZALO';

-- CreateTable
CREATE TABLE "public"."IntegrationZalo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auth" JSONB NOT NULL,
    "oaId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "fallbackFlowId" TEXT,

    CONSTRAINT "IntegrationZalo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationZalo_inboxId_key" ON "public"."IntegrationZalo"("inboxId");

-- CreateIndex
CREATE INDEX "IntegrationZalo_chatbotId_idx" ON "public"."IntegrationZalo"("chatbotId");

-- CreateIndex
CREATE INDEX "IntegrationZalo_fallbackFlowId_idx" ON "public"."IntegrationZalo"("fallbackFlowId");

-- AddForeignKey
ALTER TABLE "public"."IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_fallbackFlowId_fkey" FOREIGN KEY ("fallbackFlowId") REFERENCES "public"."Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

