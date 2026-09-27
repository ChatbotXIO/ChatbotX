export const REALTIME_CLOSE_CODE = {
  revoked: 4001,
  resync: 4002,
  overloaded: 4003,
} as const

type RealtimeWebSocket = {
  close: (code?: number, reason?: string) => void
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onopen: (() => void) | null
}
export type RealtimeSocketOptions = {
  getUrl: () => Promise<string>
  heartbeatTimeoutMs?: number
  maxReconnectDelayMs?: number
  onClose?: (event: { code: number; reason: string }) => void
  onMessage: (data: string) => void
  onOpen?: () => void
  onResync?: () => void
  random?: () => number
  reconnectBaseDelayMs?: number
  webSocketFactory?: (url: string) => RealtimeWebSocket
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000
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
  #heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #socket: RealtimeWebSocket | null = null
  readonly #heartbeatTimeoutMs: number
  readonly #maxReconnectDelayMs: number
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
          this.#attempt = 0
          this.#armHeartbeat(socket)
          this.options.onOpen?.()
        }
        socket.onmessage = (event) => {
          this.#armHeartbeat(socket)
          this.options.onMessage(event.data)
        }
        socket.onerror = () => {
          socket.close()
        }
        socket.onclose = (event) => {
          if (this.#socket !== socket) {
            return
          }
          this.#socket = null
          this.#clearHeartbeat()
          this.options.onClose?.(event)
          this.#scheduleReconnect(event)
        }
      })
      .catch(() => {
        this.#connecting = false
        this.#scheduleReconnect({ code: 0, reason: "" })
      })
  }

  close = (): void => {
    this.#closed = true
    this.#clearHeartbeat()
    this.#clearReconnect()
    this.#socket?.close()
    this.#socket = null
  }

  reconnectNow = (): void => {
    this.#clearReconnect()
    this.connect()
  }

  #armHeartbeat(socket: RealtimeWebSocket): void {
    this.#clearHeartbeat()
    this.#heartbeatTimer = setTimeout(() => {
      if (this.#socket === socket) {
        socket.close(4000, "heartbeat-timeout")
      }
    }, this.#heartbeatTimeoutMs)
  }

  #clearHeartbeat(): void {
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer)
      this.#heartbeatTimer = null
    }
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
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      this.connect()
    }, delay)
  }
}
