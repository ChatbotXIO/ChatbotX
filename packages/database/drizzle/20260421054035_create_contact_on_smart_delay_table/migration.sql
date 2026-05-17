CREATE TYPE "ContactOnSmartDelayStatus" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "ContactOnSmartDelayType" AS ENUM('waitNode');--> statement-breakpoint
CREATE TABLE "ContactOnSmartDelay" (
	"id" bigint PRIMARY KEY,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"flowVersionId" bigint,
	"contactInboxId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"nodeId" text,
	"stepId" text,
	"type" "ContactOnSmartDelayType" NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"triggerAt" timestamp(6) with time zone NOT NULL,
	"status" "ContactOnSmartDelayStatus" DEFAULT 'pending'::"ContactOnSmartDelayStatus" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ContactOnSmartDelay_workspaceId_flowId_contactInboxId_stepId_idx" ON "ContactOnSmartDelay" ("workspaceId","flowId","contactInboxId","stepId");--> statement-breakpoint
CREATE INDEX "ContactOnSmartDelay_status_triggerAt_idx" ON "ContactOnSmartDelay" ("status","triggerAt");--> statement-breakpoint
ALTER TABLE "ContactOnSmartDelay" ADD CONSTRAINT "ContactOnSmartDelay_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnSmartDelay" ADD CONSTRAINT "ContactOnSmartDelay_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
