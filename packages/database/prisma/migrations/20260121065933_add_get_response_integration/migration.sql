-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'getResponse';

-- CreateTable
CREATE TABLE "IntegrationGetResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationGetResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGetResponse_integrationId_key" ON "IntegrationGetResponse"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationGetResponse" ADD CONSTRAINT "IntegrationGetResponse_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGetResponse" ADD CONSTRAINT "IntegrationGetResponse_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
