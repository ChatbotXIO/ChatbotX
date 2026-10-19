CREATE TABLE "AnalyticsAgentResponseEvent" (
	"eventId" text,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"adminId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone,
	"awaitingSince" timestamp(6) with time zone NOT NULL,
	"measuredFrom" timestamp(6) with time zone NOT NULL,
	"responseSeconds" integer NOT NULL,
	"workingResponseSeconds" integer,
	"isFirstResponse" boolean NOT NULL,
	"workingHoursId" bigint,
	"channel" text,
	"inboxId" bigint,
	"metadata" jsonb,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsAgentResponseEvent_pkey" PRIMARY KEY("occurredAt","eventId")
);
--> statement-breakpoint
CREATE TABLE "WorkingHours" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "WorkingHours_id_workspaceId_key" UNIQUE("id","workspaceId")
);
--> statement-breakpoint
CREATE TABLE "WorkingHoursInterval" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workingHoursId" bigint NOT NULL,
	"weekday" integer NOT NULL,
	"startMinute" integer NOT NULL,
	"endMinute" integer NOT NULL,
	CONSTRAINT "WorkingHoursInterval_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
	CONSTRAINT "WorkingHoursInterval_minutes_check" CHECK (0 <= "startMinute" AND "startMinute" < "endMinute" AND "endMinute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "WorkingHoursMember" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workingHoursId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	CONSTRAINT "WorkingHoursMember_workspaceId_userId_key" UNIQUE("workspaceId","userId")
);
--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN "awaitingHumanReplySince" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN "awaitingHumanReplyClosedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN "assignedUserAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "AnalyticsAgentResponseEvent_workspaceId_occurredAt_idx" ON "AnalyticsAgentResponseEvent" ("workspaceId","occurredAt");--> statement-breakpoint
CREATE INDEX "WorkingHours_workspaceId_idx" ON "WorkingHours" ("workspaceId");--> statement-breakpoint
CREATE INDEX "WorkingHoursInterval_workingHoursId_idx" ON "WorkingHoursInterval" ("workingHoursId");--> statement-breakpoint
CREATE INDEX "WorkingHoursMember_workingHoursId_idx" ON "WorkingHoursMember" ("workingHoursId");--> statement-breakpoint
ALTER TABLE "AnalyticsAgentResponseEvent" ADD CONSTRAINT "AnalyticsAgentResponseEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkingHoursInterval" ADD CONSTRAINT "WorkingHoursInterval_workingHoursId_WorkingHours_id_fkey" FOREIGN KEY ("workingHoursId") REFERENCES "WorkingHours"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkingHoursMember" ADD CONSTRAINT "WorkingHoursMember_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkingHoursMember" ADD CONSTRAINT "WorkingHoursMember_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkingHoursMember" ADD CONSTRAINT "WorkingHoursMember_workingHoursId_workspaceId_fkey" FOREIGN KEY ("workingHoursId","workspaceId") REFERENCES "WorkingHours"("id","workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
-- AnalyticsAgentResponseEvent hypertable
SELECT create_hypertable(
  '"AnalyticsAgentResponseEvent"',
  by_range('occurredAt', INTERVAL '30 days'),
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsAgentResponseEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsAgentResponseEvent"', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsAgentResponseEvent"', INTERVAL '10 years', if_not_exists => TRUE);
