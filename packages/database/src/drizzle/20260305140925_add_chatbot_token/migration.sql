CREATE TABLE "jwks" (
	"id" text PRIMARY KEY,
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"createdAt" timestamp(6) with time zone NOT NULL,
	"expiresAt" timestamp(6) with time zone
);
--> statement-breakpoint
ALTER TABLE "Chatbot" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "Integration" ALTER COLUMN "integrationType" SET DATA TYPE text USING "integrationType"::text;--> statement-breakpoint
CREATE INDEX "Integration_chatbotId_integrationType_key" ON "Integration" ("chatbotId" text_ops,"integrationType" text_ops);--> statement-breakpoint
DROP TYPE "IntegrationType";