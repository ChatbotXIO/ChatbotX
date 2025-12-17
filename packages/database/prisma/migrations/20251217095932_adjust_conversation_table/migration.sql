/*
  Warnings:

  - You are about to drop the column `hasAdminReplied` on the `Conversation` table. All the data in the column will be lost.
  - You are about to drop the column `hasAdminSeen` on the `Conversation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "hasAdminReplied",
DROP COLUMN "hasAdminSeen",
ADD COLUMN     "adminRepliedAt" TIMESTAMP(3),
ADD COLUMN     "contactRepliedAt" TIMESTAMP(3);
