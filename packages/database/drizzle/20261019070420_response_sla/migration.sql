CREATE TABLE "ResponseSlaPolicy" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL CONSTRAINT "ResponseSlaPolicy_workspaceId_key" UNIQUE,
	"firstResponseTargetSeconds" integer NOT NULL,
	"nextResponseTargetSeconds" integer,
	"breachingThresholdPercent" integer DEFAULT 25 NOT NULL,
	CONSTRAINT "ResponseSlaPolicy_targets_check" CHECK ("firstResponseTargetSeconds" > 0 AND ("nextResponseTargetSeconds" IS NULL OR "nextResponseTargetSeconds" > 0)),
	CONSTRAINT "ResponseSlaPolicy_threshold_check" CHECK ("breachingThresholdPercent" BETWEEN 1 AND 99)
);
--> statement-breakpoint
ALTER TABLE "AnalyticsAgentResponseEvent" ADD COLUMN "slaTargetSeconds" integer;--> statement-breakpoint
ALTER TABLE "AnalyticsAgentResponseEvent" ADD COLUMN "slaMet" boolean;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN "responseDueAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN "responseSlaBreachingAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ADD COLUMN "responseSlaTargetSeconds" integer;--> statement-breakpoint
ALTER TABLE "ResponseSlaPolicy" ADD CONSTRAINT "ResponseSlaPolicy_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;