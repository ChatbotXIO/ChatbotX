-- Migration: Add messages by admin tracking
-- Tracks outgoing messages sent by human agents (admins)

-- ============================================================
-- PART 1: Add admin_id column to contact_events table
-- ============================================================

ALTER TABLE contact_events ADD COLUMN IF NOT EXISTS admin_id String DEFAULT '';

-- ============================================================
-- PART 2: Create messages_by_admin_hourly table
-- ============================================================

CREATE TABLE IF NOT EXISTS messages_by_admin_hourly (
    workspace_id String,
    admin_id String,
    hour DateTime,
    message_count_state AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, admin_id, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 3: Create materialized view for messages_by_admin
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS messages_by_admin_hourly_mv
TO messages_by_admin_hourly
AS SELECT
    workspace_id,
    admin_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as message_count_state
FROM contact_events
WHERE event_type = 'contact_message_out'
    AND sender_type = 'human'
    AND admin_id != ''
GROUP BY workspace_id, admin_id, hour;

-- ============================================================
-- PART 4: Backfill messages_by_admin_hourly from existing data
-- Note: This will only work for events that have admin_id in metadata
-- ============================================================

INSERT INTO messages_by_admin_hourly
SELECT
    workspace_id,
    JSONExtractString(metadata, 'adminId') as admin_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    countState() as message_count_state
FROM contact_events
WHERE event_type = 'contact_message_out'
    AND sender_type = 'human'
    AND JSONExtractString(metadata, 'adminId') != ''
GROUP BY workspace_id, admin_id, hour;
