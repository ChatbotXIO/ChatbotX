-- CreateTable
CREATE TABLE "public"."IntegrationMessenger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auth" JSONB NOT NULL,
    "pageId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "fallbackFlowId" TEXT,

    CONSTRAINT "IntegrationMessenger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMessenger_inboxId_key" ON "public"."IntegrationMessenger"("inboxId");

-- CreateIndex
CREATE INDEX "IntegrationMessenger_chatbotId_idx" ON "public"."IntegrationMessenger"("chatbotId");

-- CreateIndex
CREATE INDEX "IntegrationMessenger_fallbackFlowId_idx" ON "public"."IntegrationMessenger"("fallbackFlowId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMessenger_pageId_key" ON "public"."IntegrationMessenger"("pageId");

-- AddForeignKey
ALTER TABLE "public"."IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "public"."Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "public"."Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_fallbackFlowId_fkey" FOREIGN KEY ("fallbackFlowId") REFERENCES "public"."Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
