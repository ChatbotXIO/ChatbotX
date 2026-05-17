# Implement websocket

### Browser connect websocket

```mermaid
sequenceDiagram
  participant Browser
  participant NextServer
  participant Partysocket

  Browser->>Partysocket: connect
  Partysocket->>NextServer: GET /api/auth/session <br/> Cookie: xxxxxxxxxxxxx
  NextServer-->>Partysocket: return Session | null
  critical has Session
    Partysocket-->>Browser: connected
  option Session not found
    Partysocket-->>Browser: not connected
  end
```

### Broadcast messages

```mermaid
sequenceDiagram
  participant Browser
  participant NextServer
  participant Partysocket

  NextServer->>NextServer: sign 60s JWT <br> aud=room:id, HS256(REALTIME_BROADCAST_SECRET)
  NextServer->>Partysocket: POST /parties/xxx <br> Authorization: Bearer <jwt>
  critical JWT verifies and aud matches room
    Partysocket-->>Browser: return ok
    Partysocket->>Browser: broadcast messages
  option JWT invalid, expired, or wrong audience
    Partysocket-->>NextServer: 401 Unauthorized
  end
```
