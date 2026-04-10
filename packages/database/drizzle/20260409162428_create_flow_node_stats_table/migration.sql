DROP TABLE IF EXISTS "FlowAnalyticsSession" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "FlowNodeStat" CASCADE;--> statement-breakpoint

CREATE TABLE "FlowAnalyticsSession" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"flowId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"deletedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "FlowNodeStat" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"analyticsId" bigint NOT NULL,
	"nodeId" text NOT NULL,
	"buttonId" text,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"failedAt" timestamp(6) with time zone,
	"deliveredAt" timestamp(6) with time zone,
	"seenAt" timestamp(6) with time zone,
	"clickedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "FlowAnalyticsSession_workspaceId_flowId_key" ON "FlowAnalyticsSession" ("flowId","workspaceId") WHERE "deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX "FlowAnalyticsSession_flowId_idx" ON "FlowAnalyticsSession" ("flowId");--> statement-breakpoint
CREATE INDEX "FlowNodeStat_contactInboxId_seenAt_idx" ON "FlowNodeStat" ("contactInboxId","seenAt");--> statement-breakpoint
CREATE INDEX "FlowNodeStat_analyticsId_nodeId_idx" ON "FlowNodeStat" ("analyticsId","nodeId");--> statement-breakpoint
CREATE UNIQUE INDEX "FlowNodeStat_analyticsId_nodeId_contactId_key" ON "FlowNodeStat" ("analyticsId","nodeId","contactId");--> statement-breakpoint
ALTER TABLE "FlowNodeStat" ADD CONSTRAINT "FlowNodeStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FlowAnalyticsSession" ("id", "createdAt", "updatedAt", "flowId", "workspaceId", "deletedAt")
SELECT "id", NOW(), NOW(), "id", "workspaceId", NULL
FROM "Flow"
ON CONFLICT DO NOTHING;

