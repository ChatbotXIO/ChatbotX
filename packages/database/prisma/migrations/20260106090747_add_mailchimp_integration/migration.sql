-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'mailchimp';

-- DropTable
DROP TABLE IF EXISTS "IntegrationMailchimp";

-- CreateTable
CREATE TABLE "IntegrationMailchimp" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auth" JSONB NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationMailchimp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMailchimp_chatbotId_key" ON "IntegrationMailchimp"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMailchimp_integrationId_key" ON "IntegrationMailchimp"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationMailchimp" ADD CONSTRAINT "IntegrationMailchimp_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationMailchimp" ADD CONSTRAINT "IntegrationMailchimp_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
