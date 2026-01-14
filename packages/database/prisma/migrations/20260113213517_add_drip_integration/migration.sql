-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'drip';

-- CreateTable
CREATE TABLE "IntegrationDrip" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiToken" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationDrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDrip_integrationId_key" ON "IntegrationDrip"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationDrip" ADD CONSTRAINT "IntegrationDrip_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDrip" ADD CONSTRAINT "IntegrationDrip_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
