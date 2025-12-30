-- CreateTable
CREATE TABLE "Reflink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "fieldId" TEXT,

    CONSTRAINT "Reflink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reflink_chatbotId_idx" ON "Reflink"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "Reflink_chatbotId_flowId_key" ON "Reflink"("chatbotId", "flowId");

-- AddForeignKey
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;
