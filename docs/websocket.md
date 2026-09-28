# WebSocket transport

## Browser connection

```mermaid
sequenceDiagram
  participant Browser
  participant Builder
  participant Gateway

  Browser->>Builder: mint workspace or guest connect token
  Builder-->>Browser: short-lived JWT
  Browser->>Gateway: GET /rt/workspaces/:workspaceId?token=JWT
  Gateway->>Gateway: verify audience, expiry, and claims
  Gateway-->>Browser: native WebSocket established
```

## Event delivery

```mermaid
sequenceDiagram
  participant Producer
  participant Redis as Redis Stream
  participant Gateway
  participant Browser

  Producer->>Redis: XADD typed realtime record
  Gateway->>Redis: consume owned shard
  Gateway->>Browser: { seq, batch }
  Browser->>Browser: deduplicate and persist seq
```

The WebSocket is a replayable projection. The database remains authoritative;
a client that detects a gap or receives a resync close fetches its current
conversation head and active thread.
