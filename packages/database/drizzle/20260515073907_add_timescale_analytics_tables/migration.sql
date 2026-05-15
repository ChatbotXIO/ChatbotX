CREATE TYPE "analyticsBotResponseType" AS ENUM('automated_response', 'ai_agent', 'flow', 'none');--> statement-breakpoint
CREATE TYPE "analyticsBotResult" AS ENUM('success', 'fallback');--> statement-breakpoint
CREATE TYPE "analyticsBotRouteType" AS ENUM('flow', 'agent', 'fallback');--> statement-breakpoint
CREATE TYPE "analyticsBroadcastEventType" AS ENUM('message:sent', 'message:delivered', 'message:seen', 'message:failed', 'flow:clicked');--> statement-breakpoint
CREATE TYPE "analyticsContactEventType" AS ENUM('contact_created', 'contact_deleted', 'contact_message_in', 'contact_message_out');--> statement-breakpoint
CREATE TYPE "analyticsContactSenderType" AS ENUM('bot', 'human');--> statement-breakpoint
CREATE TYPE "analyticsConversationEventType" AS ENUM('conversation_created', 'conversation_assigned', 'conversation_unassigned', 'conversation_transferred_to_human', 'conversation_transferred_to_bot', 'conversation_followed', 'conversation_unfollowed', 'conversation_archived', 'conversation_unarchived');--> statement-breakpoint
CREATE TABLE "AnalyticsBotMessageEvent" (
	"eventId" text,
	"workspaceId" bigint NOT NULL,
	"messageId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone,
	"hasResponse" boolean DEFAULT false NOT NULL,
	"responseType" "analyticsBotResponseType",
	"routeType" "analyticsBotRouteType",
	"result" "analyticsBotResult",
	"aiProvider" text,
	"channel" text,
	"source" text,
	"metadata" jsonb,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsBotMessageEvent_pkey" PRIMARY KEY("occurredAt","eventId")
);
--> statement-breakpoint
CREATE TABLE "AnalyticsBroadcastEvent" (
	"workspaceId" bigint NOT NULL,
	"broadcastId" bigint,
	"contactInboxId" bigint,
	"eventType" "analyticsBroadcastEventType",
	"batchId" bigint DEFAULT 1,
	"occurredAt" timestamp(6) with time zone,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsBroadcastEvent_pkey" PRIMARY KEY("broadcastId","contactInboxId","batchId","eventType","occurredAt")
);
--> statement-breakpoint
CREATE TABLE "AnalyticsContactEvent" (
	"eventId" text,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"eventType" "analyticsContactEventType" NOT NULL,
	"occurredAt" timestamp(6) with time zone,
	"source" text,
	"sourceId" text,
	"channel" text,
	"country" text,
	"senderType" "analyticsContactSenderType",
	"adminId" bigint,
	"metadata" jsonb,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsContactEvent_pkey" PRIMARY KEY("occurredAt","eventId")
);
--> statement-breakpoint
CREATE TABLE "AnalyticsConversationEvent" (
	"eventId" text,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"eventType" "analyticsConversationEventType" NOT NULL,
	"occurredAt" timestamp(6) with time zone,
	"fromAssignee" bigint,
	"toAssignee" bigint,
	"channel" text,
	"metadata" jsonb,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsConversationEvent_pkey" PRIMARY KEY("occurredAt","eventId")
);
--> statement-breakpoint
CREATE TABLE "AnalyticsFlowNodeEvent" (
	"workspaceId" bigint NOT NULL,
	"flowId" bigint,
	"analyticsId" bigint,
	"nodeId" text,
	"buttonId" text DEFAULT '',
	"contactInboxId" bigint,
	"eventType" text,
	"occurredAt" timestamp(6) with time zone,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsFlowNodeEvent_pkey" PRIMARY KEY("flowId","analyticsId","nodeId","buttonId","contactInboxId","eventType","occurredAt")
);
--> statement-breakpoint
CREATE TABLE "AnalyticsSequenceEvent" (
	"workspaceId" bigint NOT NULL,
	"contactInboxId" bigint,
	"eventType" text,
	"sequenceId" bigint,
	"stepId" bigint,
	"occurredAt" timestamp(6) with time zone,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsSequenceEvent_pkey" PRIMARY KEY("sequenceId","stepId","contactInboxId","eventType","occurredAt")
);
--> statement-breakpoint
CREATE INDEX "AnalyticsBotMessageEvent_workspaceId_occurredAt_idx" ON "AnalyticsBotMessageEvent" ("workspaceId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsBotMessageEvent_workspaceId_aiProvider_occurredAt_idx" ON "AnalyticsBotMessageEvent" ("workspaceId","aiProvider","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsBotMessageEvent_workspaceId_hasResponse_result_occurredAt_idx" ON "AnalyticsBotMessageEvent" ("workspaceId","hasResponse","result","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsBroadcastEvent_workspaceId_broadcastId_eventType_occurredAt_idx" ON "AnalyticsBroadcastEvent" ("workspaceId","broadcastId","eventType","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsContactEvent_workspaceId_occurredAt_eventType_idx" ON "AnalyticsContactEvent" ("workspaceId","occurredAt","eventType");--> statement-breakpoint
CREATE INDEX "AnalyticsContactEvent_workspaceId_eventType_occurredAt_idx" ON "AnalyticsContactEvent" ("workspaceId","eventType","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsContactEvent_workspaceId_adminId_occurredAt_idx" ON "AnalyticsContactEvent" ("workspaceId","adminId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsConversationEvent_workspaceId_occurredAt_eventType_idx" ON "AnalyticsConversationEvent" ("workspaceId","occurredAt","eventType");--> statement-breakpoint
CREATE INDEX "AnalyticsConversationEvent_workspaceId_toAssignee_occurredAt_idx" ON "AnalyticsConversationEvent" ("workspaceId","toAssignee","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsFlowNodeEvent_workspaceId_flowId_analyticsId_nodeId_occurredAt_idx" ON "AnalyticsFlowNodeEvent" ("workspaceId","flowId","analyticsId","nodeId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsFlowNodeEvent_workspaceId_flowId_analyticsId_nodeId_buttonId_occurredAt_idx" ON "AnalyticsFlowNodeEvent" ("workspaceId","flowId","analyticsId","nodeId","buttonId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsSequenceEvent_workspaceId_sequenceId_stepId_eventType_occurredAt_idx" ON "AnalyticsSequenceEvent" ("workspaceId","sequenceId","stepId","eventType","occurredAt");--> statement-breakpoint
ALTER TABLE "AnalyticsBotMessageEvent" ADD CONSTRAINT "AnalyticsBotMessageEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsBroadcastEvent" ADD CONSTRAINT "AnalyticsBroadcastEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsContactEvent" ADD CONSTRAINT "AnalyticsContactEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsConversationEvent" ADD CONSTRAINT "AnalyticsConversationEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsFlowNodeEvent" ADD CONSTRAINT "AnalyticsFlowNodeEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsSequenceEvent" ADD CONSTRAINT "AnalyticsSequenceEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
--> statement-breakpoint
-- Covering index for distinct-count queries on AnalyticsContactEvent
CREATE INDEX "AnalyticsContactEvent_workspaceId_eventType_occurredAt_covering_idx"
  ON "AnalyticsContactEvent" ("workspaceId", "eventType", "occurredAt" DESC)
  INCLUDE ("contactId", "channel", "country", "source");
--> statement-breakpoint
-- AnalyticsContactEvent hypertable
SELECT create_hypertable(
  '"AnalyticsContactEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsContactEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsContactEvent"', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsContactEvent"', INTERVAL '3 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsBotMessageEvent hypertable
SELECT create_hypertable(
  '"AnalyticsBotMessageEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsBotMessageEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsBotMessageEvent"', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsBotMessageEvent"', INTERVAL '3 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsConversationEvent hypertable
SELECT create_hypertable(
  '"AnalyticsConversationEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsConversationEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsConversationEvent"', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsConversationEvent"', INTERVAL '3 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsBroadcastEvent hypertable
SELECT create_hypertable(
  '"AnalyticsBroadcastEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsBroadcastEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId","broadcastId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsBroadcastEvent"', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsBroadcastEvent"', INTERVAL '10 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsSequenceEvent hypertable
SELECT create_hypertable(
  '"AnalyticsSequenceEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsSequenceEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId","sequenceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsSequenceEvent"', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsSequenceEvent"', INTERVAL '10 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsFlowNodeEvent hypertable
SELECT create_hypertable(
  '"AnalyticsFlowNodeEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsFlowNodeEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId","flowId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsFlowNodeEvent"', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsFlowNodeEvent"', INTERVAL '10 years', if_not_exists => TRUE);