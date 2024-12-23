/*
  Warnings:

  - You are about to drop the column `teamId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Contact` table. All the data in the column will be lost.
  - Added the required column `gender` to the `Contact` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Unknown');

-- CreateEnum
CREATE TYPE "AssignedType" AS ENUM ('User', 'Team');

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_teamId_fkey";

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_userId_fkey";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "teamId",
DROP COLUMN "userId",
ADD COLUMN     "assignedId" TEXT,
ADD COLUMN     "assignedType" "AssignedType",
DROP COLUMN "gender",
ADD COLUMN     "gender" "Gender" NOT NULL;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "user_assignedId" FOREIGN KEY ("assignedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "team_assignedId" FOREIGN KEY ("assignedId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
