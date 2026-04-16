-- DROP TABLE IF EXISTS flow_stat_events;

CREATE TABLE IF NOT EXISTS flow_stat_events (
  event_id String,
  workspace_id String,

  contact_id String,
  contact_inbox_id String,
  source_id String,

  event_type LowCardinality(String),

  flow_id String,
  analytics_id String,
  node_id String,
  button_id String DEFAULT '',

  ref_id String DEFAULT '',
  ref_type LowCardinality(String) DEFAULT '',

  content Nullable(String),
  occurred_at DateTime('UTC'),
  inserted_at DateTime('UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (workspace_id, flow_id, analytics_id, node_id, event_type, contact_id)
TTL occurred_at + INTERVAL 10 YEAR;

CREATE TABLE IF NOT EXISTS flow_node_contact_state (
  workspace_id String,
  flow_id String,
  analytics_id String,
  node_id String,
  button_id String DEFAULT '',
  contact_id String,
  contact_inbox_id String,

  sent_at Nullable(DateTime('UTC')),
  delivered_at Nullable(DateTime('UTC')),
  seen_at Nullable(DateTime('UTC')),
  clicked_at Nullable(DateTime('UTC')),

  version UInt64,
  updated_at DateTime('UTC') DEFAULT now()
) ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(coalesce(sent_at, updated_at))
ORDER BY (workspace_id, flow_id, analytics_id, node_id, button_id, contact_id);
