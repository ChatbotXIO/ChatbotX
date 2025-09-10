/*
  Warnings:

  - You are about to drop the column `integrationId` on the `IntegrationMessenger` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."IntegrationMessenger" DROP CONSTRAINT "IntegrationMessenger_integrationId_fkey";

-- DropIndex
DROP INDEX "public"."IntegrationMessenger_integrationId_key";

-- AlterTable
ALTER TABLE "public"."IntegrationMessenger" DROP COLUMN "integrationId";
