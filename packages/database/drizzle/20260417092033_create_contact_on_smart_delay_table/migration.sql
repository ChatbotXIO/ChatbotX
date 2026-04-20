CREATE TABLE "ContactOnSmartDelay" (
	"id" bigint PRIMARY KEY,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint,
	"contactInboxId" bigint,
	"nodeId" text NOT NULL,
	"retryCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"triggerAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ContactOnSmartDelay_workspaceId_flowId_nodeId_contactInboxId_idx" ON "ContactOnSmartDelay" ("workspaceId","flowId","nodeId","contactInboxId");--> statement-breakpoint
ALTER TABLE "ContactOnSmartDelay" ADD CONSTRAINT "ContactOnSmartDelay_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;