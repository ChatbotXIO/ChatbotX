CREATE TABLE "IntegrationTelegram" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"botId" text NOT NULL,
	"botUsername" text NOT NULL,
	"name" text NOT NULL,
	"chatbotId" text NOT NULL,
	"inboxId" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IntegrationTelegram_chatbotId_idx" ON "IntegrationTelegram" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationTelegram_inboxId_key" ON "IntegrationTelegram" ("inboxId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationTelegram_botId_chatbotId_key" ON "IntegrationTelegram" ("botId" text_ops,"chatbotId" text_ops);--> statement-breakpoint
ALTER TABLE "IntegrationTelegram" ADD CONSTRAINT "IntegrationTelegram_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationTelegram" ADD CONSTRAINT "IntegrationTelegram_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;