ALTER TABLE "OAuthConsent" ADD COLUMN "workspaceId" bigint;--> statement-breakpoint
CREATE INDEX "OAuthConsent_workspaceId_idx" ON "OAuthConsent" ("workspaceId") WHERE "workspaceId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "OAuthConsent" ADD CONSTRAINT "OAuthConsent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;