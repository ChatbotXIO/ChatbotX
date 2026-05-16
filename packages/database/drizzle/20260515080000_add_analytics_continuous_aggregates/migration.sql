-- Continuous aggregate: contact events per hour
CREATE MATERIALIZED VIEW analytics_contact_events_hourly
  WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "occurredAt") AS bucket,
  "workspaceId",
  "eventType",
  "channel",
  "senderType",
  "country",
  "source",
  "adminId",
  COUNT(*)                            AS count
FROM "AnalyticsContactEvent"
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy(
  'analytics_contact_events_hourly',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE
);
--> statement-breakpoint
ALTER MATERIALIZED VIEW analytics_contact_events_hourly
  SET (timescaledb.compress = TRUE);
--> statement-breakpoint
SELECT add_compression_policy(
  'analytics_contact_events_hourly',
  compress_after    => INTERVAL '30 days',
  if_not_exists     => TRUE
);
--> statement-breakpoint
SELECT add_retention_policy(
  'analytics_contact_events_hourly',
  drop_after        => INTERVAL '3 years',
  if_not_exists     => TRUE
);
--> statement-breakpoint
-- Continuous aggregate: bot message events per hour
CREATE MATERIALIZED VIEW analytics_bot_message_events_hourly
  WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "occurredAt") AS bucket,
  "workspaceId",
  "hasResponse",
  "responseType",
  "routeType",
  "result",
  "aiProvider",
  COUNT(*)                            AS count
FROM "AnalyticsBotMessageEvent"
GROUP BY 1, 2, 3, 4, 5, 6, 7
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy(
  'analytics_bot_message_events_hourly',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE
);
--> statement-breakpoint
ALTER MATERIALIZED VIEW analytics_bot_message_events_hourly
  SET (timescaledb.compress = TRUE);
--> statement-breakpoint
SELECT add_compression_policy(
  'analytics_bot_message_events_hourly',
  compress_after    => INTERVAL '30 days',
  if_not_exists     => TRUE
);
--> statement-breakpoint
SELECT add_retention_policy(
  'analytics_bot_message_events_hourly',
  drop_after        => INTERVAL '3 years',
  if_not_exists     => TRUE
);
--> statement-breakpoint
-- Continuous aggregate: conversation events per hour
CREATE MATERIALIZED VIEW analytics_conversation_events_hourly
  WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "occurredAt") AS bucket,
  "workspaceId",
  "eventType",
  "toAssignee",
  COUNT(*)                            AS count
FROM "AnalyticsConversationEvent"
GROUP BY 1, 2, 3, 4
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy(
  'analytics_conversation_events_hourly',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE
);
--> statement-breakpoint
ALTER MATERIALIZED VIEW analytics_conversation_events_hourly
  SET (timescaledb.compress = TRUE);
--> statement-breakpoint
SELECT add_compression_policy(
  'analytics_conversation_events_hourly',
  compress_after    => INTERVAL '30 days',
  if_not_exists     => TRUE
);
--> statement-breakpoint
SELECT add_retention_policy(
  'analytics_conversation_events_hourly',
  drop_after        => INTERVAL '3 years',
  if_not_exists     => TRUE
);
--> statement-breakpoint
-- Continuous aggregate: message events per hour
CREATE MATERIALIZED VIEW analytics_message_events_hourly
  WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "occurredAt") AS bucket,
  "workspaceId",
  "eventType",
  "channel",
  "senderType",
  "adminId",
  COUNT(*)                            AS count
FROM "AnalyticsMessageEvent"
GROUP BY 1, 2, 3, 4, 5, 6
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy(
  'analytics_message_events_hourly',
  start_offset      => INTERVAL '3 hours',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE
);
--> statement-breakpoint
ALTER MATERIALIZED VIEW analytics_message_events_hourly
  SET (timescaledb.compress = TRUE);
--> statement-breakpoint
SELECT add_compression_policy(
  'analytics_message_events_hourly',
  compress_after    => INTERVAL '30 days',
  if_not_exists     => TRUE
);
--> statement-breakpoint
SELECT add_retention_policy(
  'analytics_message_events_hourly',
  drop_after        => INTERVAL '10 years',
  if_not_exists     => TRUE
);
