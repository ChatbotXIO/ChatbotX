ALTER TABLE "Workspace" ADD COLUMN "scheduledDeletionAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "Workspace_scheduledDeletionAt_idx" ON "Workspace" ("scheduledDeletionAt");
