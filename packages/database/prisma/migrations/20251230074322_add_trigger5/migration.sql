/*
  Warnings:

  - You are about to drop the column `filters` on the `Trigger` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trigger" DROP COLUMN "filters",
ADD COLUMN     "conditions" JSONB NOT NULL DEFAULT '{}';
