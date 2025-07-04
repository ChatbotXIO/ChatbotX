/*
  Warnings:

  - You are about to drop the column `assignedId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `assignedInboxTeamId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `assignedType` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `assignedUserId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `executorId` on the `Log` table. All the data in the column will be lost.
  - You are about to drop the column `executorType` on the `Log` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "team_assignedId";

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "user_assignedId";

-- DropForeignKey
ALTER TABLE "Log" DROP CONSTRAINT "contact_executorId";

-- DropForeignKey
ALTER TABLE "Log" DROP CONSTRAINT "user_executorId";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "assignedId",
DROP COLUMN "assignedInboxTeamId",
DROP COLUMN "assignedType",
DROP COLUMN "assignedUserId";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assignedInboxTeamId" TEXT,
ADD COLUMN     "assignedUserId" TEXT;

-- AlterTable
ALTER TABLE "Log" DROP COLUMN "executorId",
DROP COLUMN "executorType",
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedInboxTeamId_fkey" FOREIGN KEY ("assignedInboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
