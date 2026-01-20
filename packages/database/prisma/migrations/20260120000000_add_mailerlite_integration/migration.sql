-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'mailerLite';

DROP TABLE IF EXISTS "IntegrationMailerLite";

-- CreateTable
CREATE TABLE "IntegrationMailerLite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationMailerLite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMailerLite_integrationId_key" ON "IntegrationMailerLite"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationMailerLite" ADD CONSTRAINT "IntegrationMailerLite_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationMailerLite" ADD CONSTRAINT "IntegrationMailerLite_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

