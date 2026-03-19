
-- Use the database
-- NOTE: If re-running after consolidation, use CLICKHOUSE_MIGRATIONS_FORCE_FILES=02-create-tables.sql
USE chatbotx_analytics;

-- Drop all existing materialized views
DROP VIEW IF EXISTS contact_stats_minute_mv;
DROP VIEW IF EXISTS contact_stats_hourly_mv;
DROP VIEW IF EXISTS contact_stats_daily_mv;
DROP VIEW IF EXISTS contacts_by_channel_daily_mv;
DROP VIEW IF EXISTS contacts_by_country_daily_mv;
DROP VIEW IF EXISTS contacts_by_source_daily_mv;
DROP VIEW IF EXISTS active_contacts_daily_mv;

-- Drop all destination tables
DROP TABLE IF EXISTS contact_stats_minute;
DROP TABLE IF EXISTS contact_stats_hourly;
DROP TABLE IF EXISTS contact_stats_daily;
DROP TABLE IF EXISTS contacts_by_channel_daily;
DROP TABLE IF EXISTS contacts_by_country_daily;
DROP TABLE IF EXISTS contacts_by_source_daily;
DROP TABLE IF EXISTS active_contacts_daily;

-- Drop and recreate source table
DROP TABLE IF EXISTS contact_events;

-- ============================================================
-- Source table: contact_events (raw events)
-- TTL: 3 years (to match aggregated tables, allows MV rebuild)
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_events (
    event_id String,
    chatbot_id String,
    contact_id String,
    event_type LowCardinality(String),
    occurred_at UInt32,
    source LowCardinality(String),
    source_id String,
    channel LowCardinality(String),
    country LowCardinality(String),
    sender_type LowCardinality(String) DEFAULT '',
    metadata String,
    inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(occurred_at, 'UTC'))
ORDER BY (chatbot_id, occurred_at, event_type, contact_id)
TTL toDateTime(occurred_at, 'UTC') + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- Aggregated tables: contact_stats (minute/hourly/daily)
-- Includes channel + sender_type dimensions
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

-- Hourly stats (12 months retention)
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
TTL hour + INTERVAL 12 MONTH
SETTINGS index_granularity = 8192;

-- Daily stats (3 years retention)
CREATE TABLE IF NOT EXISTS contact_stats_daily (
    chatbot_id String,
    day Date,
    event_type LowCardinality(String),
    channel LowCardinality(String),
    sender_type LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, event_type, channel, sender_type)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- Daily breakdown tables for donut charts (new contacts only)
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts_by_channel_daily (
    chatbot_id String,
    day Date,
    channel LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, channel)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS contacts_by_country_daily (
    chatbot_id String,
    day Date,
    country LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, country)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS contacts_by_source_daily (
    chatbot_id String,
    day Date,
    source LowCardinality(String),
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, source)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Active contacts daily (for message activity tracking)
CREATE TABLE IF NOT EXISTS active_contacts_daily (
    chatbot_id String,
    day Date,
    active_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- Materialized views (TO <table>)
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

CREATE MATERIALIZED VIEW IF NOT EXISTS contact_stats_daily_mv
TO contact_stats_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    event_type,
    channel,
    sender_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, day, event_type, channel, sender_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_channel_daily_mv
TO contacts_by_channel_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    channel,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND channel != ''
GROUP BY chatbot_id, day, channel;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_country_daily_mv
TO contacts_by_country_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    country,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND country != ''
GROUP BY chatbot_id, day, country;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_source_daily_mv
TO contacts_by_source_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    source,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND source != ''
GROUP BY chatbot_id, day, source;

CREATE MATERIALIZED VIEW IF NOT EXISTS active_contacts_daily_mv
TO active_contacts_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    uniqState(contact_id) as active_contacts_state
FROM contact_events
WHERE event_type IN ('contact_message_in', 'contact_message_out')
GROUP BY chatbot_id, day;

-- Create indexes for better query performance
ALTER TABLE contact_events ADD INDEX IF NOT EXISTS idx_event_id event_id TYPE bloom_filter GRANULARITY 1;
ALTER TABLE contact_events ADD INDEX IF NOT EXISTS idx_contact_id contact_id TYPE bloom_filter GRANULARITY 1;
