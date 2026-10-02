CREATE TYPE "aiHandoverBulkAction" AS ENUM('enable', 'disable');--> statement-breakpoint
CREATE TYPE "aiHandoverBulkStatus" AS ENUM('pending', 'running', 'cancelling', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "AIHandoverBulkRun" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"channel" text NOT NULL,
	"revision" integer NOT NULL,
	"action" "aiHandoverBulkAction" NOT NULL,
	"status" "aiHandoverBulkStatus" NOT NULL,
	"message" text,
	"requestedByUserId" bigint,
	"requestedAt" timestamp(6) with time zone NOT NULL,
	"startedAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone,
	"lastHeartbeatAt" timestamp(6) with time zone,
	"pausedUntil" timestamp(6) with time zone,
	"claimToken" text,
	"attempts" integer NOT NULL,
	"chunkSeq" integer NOT NULL,
	"totalCount" integer,
	"processedCount" integer NOT NULL,
	"skippedCount" integer NOT NULL,
	"failedCount" integer NOT NULL,
	"cursorContactInboxId" text,
	"inFlightFromId" text,
	"inFlightToId" text,
	"currentError" text
);
--> statement-breakpoint
CREATE TABLE "AIHandoverSettings" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"scheduleEnabled" boolean DEFAULT false NOT NULL,
	"timeRanges" jsonb NOT NULL,
	"gotoFlowId" bigint,
	"returnMessage" text,
	"pauseBotWaitingForStaff" boolean DEFAULT false NOT NULL,
	"applyToAllCustomers" boolean DEFAULT false NOT NULL,
	"applyToAllRevision" integer DEFAULT 0 NOT NULL,
	"applyToAllMessage" text,
	"applyToAllRequestedByUserId" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX "AIHandoverBulkRun_inbox_live_uq" ON "AIHandoverBulkRun" ("inboxId") WHERE status IN ('pending', 'running', 'cancelling');--> statement-breakpoint
CREATE UNIQUE INDEX "AIHandoverBulkRun_inbox_revision_uq" ON "AIHandoverBulkRun" ("inboxId","revision");--> statement-breakpoint
CREATE INDEX "AIHandoverBulkRun_workspace_idx" ON "AIHandoverBulkRun" ("workspaceId");--> statement-breakpoint
CREATE INDEX "AIHandoverBulkRun_inbox_createdAt_idx" ON "AIHandoverBulkRun" ("inboxId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "AIHandoverBulkRun_live_idx" ON "AIHandoverBulkRun" ("status","lastHeartbeatAt") WHERE status IN ('pending', 'running', 'cancelling');--> statement-breakpoint
CREATE INDEX "AIHandoverBulkRun_requestedByUserId_idx" ON "AIHandoverBulkRun" ("requestedByUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "AIHandoverSettings_inboxId_key" ON "AIHandoverSettings" ("inboxId");--> statement-breakpoint
CREATE INDEX "AIHandoverSettings_workspaceId_idx" ON "AIHandoverSettings" ("workspaceId");--> statement-breakpoint
CREATE INDEX "AIHandoverSettings_applyToAllRequestedByUserId_idx" ON "AIHandoverSettings" ("applyToAllRequestedByUserId");--> statement-breakpoint
CREATE INDEX "AIHandoverSettings_gotoFlowId_idx" ON "AIHandoverSettings" ("gotoFlowId");--> statement-breakpoint
ALTER TABLE "AIHandoverBulkRun" ADD CONSTRAINT "AIHandoverBulkRun_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIHandoverBulkRun" ADD CONSTRAINT "AIHandoverBulkRun_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIHandoverBulkRun" ADD CONSTRAINT "AIHandoverBulkRun_requestedByUserId_User_id_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIHandoverSettings" ADD CONSTRAINT "AIHandoverSettings_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIHandoverSettings" ADD CONSTRAINT "AIHandoverSettings_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIHandoverSettings" ADD CONSTRAINT "AIHandoverSettings_gotoFlowId_Flow_id_fkey" FOREIGN KEY ("gotoFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIHandoverSettings" ADD CONSTRAINT "AIHandoverSettings_applyToAllRequestedByUserId_User_id_fkey" FOREIGN KEY ("applyToAllRequestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;