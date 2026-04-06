-- Migration: Add conversation transfer events to handoffs tracking
-- New event types: conversation_transferred_to_human, conversation_transferred_to_bot
-- Fix: Direction logic now based on event_type instead of to_assignee field

-- Step 1: Drop existing materialized view
DROP VIEW IF EXISTS conversation_handoffs_hourly_mv;

-- Step 2: Recreate materialized view with updated logic
CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_handoffs_hourly_mv
TO conversation_handoffs_hourly
AS SELECT
    workspace_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    multiIf(
        event_type IN ('conversation_assigned', 'conversation_transferred_to_human'), 'to_human',
        'to_bot'
    ) as direction,
    countState() as handoff_count_state
FROM conversation_events
WHERE event_type IN (
    'conversation_assigned',
    'conversation_unassigned',
    'conversation_transferred_to_human',
    'conversation_transferred_to_bot'
)
GROUP BY workspace_id, hour, direction;

-- Step 3: Backfill conversation_handoffs_hourly for new transfer events (if any exist)
INSERT INTO conversation_handoffs_hourly
SELECT
    workspace_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    multiIf(
        event_type IN ('conversation_assigned', 'conversation_transferred_to_human'), 'to_human',
        'to_bot'
    ) as direction,
    countState() as handoff_count_state
FROM conversation_events
WHERE event_type IN ('conversation_transferred_to_human', 'conversation_transferred_to_bot')
GROUP BY workspace_id, hour, direction;
