/*
  Warnings:

  - You are about to drop the column `maximumOutputTokens` on the `IntegrationOpenAI` table. All the data in the column will be lost.
  - Added the required column `maxTokens` to the `IntegrationOpenAI` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "IntegrationOpenAI" DROP COLUMN "maximumOutputTokens",
ADD COLUMN     "maxTokens" INTEGER NOT NULL;
