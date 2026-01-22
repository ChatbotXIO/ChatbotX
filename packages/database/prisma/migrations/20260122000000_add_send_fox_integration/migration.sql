-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'sendFox';

-- CreateTable
CREATE TABLE "IntegrationSendFox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accessToken" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationSendFox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationSendFox_integrationId_key" ON "IntegrationSendFox"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationSendFox" ADD CONSTRAINT "IntegrationSendFox_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSendFox" ADD CONSTRAINT "IntegrationSendFox_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
