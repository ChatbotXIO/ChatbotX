-- Migration: Add unique conversations by admin tracking
-- Counts DISTINCT conversations assigned to each admin (not total assignment events)

-- ============================================================
-- PART 1: Create unique_conversations_by_admin_hourly table
-- ============================================================

CREATE TABLE IF NOT EXISTS unique_conversations_by_admin_hourly (
    workspace_id String,
    to_assignee String,
    hour DateTime,
    unique_conversation_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, to_assignee, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 2: Create materialized view for unique_conversations_by_admin
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS unique_conversations_by_admin_hourly_mv
TO unique_conversations_by_admin_hourly
AS SELECT
    workspace_id,
    to_assignee,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    uniqState(conversation_id) as unique_conversation_state
FROM conversation_events
WHERE event_type = 'conversation_assigned'
    AND to_assignee != ''
GROUP BY workspace_id, to_assignee, hour;

-- ============================================================
-- PART 3: Backfill unique_conversations_by_admin_hourly (if any exist)
-- ============================================================

INSERT INTO unique_conversations_by_admin_hourly
SELECT
    workspace_id,
    to_assignee,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    uniqState(conversation_id) as unique_conversation_state
FROM conversation_events
WHERE event_type = 'conversation_assigned'
    AND to_assignee != ''
GROUP BY workspace_id, to_assignee, hour;
