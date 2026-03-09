ALTER TABLE "Chatbot" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "Integration" ALTER COLUMN "integrationType" SET DATA TYPE text USING "integrationType"::text;--> statement-breakpoint
CREATE INDEX "Integration_chatbotId_integrationType_key" ON "Integration" ("chatbotId" text_ops,"integrationType" text_ops);--> statement-breakpoint
DROP TYPE "IntegrationType";