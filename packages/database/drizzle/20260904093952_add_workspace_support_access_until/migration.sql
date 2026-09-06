ALTER TABLE "Workspace" ADD COLUMN "supportAccessUntil" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "Workspace_supportAccessUntil_idx" ON "Workspace" ("supportAccessUntil");
