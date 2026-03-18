DROP INDEX IF EXISTS "BotField_chatbotId_fieldType_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "BotField_chatbotId_fieldType_name_key" ON "BotField" ("chatbotId" text_ops,"type" enum_ops,"name" text_ops);--> statement-breakpoint
DROP INDEX IF EXISTS "CustomField_chatbotId_fieldType_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CustomField_chatbotId_fieldType_name_key" ON "CustomField" ("chatbotId" text_ops,"type" enum_ops,"name" text_ops);
