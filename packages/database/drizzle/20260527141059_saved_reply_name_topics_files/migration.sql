-- Paridade Respond.io Camada 2 (gap #12 — 2026-05-27): SavedReply (Snippet)
-- ganha nome descritivo, tópicos (tags) e anexos de arquivo.

ALTER TABLE "SavedReply" ADD COLUMN IF NOT EXISTS "name" text;--> statement-breakpoint
ALTER TABLE "SavedReply" ADD COLUMN IF NOT EXISTS "topics" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "SavedReply" ADD COLUMN IF NOT EXISTS "files" jsonb DEFAULT '[]'::jsonb NOT NULL;
