ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'trigger';--> statement-breakpoint
ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'webhook';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Condition" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text,
	"webhookId" text,
	"type" integer NOT NULL,
	"sourceId" text,
	"operator" varchar(255),
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TriggerContactHistory" (
	"id" text,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text NOT NULL,
	"contactId" text,
	"chatbotId" text NOT NULL,
	"firstEnteredAt" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "TriggerContactHistory_pkey" PRIMARY KEY("id","contactId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TriggerExecution" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"executedAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text NOT NULL,
	"contactId" text NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Trigger" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folderId" text,
	"actions" jsonb DEFAULT '[]' NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TriggerStats" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"triggerId" text NOT NULL,
	"chatbotId" text NOT NULL,
	"date" timestamp(3) NOT NULL,
	"totalContacts" integer DEFAULT 0 NOT NULL,
	"successCount" integer DEFAULT 0 NOT NULL,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"totalExecutions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Webhook" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folderId" text,
	"url" text NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Condition_type_sourceId_idx" ON "Condition" ("type" int4_ops,"sourceId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Condition_triggerId_idx" ON "Condition" ("triggerId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Condition_webhookId_idx" ON "Condition" ("webhookId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Condition_type_sourceId_triggerId_idx" ON "Condition" ("type" int4_ops,"sourceId" text_ops,"triggerId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Condition_type_sourceId_webhookId_idx" ON "Condition" ("type" int4_ops,"sourceId" text_ops,"webhookId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerContactHistory_triggerId_contactId_idx" ON "TriggerContactHistory" ("triggerId" text_ops,"contactId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerContactHistory_contactId_idx" ON "TriggerContactHistory" ("contactId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerContactHistory_chatbotId_idx" ON "TriggerContactHistory" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerExecution_triggerId_contactId_idx" ON "TriggerExecution" ("triggerId" text_ops,"contactId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerExecution_chatbotId_idx" ON "TriggerExecution" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Trigger_chatbotId_name_key" ON "Trigger" ("chatbotId" text_ops,"name" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Trigger_chatbotId_idx" ON "Trigger" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Trigger_folderId_idx" ON "Trigger" ("folderId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Trigger_chatbotId_active_idx" ON "Trigger" ("chatbotId" text_ops,"active" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "TriggerStats_triggerId_date_key" ON "TriggerStats" ("triggerId" text_ops,"date" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerStats_triggerId_date_idx" ON "TriggerStats" ("triggerId" text_ops,"date" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TriggerStats_chatbotId_date_idx" ON "TriggerStats" ("chatbotId" text_ops,"date" timestamp_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Webhook_chatbotId_idx" ON "Webhook" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Webhook_folderId_idx" ON "Webhook" ("folderId" text_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Webhook_chatbotId_active_idx" ON "Webhook" ("chatbotId" text_ops,"active" bool_ops);--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Condition_triggerId_fkey'
	) THEN
		ALTER TABLE "Condition" ADD CONSTRAINT "Condition_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Condition_webhookId_fkey'
	) THEN
		ALTER TABLE "Condition" ADD CONSTRAINT "Condition_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerContactHistory_triggerId_fkey'
	) THEN
		ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerContactHistory_contactId_fkey'
	) THEN
		ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerContactHistory_chatbotId_fkey'
	) THEN
		ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerExecution_triggerId_fkey'
	) THEN
		ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerExecution_contactId_fkey'
	) THEN
		ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerExecution_chatbotId_fkey'
	) THEN
		ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Trigger_folderId_fkey'
	) THEN
		ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Trigger_chatbotId_fkey'
	) THEN
		ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerStats_triggerId_fkey'
	) THEN
		ALTER TABLE "TriggerStats" ADD CONSTRAINT "TriggerStats_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'TriggerStats_chatbotId_fkey'
	) THEN
		ALTER TABLE "TriggerStats" ADD CONSTRAINT "TriggerStats_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Webhook_folderId_fkey'
	) THEN
		ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'Webhook_chatbotId_fkey'
	) THEN
		ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END
$$;
