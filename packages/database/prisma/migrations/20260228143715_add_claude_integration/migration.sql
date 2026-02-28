-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'claude';

-- CreateTable
CREATE TABLE "IntegrationClaude" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auth" JSONB NOT NULL,
    "autoReply" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,

    CONSTRAINT "IntegrationClaude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationClaude_chatbotId_key" ON "IntegrationClaude"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationClaude_integrationId_key" ON "IntegrationClaude"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationClaude" ADD CONSTRAINT "IntegrationClaude_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationClaude" ADD CONSTRAINT "IntegrationClaude_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
