CREATE TABLE "IntegrationInstagram" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"igId" text NOT NULL,
	"pageId" text NOT NULL,
	"name" text NOT NULL,
	"chatbotId" text NOT NULL,
	"inboxId" text NOT NULL,
	"fallbackFlowId" text
);
--> statement-breakpoint
CREATE INDEX "IntegrationInstagram_chatbotId_idx" ON "IntegrationInstagram" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationInstagram_fallbackFlowId_idx" ON "IntegrationInstagram" ("fallbackFlowId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationInstagram_inboxId_key" ON "IntegrationInstagram" ("inboxId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationInstagram_igId_key" ON "IntegrationInstagram" ("igId" text_ops);--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD CONSTRAINT "IntegrationInstagram_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD CONSTRAINT "IntegrationInstagram_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD CONSTRAINT "IntegrationInstagram_fallbackFlowId_fkey" FOREIGN KEY ("fallbackFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;