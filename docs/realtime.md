# Realtime

ChatbotX uses a native uWebSockets gateway and Redis Streams. The realtime
transport has no edge-room compatibility layer.

## Connection model

A browser tab opens one native WebSocket for its workspace:

- Members connect to `/rt/workspaces/:workspaceId` with a short-lived member
  token.
- Webchat guests connect to `/rt/guests/:guestConversationId` with a
  guest-scoped token.
- The gateway verifies the token audience and claims before upgrade. Member
  claims include `userId`, chat scope, and assigned team IDs.
- Browser clients use `RealtimeSocket` from `@chatbotx.io/realtime-protocol`.

Workspace events are delivered only when their route permits the connected
member. Directed member events and revocations are not workspace broadcasts.

## Delivery and recovery

Business code appends typed records to a Redis Stream shard through
`packages/business/src/platform/realtime-stream-publisher.ts`. The gateway
consumes the stream and emits frames with the Redis record id in `seq`.

Clients persist their last processed sequence and request replay after it on a
new connection. The UI deduplicates replayed frames and resyncs the authoritative
conversation head and active thread after reconnect. A client that cannot keep
up must be closed for resync rather than silently losing frames.

The delivery contract is at-least-once with idempotent client handling; the
canonical conversation and message data remains the source of truth.

## Event contract

`@chatbotx.io/realtime-protocol` owns event schemas, routes, token helpers,
stream-record schemas, the native socket helper, and presence constants.

- Producers create `RealtimeEventData` with `routeForConversation` or
  `routeForAssignment` when the event is conversation-scoped.
- Client handlers validate known event payloads with schemas from
  `realtime-protocol` before dispatch.
- Unknown event names are ignored to support staggered deployments.

## Presence

Each gateway periodically reports its locally connected workspace members to
the Builder presence endpoint. `PRESENCE_REPORT_INTERVAL_MS` and
`PRESENCE_TTL_MS` are owned by `@chatbotx.io/realtime-protocol/presence`; the
interval remains at most half the TTL. This reporting path is transport-neutral
and does not use a browser-specific protocol.
