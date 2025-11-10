-- CreateTable
CREATE TABLE "ChatbotUsage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactsCount" INTEGER NOT NULL DEFAULT 0,
    "maxContacts" INTEGER NOT NULL DEFAULT 0,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "ChatbotUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotUsage_chatbotId_key" ON "ChatbotUsage"("chatbotId");

-- AddForeignKey
ALTER TABLE "ChatbotUsage" ADD CONSTRAINT "ChatbotUsage_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
