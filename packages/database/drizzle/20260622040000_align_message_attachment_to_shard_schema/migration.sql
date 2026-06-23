-- Align Message and Attachment tables on main DB to match shard DB schema.
--
-- Key structural changes:
--   1. Composite PRIMARY KEY (id, createdAt) on both tables — TimescaleDB partition requirement.
--   2. messageCreatedAt column added to Attachment — needed to locate the parent Message chunk.
--   3. Indexes rebuilt to include createdAt for efficient time-range scans.
--   4. TimescaleDB hypertables with 7-day chunks and 30-day compression.
--   5. FK constraints referencing hypertables are dropped:
--        - Attachment.messageId → Message (FK to hypertable not supported)
--        - AIConversationSource.messageId → Message
--        - AIConversationSource.attachmentId → Attachment
--      FK FROM hypertables TO regular tables (Workspace, Conversation, ContactInbox) are kept.
--
-- WARNING: This migration drops and recreates Message and Attachment.
--          ALL EXISTING DATA IN THESE TABLES WILL BE LOST.
--          Take a full database backup before running.

-- Enable TimescaleDB on the main database
CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint

-- Drop Attachment first (it has an FK to Message).
-- CASCADE removes:
--   - Attachment_messageId_Message_id_fkey
--   - AIConversationSource_attachmentId_Attachment_id_fkey
DROP TABLE IF EXISTS "Attachment" CASCADE;
--> statement-breakpoint

-- Drop Message. CASCADE removes:
--   - AIConversationSource_messageId_Message_id_fkey
--   - any remaining constraints referencing Message
DROP TABLE IF EXISTS "Message" CASCADE;
--> statement-breakpoint

-- ─────────────────────────────────────────────
-- Message table (TimescaleDB hypertable)
-- ─────────────────────────────────────────────
CREATE TABLE "Message" (
  "id" bigint NOT NULL,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "conversationId" bigint NOT NULL,
  "contactInboxId" bigint NOT NULL,
  "workspaceId" bigint NOT NULL,
  "text" text,
  "contentAttributes" jsonb,
  "messageType" "messageType" NOT NULL,
  "contentType" "contentType" NOT NULL,
  "senderType" "senderType" NOT NULL,
  "senderId" bigint,
  "sourceId" text,
  PRIMARY KEY ("id", "createdAt")
);
--> statement-breakpoint

SELECT create_hypertable('"Message"', by_range('createdAt', INTERVAL '7 days'), if_not_exists => TRUE);
--> statement-breakpoint

-- FK from Message to regular tables (supported — FK FROM hypertable TO regular table is fine)
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_Conversation_id_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "Message" ADD CONSTRAINT "Message_contactInboxId_ContactInbox_id_fkey"
  FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_Workspace_id_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

-- ─────────────────────────────────────────────
-- Attachment table (TimescaleDB hypertable)
-- messageCreatedAt is the partition key of the parent Message row —
-- required to look up the message without a full chunk scan.
-- ─────────────────────────────────────────────
CREATE TABLE "Attachment" (
  "id" bigint NOT NULL,
  "createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
  "workspaceId" bigint NOT NULL,
  "conversationId" bigint NOT NULL,
  "messageId" bigint NOT NULL,
  "messageCreatedAt" timestamp(6) with time zone NOT NULL,
  "fileType" "fileType" NOT NULL,
  "sourceId" text,
  "mimeType" text NOT NULL,
  "width" integer,
  "height" integer,
  "size" integer DEFAULT 0 NOT NULL,
  "thumbnailPath" text,
  "originPath" text NOT NULL,
  "name" text,
  PRIMARY KEY ("id", "createdAt")
);
--> statement-breakpoint

SELECT create_hypertable('"Attachment"', by_range('createdAt', INTERVAL '7 days'), if_not_exists => TRUE);
--> statement-breakpoint

-- FK from Attachment to regular tables only.
-- Attachment.messageId has NO FK to Message — FK references to hypertables are unsupported.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_Workspace_id_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_Conversation_id_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

-- ─────────────────────────────────────────────
-- Message indexes
-- ─────────────────────────────────────────────
CREATE INDEX "Message_conversation_history_idx"
  ON "Message" ("conversationId", "createdAt" DESC, "id" DESC);
--> statement-breakpoint

CREATE INDEX "Message_workspace_created_idx"
  ON "Message" ("workspaceId", "createdAt" DESC);
--> statement-breakpoint

CREATE INDEX "Message_contactInboxId_sourceId_createdAt_idx"
  ON "Message" ("contactInboxId", "sourceId", "createdAt" DESC);
--> statement-breakpoint

-- DB-level dedup fallback when the distributed lock expires under extreme load.
-- Includes createdAt because TimescaleDB unique constraints must include the partition key.
CREATE UNIQUE INDEX "Message_source_dedup_idx"
  ON "Message" ("contactInboxId", "sourceId", "createdAt");
--> statement-breakpoint

-- ─────────────────────────────────────────────
-- Attachment indexes
-- ─────────────────────────────────────────────
CREATE INDEX "Attachment_message_idx"
  ON "Attachment" ("messageId", "messageCreatedAt" DESC);
--> statement-breakpoint

CREATE INDEX "Attachment_workspaceId_createdAt_idx"
  ON "Attachment" ("workspaceId", "createdAt" DESC);
--> statement-breakpoint

CREATE INDEX "Attachment_conversationId_idx"
  ON "Attachment" ("conversationId", "createdAt" DESC);
--> statement-breakpoint

-- ─────────────────────────────────────────────
-- TimescaleDB compression (chunks older than 30 days)
-- ─────────────────────────────────────────────
ALTER TABLE "Message" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"workspaceId","conversationId"',
  timescaledb.compress_orderby = '"createdAt" DESC'
);
--> statement-breakpoint

SELECT add_compression_policy('"Message"', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint

ALTER TABLE "Attachment" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"workspaceId","conversationId"',
  timescaledb.compress_orderby = '"createdAt" DESC'
);
--> statement-breakpoint

SELECT add_compression_policy('"Attachment"', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint

-- ─────────────────────────────────────────────
-- updatedAt triggers (Drizzle's $onUpdate does not work on hypertables)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "Message_updated_at_trigger" ON "Message";
--> statement-breakpoint

CREATE TRIGGER "Message_updated_at_trigger"
  BEFORE UPDATE ON "Message"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
--> statement-breakpoint

DROP TRIGGER IF EXISTS "Attachment_updated_at_trigger" ON "Attachment";
--> statement-breakpoint

CREATE TRIGGER "Attachment_updated_at_trigger"
  BEFORE UPDATE ON "Attachment"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
