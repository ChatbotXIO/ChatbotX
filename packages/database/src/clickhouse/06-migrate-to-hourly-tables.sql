-- Migration: Convert daily tables to hourly tables with timezone support
-- This migration:
-- 1. Drops all old daily tables and materialized views
-- 2. Drops all old hourly tables and materialized views  
-- 3. Recreates hourly tables with 3-year TTL
-- 4. Recreates materialized views
-- NOTE: Main source tables (contact_events, bot_message_events, conversation_events) are preserved

USE chatbot_analytics;

-- ============================================================
-- PART 1: Drop all existing materialized views and aggregated tables
-- (Keep source tables: contact_events, bot_message_events, conversation_events)
-- ============================================================

-- Contact stats views
DROP VIEW IF EXISTS contact_stats_minute_mv;
DROP VIEW IF EXISTS contact_stats_hourly_mv;
DROP VIEW IF EXISTS contact_stats_daily_mv;
DROP VIEW IF EXISTS contacts_by_channel_hourly_mv;
DROP VIEW IF EXISTS contacts_by_channel_daily_mv;
DROP VIEW IF EXISTS contacts_by_country_hourly_mv;
DROP VIEW IF EXISTS contacts_by_country_daily_mv;
DROP VIEW IF EXISTS contacts_by_source_hourly_mv;
DROP VIEW IF EXISTS contacts_by_source_daily_mv;
DROP VIEW IF EXISTS active_contacts_hourly_mv;
DROP VIEW IF EXISTS active_contacts_daily_mv;

-- Contact stats tables
DROP TABLE IF EXISTS contact_stats_minute;
DROP TABLE IF EXISTS contact_stats_hourly;
DROP TABLE IF EXISTS contact_stats_daily;
DROP TABLE IF EXISTS contacts_by_channel_hourly;
DROP TABLE IF EXISTS contacts_by_channel_daily;
DROP TABLE IF EXISTS contacts_by_country_hourly;
DROP TABLE IF EXISTS contacts_by_country_daily;
DROP TABLE IF EXISTS contacts_by_source_hourly;
DROP TABLE IF EXISTS contacts_by_source_daily;
DROP TABLE IF EXISTS active_contacts_hourly;
DROP TABLE IF EXISTS active_contacts_daily;

-- Bot messages views
DROP VIEW IF EXISTS bot_messages_minute_mv;
DROP VIEW IF EXISTS bot_messages_hourly_mv;
DROP VIEW IF EXISTS bot_messages_daily_mv;

-- Bot messages tables
DROP TABLE IF EXISTS bot_messages_minute;
DROP TABLE IF EXISTS bot_messages_hourly;
DROP TABLE IF EXISTS bot_messages_daily;

-- Conversation handoffs views
DROP VIEW IF EXISTS conversation_handoffs_hourly_mv;
DROP VIEW IF EXISTS conversation_handoffs_daily_mv;

-- Conversation handoffs tables
DROP TABLE IF EXISTS conversation_handoffs_hourly;
DROP TABLE IF EXISTS conversation_handoffs_daily;

-- ============================================================
-- PART 2: Create contact_stats tables (minute + hourly)
-- ============================================================

