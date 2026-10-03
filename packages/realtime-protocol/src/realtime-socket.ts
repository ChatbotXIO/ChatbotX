export const REALTIME_CLOSE_CODE = {
  // Client-generated when the heartbeat timeout elapses. Kept in this table
  // so every protocol close code is discoverable in one place.
  heartbeatTimeout: 4000,
  revoked: 4001,
  resync: 4002,
  overloaded: 4003,
  // Non-terminal unlike `revoked`: membership/permissions/team changed (not
  // a deletion) or the forced connection-lifetime re-handshake elapsed.
  // Unlike `resync`, the client keeps its replay cursor — the server
  // re-validates claims on the fresh token mint and gap-fills via the
  // normal replay path, so there's nothing to invalidate caches for.
  reauth: 4004,
} as const

/**
 * `getUrl` throws this to signal that the failure is permanent — e.g. the
 * server rejected the token mint with 401/403 — so retrying with the same
 * (or a freshly re-minted, still-unauthorized) credential would never
 * succeed. `connect()`'s catch handler stops reconnecting entirely instead
 * of backing off forever.
 */
export class RealtimeFatalError extends Error {}

type RealtimeWebSocket = {
  close: (code?: number, reason?: string) => void
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onopen: (() => void) | null
}
type RealtimeSocketOptions = {
  getUrl: () => Promise<string>
  heartbeatTimeoutMs?: number
  maxReconnectDelayMs?: number
  minUptimeBeforeResetMs?: number
  onClose?: (event: { code: number; reason: string }) => void
  onError?: (error: unknown) => void
  onMessage: (data: string) => void
  onOpen?: () => void
  onResync?: () => void
  random?: () => number
  reconnectBaseDelayMs?: number
  webSocketFactory?: (url: string) => RealtimeWebSocket
}

type TimerHandle = ReturnType<typeof setTimeout>

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000
const DEFAULT_MIN_UPTIME_BEFORE_RESET_MS = 10_000
const DEFAULT_RECONNECT_BASE_DELAY_MS = 500

const getRetryAfterMs = (reason: string): number | null => {
  try {
    const parsed = JSON.parse(reason) as { retryAfter?: unknown }
    return typeof parsed.retryAfter === "number" && parsed.retryAfter >= 0
      ? parsed.retryAfter
      : null
  } catch {
    return null
  }
}

/**
 * Native-WebSocket transport with no outgoing queue. Every reconnect gets a
 * newly minted URL, so callers may renew short-lived auth tokens in `getUrl`.
 */
export class RealtimeSocket {
  #attempt = 0
  #connecting = false
  #closed = false
  #heartbeatTimer: TimerHandle | null = null
  #reconnectTimer: TimerHandle | null = null
  #retryNotBeforeMs: number | null = null
  #socket: RealtimeWebSocket | null = null
  #uptimeResetTimer: TimerHandle | null = null
  readonly #heartbeatTimeoutMs: number
  readonly #maxReconnectDelayMs: number
  readonly #minUptimeBeforeResetMs: number
  readonly #random: () => number
  readonly #reconnectBaseDelayMs: number
  readonly #webSocketFactory: (url: string) => RealtimeWebSocket
  readonly options: RealtimeSocketOptions

  constructor(options: RealtimeSocketOptions) {
    this.options = options
    this.#heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS
    this.#maxReconnectDelayMs =
      options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS
    this.#minUptimeBeforeResetMs =
      options.minUptimeBeforeResetMs ?? DEFAULT_MIN_UPTIME_BEFORE_RESET_MS
    this.#random = options.random ?? Math.random
    this.#reconnectBaseDelayMs =
      options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS
    this.#webSocketFactory =
      options.webSocketFactory ??
      ((url) => new WebSocket(url) as unknown as RealtimeWebSocket)
  }

