-- DROP TABLE IF EXISTS broadcast_events;

CREATE TABLE IF NOT EXISTS sequence_schedule_events (
  event_id String,
  workspace_id String,

  contact_id String,
  contact_inbox_id String,
  conv_id String,
  source_id String,
  channel LowCardinality(String),

  event_type LowCardinality(String),

  sequence_id String,
  step_id String,

  content Nullable(String),
  occurred_at DateTime('UTC'),
  inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (workspace_id, sequence_id, event_type, step_id, contact_id)
TTL occurred_at + INTERVAL 10 YEAR;
