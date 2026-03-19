
-- Use the database
USE chatbotx_analytics;

-- Step 1: Create conversation_events table
CREATE TABLE IF NOT EXISTS conversation_events (
    event_id String,
    chatbot_id String,
    conversation_id String,
    event_type LowCardinality(String),
    occurred_at UInt32,
    from_assignee String DEFAULT '',
    to_assignee String DEFAULT '',
    channel LowCardinality(String) DEFAULT '',
    metadata String DEFAULT '',
    inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(occurred_at, 'UTC'))
ORDER BY (chatbot_id, occurred_at, event_type, conversation_id)
SETTINGS index_granularity = 8192;

-- Step 2: Create aggregation table for daily handoffs
CREATE TABLE IF NOT EXISTS conversation_handoffs_daily (
    chatbot_id String,
    day Date,
    direction LowCardinality(String),
    handoff_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYear(day)
ORDER BY (chatbot_id, day, direction)
TTL day + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- Step 3: Create materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_handoffs_daily_mv
TO conversation_handoffs_daily
AS SELECT
    chatbot_id,
    toDate(toDateTime(occurred_at, 'UTC')) as day,
    if(to_assignee != '', 'to_human', 'to_bot') as direction,
    countState() as handoff_count_state
FROM conversation_events
WHERE event_type IN ('conversation_assigned', 'conversation_unassigned')
GROUP BY chatbot_id, day, direction;