-- Minute-level stats (30 days retention)
CREATE TABLE IF NOT EXISTS contact_stats_minute (
    chatbot_id String,
    minute DateTime,
    event_type LowCardinality(String),
    channel LowCardinality(String),
    sender_type LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (chatbot_id, minute, event_type, channel, sender_type)
TTL minute + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Hourly stats (3 years retention)
CREATE TABLE IF NOT EXISTS contact_stats_hourly (
    chatbot_id String,
    hour DateTime,
    event_type LowCardinality(String),
    channel LowCardinality(String),
    sender_type LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, event_type, channel, sender_type)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 3: Create dimension breakdown tables (hourly only)
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts_by_channel_hourly (
    chatbot_id String,
    hour DateTime,
    channel LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, channel)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS contacts_by_country_hourly (
    chatbot_id String,
    hour DateTime,
    country LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, country)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS contacts_by_source_hourly (
    chatbot_id String,
    hour DateTime,
    source LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, source)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS active_contacts_hourly (
    chatbot_id String,
    hour DateTime,
    active_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 4: Create bot_messages tables (minute + hourly)
-- ============================================================

-- Minute-level stats (30 days retention)
CREATE TABLE IF NOT EXISTS bot_messages_minute (
    chatbot_id String,
    minute DateTime,
    has_response UInt8,
    response_type LowCardinality(String),
    route_type LowCardinality(String),
    result LowCardinality(String),
    ai_provider LowCardinality(String),
    event_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (chatbot_id, minute, has_response, response_type, route_type, result, ai_provider)
TTL minute + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Hourly stats (3 years retention)
CREATE TABLE IF NOT EXISTS bot_messages_hourly (
    chatbot_id String,
    hour DateTime,
    has_response UInt8,
    response_type LowCardinality(String),
    route_type LowCardinality(String),
    result LowCardinality(String),
    ai_provider LowCardinality(String),
    event_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, has_response, response_type, route_type, result, ai_provider)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 5: Create conversation_handoffs table (hourly)
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_handoffs_hourly (
    chatbot_id String,
    hour DateTime,
    direction LowCardinality(String),
    handoff_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, direction)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 6: Create materialized views for contact_stats
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS contact_stats_minute_mv
TO contact_stats_minute
AS SELECT
    chatbot_id,
    toStartOfMinute(toDateTime(occurred_at, 'UTC')) as minute,
    event_type,
    channel,
    sender_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, minute, event_type, channel, sender_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS contact_stats_hourly_mv
TO contact_stats_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    event_type,
    channel,
    sender_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, hour, event_type, channel, sender_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_channel_hourly_mv
TO contacts_by_channel_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    channel,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND channel != ''
GROUP BY chatbot_id, hour, channel;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_country_hourly_mv
TO contacts_by_country_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    country,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND country != ''
GROUP BY chatbot_id, hour, country;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_source_hourly_mv
TO contacts_by_source_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    source,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND source != ''
GROUP BY chatbot_id, hour, source;

CREATE MATERIALIZED VIEW IF NOT EXISTS active_contacts_hourly_mv
TO active_contacts_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    uniqState(contact_id) as active_contacts_state
FROM contact_events
WHERE event_type IN ('contact_message_in', 'contact_message_out')
GROUP BY chatbot_id, hour;

-- ============================================================
-- PART 7: Create materialized views for bot_messages
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS bot_messages_minute_mv
TO bot_messages_minute
AS SELECT
    chatbot_id,
    toStartOfMinute(toDateTime(occurred_at, 'UTC')) as minute,
    has_response,
    response_type,
    route_type,
    result,
    ai_provider,
    countState() as event_count_state
FROM bot_message_events
GROUP BY chatbot_id, minute, has_response, response_type, route_type, result, ai_provider;

CREATE MATERIALIZED VIEW IF NOT EXISTS bot_messages_hourly_mv
TO bot_messages_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    has_response,
    response_type,
    route_type,
    result,
    ai_provider,
    countState() as event_count_state
FROM bot_message_events
GROUP BY chatbot_id, hour, has_response, response_type, route_type, result, ai_provider;

-- ============================================================
-- PART 8: Create materialized view for conversation_handoffs
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_handoffs_hourly_mv
TO conversation_handoffs_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    if(to_assignee != '', 'to_human', 'to_bot') as direction,
    countState() as handoff_count_state
FROM conversation_events
WHERE event_type IN ('conversation_assigned', 'conversation_unassigned')
GROUP BY chatbot_id, hour, direction;

-- ============================================================
-- PART 9: Backfill data from source tables to new aggregated tables
-- This will populate the new hourly tables with existing data
-- ============================================================

-- Backfill contact_stats_hourly
INSERT INTO contact_stats_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    event_type,
    channel,
    sender_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, hour, event_type, channel, sender_type;

-- Backfill contacts_by_channel_hourly
INSERT INTO contacts_by_channel_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    channel,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND channel != ''
GROUP BY chatbot_id, hour, channel;

-- Backfill contacts_by_country_hourly
INSERT INTO contacts_by_country_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    country,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND country != ''
GROUP BY chatbot_id, hour, country;

-- Backfill contacts_by_source_hourly
INSERT INTO contacts_by_source_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    source,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND source != ''
GROUP BY chatbot_id, hour, source;

-- Backfill active_contacts_hourly
INSERT INTO active_contacts_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    uniqState(contact_id) as active_contacts_state
FROM contact_events
WHERE event_type IN ('contact_message_in', 'contact_message_out')
GROUP BY chatbot_id, hour;

-- Backfill bot_messages_hourly
INSERT INTO bot_messages_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    has_response,
    response_type,
    route_type,
    result,
    ai_provider,
    countState() as event_count_state
FROM bot_message_events
GROUP BY chatbot_id, hour, has_response, response_type, route_type, result, ai_provider;

-- Backfill conversation_handoffs_hourly
INSERT INTO conversation_handoffs_hourly
SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    if(to_assignee != '', 'to_human', 'to_bot') as direction,
    countState() as handoff_count_state
FROM conversation_events
WHERE event_type IN ('conversation_assigned', 'conversation_unassigned')
GROUP BY chatbot_id, hour, direction;
