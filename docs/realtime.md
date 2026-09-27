# Realtime

ChatbotX serves workspace and webchat realtime traffic through a native
uWebSockets gateway backed by Redis Streams.

## Connection and delivery

- Member tabs connect to `/rt/workspaces/:workspaceId` with a short-lived
  workspace-bound token. Guest tabs connect to `/rt/guests/:guestConversationId`
  with a token bound to both the conversation and its workspace.
- Full-access members receive one `{"batch":[…],"seq":"<stream-id>"}` frame per
  workspace record. Assigned-only members receive one filtered frame per record;
  unrouted events are full-access only. Directed member events use the local
  member-connection map and revocations close with code `4001`.
- Every socket subscribes to the gateway's `hb` topic. The gateway publishes a
  heartbeat every 25 seconds; clients close only after 60 seconds without any
  frame.

The contract is at-least-once. `seq` is strictly increasing per socket; clients
deduplicate only complete record frames, not individual events in a batch.

## Streams and recovery

The gateway activates only shards with local workspace or guest sockets. One
Redis connection runs `XREAD BLOCK 1000 COUNT 200` across active shards; no
consumer group is used. Every replica therefore observes the same records, so
load-balancer workspace affinity is an optional efficiency optimization, not a
correctness requirement.

On upgrade, the gateway loads up to 500 records after the supplied `lastSeq`.
It subscribes synchronously before sending replay and then sends the active
shard's recent-buffer gap fill, preserving order without touching a closed
socket. Invalid, expired, or oversized replay windows close with `4002`; the
client performs an authoritative resync only for that close code.

Publishers trim streams with `MINID ~ now-5-minutes`. This bounds retention by
the replay window rather than by a per-shard entry count.

## Presence

The gateway reports presence after a user's first local socket opens or last
local socket closes. Reports are coalesced per workspace for one second, and
the periodic report is concurrency-bounded.
