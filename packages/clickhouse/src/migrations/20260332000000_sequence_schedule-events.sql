-- DROP TABLE IF EXISTS broadcast_events;

CREATE TABLE IF NOT EXISTS sequence_schedule_events (
  event_id String,
  chatbot_id String,

  contact_id String,
  conv_id String,

  event_type LowCardinality(String),

  sequence_id String,
  step_id String,

  content Nullable(String),
  occurred_at DateTime('UTC'),
  inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (chatbot_id, sequence_id, event_type, step_id, contact_id)
TTL occurred_at + INTERVAL 10 YEAR;
