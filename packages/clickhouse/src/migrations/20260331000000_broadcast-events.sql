DROP TABLE IF EXISTS broadcast_events;

CREATE TABLE IF NOT EXISTS broadcast_events (
  workspace_id String,
  broadcast_id String,

  contact_inbox_id String,

  event_type LowCardinality(String),

  batch_id Int64 DEFAULT 1,

  occurred_at DateTime('UTC'),
  inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = ReplacingMergeTree(inserted_at)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (workspace_id, broadcast_id, batch_id, event_type, contact_inbox_id)
TTL occurred_at + INTERVAL 10 YEAR;
