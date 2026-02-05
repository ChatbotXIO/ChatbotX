
-- Use the database
USE chatbot_analytics;

-- Drop old materialized views if they exist (from previous schema)
DROP VIEW IF EXISTS contact_stats_minute_mv;
DROP VIEW IF EXISTS contact_stats_hourly_mv;
DROP VIEW IF EXISTS contact_stats_daily_mv;
DROP VIEW IF EXISTS contacts_by_channel_daily_mv;
DROP VIEW IF EXISTS contacts_by_country_daily_mv;
DROP VIEW IF EXISTS active_contacts_daily_mv;

-- Drop destination tables to ensure clean recreation with correct schema
DROP TABLE IF EXISTS contact_stats_minute;
DROP TABLE IF EXISTS contact_stats_hourly;
DROP TABLE IF EXISTS contact_stats_daily;
DROP TABLE IF EXISTS contacts_by_channel_daily;
DROP TABLE IF EXISTS contacts_by_country_daily;
DROP TABLE IF EXISTS active_contacts_daily;

-- Drop and recreate source table to reset all data
DROP TABLE IF EXISTS contact_events;

-- Contact events table (raw events, append-only)
-- Keep 1 year for rebuilding materialized views if needed
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
    metadata String,
    inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(occurred_at, 'UTC'))
ORDER BY (chatbot_id, occurred_at, event_type, contact_id)
TTL toDateTime(occurred_at, 'UTC') + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- Destination tables (AggregatingMergeTree)

