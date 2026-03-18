DROP INDEX "BotField_chatbotId_fieldType_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "BotField_chatbotId_fieldType_name_key" ON "BotField" ("chatbotId" text_ops,"type" enum_ops,"name" text_ops);--> statement-breakpoint
DROP INDEX "CustomField_chatbotId_fieldType_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "CustomField_chatbotId_fieldType_name_key" ON "CustomField" ("chatbotId" text_ops,"type" enum_ops,"name" text_ops);