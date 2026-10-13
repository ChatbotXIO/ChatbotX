CREATE TYPE "broadcastOccurrenceOutcome" AS ENUM('created', 'skipped', 'missed');--> statement-breakpoint
CREATE TYPE "broadcastOccurrenceReason" AS ENUM('catchUpSuperseded', 'paused', 'draft', 'blockedOwner', 'planLimit', 'noTargets', 'undeliverable');--> statement-breakpoint
ALTER TYPE "broadcastScheduleType" ADD VALUE IF NOT EXISTS 'recurring';--> statement-breakpoint
ALTER TYPE "broadcastStatus" ADD VALUE IF NOT EXISTS 'recurring';--> statement-breakpoint
CREATE TABLE "BroadcastRecurrence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"broadcastId" bigint NOT NULL,
	"rule" jsonb NOT NULL,
	"nextRunAt" timestamp(6) with time zone,
	"accountedThroughAt" timestamp(6) with time zone,
	"occurrenceCount" integer DEFAULT 0 NOT NULL,
	"lastOccurrenceAt" timestamp(6) with time zone,
	"pausedAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "BroadcastRecurrenceOccurrence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"recurrenceId" bigint NOT NULL,
	"localSlot" text NOT NULL,
	"occurrenceAt" timestamp(6) with time zone NOT NULL,
	"outcome" "broadcastOccurrenceOutcome" NOT NULL,
	"reason" "broadcastOccurrenceReason",
	"childBroadcastId" bigint,
	"materializedAt" timestamp(6) with time zone NOT NULL,
	"supersededCount" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "parentBroadcastId" bigint;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "occurrenceAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "BroadcastRecurrence_broadcastId_key" ON "BroadcastRecurrence" ("broadcastId");--> statement-breakpoint
CREATE INDEX "BroadcastRecurrence_workspaceId_idx" ON "BroadcastRecurrence" ("workspaceId");--> statement-breakpoint
CREATE INDEX "BroadcastRecurrence_due_idx" ON "BroadcastRecurrence" ("nextRunAt","id") WHERE "nextRunAt" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "BroadcastRecurrenceOccurrence_recurrenceId_localSlot_key" ON "BroadcastRecurrenceOccurrence" ("recurrenceId","localSlot");--> statement-breakpoint
CREATE INDEX "BroadcastRecurrenceOccurrence_recurrenceId_occurrenceAt_idx" ON "BroadcastRecurrenceOccurrence" ("recurrenceId","occurrenceAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "BroadcastRecurrenceOccurrence_workspaceId_idx" ON "BroadcastRecurrenceOccurrence" ("workspaceId");--> statement-breakpoint
CREATE INDEX "BroadcastRecurrenceOccurrence_childBroadcastId_idx" ON "BroadcastRecurrenceOccurrence" ("childBroadcastId");--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_parentBroadcastId_Broadcast_id_fkey" FOREIGN KEY ("parentBroadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastRecurrence" ADD CONSTRAINT "BroadcastRecurrence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastRecurrence" ADD CONSTRAINT "BroadcastRecurrence_broadcastId_Broadcast_id_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastRecurrenceOccurrence" ADD CONSTRAINT "BroadcastRecurrenceOccurrence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastRecurrenceOccurrence" ADD CONSTRAINT "BroadcastRecurrenceOccurrence_x0yNXfzZ2cZs_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "BroadcastRecurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastRecurrenceOccurrence" ADD CONSTRAINT "BroadcastRecurrenceOccurrence_Md67cxyTrOQZ_fkey" FOREIGN KEY ("childBroadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_occurrence_pair_check" CHECK ("parentBroadcastId" IS NULL OR "occurrenceAt" IS NOT NULL);