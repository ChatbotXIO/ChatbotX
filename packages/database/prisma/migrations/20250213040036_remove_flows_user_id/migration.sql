/*
  Warnings:

  - You are about to drop the column `userId` on the `Flow` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_userId_fkey";

-- AlterTable
ALTER TABLE "Flow" DROP COLUMN "userId";
