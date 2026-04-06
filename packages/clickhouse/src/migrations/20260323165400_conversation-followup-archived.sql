-- Migration: Add conversation follow-up and archived tracking
-- New event types: conversation_followed, conversation_unfollowed, conversation_archived, conversation_unarchived

-- ============================================================
-- PART 1: Create conversation_followups_hourly table
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_followups_hourly (
    workspace_id String,
    hour DateTime,
    followup_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 2: Create conversation_archived_hourly table
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_archived_hourly (
    workspace_id String,
    hour DateTime,
    archived_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 3: Create materialized view for conversation_followups
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_followups_hourly_mv
TO conversation_followups_hourly
AS SELECT
    workspace_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as followup_count_state
FROM conversation_events
WHERE event_type = 'conversation_followed'
GROUP BY workspace_id, hour;

-- ============================================================
-- PART 4: Create materialized view for conversation_archived
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_archived_hourly_mv
TO conversation_archived_hourly
AS SELECT
    workspace_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as archived_count_state
FROM conversation_events
WHERE event_type = 'conversation_archived'
GROUP BY workspace_id, hour;

-- ============================================================
-- PART 5: Backfill conversation_followups_hourly (if any exist)
-- ============================================================

INSERT INTO conversation_followups_hourly
SELECT
    workspace_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as followup_count_state
FROM conversation_events
WHERE event_type = 'conversation_followed'
GROUP BY workspace_id, hour;

-- ============================================================
-- PART 6: Backfill conversation_archived_hourly (if any exist)
-- ============================================================

INSERT INTO conversation_archived_hourly
SELECT
    workspace_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as archived_count_state
FROM conversation_events
WHERE event_type = 'conversation_archived'
GROUP BY workspace_id, hour;
