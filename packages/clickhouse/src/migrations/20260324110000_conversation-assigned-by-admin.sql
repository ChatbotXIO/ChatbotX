-- Migration: Add conversation assigned by admin tracking
-- New tracking for conversation_assigned events grouped by admin (to_assignee)

-- ============================================================
-- PART 1: Create conversation_assigned_by_admin_hourly table
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_assigned_by_admin_hourly (
    workspace_id String,
    to_assignee String,
    hour DateTime,
    assigned_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, to_assignee, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 2: Create materialized view for conversation_assigned_by_admin
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_assigned_by_admin_hourly_mv
TO conversation_assigned_by_admin_hourly
AS SELECT
    workspace_id,
    to_assignee,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as assigned_count_state
FROM conversation_events
WHERE event_type = 'conversation_assigned'
    AND to_assignee != ''
GROUP BY workspace_id, to_assignee, hour;

-- ============================================================
-- PART 3: Backfill conversation_assigned_by_admin_hourly (if any exist)
-- ============================================================

INSERT INTO conversation_assigned_by_admin_hourly
SELECT
    workspace_id,
    to_assignee,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as assigned_count_state
FROM conversation_events
WHERE event_type = 'conversation_assigned'
    AND to_assignee != ''
GROUP BY workspace_id, to_assignee, hour;
