import type Redis from "ioredis"
import { describe, expect, test, vi } from "vitest"
import { distributedStoreFactory } from "../src/distributed-store"

describe("distributedStoreFactory.exists", () => {
  test("returns true only when Redis reports the key exists", async () => {
    const exists = vi.fn(async (key: string) => (key === "present" ? 1 : 0))
    const store = distributedStoreFactory(
      async () => ({ exists }) as unknown as Redis,
    )

    await expect(store.exists("present")).resolves.toBe(true)
    await expect(store.exists("missing")).resolves.toBe(false)
  })
})

describe("distributedStoreFactory.merge", () => {
  test("writes an explicit null field instead of silently skipping it", async () => {
    const hset = vi.fn(async () => 1)
    const expire = vi.fn(async () => 1)
    const store = distributedStoreFactory(
      async () => ({ hset, expire }) as unknown as Redis,
    )

    await store.merge("ctx:conv-1", { summarizing: false, startedAt: null })

    expect(hset).toHaveBeenCalledWith("ctx:conv-1", {
      summarizing: "false",
      startedAt: "null",
    })
  })

  test("skips undefined fields — the 'don't touch this field' signal", async () => {
    const hset = vi.fn(async () => 1)
    const store = distributedStoreFactory(
      async () => ({ hset }) as unknown as Redis,
    )

    await store.merge("ctx:conv-1", { a: 1, b: undefined })

    expect(hset).toHaveBeenCalledWith("ctx:conv-1", { a: "1" })
  })
})

describe("distributedStoreFactory.incrWithWindow", () => {
  /**
   * `defineCommand` registers a Lua script and ioredis exposes it as a
   * method on the client — vitest can't run real Lua, so this fake
   * reproduces `INCR_WITH_WINDOW_LUA`'s exact semantics (increment; set TTL
   * only when the result is 1, i.e. the key was just created) in JS,
   * against an in-memory counter map, to verify the store method wires the
   * script call correctly.
   */
  function makeFakeRedisWithLuaCounter() {
    const counters = new Map<string, number>()
    const expireCalls: Array<{ key: string; ttl: number }> = []

    const client = {
      defineCommand: vi.fn(),
      incrWithWindow: vi.fn((key: string, ttlSeconds: string) => {
        const next = (counters.get(key) ?? 0) + 1
        counters.set(key, next)
        if (next === 1) {
          expireCalls.push({ key, ttl: Number(ttlSeconds) })
        }
        return Promise.resolve(next)
      }),
    } as unknown as Redis

    return { client, counters, expireCalls }
  }

  test("increments a fresh key to 1 and sets its expiry exactly once", async () => {
    const { client, expireCalls } = makeFakeRedisWithLuaCounter()
    const store = distributedStoreFactory(async () => client)

    await expect(store.incrWithWindow("rl:ws-1:0", 10)).resolves.toBe(1)
    expect(expireCalls).toEqual([{ key: "rl:ws-1:0", ttl: 10 }])
  })

  test("subsequent increments in the same window do not re-set the expiry", async () => {
    const { client, expireCalls } = makeFakeRedisWithLuaCounter()
    const store = distributedStoreFactory(async () => client)

    await store.incrWithWindow("rl:ws-1:0", 10)
    await expect(store.incrWithWindow("rl:ws-1:0", 10)).resolves.toBe(2)
    await expect(store.incrWithWindow("rl:ws-1:0", 10)).resolves.toBe(3)

    expect(expireCalls).toHaveLength(1)
  })

  test("registers the Lua command only once per client (defineCommand called once)", async () => {
    const { client } = makeFakeRedisWithLuaCounter()
    const store = distributedStoreFactory(async () => client)

    await store.incrWithWindow("rl:ws-1:0", 10)
    await store.incrWithWindow("rl:ws-2:0", 10)

    expect(client.defineCommand).toHaveBeenCalledTimes(1)
    expect(client.defineCommand).toHaveBeenCalledWith(
      "incrWithWindow",
      expect.objectContaining({ numberOfKeys: 1 }),
    )
  })
})

