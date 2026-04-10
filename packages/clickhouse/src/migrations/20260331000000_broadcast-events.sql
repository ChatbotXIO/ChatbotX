-- DROP TABLE IF EXISTS broadcast_events;

CREATE TABLE IF NOT EXISTS broadcast_events (
  event_id String,
  chatbot_id String,
  broadcast_id String,

  contact_id String,
  conv_id String,

  event_type LowCardinality(String),

  batch_id Int32 DEFAULT 1,

  content Nullable(String),
  occurred_at DateTime('UTC'),
  inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (chatbot_id, broadcast_id, batch_id, event_type, contact_id)
TTL occurred_at + INTERVAL 1 YEAR;
