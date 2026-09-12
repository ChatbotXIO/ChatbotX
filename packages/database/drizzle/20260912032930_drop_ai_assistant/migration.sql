ALTER TABLE "IntegrationOpenai" DROP CONSTRAINT IF EXISTS "IntegrationOpenai_aiAssistantId_AIAssistant_id_fkey";--> statement-breakpoint
ALTER TABLE "IntegrationOpenai" DROP COLUMN IF EXISTS "aiAssistantId";--> statement-breakpoint
ALTER TABLE "AIAssistant" DROP CONSTRAINT IF EXISTS "AIAssistant_workspaceId_Workspace_id_fkey";--> statement-breakpoint
DROP TABLE IF EXISTS "AIAssistant";