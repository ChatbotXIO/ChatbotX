/*
  Warnings:

  - A unique constraint covering the columns `[integrationId]` on the table `IntegrationGemini` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `integrationId` to the `IntegrationGemini` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxTokens` to the `IntegrationGemini` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `IntegrationGemini` table without a default value. This is not possible if the table is not empty.
  - Added the required column `temperature` to the `IntegrationGemini` table without a default value. This is not possible if the table is not empty.
  - Made the column `auth` on table `IntegrationGemini` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "IntegrationGemini" ADD COLUMN     "integrationId" TEXT NOT NULL,
ADD COLUMN     "maxTokens" INTEGER NOT NULL,
ADD COLUMN     "model" TEXT NOT NULL,
ADD COLUMN     "prompt" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "auth" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGemini_integrationId_key" ON "IntegrationGemini"("integrationId");

-- AddForeignKey
ALTER TABLE "IntegrationGemini" ADD CONSTRAINT "IntegrationGemini_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
