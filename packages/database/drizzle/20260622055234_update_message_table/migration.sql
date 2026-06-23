ALTER TABLE "Conversation" ADD COLUMN "sourceId" text;--> statement-breakpoint
UPDATE "Conversation" c
SET "sourceId" = ci."sourceConversationId"
FROM "ContactInbox" ci
WHERE ci."contactId" = c."contactId"
  AND ci."sourceConversationId" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "Conversation_contactId_key";--> statement-breakpoint

CREATE UNIQUE INDEX "Conversation_contactId_sourceId_key" ON "Conversation" ("contactId","sourceId") WHERE "sourceId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactInbox" DROP COLUMN "sourceConversationId";

ALTER TABLE "Message" ADD COLUMN "deletedAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "Message_deletedAt_idx" ON "Message" ("deletedAt");--> statement-breakpoint
UPDATE "Message" SET "deletedAt" = "updatedAt" WHERE ("contentAttributes"->>'deleted')::boolean = true;

CREATE TYPE "messageKind" AS ENUM('message', 'comment');--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "type" "messageKind" DEFAULT 'message'::"messageKind" NOT NULL;--> statement-breakpoint
ALTER TABLE "Message" ADD COLUMN "parentId" text;--> statement-breakpoint
UPDATE "Message" SET "type" = 'comment' WHERE "contentAttributes"->>'isComment' = 'true';--> statement-breakpoint
UPDATE "Message" SET "parentId" = "contentAttributes"->>'parentId' WHERE "contentAttributes"->>'parentId' IS NOT NULL;--> statement-breakpoint
CREATE INDEX "Message_conversationId_type_idx" ON "Message" ("conversationId","type");--> statement-breakpoint
CREATE INDEX "Message_parentId_idx" ON "Message" ("parentId") WHERE "parentId" IS NOT NULL;

ALTER TABLE "Message" ADD COLUMN "attributes" jsonb;

CREATE UNIQUE INDEX "Conversation_contactId_dm_key" ON "Conversation" ("contactId") WHERE "sourceId" IS NULL;

DROP INDEX "Message_deletedAt_idx";--> statement-breakpoint
DROP INDEX "Message_conversationId_type_idx";--> statement-breakpoint
CREATE INDEX "Message_conversationId_type_idx" ON "Message" ("workspaceId","conversationId","type","createdAt" DESC NULLS LAST);--> statement-breakpoint
DROP INDEX "Message_parentId_idx";--> statement-breakpoint
CREATE INDEX "Message_parentId_idx" ON "Message" ("workspaceId","parentId","type","createdAt" DESC NULLS LAST) WHERE "parentId" IS NOT NULL;