  connect = (): void => {
    if (
      this.#closed ||
      this.#connecting ||
      this.#socket ||
      this.#reconnectTimer
    ) {
      return
    }
    this.#connecting = true
    this.options
      .getUrl()
      .then((url) => {
        this.#connecting = false
        if (this.#closed || this.#socket) {
          return
        }
        const socket = this.#webSocketFactory(url)
        this.#socket = socket
        socket.onopen = () => {
          this.#armUptimeReset()
          this.#armHeartbeat(socket)
          this.options.onOpen?.()
        }
        socket.onmessage = (event) => {
          this.#resetAttempt()
          this.#armHeartbeat(socket)
          this.options.onMessage(event.data)
        }
        socket.onerror = () => {
          // Native WebSocket errors carry no useful detail and are followed by
          // close. Report the failure through `onClose` exactly once.
          socket.close()
        }
        socket.onclose = (event) => {
          if (this.#socket !== socket) {
            return
          }
          this.#socket = null
          this.#clearHeartbeat()
          this.#clearUptimeReset()
          this.options.onClose?.(event)
          this.#scheduleReconnect(event)
        }
      })
      .catch((error: unknown) => {
        this.#connecting = false
        this.options.onError?.(error)
        if (error instanceof RealtimeFatalError) {
          this.close()
          return
        }
        this.#scheduleReconnect({ code: 0, reason: "" })
      })
  }

  close = (): void => {
    this.#closed = true
    this.#clearHeartbeat()
    this.#clearReconnect()
    this.#clearUptimeReset()
    this.#socket?.close()
    this.#socket = null
  }

  reconnectNow = (): void => {
    // A server-directed overload backoff must survive a foreground/online
    // event — otherwise every tab reconnects in lockstep the instant the
    // laptop wakes, defeating the jittered retryAfter the server sent.
    if (
      this.#retryNotBeforeMs !== null &&
      Date.now() < this.#retryNotBeforeMs
    ) {
      return
    }
    this.#clearReconnect()
    this.connect()
  }

  #armHeartbeat(socket: RealtimeWebSocket): void {
    this.#clearHeartbeat()
    this.#heartbeatTimer = setTimeout(() => {
      if (this.#socket === socket) {
        socket.close(REALTIME_CLOSE_CODE.heartbeatTimeout, "heartbeat-timeout")
      }
    }, this.#heartbeatTimeoutMs)
  }

  #clearHeartbeat(): void {
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer)
      this.#heartbeatTimer = null
    }
  }

  #armUptimeReset(): void {
    this.#clearUptimeReset()
    this.#uptimeResetTimer = setTimeout(() => {
      this.#uptimeResetTimer = null
      this.#resetAttempt()
    }, this.#minUptimeBeforeResetMs)
  }

  #clearUptimeReset(): void {
    if (this.#uptimeResetTimer) {
      clearTimeout(this.#uptimeResetTimer)
      this.#uptimeResetTimer = null
    }
  }

  #resetAttempt(): void {
    this.#clearUptimeReset()
    this.#attempt = 0
    this.#retryNotBeforeMs = null
  }

  #clearReconnect(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
  }

  #scheduleReconnect(event: { code: number; reason: string }): void {
    if (this.#closed || event.code === REALTIME_CLOSE_CODE.revoked) {
      return
    }
    if (event.code === REALTIME_CLOSE_CODE.resync) {
      this.options.onResync?.()
    }
    const retryAfterMs =
      event.code === REALTIME_CLOSE_CODE.overloaded
        ? getRetryAfterMs(event.reason)
        : null
    const ceiling = Math.min(
      this.#maxReconnectDelayMs,
      this.#reconnectBaseDelayMs * 2 ** this.#attempt,
    )
    this.#attempt += 1
    const delay = retryAfterMs ?? Math.floor(this.#random() * ceiling)
    this.#retryNotBeforeMs = retryAfterMs === null ? null : Date.now() + delay
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      this.connect()
    }, delay)
  }
}
