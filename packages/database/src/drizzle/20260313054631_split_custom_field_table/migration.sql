CREATE TABLE "BotField" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" "CustomFieldType" NOT NULL,
	"value" text,
	"description" text,
	"folderId" text,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Field" RENAME TO "CustomField";--> statement-breakpoint
ALTER TABLE "CustomField" RENAME COLUMN "customFieldType" TO "type";--> statement-breakpoint
DROP INDEX IF EXISTS "Field_chatbotId_fieldType_name_key";--> statement-breakpoint
ALTER TABLE "CustomField" DROP COLUMN "fieldType";--> statement-breakpoint
ALTER TABLE "CustomField" DROP COLUMN "value";--> statement-breakpoint
-- CREATE UNIQUE INDEX IF NOT EXISTS "CustomField_chatbotId_fieldType_name_key" ON "CustomField" ("chatbotId" enum_ops,"type" text_ops,"name" enum_ops);--> statement-breakpoint
-- CREATE UNIQUE INDEX IF NOT EXISTS "BotField_chatbotId_fieldType_name_key" ON "BotField" ("chatbotId" enum_ops,"type" text_ops,"name" enum_ops);--> statement-breakpoint
ALTER TABLE "BotField" ADD CONSTRAINT "BotField_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BotField" ADD CONSTRAINT "BotField_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
