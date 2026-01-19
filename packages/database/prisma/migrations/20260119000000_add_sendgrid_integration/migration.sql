-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'sendgrid';

-- CreateTable
CREATE TABLE "IntegrationSendGrid" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationSendGrid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSendGrid_integrationId_key" ON "IntegrationSendGrid"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationSendGrid" ADD CONSTRAINT "IntegrationSendGrid_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSendGrid" ADD CONSTRAINT "IntegrationSendGrid_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
