-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "hasAdminReplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasAdminSeen" BOOLEAN NOT NULL DEFAULT false;
