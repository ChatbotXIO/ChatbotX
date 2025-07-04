/*
  Warnings:

  - You are about to drop the column `followed` on the `Contact` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "followed";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "followed" BOOLEAN NOT NULL DEFAULT false;
