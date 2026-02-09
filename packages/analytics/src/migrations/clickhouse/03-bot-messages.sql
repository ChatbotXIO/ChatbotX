
-- Use the database
USE chatbot_analytics;

-- Drop old materialized views if they exist
DROP VIEW IF EXISTS bot_messages_minute_mv;
DROP VIEW IF EXISTS bot_messages_hourly_mv;
DROP VIEW IF EXISTS bot_messages_daily_mv;

-- Drop destination tables
DROP TABLE IF EXISTS bot_messages_minute;
DROP TABLE IF EXISTS bot_messages_hourly;
DROP TABLE IF EXISTS bot_messages_daily;

-- Drop source table
DROP TABLE IF EXISTS bot_message_events;

-- Bot message events table (raw events, append-only)
-- Keep 3 years for analytics and rebuilding materialized views
CREATE TABLE IF NOT EXISTS bot_message_events (
    event_id String,
    event_type LowCardinality(String),
    chatbot_id String,
    message_id String,
    conversation_id String,
    occurred_at UInt32,

    -- Response tracking
    has_response UInt8,  -- 0 or 1
    response_type LowCardinality(String),  -- automated_response, ai_agent, flow, none
    route_type LowCardinality(String),  -- FLOW, AGENT, FALLBACK
    result LowCardinality(String),  -- success, fallback, empty string

    -- AI tracking
    ai_provider LowCardinality(String),  -- openai, gemini, none

    -- Dimensions
    channel LowCardinality(String),
    source LowCardinality(String),

    -- Metadata
    metadata String,
    inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(occurred_at, 'UTC'))
ORDER BY (chatbot_id, occurred_at, has_response, result)
TTL toDateTime(occurred_at, 'UTC') + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Destination tables (AggregatingMergeTree)

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

-- Hourly stats (12 months retention)
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
TTL hour + INTERVAL 12 MONTH
SETTINGS index_granularity = 8192;

-- Daily stats (3 years retention)
CREATE TABLE IF NOT EXISTS bot_messages_daily (
    chatbot_id String,
    day Date,
    has_response UInt8,
    response_type LowCardinality(String),
    route_type LowCardinality(String),
    result LowCardinality(String),
    ai_provider LowCardinality(String),
    event_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, has_response, response_type, route_type, result, ai_provider)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Materialized views

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

CREATE MATERIALIZED VIEW IF NOT EXISTS bot_messages_daily_mv
TO bot_messages_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    has_response,
    response_type,
    route_type,
    result,
    ai_provider,
    countState() as event_count_state
FROM bot_message_events
GROUP BY chatbot_id, day, has_response, response_type, route_type, result, ai_provider;

-- Create indexes for better query performance
ALTER TABLE bot_message_events ADD INDEX IF NOT EXISTS idx_event_id event_id TYPE bloom_filter GRANULARITY 1;
ALTER TABLE bot_message_events ADD INDEX IF NOT EXISTS idx_message_id message_id TYPE bloom_filter GRANULARITY 1;
ALTER TABLE bot_message_events ADD INDEX IF NOT EXISTS idx_conversation_id conversation_id TYPE bloom_filter GRANULARITY 1;
