-- Initialize a new message shard database
-- Run this script on each new shard database before activating it

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create enums (must match main database enums)
DO $$ BEGIN
  CREATE TYPE "senderType" AS ENUM ('bot', 'contact', 'system', 'user', 'api');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "messageType" AS ENUM ('incoming', 'outgoing', 'activity');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "contentType" AS ENUM ('text', 'location', 'refLink');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "fileType" AS ENUM ('image', 'video', 'audio', 'gif', 'file');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create Message table (without FK to main DB tables)
CREATE TABLE IF NOT EXISTS "Message" (
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

-- Convert Message table to TimescaleDB hypertable
-- Partitioned by createdAt with 7-day chunks
SELECT create_hypertable(
  '"Message"',
  by_range('createdAt', INTERVAL '7 days'),
  if_not_exists => TRUE
);

-- Create Attachment table (with FK to Message on same shard)
-- Note: FK constraint removed because Message is now a hypertable
CREATE TABLE IF NOT EXISTS "Attachment" (
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

-- Convert Attachment table to TimescaleDB hypertable
-- Partitioned by createdAt with 7-day chunks (same as Message)
SELECT create_hypertable(
  '"Attachment"',
  by_range('createdAt', INTERVAL '7 days'),
  if_not_exists => TRUE
);

-- Essential indexes for Message table
-- TimescaleDB automatically creates index on createdAt for chunk pruning
CREATE INDEX IF NOT EXISTS "Message_conversation_history_idx"
  ON "Message" ("conversationId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "Message_workspace_created_idx"
  ON "Message" ("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_contactInboxId_sourceId_createdAt_idx"
  ON "Message" ("contactInboxId", "sourceId", "createdAt" DESC);

-- Indexes for Attachment table
-- Include messageCreatedAt for efficient joins with Message hypertable
CREATE INDEX IF NOT EXISTS "Attachment_message_idx"
  ON "Attachment" ("messageId", "messageCreatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Attachment_workspaceId_createdAt_idx"
  ON "Attachment" ("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Attachment_conversationId_idx"
  ON "Attachment" ("conversationId", "createdAt" DESC);

-- Enable compression for older chunks (optional, for production)
-- ALTER TABLE "Message" SET (
--   timescaledb.compress,
--   timescaledb.compress_segmentby = 'conversationId, workspaceId'
-- );
-- SELECT add_compression_policy('"Message"', INTERVAL '30 days');

-- ALTER TABLE "Attachment" SET (
--   timescaledb.compress,
--   timescaledb.compress_segmentby = 'conversationId, workspaceId'
-- );
-- SELECT add_compression_policy('"Attachment"', INTERVAL '30 days');

-- Create updatedAt trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updatedAt trigger to Message table
DROP TRIGGER IF EXISTS "Message_updated_at_trigger" ON "Message";
CREATE TRIGGER "Message_updated_at_trigger"
  BEFORE UPDATE ON "Message"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add updatedAt trigger to Attachment table
DROP TRIGGER IF EXISTS "Attachment_updated_at_trigger" ON "Attachment";
CREATE TRIGGER "Attachment_updated_at_trigger"
  BEFORE UPDATE ON "Attachment"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Verify setup
DO $$
BEGIN
  RAISE NOTICE 'Message shard initialization complete.';
  RAISE NOTICE 'Tables created: Message (hypertable), Attachment (hypertable)';
  RAISE NOTICE 'Enums created: senderType, messageType, contentType, fileType';
  RAISE NOTICE 'TimescaleDB enabled with 7-day chunk intervals';
  RAISE NOTICE 'Indexes optimized for time-based queries';
  RAISE NOTICE 'Triggers: updatedAt auto-update on Message and Attachment';
END $$;