describe("distributedStoreFactory live counter scripts", () => {
  function makeFakeRedisWithLiveCounterScripts() {
    const admitWithinLimit = vi.fn()
    const decrementFloor = vi.fn()
    const client = {
      admitWithinLimit,
      decrementFloor,
      defineCommand: vi.fn(),
    } as unknown as Redis

    return { admitWithinLimit, client, decrementFloor }
  }

  test("registers every live counter command once per client", async () => {
    const { admitWithinLimit, client, decrementFloor } =
      makeFakeRedisWithLiveCounterScripts()
    admitWithinLimit.mockResolvedValue([1, 1])
    decrementFloor.mockResolvedValue(0)
    const store = distributedStoreFactory(async () => client)

    await store.admitWithinLimit("quota:user-1", "mac", 10)
    await store.decrementFloor("quota:user-1", "mac", 1)
    await store.admitWithinLimit("quota:user-2", "mac", 10)

    expect(client.defineCommand).toHaveBeenCalledTimes(2)
    expect(client.defineCommand).toHaveBeenCalledWith(
      "admitWithinLimit",
      expect.objectContaining({ numberOfKeys: 1 }),
    )
    expect(client.defineCommand).toHaveBeenCalledWith(
      "decrementFloor",
      expect.objectContaining({ numberOfKeys: 1 }),
    )
  })

  test("maps arguments to strings and null limit to unlimited", async () => {
    const { admitWithinLimit, client, decrementFloor } =
      makeFakeRedisWithLiveCounterScripts()
    admitWithinLimit.mockResolvedValue([1, 4])
    decrementFloor.mockResolvedValue(2)
    const store = distributedStoreFactory(async () => client)

    await store.admitWithinLimit("quota:user-1", "mac", null)
    await store.decrementFloor("quota:user-1", "mac", 2)

    expect(admitWithinLimit).toHaveBeenCalledWith("quota:user-1", "mac", "-1")
    expect(decrementFloor).toHaveBeenCalledWith("quota:user-1", "mac", "2")
  })

  test.each([
    { code: 1, status: "admitted" },
    { code: 0, status: "refused" },
    { code: -1, status: "missing" },
  ] as const)("maps result code $code to $status", async ({ code, status }) => {
    const { admitWithinLimit, client } = makeFakeRedisWithLiveCounterScripts()
    admitWithinLimit.mockResolvedValue([code, 7])
    const store = distributedStoreFactory(async () => client)

    await expect(
      store.admitWithinLimit("quota:user-1", "mac", 10),
    ).resolves.toEqual({ status, value: 7 })
  })

  test("maps a missing decrement result to null", async () => {
    const { client, decrementFloor } = makeFakeRedisWithLiveCounterScripts()
    decrementFloor.mockResolvedValue(-1)
    const store = distributedStoreFactory(async () => client)

    await expect(
      store.decrementFloor("quota:user-1", "mac", 1),
    ).resolves.toBeNull()
  })
})

describe("distributedStoreFactory.setNumber", () => {
  test("always writes via plain SET key val EX ttl (no NX)", async () => {
    const set = vi.fn(async () => "OK")
    const store = distributedStoreFactory(
      async () => ({ set }) as unknown as Redis,
    )

    await store.setNumber("throttle:key", 1, 300)

    expect(set).toHaveBeenCalledWith("throttle:key", "1", "EX", 300)
  })

  test("overwrites an existing value, unlike setNumberIfNotExists", async () => {
    const set = vi.fn(async () => "OK")
    const store = distributedStoreFactory(
      async () => ({ set }) as unknown as Redis,
    )

    await store.setNumber("throttle:key", 1, 300)
    await store.setNumber("throttle:key", 1, 300)

    expect(set).toHaveBeenCalledTimes(2)
  })
})

describe("distributedStoreFactory.reserveTimeWindow", () => {
  /**
   * Reproduces `RESERVE_TIME_WINDOW_LUA` in JS (vitest cannot run Lua): the
   * window starts at max(now, reservedUntil) and moves reservedUntil to its end.
   */
  function makeFakeRedisWithTimeline() {
    const timelines = new Map<string, number>()
    const client = {
      defineCommand: vi.fn(),
      reserveTimeWindow: vi.fn((key: string, now: string, span: string) => {
        const start = Math.max(Number(now), timelines.get(key) ?? 0)
        timelines.set(key, start + Number(span))
        return Promise.resolve(String(start))
      }),
    } as unknown as Redis
    return { client }
  }

  test("a free timeline starts now; the next caller starts where it ends", async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const { client } = makeFakeRedisWithTimeline()
    const store = distributedStoreFactory(async () => client)

    await expect(store.reserveTimeWindow("pace:page-1", 3000)).resolves.toBe(
      1_000_000,
    )
    await expect(store.reserveTimeWindow("pace:page-1", 2000)).resolves.toBe(
      1_003_000,
    )
    // Another key has its own timeline.
    await expect(store.reserveTimeWindow("pace:page-2", 2000)).resolves.toBe(
      1_000_000,
    )
    vi.useRealTimers()
  })

  test("registers the Lua command only once per client", async () => {
    const { client } = makeFakeRedisWithTimeline()
    const store = distributedStoreFactory(async () => client)

    await store.reserveTimeWindow("pace:page-1", 1000)
    await store.reserveTimeWindow("pace:page-1", 1000)

    expect(client.defineCommand).toHaveBeenCalledTimes(1)
    expect(client.defineCommand).toHaveBeenCalledWith(
      "reserveTimeWindow",
      expect.objectContaining({ numberOfKeys: 1 }),
    )
  })
})
