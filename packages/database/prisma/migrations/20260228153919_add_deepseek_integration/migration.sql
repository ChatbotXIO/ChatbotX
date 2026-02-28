-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'deepseek';

-- CreateTable
CREATE TABLE "IntegrationDeepSeek" (
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

    CONSTRAINT "IntegrationDeepSeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDeepSeek_chatbotId_key" ON "IntegrationDeepSeek"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDeepSeek_integrationId_key" ON "IntegrationDeepSeek"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationDeepSeek" ADD CONSTRAINT "IntegrationDeepSeek_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDeepSeek" ADD CONSTRAINT "IntegrationDeepSeek_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
