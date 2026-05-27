-- Paridade Respond.io Camada 2 (gap #11 — 2026-05-27): slug user-facing
-- imutável `fieldId` no CustomField. Substitui o uso do Snowflake `id`
-- pra APIs/integrações/variáveis de template.

-- 1) ADD COLUMN nullable temporário pra backfill.
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "fieldId" text;--> statement-breakpoint

-- 2) Backfill: gera slug do nome (lowercase + non-alphanumeric → _).
UPDATE "CustomField"
  SET "fieldId" = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))
  WHERE "fieldId" IS NULL;--> statement-breakpoint

-- 3) Remove underscores leading/trailing após backfill (cleanup).
UPDATE "CustomField"
  SET "fieldId" = regexp_replace("fieldId", '^_+|_+$', '', 'g')
  WHERE "fieldId" ~ '^_|_$';--> statement-breakpoint

-- 4) Fallback pra casos edge (nome só com special chars): usa o id.
UPDATE "CustomField"
  SET "fieldId" = 'field_' || id
  WHERE "fieldId" = '' OR "fieldId" IS NULL;--> statement-breakpoint

-- 5) NOT NULL agora que backfill completou.
ALTER TABLE "CustomField" ALTER COLUMN "fieldId" SET NOT NULL;--> statement-breakpoint

-- 6) Unique constraint workspaceId + fieldId (slug único por workspace).
CREATE UNIQUE INDEX IF NOT EXISTS "CustomField_workspaceId_fieldId_key"
  ON "CustomField" USING btree ("workspaceId", "fieldId");
