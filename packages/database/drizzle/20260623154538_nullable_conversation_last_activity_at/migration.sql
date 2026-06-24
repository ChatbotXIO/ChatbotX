ALTER TABLE "Conversation" ALTER COLUMN "lastActivityAt" DROP DEFAULT;
ALTER TABLE "Conversation" ALTER COLUMN "lastActivityAt" DROP NOT NULL;
