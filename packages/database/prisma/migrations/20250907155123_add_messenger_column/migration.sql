/*
  Warnings:

  - A unique constraint covering the columns `[integrationId]` on the table `IntegrationMessenger` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `integrationId` to the `IntegrationMessenger` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationMessenger" ADD COLUMN     "integrationId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMessenger_integrationId_key" ON "public"."IntegrationMessenger"("integrationId");

-- AddForeignKey
ALTER TABLE "public"."IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
