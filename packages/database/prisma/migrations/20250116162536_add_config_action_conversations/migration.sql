-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "followed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liveChatEnabled" BOOLEAN NOT NULL DEFAULT false;
