import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  REALTIME_CLOSE_CODE,
  RealtimeFatalError,
  RealtimeSocket,
} from "../src/realtime-socket"

class FakeWebSocket {
  closed: { code?: number; reason?: string } | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  readyState = 0
  sent: string[] = []
  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
    this.readyState = 3
    this.onclose?.({ code: code ?? 1000, reason: reason ?? "" })
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }
}

describe("RealtimeSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("mints a URL before every reconnect", async () => {
    const sockets: FakeWebSocket[] = []
    const getUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("ws://realtime.test/one")
      .mockResolvedValueOnce("ws://realtime.test/two")
    const socket = new RealtimeSocket({
      getUrl,
      onMessage: vi.fn(),
      random: () => 0,
      webSocketFactory: (url) => {
        expect(url).toBe(
          getUrl.mock.results.length === 1
            ? "ws://realtime.test/one"
            : "ws://realtime.test/two",
        )
        const webSocket = new FakeWebSocket()
        sockets.push(webSocket)
        return webSocket
      },
    })

    socket.connect()
    await vi.runAllTimersAsync()
    sockets[0]?.open()
    sockets[0]?.close(1006)
    await vi.runAllTimersAsync()

    expect(getUrl).toHaveBeenCalledTimes(2)
    expect(sockets).toHaveLength(2)
  })

  it("does not reconnect after a revoked close", async () => {
    const getUrl = vi.fn<() => Promise<string>>().mockResolvedValue("ws://test")
    let webSocket: FakeWebSocket | undefined
    const socket = new RealtimeSocket({
      getUrl,
      onMessage: vi.fn(),
      webSocketFactory: () => {
        webSocket = new FakeWebSocket()
        return webSocket
      },
    })

    socket.connect()
    await vi.runAllTimersAsync()
    webSocket?.open()
    webSocket?.close(REALTIME_CLOSE_CODE.revoked)
    await vi.runAllTimersAsync()

    expect(getUrl).toHaveBeenCalledOnce()
  })

  it("runs resync then reconnects after a resync close", async () => {
    const onResync = vi.fn()
    const sockets: FakeWebSocket[] = []
    const socket = new RealtimeSocket({
      getUrl: vi.fn().mockResolvedValue("ws://test"),
      onMessage: vi.fn(),
      onResync,
      random: () => 0,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket()
        sockets.push(webSocket)
        return webSocket
      },
    })

    socket.connect()
    await vi.runAllTimersAsync()
    sockets[0]?.open()
    sockets[0]?.close(REALTIME_CLOSE_CODE.resync)
    await vi.runAllTimersAsync()

    expect(onResync).toHaveBeenCalledOnce()
    expect(sockets).toHaveLength(2)
  })

  it("keeps backing off across a repeated resync-then-immediate-close loop", async () => {
    // Regression for PR #1349 finding #1: resetting #attempt on every `open`
    // gave a server that closes right after connecting (e.g. a stale-cursor
    // resync loop) zero backoff. Attempt must only reset after the socket
    // stays open past `minUptimeBeforeResetMs`.
    const sockets: FakeWebSocket[] = []
    const getUrl = vi.fn<() => Promise<string>>().mockResolvedValue("ws://test")
    new RealtimeSocket({
      getUrl,
      minUptimeBeforeResetMs: 60_000,
      onMessage: vi.fn(),
      random: () => 1,
      reconnectBaseDelayMs: 1000,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket()
        sockets.push(webSocket)
        return webSocket
      },
    }).connect()
    await vi.runAllTimersAsync()
    sockets[0]?.open()
    sockets[0]?.close(1006)

    await vi.advanceTimersByTimeAsync(999)
    expect(getUrl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getUrl).toHaveBeenCalledTimes(2)

    sockets[1]?.open()
    sockets[1]?.close(1006)
    await vi.advanceTimersByTimeAsync(1999)
    expect(getUrl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getUrl).toHaveBeenCalledTimes(3)
  })

  it("resets backoff once a connection stays open past the minimum uptime", async () => {
    const sockets: FakeWebSocket[] = []
    const getUrl = vi.fn<() => Promise<string>>().mockResolvedValue("ws://test")
    new RealtimeSocket({
      getUrl,
      minUptimeBeforeResetMs: 5000,
      onMessage: vi.fn(),
      random: () => 1,
      reconnectBaseDelayMs: 1000,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket()
        sockets.push(webSocket)
        return webSocket
      },
    }).connect()
    await vi.runAllTimersAsync()
    sockets[0]?.open()
    sockets[0]?.close(1006)
    await vi.advanceTimersByTimeAsync(1000)
    expect(getUrl).toHaveBeenCalledTimes(2)

    sockets[1]?.open()
    await vi.advanceTimersByTimeAsync(5000)
    sockets[1]?.close(1006)

    await vi.advanceTimersByTimeAsync(999)
    expect(getUrl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getUrl).toHaveBeenCalledTimes(3)
  })

  it("uses the server retryAfter on an overloaded close", async () => {
    const getUrl = vi.fn().mockResolvedValue("ws://test")
    let webSocket: FakeWebSocket | undefined
    const socket = new RealtimeSocket({
      getUrl,
      onMessage: vi.fn(),
      random: () => 0,
      webSocketFactory: () => {
        webSocket = new FakeWebSocket()
        return webSocket
      },
    })

    socket.connect()
    await vi.runAllTimersAsync()
    webSocket?.open()
    webSocket?.close(REALTIME_CLOSE_CODE.overloaded, '{"retryAfter":1000}')
    await vi.advanceTimersByTimeAsync(999)
    expect(getUrl).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)

    expect(getUrl).toHaveBeenCalledTimes(2)
  })

  it("deduplicates concurrent connection attempts before URL minting resolves", async () => {
    const getUrl = vi.fn<() => Promise<string>>().mockResolvedValue("ws://test")
    const socket = new RealtimeSocket({
      getUrl,
      onMessage: vi.fn(),
      webSocketFactory: () => new FakeWebSocket(),
    })

    socket.connect()
    socket.connect()
    await vi.runAllTimersAsync()

    expect(getUrl).toHaveBeenCalledOnce()
  })

  it("closes a silent socket when its heartbeat deadline expires", async () => {
    const webSocket = new FakeWebSocket()
    const socket = new RealtimeSocket({
      getUrl: vi.fn().mockResolvedValue("ws://test"),
      heartbeatTimeoutMs: 100,
      onMessage: vi.fn(),
      webSocketFactory: () => webSocket,
    })

    socket.connect()
    await vi.runAllTimersAsync()
    webSocket.open()
    await vi.advanceTimersByTimeAsync(100)

    expect(webSocket.closed).toEqual({
      code: 4000,
      reason: "heartbeat-timeout",
    })
  })

  it("stops reconnecting once getUrl rejects with a fatal error (e.g. a 401/403 token mint)", async () => {
    const onError = vi.fn()
    const getUrl = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new RealtimeFatalError("unauthorized"))
    const socket = new RealtimeSocket({
      getUrl,
      onError,
      onMessage: vi.fn(),
    })

    socket.connect()
    await vi.runAllTimersAsync()

    expect(getUrl).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.any(RealtimeFatalError))

    // A later external trigger (e.g. the tab regaining focus) must not
    // resurrect a connection the fatal error already gave up on.
    socket.reconnectNow()
    await vi.runAllTimersAsync()
    expect(getUrl).toHaveBeenCalledOnce()
  })

  it("counts a native WebSocket error only once (onClose), not also via onError", async () => {
    // Regression for PR #1349 round-4 medium finding: `onerror` used to also
    // forward to `options.onError` before calling `socket.close()` — since
    // `close()` always triggers `onclose` too, a caller tallying consecutive
    // connect failures across both callbacks (e.g. the webchat widget's
    // reconnect-failure banner threshold) counted one real failure as two.
    const webSocket = new FakeWebSocket()
    const onError = vi.fn()
    const onClose = vi.fn()
    const socket = new RealtimeSocket({
      getUrl: vi.fn().mockResolvedValue("ws://test"),
      onClose,
      onError,
      onMessage: vi.fn(),
      webSocketFactory: () => webSocket,
    })

    socket.connect()
    await vi.runAllTimersAsync()
    webSocket.onerror?.()

    expect(onError).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("fires onClose only once even if the underlying socket's close handler is invoked twice", async () => {
    // Regression for PR #1349 round-5: a native WebSocket implementation
    // (or an error->close() request racing a connection that was already
    // closing on its own) could in principle invoke `onclose` more than
    // once for the SAME socket instance — `this.#socket !== socket` must
    // guard every invocation after the first, not just assume there's only
    // ever one.
    const webSocket = new FakeWebSocket()
    const onClose = vi.fn()
    const socket = new RealtimeSocket({
      getUrl: vi.fn().mockResolvedValue("ws://test"),
      onClose,
      onMessage: vi.fn(),
      webSocketFactory: () => webSocket,
    })

    socket.connect()
    await vi.runAllTimersAsync()
    webSocket.onclose?.({ code: 1006, reason: "" })
    // A second, redundant invocation of the exact same handler on the exact
    // same (already-replaced) socket instance.
    webSocket.onclose?.({ code: 1006, reason: "" })

    expect(onClose).toHaveBeenCalledOnce()
  })
})
