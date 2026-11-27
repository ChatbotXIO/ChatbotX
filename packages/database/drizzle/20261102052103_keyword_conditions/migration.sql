ALTER TABLE "AutomatedResponse" ADD COLUMN IF NOT EXISTS "conditions" jsonb;--> statement-breakpoint
UPDATE "AutomatedResponse"
SET "conditions" = jsonb_build_array(
  jsonb_build_object('operator', 'contains', 'values', to_jsonb("keywords"))
)
WHERE "type" = 'inbound' AND "conditions" IS NULL;
