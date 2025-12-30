-- CreateTable
CREATE TABLE "RefLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "fieldId" TEXT,

    CONSTRAINT "RefLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefLink_chatbotId_idx" ON "RefLink"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "RefLink_chatbotId_flowId_key" ON "RefLink"("chatbotId", "flowId");

-- AddForeignKey
ALTER TABLE "RefLink" ADD CONSTRAINT "RefLink_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefLink" ADD CONSTRAINT "RefLink_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefLink" ADD CONSTRAINT "RefLink_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;
