--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" DROP CONSTRAINT "IntegrationMessenger_fallbackFlowId_fkey";--> statement-breakpoint
DROP INDEX "IntegrationMessenger_fallbackFlowId_idx";--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "welcomeFlowId" text;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "greetingMessages" jsonb[] NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "persistentMenus" jsonb[] NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "conversationStarters" jsonb[] NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "personas" jsonb[] NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" DROP COLUMN "fallbackFlowId";--> statement-breakpoint
CREATE INDEX "IntegrationMessenger_welcomeFlowId_idx" ON "IntegrationMessenger" ("welcomeFlowId" text_ops);--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_welcomeFlowId_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
