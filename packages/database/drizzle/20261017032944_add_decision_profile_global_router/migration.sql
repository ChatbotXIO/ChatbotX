ALTER TABLE "DecisionProfile" ADD COLUMN "globalRouterEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "DecisionProfile" ADD COLUMN "globalRouterConfig" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "DecisionProfile_workspaceId_globalRouter_key" ON "DecisionProfile" ("workspaceId") WHERE "globalRouterEnabled" = true;
