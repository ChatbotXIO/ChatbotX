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

-- Create Attachment table
-- FK to Message omitted because Message is a hypertable
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
SELECT create_hypertable(
  '"Attachment"',
  by_range('createdAt', INTERVAL '7 days'),
  if_not_exists => TRUE
);

-- ─────────────────────────────────────────────
-- Indexes for Message table
-- TimescaleDB automatically indexes the time column for chunk pruning
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Message_conversation_history_idx"
  ON "Message" ("conversationId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "Message_workspace_created_idx"
  ON "Message" ("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_contactInboxId_sourceId_createdAt_idx"
  ON "Message" ("contactInboxId", "sourceId", "createdAt" DESC);

-- DB-level dedup guard: prevents same sourceId at the exact same millisecond.
-- Primary dedup is via distributed lock; this is the fallback for race conditions.
-- TimescaleDB requires unique constraints to include the partition key (createdAt).
CREATE UNIQUE INDEX IF NOT EXISTS "Message_source_dedup_idx"
  ON "Message" ("contactInboxId", "sourceId", "createdAt");

-- ─────────────────────────────────────────────
-- Indexes for Attachment table
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Attachment_message_idx"
  ON "Attachment" ("messageId", "messageCreatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Attachment_workspaceId_createdAt_idx"
  ON "Attachment" ("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Attachment_conversationId_idx"
  ON "Attachment" ("conversationId", "createdAt" DESC);

-- ─────────────────────────────────────────────
-- TimescaleDB compression
-- Chunks older than 30 days are compressed automatically.
-- segmentby matches the most common query pattern (workspace + conversation).
-- ─────────────────────────────────────────────
ALTER TABLE "Message" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'workspaceId,conversationId',
  timescaledb.compress_orderby = 'createdAt DESC'
);
SELECT add_compression_policy('"Message"', INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE "Attachment" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'workspaceId,conversationId',
  timescaledb.compress_orderby = 'createdAt DESC'
);
SELECT add_compression_policy('"Attachment"', INTERVAL '30 days', if_not_exists => TRUE);

-- ─────────────────────────────────────────────
-- updatedAt trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Message_updated_at_trigger" ON "Message";
CREATE TRIGGER "Message_updated_at_trigger"
  BEFORE UPDATE ON "Message"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS "Attachment_updated_at_trigger" ON "Attachment";
CREATE TRIGGER "Attachment_updated_at_trigger"
  BEFORE UPDATE ON "Attachment"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- Shard meta table — tracks schema version and migration history
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_shard_meta" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);

INSERT INTO "_shard_meta" ("key", "value")
VALUES
  ('schemaVersion', '1.0.0'),
  ('initializedAt', now()::text)
ON CONFLICT ("key") DO NOTHING;

-- Verify setup
DO $$
BEGIN
  RAISE NOTICE 'Message shard initialization complete.';
  RAISE NOTICE 'Tables: Message (hypertable, 7-day chunks), Attachment (hypertable, 7-day chunks), _shard_meta';
  RAISE NOTICE 'Compression: enabled for chunks older than 30 days';
  RAISE NOTICE 'Dedup index: Message_source_dedup_idx on (contactInboxId, sourceId, createdAt)';
  RAISE NOTICE 'Schema version: 1.0.0';
END $$;
