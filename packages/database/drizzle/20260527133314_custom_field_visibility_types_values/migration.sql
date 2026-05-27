-- Paridade Respond.io Camada 2 Dados Mestres (gap #10 catalogado 2026-05-27):
-- adicionar tipos `time`/`url`/`list` ao enum customFieldType + migrar
-- showInInbox (boolean) → visibility (enum 3-state alwaysShow/alwaysHide/
-- hideWhenEmpty) + adicionar coluna `values` (jsonb) pra opções do tipo list.

-- 1) Adicionar 3 novos valores ao enum customFieldType.
ALTER TYPE "customFieldType" ADD VALUE IF NOT EXISTS 'time';--> statement-breakpoint
ALTER TYPE "customFieldType" ADD VALUE IF NOT EXISTS 'url';--> statement-breakpoint
ALTER TYPE "customFieldType" ADD VALUE IF NOT EXISTS 'list';--> statement-breakpoint

-- 2) Visibility 3-state — ADD com default + backfill antes de DROP do legado.
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'alwaysShow' NOT NULL;--> statement-breakpoint
UPDATE "CustomField"
  SET "visibility" = CASE WHEN "showInInbox" THEN 'alwaysShow' ELSE 'alwaysHide' END
  WHERE TRUE;--> statement-breakpoint
ALTER TABLE "CustomField" DROP COLUMN IF EXISTS "showInInbox";--> statement-breakpoint

-- 3) Coluna `values` (jsonb) pra opções pré-definidas do tipo list.
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "values" jsonb DEFAULT '[]'::jsonb NOT NULL;
