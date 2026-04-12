CREATE TABLE flow_node_events (
  workspace_id String,
  flow_id String,
  analytics_id String,
  node_id String,
  button_id String DEFAULT '',
  contact_inbox_id String,

  event_type LowCardinality(String),

  occurred_at DateTime('UTC'),
  inserted_at DateTime DEFAULT now()
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id,
  event_type,
  contact_inbox_id
);

CREATE TABLE flow_node_agg (
  workspace_id String,
  flow_id String,
  analytics_id String,
  node_id String,
  button_id String,

  event_type LowCardinality(String),

  uniq_contact AggregateFunction(uniq, String),
  total_count SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id,
  event_type
);

CREATE MATERIALIZED VIEW flow_node_mv
TO flow_node_agg
AS
SELECT
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id,
  event_type,

  uniqState(contact_inbox_id) AS uniq_contact,
  count() AS total_count
FROM flow_node_events
GROUP BY
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id,
  event_type;

-- button
CREATE TABLE flow_button_stats (
  workspace_id String,
  flow_id String,
  analytics_id String,
  node_id String,
  button_id String,

  uniq_user AggregateFunction(uniq, String),

  inserted_at DateTime
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(inserted_at)
ORDER BY (
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id
);

DROP TABLE IF EXISTS flow_button_mv;
CREATE MATERIALIZED VIEW flow_button_mv
TO flow_button_stats
AS
SELECT
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id,

  uniqState(contact_inbox_id) AS uniq_user,
  now() AS inserted_at
FROM flow_node_events
WHERE event_type = 'flow:clicked'
GROUP BY
  workspace_id,
  flow_id,
  analytics_id,
  node_id,
  button_id;
