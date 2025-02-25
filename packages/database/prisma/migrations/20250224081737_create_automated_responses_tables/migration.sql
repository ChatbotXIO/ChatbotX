-- CreateTable

CREATE TABLE "AutomatedResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "folderId" TEXT,
    "flowId" TEXT,
    "replies" JSONB,
    CONSTRAINT "AutomatedResponse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
