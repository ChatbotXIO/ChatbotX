-- CreateTable
CREATE TABLE "AutomatedResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "userMessages" TEXT[],
    "folderId" TEXT,
    "replies" JSONB[],
    "status" BOOLEAN NOT NULL,

    CONSTRAINT "AutomatedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomatedResponse_chatbotId_idx" ON "AutomatedResponse"("chatbotId");

-- AddForeignKey
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
