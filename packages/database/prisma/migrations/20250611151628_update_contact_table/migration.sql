/*
  Warnings:

  - You are about to drop the column `blockedAt` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `followed` on the `Conversation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "assignedInboxTeamId" TEXT,
ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "followed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "blockedAt",
DROP COLUMN "followed";
