-- Migration: Add unique contacts by admin tracking
-- Tracks unique contacts (customers) that each admin has interacted with

-- ============================================================
-- PART 1: Create contacts_by_admin_hourly table
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts_by_admin_hourly (
    workspace_id String,
    admin_id String,
    hour DateTime,
    unique_contacts_state AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (workspace_id, admin_id, hour)
TTL hour + INTERVAL 3 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================
-- PART 2: Create materialized view for contacts_by_admin
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS contacts_by_admin_hourly_mv
TO contacts_by_admin_hourly
AS SELECT
    workspace_id,
    admin_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE sender_type = 'human'
    AND admin_id != ''
GROUP BY workspace_id, admin_id, hour;

-- ============================================================
-- PART 3: Backfill contacts_by_admin_hourly from existing data
-- ============================================================

INSERT INTO contacts_by_admin_hourly
SELECT
    workspace_id,
    admin_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    uniqState(contact_id) as unique_contacts_state
FROM contact_events
WHERE sender_type = 'human'
    AND admin_id != ''
GROUP BY workspace_id, admin_id, hour;
