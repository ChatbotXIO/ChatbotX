import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type FakeClient = {
  url: string
  options: Record<string, unknown>
  connect: ReturnType<typeof vi.fn>
  ping: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

const state = vi.hoisted(() => ({
  clients: [] as FakeClient[],
  connect: (): Promise<void> => Promise.resolve(),
  ping: (): Promise<string> => Promise.resolve("PONG"),
}))

vi.mock("ioredis", () => {
  function Redis(url: string, options: Record<string, unknown>): FakeClient {
    const client: FakeClient = {
      url,
      options,
      connect: vi.fn(() => state.connect()),
      ping: vi.fn(() => state.ping()),
      disconnect: vi.fn(),
      on: vi.fn(),
    }
    state.clients.push(client)
    return client
  }
  // ioredis is pre-bundled by the vitest preset and imported through `default`.
  return { Redis, default: { Redis } }
})

const { pingRedis, resolveCacheRedisUrl } = await import("../src/probe")

const QUEUE_URL = "redis://queue:6379"
const CACHE_URL = "redis://cache:6379"
const never = () => new Promise<never>(() => undefined)

describe("Redis readiness probe", () => {
  beforeEach(() => {
    state.clients.length = 0
    state.connect = () => Promise.resolve()
    state.ping = () => Promise.resolve("PONG")
    vi.stubEnv("REDIS_URL", QUEUE_URL)
    vi.stubEnv("REDIS_CACHE_URL", CACHE_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("targets the cache URL even when queue Redis has its own URL", async () => {
    expect(resolveCacheRedisUrl()).toBe(CACHE_URL)

    await pingRedis({ timeoutMs: 2000, signal: new AbortController().signal })

    expect(state.clients[0]?.url).toBe(CACHE_URL)
  })

  test("falls back to REDIS_URL when no cache URL is set", () => {
    vi.stubEnv("REDIS_CACHE_URL", undefined)

    expect(resolveCacheRedisUrl()).toBe(QUEUE_URL)
  })

  test("uses a fail-fast client and disconnects it after a PING", async () => {
    await pingRedis({ timeoutMs: 2000, signal: new AbortController().signal })

    const [client] = state.clients
    expect(client?.options).toMatchObject({
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    })
    expect((client?.options.retryStrategy as () => unknown)()).toBeNull()
    expect(client?.ping).toHaveBeenCalledTimes(1)
    expect(client?.disconnect).toHaveBeenCalledTimes(1)
  })

  test("disconnects when the PING fails", async () => {
    state.ping = () => Promise.reject(new Error("LOADING"))

    await expect(
      pingRedis({ timeoutMs: 2000, signal: new AbortController().signal }),
    ).rejects.toThrow("LOADING")
    expect(state.clients[0]?.disconnect).toHaveBeenCalledTimes(1)
  })

  test("rejects and disconnects as soon as the signal aborts", async () => {
    state.connect = never
    const controller = new AbortController()

    const probe = pingRedis({ timeoutMs: 2000, signal: controller.signal })
    controller.abort(new Error("deadline"))

    await expect(probe).rejects.toThrow("deadline")
    expect(state.clients[0]?.disconnect).toHaveBeenCalledTimes(1)
  })

  test("does not open a client when already aborted", async () => {
    const controller = new AbortController()
    controller.abort(new Error("deadline"))

    await expect(
      pingRedis({ timeoutMs: 2000, signal: controller.signal }),
    ).rejects.toThrow("deadline")
    expect(state.clients).toHaveLength(0)
  })
})
