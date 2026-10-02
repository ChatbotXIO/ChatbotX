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
  member-connection map; a workspace-member deletion closes with code `4001`,
  while a permissions/team-membership change (the member is still in the
  workspace) closes with the non-terminal `4004` instead.
- Every socket subscribes to the gateway's `hb` topic. The gateway publishes a
  heartbeat every 25 seconds (whole-server interval). Clients independently
  self-close with code `4000` after 60 seconds without any frame at all — this
  is a client-side timer (`RealtimeSocket`'s `heartbeatTimeoutMs`), not a
  server-enforced idle timeout; the server never closes a connection for
  being quiet.
- A member's existing connections are revoked immediately
  (`revokeWorkspaceMemberRealtimeConnections`): already-open sockets close
  live, and a TTL'd `realtime:revoked:{workspaceId}:{userId}` marker makes
  every *new* connect attempt — with or without a `lastSeq` to replay through
  — check the revoke against the token's `iat` before admitting it, so a
  still-unexpired pre-revoke token can't reconnect either.

The contract is at-least-once. `seq` is strictly increasing per socket; clients
deduplicate only complete record frames, not individual events in a batch.

## Streams and recovery

The gateway activates only shards with local workspace or guest sockets. One
Redis connection runs `XREAD BLOCK 1000 COUNT 200` across active shards; no
consumer group is used. Every replica therefore observes the same records, so
load-balancer workspace affinity is an optional efficiency optimization, not a
correctness requirement.

On upgrade, the gateway loads up to 500 records after the supplied `lastSeq`,
paging through the shard until it collects that many of THIS workspace's own
records — a shard is shared by every workspace hashed to it (see "The gateway
activates only shards..." above), so a single `XRANGE` page can be entirely a
noisy neighbor's traffic.
It subscribes synchronously before sending replay and then sends the active
shard's recent-buffer gap fill, preserving order without touching a closed
socket. Invalid, expired, or oversized replay windows close with `4002`; the
client performs an authoritative resync only for that close code.

If the reader's single Redis connection errors (any active shard), the first
successful read after it recovers forces every locally-connected socket to
resync — an outage that outlasted the stream's retention window would
otherwise silently skip the gap instead of erroring. A stream record whose
`workspaceId` can't be recovered even loosely forces every workspace sharing
that record's shard to resync, since there's no single workspace to target.

Publishers trim streams with `MINID ~ now-5-minutes`. This bounds retention by
the replay window rather than by a per-shard entry count.

## Presence

The gateway reports presence after a user's first local socket opens or last
local socket closes. Reports are coalesced per workspace for one second, and
the periodic report is concurrency-bounded.

## Limits

| Limit | Default | Configured via | Scope |
| --- | --- | --- | --- |
| Total connections | 10,000 | `REALTIME_MAX_CONNECTIONS` | whole server |
| Guest connections | 8,000 | `REALTIME_MAX_GUEST_CONNECTIONS` | whole server (sub-pool of the total above) |
| Member connections per workspace | 500 | `REALTIME_MAX_CONNECTIONS_PER_WORKSPACE` | one workspace |
| Guest connections per workspace | 1,000 | `REALTIME_MAX_GUEST_CONNECTIONS_PER_WORKSPACE` | one workspace, across every guest conversation |
| Connections per guest conversation | 5 | `REALTIME_MAX_CONNECTIONS_PER_GUEST` | one `guestConversationId` |
| Forced reconnect (connection lifetime) | 30 minutes ±15% jitter | `REALTIME_CONNECTION_LIFETIME_MS` | per socket |
| Connect token TTL | 60 seconds | — | per mint |
| Replay window | 500 entries / 5 minutes | — | per upgrade |
| Backpressure buffer | 512,000 bytes (~500 KiB) | — | per socket |
| Server heartbeat publish interval | 25s | — | whole server |
| Client self-closes on silence (no frame at all) | 60s | — | per socket (client-side timer, not server-enforced) |

Hitting any connection-count limit above completes the WebSocket handshake
and then immediately closes with `4003` and a jittered `retryAfter` (1–5s) in
the close reason, so the client's backoff is server-directed rather than
guessed.

## Close codes

| Code | Meaning | Client behavior |
| --- | --- | --- |
| `4000` | Client self-detected it hasn't seen any frame (incl. heartbeats) for 60s — a client-side timer, not something the server sends | Reconnects with backoff |
| `4001` (`revoked`) | The member was removed from the workspace | Does not reconnect — caller must re-authenticate |
| `4002` (`resync`) | Replay cursor invalid/expired/oversized, a replay-window entry couldn't be fully parsed, or a post-outage recovery | Clears its cursor and reconnects immediately |
| `4003` (`overloaded`) | A limit from the table above was hit | Reconnects after the server-supplied `retryAfter` |
| `4004` (`reauth`) | Permissions/team membership changed, or the connection lifetime elapsed | Reconnects with a freshly minted token, keeping its replay cursor |

`4002`'s reason string is one of `invalid-last-seq`, `replay-cursor-ahead`,
`replay-window-expired`, `replay-window-too-large`, `replay-failed`,
`replay-entries-dropped` (the replay window contained an entry for this
workspace that couldn't be fully parsed — the connect still opens with
whatever replayed cleanly, then immediately resyncs instead of leaving a
silent gap), `malformed-stream-record` (a *live* stream record this replica
couldn't fully parse — a rolling-deploy schema skew, or one with no
recoverable `workspaceId` at all, which resyncs every workspace sharing that
record's shard), or `stream-reader-recovered` (the shard reader's Redis
connection just recovered from an error, so every locally-connected socket's
position is unconfirmed by an unknown amount) — the client treats all of
them identically (full resync), but they're distinguishable in gateway logs
when diagnosing *why* a resync was forced. `4004`'s reason is `reauth` for a
permissions/team-membership change or `connection-lifetime-exceeded` for the
forced periodic re-handshake.

