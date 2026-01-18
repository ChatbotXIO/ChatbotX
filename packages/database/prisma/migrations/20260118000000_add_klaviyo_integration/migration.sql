-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'klaviyo';

-- CreateTable
CREATE TABLE "IntegrationKlaviyo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationKlaviyo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationKlaviyo_integrationId_key" ON "IntegrationKlaviyo"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationKlaviyo" ADD CONSTRAINT "IntegrationKlaviyo_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationKlaviyo" ADD CONSTRAINT "IntegrationKlaviyo_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
