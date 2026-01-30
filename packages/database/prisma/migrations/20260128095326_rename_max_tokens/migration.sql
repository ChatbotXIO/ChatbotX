
-- AlterTable
ALTER TABLE "AIAgent" RENAME COLUMN "maxTokens" TO "maxOutputTokens";

-- AlterTable
ALTER TABLE "IntegrationGemini" RENAME COLUMN "maxTokens" TO "maxOutputTokens";

-- AlterTable
ALTER TABLE "IntegrationOpenAI" RENAME COLUMN "maxTokens" TO "maxOutputTokens";
