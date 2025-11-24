/*
  Warnings:

  - The `inboxType` column on the `Broadcast` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
ALTER TYPE "BroadcastSubaction" ADD VALUE 'OTN';

-- AlterTable
ALTER TABLE "Broadcast" DROP COLUMN "inboxType",
ADD COLUMN     "inboxType" "InboxType";
