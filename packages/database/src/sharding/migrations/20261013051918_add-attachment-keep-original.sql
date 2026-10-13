-- Shard migration: add-attachment-keep-original
-- Version: 20261013051918

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "keepOriginal" boolean;
