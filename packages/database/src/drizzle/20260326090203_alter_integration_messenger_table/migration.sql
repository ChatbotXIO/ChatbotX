--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" DROP CONSTRAINT IF EXISTS "IntegrationMessenger_fallbackFlowId_fkey";--> statement-breakpoint
DROP INDEX IF EXISTS "IntegrationMessenger_fallbackFlowId_idx";--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "welcomeFlowId" text;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "greetingMessages" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "persistentMenus" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "conversationStarters" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN IF NOT EXISTS "personas" jsonb[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" DROP COLUMN IF EXISTS "fallbackFlowId";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IntegrationMessenger_welcomeFlowId_idx" ON "IntegrationMessenger" ("welcomeFlowId" text_ops);--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_welcomeFlowId_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