-- Minute-level stats (30 days retention)
CREATE TABLE IF NOT EXISTS contact_stats_minute (
    chatbot_id String,
    minute DateTime,
    event_type LowCardinality(String),
    -- WARNING: This is an AggregateFunction *state* column.
    -- Do NOT select it directly. Use countMerge(event_count_state) in queries.
    event_count_state AggregateFunction(count),
    -- WARNING: This is an AggregateFunction *state* column.
    -- Do NOT select it directly. Use uniqMerge(unique_contacts_state) in queries.
    -- Default: approximate uniques (fast, good for dashboards).
    unique_contacts_state AggregateFunction(uniq, String)
    -- If exact DISTINCT is required, use uniqExactState/uniqExactMerge instead:
    -- unique_contacts_state AggregateFunction(uniqExact, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(minute)
ORDER BY (chatbot_id, minute, event_type)
TTL minute + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Hourly stats (12 months retention)
CREATE TABLE IF NOT EXISTS contact_stats_hourly (
    chatbot_id String,
    hour DateTime,
    event_type LowCardinality(String),
    -- AggregateFunction *state* columns (use *Merge() in SELECT)
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
    -- Alternative exact uniques:
    -- unique_contacts_state AggregateFunction(uniqExact, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (chatbot_id, hour, event_type)
TTL hour + INTERVAL 12 MONTH
SETTINGS index_granularity = 8192;

-- Daily stats (3 years retention)
CREATE TABLE IF NOT EXISTS contact_stats_daily (
    chatbot_id String,
    day Date,
    event_type LowCardinality(String),
    -- AggregateFunction *state* columns (use *Merge() in SELECT)
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
    -- Alternative exact uniques:
    -- unique_contacts_state AggregateFunction(uniqExact, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, event_type)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Daily breakdown tables for donut charts (new contacts only)

CREATE TABLE IF NOT EXISTS contacts_by_channel_daily (
    chatbot_id String,
    day Date,
    channel LowCardinality(String),
    -- AggregateFunction *state* columns (use *Merge() in SELECT)
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
    -- Alternative exact uniques:
    -- unique_contacts_state AggregateFunction(uniqExact, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, channel)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS contacts_by_country_daily (
    chatbot_id String,
    day Date,
    country LowCardinality(String),
    -- AggregateFunction *state* columns (use *Merge() in SELECT)
    event_count_state AggregateFunction(count),
    unique_contacts_state AggregateFunction(uniq, String)
    -- Alternative exact uniques:
    -- unique_contacts_state AggregateFunction(uniqExact, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, country)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Active contacts daily (for message activity tracking)
CREATE TABLE IF NOT EXISTS active_contacts_daily (
    chatbot_id String,
    day Date,
    -- AggregateFunction *state* column (use uniqMerge() in SELECT)
    active_contacts_state AggregateFunction(uniq, String)
    -- Alternative exact uniques:
    -- active_contacts_state AggregateFunction(uniqExact, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Materialized views (TO <table>)

CREATE MATERIALIZED VIEW IF NOT EXISTS contact_stats_minute_mv
TO contact_stats_minute
AS SELECT
    chatbot_id,
    toStartOfMinute(toDateTime(occurred_at, 'UTC')) as minute,
    event_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
    -- For exact uniques, replace uniqState with uniqExactState:
    -- uniqExactState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, minute, event_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS contact_stats_hourly_mv
TO contact_stats_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    event_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
    -- For exact uniques, replace uniqState with uniqExactState:
    -- uniqExactState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, hour, event_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS contact_stats_daily_mv
TO contact_stats_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    event_type,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
    -- For exact uniques, replace uniqState with uniqExactState:
    -- uniqExactState(contact_id) as unique_contacts_state
FROM contact_events
GROUP BY chatbot_id, day, event_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_channel_daily_mv
TO contacts_by_channel_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    channel,
    countState() as event_count_state,
    uniqState(contact_id) as unique_contacts_state
    -- For exact uniques, replace uniqState with uniqExactState:
    -- uniqExactState(contact_id) as unique_contacts_state
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
    -- For exact uniques, replace uniqState with uniqExactState:
    -- uniqExactState(contact_id) as unique_contacts_state
FROM contact_events
WHERE event_type = 'contact_created'
  AND country != ''
GROUP BY chatbot_id, day, country;

CREATE MATERIALIZED VIEW IF NOT EXISTS active_contacts_daily_mv
TO active_contacts_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    uniqState(contact_id) as active_contacts_state
    -- For exact uniques, replace uniqState with uniqExactState:
    -- uniqExactState(contact_id) as active_contacts_state
FROM contact_events
WHERE event_type IN ('contact_message_in', 'contact_message_out')
GROUP BY chatbot_id, day;

-- Create indexes for better query performance
ALTER TABLE contact_events ADD INDEX IF NOT EXISTS idx_event_id event_id TYPE bloom_filter GRANULARITY 1;
ALTER TABLE contact_events ADD INDEX IF NOT EXISTS idx_contact_id contact_id TYPE bloom_filter GRANULARITY 1;

-- =====================================================================================
-- Example queries (IMPORTANT: never select *_state columns directly)
-- =====================================================================================

-- 1) Daily new contacts (event_type = 'contact_created')
--    Uses daily rollup table.
--
-- SELECT
--   day,
--   countMerge(event_count_state) AS new_contacts,
--   uniqMerge(unique_contacts_state) AS unique_contacts
-- FROM contact_stats_daily
-- WHERE chatbot_id = {chatbotId:String}
--   AND day >= toDate(toDateTime({from:UInt32}))
--   AND day < toDate(toDateTime({to:UInt32}))
--   AND event_type = 'contact_created'
-- GROUP BY day
-- ORDER BY day ASC;

-- 2) Cumulative total contacts over time (running sum of daily new contacts)
--
-- SELECT
--   day,
--   sum(new_contacts) OVER (ORDER BY day ASC) AS total_contacts
-- FROM (
--   SELECT
--     day,
--     countMerge(event_count_state) AS new_contacts
--   FROM contact_stats_daily
--   WHERE chatbot_id = {chatbotId:String}
--     AND day >= toDate(toDateTime({from:UInt32}))
--     AND day < toDate(toDateTime({to:UInt32}))
--     AND event_type = 'contact_created'
--   GROUP BY day
-- );

-- 3) Donut: new contacts by channel (daily breakdown)
--
-- SELECT
--   channel,
--   countMerge(event_count_state) AS new_contacts,
--   uniqMerge(unique_contacts_state) AS unique_contacts
-- FROM contacts_by_channel_daily
-- WHERE chatbot_id = {chatbotId:String}
--   AND day >= toDate(toDateTime({from:UInt32}))
--   AND day < toDate(toDateTime({to:UInt32}))
-- GROUP BY channel
-- ORDER BY new_contacts DESC;

-- 4) Donut: new contacts by country (daily breakdown)
--
-- SELECT
--   country,
--   countMerge(event_count_state) AS new_contacts,
--   uniqMerge(unique_contacts_state) AS unique_contacts
-- FROM contacts_by_country_daily
-- WHERE chatbot_id = {chatbotId:String}
--   AND day >= toDate(toDateTime({from:UInt32}))
--   AND day < toDate(toDateTime({to:UInt32}))
-- GROUP BY country
-- ORDER BY new_contacts DESC;

-- 5) Time series (minute/hour/day) - example for hourly
--
-- SELECT
--   hour,
--   countMerge(event_count_state) AS event_count,
--   uniqMerge(unique_contacts_state) AS unique_contacts
-- FROM contact_stats_hourly
-- WHERE chatbot_id = {chatbotId:String}
--   AND hour >= toDateTime({from:UInt32})
--   AND hour < toDateTime({to:UInt32})
--   AND event_type = 'contact_created'
-- GROUP BY hour
-- ORDER BY hour ASC;
