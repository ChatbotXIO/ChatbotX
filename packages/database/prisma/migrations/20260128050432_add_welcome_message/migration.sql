/*
  Warnings:

  - You are about to drop the column `fallbackFlowId` on the `IntegrationMessenger` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "IntegrationMessenger" DROP CONSTRAINT "IntegrationMessenger_fallbackFlowId_fkey";

-- DropIndex
DROP INDEX "IntegrationMessenger_fallbackFlowId_idx";

-- AlterTable
ALTER TABLE "IntegrationMessenger" DROP COLUMN "fallbackFlowId",
ADD COLUMN     "greetingMessages" JSONB[] DEFAULT ARRAY[]::JSONB[],
ADD COLUMN     "welcomeFlowId" TEXT;

-- CreateIndex
CREATE INDEX "IntegrationMessenger_welcomeFlowId_idx" ON "IntegrationMessenger"("welcomeFlowId");

-- AddForeignKey
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_welcomeFlowId_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
