# ADR 0002: Message hypertable sharding

## Status

Accepted

Date: 2026-09-23

## Context

Messages and attachments are the highest-volume operational records. Their storage
must support efficient workspace and conversation reads while allowing historical
data to be retained without keeping every chunk uncompressed. The repository
already has a TimescaleDB message schema and a shard registry, but the architecture
had not been recorded as a decision.

## Decision

Use the existing message-storage design:

- `Message` and `Attachment` are TimescaleDB hypertables partitioned by
  `createdAt` into 7-day chunks.
- Chunks older than 30 days are compressed, segmented by `(workspaceId,
  conversationId)` and ordered by `createdAt` descending.
- The message shard registry records active external shards and their time ranges.
  Writes select an active shard by a deterministic workspace hash; reads select
  shards overlapping the requested time range and also include the workspace's
  write shard so back-dated data remains reachable.
- `MessageShardConnectionManager` keeps an LRU pool of at most 10 shard
  connections and reuses the main database client when external sharding is not
  configured.
- Read-replica routing is disabled by default through the hardcoded
  `READ_REPLICAS_ENABLED = false`. It can be enabled only with the
  `readReplicasEnabled` constructor option; `SHARD_READ_REPLICA_RETRY_TTL_MS`
  is the sole environment knob.

## Consequences

This ADR documents the existing design; it does not change the shard schema or
routing behavior. Operations must provision the TimescaleDB extension for every
message shard, and shard registration must precede routing traffic to that shard.
The bounded connection pool prevents the number of active shard clients from
growing without limit, while time-range routing avoids querying every shard for
normal historical reads.
