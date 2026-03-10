USE chatbot_analytics;

-- Add unique_messages_state column to destination tables
ALTER TABLE bot_messages_minute
ADD COLUMN IF NOT EXISTS unique_messages_state AggregateFunction(uniqExact, String);

ALTER TABLE bot_messages_hourly
ADD COLUMN IF NOT EXISTS unique_messages_state AggregateFunction(uniqExact, String);

-- Recreate materialized views with unique_messages_state
DROP VIEW IF EXISTS bot_messages_minute_mv;
DROP VIEW IF EXISTS bot_messages_hourly_mv;

CREATE MATERIALIZED VIEW bot_messages_minute_mv
TO bot_messages_minute
AS SELECT
    chatbot_id,
    toStartOfMinute(toDateTime(occurred_at, 'UTC')) as minute,
    has_response,
    response_type,
    route_type,
    result,
    ai_provider,
    countState() as event_count_state,
    uniqExactState(message_id) as unique_messages_state
FROM bot_message_events
GROUP BY chatbot_id, minute, has_response, response_type, route_type, result, ai_provider;

CREATE MATERIALIZED VIEW bot_messages_hourly_mv
TO bot_messages_hourly
AS SELECT
    chatbot_id,
    toStartOfHour(toDateTime(occurred_at, 'UTC')) as hour,
    has_response,
    response_type,
    route_type,
    result,
    ai_provider,
    countState() as event_count_state,
    uniqExactState(message_id) as unique_messages_state
FROM bot_message_events
GROUP BY chatbot_id, hour, has_response, response_type, route_type, result, ai_provider;
