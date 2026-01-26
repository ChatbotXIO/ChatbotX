-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'moosend';

-- CreateTable
CREATE TABLE "IntegrationMoosend" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationMoosend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMoosend_integrationId_key" ON "IntegrationMoosend"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationMoosend" ADD CONSTRAINT "IntegrationMoosend_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationMoosend" ADD CONSTRAINT "IntegrationMoosend_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
