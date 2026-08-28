ALTER TABLE "Workspace" ADD COLUMN "tokenHash" text;--> statement-breakpoint
CREATE INDEX "Workspace_tokenHash_idx" ON "Workspace" ("tokenHash");--> statement-breakpoint
