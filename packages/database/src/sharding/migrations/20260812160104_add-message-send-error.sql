-- Shard migration: add-message-send-error
-- Version: 20260812160104

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "sendError" text;
