import { beforeEach, describe, expect, it, vi } from "vitest"
import { REALTIME_CLOSE_CODE, RealtimeSocket } from "../src/realtime-socket"

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
})
