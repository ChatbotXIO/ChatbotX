DROP TABLE IF EXISTS sequence_schedule_events;

CREATE TABLE IF NOT EXISTS sequence_schedule_events (
  workspace_id String,

  contact_inbox_id String,

  event_type LowCardinality(String),

  sequence_id String,
  step_id String,

  occurred_at DateTime('UTC'),
  inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = ReplacingMergeTree(inserted_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (workspace_id, sequence_id, event_type, step_id, contact_inbox_id)
TTL occurred_at + INTERVAL 10 YEAR;
