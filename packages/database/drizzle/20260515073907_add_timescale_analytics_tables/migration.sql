CREATE TYPE "analyticsBotResponseType" AS ENUM('automated_response', 'ai_agent', 'flow', 'none');--> statement-breakpoint
CREATE TYPE "analyticsBotResult" AS ENUM('success', 'fallback');--> statement-breakpoint
CREATE TYPE "analyticsBotRouteType" AS ENUM('flow', 'agent', 'fallback');--> statement-breakpoint
CREATE TYPE "analyticsContactEventType" AS ENUM('contact_created', 'contact_deleted');--> statement-breakpoint
CREATE TYPE "analyticsMessageEventType" AS ENUM('message_human_sent', 'message_bot_sent');--> statement-breakpoint
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
CREATE TABLE "AnalyticsMessageEvent" (
	"eventId" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"eventType" "analyticsMessageEventType" NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"senderType" "analyticsContactSenderType",
	"adminId" bigint,
	"channel" text,
	"source" text,
	"sourceId" text,
	"metadata" jsonb,
	"insertedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AnalyticsMessageEvent_pkey" PRIMARY KEY("occurredAt","eventId")
);
--> statement-breakpoint
CREATE INDEX "AnalyticsBotMessageEvent_workspaceId_occurredAt_idx" ON "AnalyticsBotMessageEvent" ("workspaceId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsBotMessageEvent_workspaceId_aiProvider_occurredAt_idx" ON "AnalyticsBotMessageEvent" ("workspaceId","aiProvider","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsBotMessageEvent_workspaceId_hasResponse_result_occurredAt_idx" ON "AnalyticsBotMessageEvent" ("workspaceId","hasResponse","result","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsContactEvent_workspaceId_occurredAt_eventType_idx" ON "AnalyticsContactEvent" ("workspaceId","occurredAt","eventType");--> statement-breakpoint
CREATE INDEX "AnalyticsContactEvent_workspaceId_eventType_occurredAt_idx" ON "AnalyticsContactEvent" ("workspaceId","eventType","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsContactEvent_workspaceId_adminId_occurredAt_idx" ON "AnalyticsContactEvent" ("workspaceId","adminId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsConversationEvent_workspaceId_occurredAt_eventType_idx" ON "AnalyticsConversationEvent" ("workspaceId","occurredAt","eventType");--> statement-breakpoint
CREATE INDEX "AnalyticsConversationEvent_workspaceId_toAssignee_occurredAt_idx" ON "AnalyticsConversationEvent" ("workspaceId","toAssignee","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsMessageEvent_workspaceId_occurredAt_eventType_idx" ON "AnalyticsMessageEvent" ("workspaceId","occurredAt","eventType");--> statement-breakpoint
CREATE INDEX "AnalyticsMessageEvent_workspaceId_eventType_occurredAt_idx" ON "AnalyticsMessageEvent" ("workspaceId","eventType","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsMessageEvent_workspaceId_adminId_occurredAt_idx" ON "AnalyticsMessageEvent" ("workspaceId","adminId","occurredAt");--> statement-breakpoint
CREATE INDEX "AnalyticsMessageEvent_workspaceId_senderType_occurredAt_idx" ON "AnalyticsMessageEvent" ("workspaceId","senderType","occurredAt");--> statement-breakpoint
ALTER TABLE "AnalyticsBotMessageEvent" ADD CONSTRAINT "AnalyticsBotMessageEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsContactEvent" ADD CONSTRAINT "AnalyticsContactEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsConversationEvent" ADD CONSTRAINT "AnalyticsConversationEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsMessageEvent" ADD CONSTRAINT "AnalyticsMessageEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
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
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsContactEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsContactEvent"', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsContactEvent"', INTERVAL '10 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsBotMessageEvent hypertable
SELECT create_hypertable(
  '"AnalyticsBotMessageEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsBotMessageEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsBotMessageEvent"', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsBotMessageEvent"', INTERVAL '10 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsConversationEvent hypertable
SELECT create_hypertable(
  '"AnalyticsConversationEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsConversationEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsConversationEvent"', INTERVAL '10 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsConversationEvent"', INTERVAL '10 years', if_not_exists => TRUE);
--> statement-breakpoint
-- AnalyticsMessageEvent hypertable
SELECT create_hypertable(
  '"AnalyticsMessageEvent"',
  by_range('"occurredAt"'),
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
--> statement-breakpoint
ALTER TABLE "AnalyticsMessageEvent" SET (
  timescaledb.compress = TRUE,
  timescaledb.compress_segmentby = '"workspaceId"',
  timescaledb.compress_orderby = '"occurredAt" DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('"AnalyticsMessageEvent"', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT add_retention_policy('"AnalyticsMessageEvent"', INTERVAL '10 years', if_not_exists => TRUE);
