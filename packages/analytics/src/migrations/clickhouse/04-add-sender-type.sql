
-- Use the database
USE chatbot_analytics;

-- Step 1: Add sender_type column to contact_events table
ALTER TABLE contact_events
ADD COLUMN IF NOT EXISTS sender_type LowCardinality(String) DEFAULT '';

-- Step 2: Drop existing materialized views
DROP VIEW IF EXISTS contact_stats_minute_mv;
DROP VIEW IF EXISTS contact_stats_hourly_mv;
DROP VIEW IF EXISTS contact_stats_daily_mv;

-- Step 3: Drop and recreate aggregation tables with sender_type
DROP TABLE IF EXISTS contact_stats_minute;
DROP TABLE IF EXISTS contact_stats_hourly;
DROP TABLE IF EXISTS contact_stats_daily;

-- Minute-level stats with sender_type and channel (30 days retention)
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

-- Hourly stats with sender_type and channel (12 months retention)
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

-- Daily stats with sender_type and channel (3 years retention)
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

-- Step 4: Recreate materialized views with sender_type

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
