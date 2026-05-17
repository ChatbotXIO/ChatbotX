DROP INDEX "IntegrationSmtp_workspaceId_idx";--> statement-breakpoint
CREATE INDEX "IntegrationSmtp_workspaceId_idx" ON "IntegrationSmtp" ("workspaceId");