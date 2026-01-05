-- CreateTable
CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trigger_chatbotId_idx" ON "Trigger"("chatbotId");

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
