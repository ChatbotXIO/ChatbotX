CREATE TABLE "Reflink" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"flowId" text NOT NULL,
	"chatbotId" text NOT NULL,
	"customFieldId" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "Reflink_chatbotId_name_key" ON "Reflink" ("chatbotId" text_ops,"name" text_ops);--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE SET NULL ON UPDATE CASCADE;