-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'activeCampaign';

-- CreateTable
CREATE TABLE "IntegrationActiveCampaign" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationActiveCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationActiveCampaign_integrationId_key" ON "IntegrationActiveCampaign"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationActiveCampaign" ADD CONSTRAINT "IntegrationActiveCampaign_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationActiveCampaign" ADD CONSTRAINT "IntegrationActiveCampaign_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

