ALTER TABLE "AIAgent" ADD COLUMN "actionPrompt" text;--> statement-breakpoint
ALTER TABLE "AIAgent" ADD COLUMN "actionRules" jsonb[];--> statement-breakpoint
UPDATE "AIAgent" SET "actionRules" = ARRAY[]::jsonb[] WHERE "actionRules" IS NULL;--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "actionRules" SET NOT NULL;
