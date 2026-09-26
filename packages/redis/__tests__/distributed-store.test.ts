import type Redis from "ioredis"
import { afterEach, describe, expect, test, vi } from "vitest"
import { distributedStoreFactory } from "../src/distributed-store"
import { LIVE_RESERVATION_MAX_AGE_MS } from "../src/live-counter-scripts"

afterEach(() => {
  vi.useRealTimers()
})

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

describe("distributedStoreFactory reservation scripts", () => {
  const makeFakeRedis = () => {
    const commands = {
      reserveWithinLimit: vi.fn(async () => [1, 4] as [number, number]),
      touchReservation: vi.fn(async () => 1),
      settleReservation: vi.fn(async () => 1),
      releaseReservation: vi.fn(async () => 1),
      hsetWithInflight: vi.fn(async () => 4),
    }
    const client = {
      defineCommand: vi.fn(),
      ...commands,
    } as unknown as Redis
    return { client, commands }
  }

  test("registers all live-counter commands once per client", async () => {
    const { client } = makeFakeRedis()
    const store = distributedStoreFactory(async () => client)

    await store.reserveWithinLimit("quota:1", "mac", 10, "r-1")
    await store.touchReservation("quota:1", "mac", "r-1")
    await store.settleReservation("quota:1", "mac", "r-1")
    await store.releaseReservation("quota:1", "mac", "r-1")
    await store.hsetWithInflight("quota:1", "mac", 3, "set")
    await store.reserveWithinLimit("quota:2", "mac", 10, "r-2")

    expect(client.defineCommand).toHaveBeenCalledTimes(5)
    expect(client.defineCommand.mock.calls.map(([command]) => command)).toEqual(
      [
        "reserveWithinLimit",
        "touchReservation",
        "settleReservation",
        "releaseReservation",
        "hsetWithInflight",
      ],
    )
  })

  test("maps reserve arguments, timestamps, and the unlimited sentinel", async () => {
    const { client, commands } = makeFakeRedis()
    const store = distributedStoreFactory(async () => client)
    vi.useFakeTimers()
    vi.setSystemTime(1234 + LIVE_RESERVATION_MAX_AGE_MS)

    await store.reserveWithinLimit("quota:1", "mac", null, "r-1")

    expect(commands.reserveWithinLimit).toHaveBeenCalledWith(
      "quota:1",
      "mac",
      "-1",
      "r-1",
      String(1234 + LIVE_RESERVATION_MAX_AGE_MS),
      "1234",
    )
  })

  test.each([
    { raw: [1, 4], expected: { status: "reserved", value: 4 } },
    { raw: [0, 3], expected: { status: "refused", value: 3 } },
    { raw: [-1, 0], expected: { status: "missing", value: 0 } },
  ])("maps reserve status $raw.0", async ({ raw, expected }) => {
    const { client, commands } = makeFakeRedis()
    commands.reserveWithinLimit.mockResolvedValue(raw as [number, number])
    const store = distributedStoreFactory(async () => client)

    await expect(
      store.reserveWithinLimit("quota:1", "mac", 10, "r-1"),
    ).resolves.toEqual(expected)
  })

  test("maps touch, settle, and release results to booleans", async () => {
    const { client, commands } = makeFakeRedis()
    commands.touchReservation.mockResolvedValue(0)
    commands.settleReservation.mockResolvedValue(1)
    commands.releaseReservation.mockResolvedValue(0)
    const store = distributedStoreFactory(async () => client)
    vi.useFakeTimers()
    vi.setSystemTime(1234)

    await expect(store.touchReservation("quota:1", "mac", "r-1")).resolves.toBe(
      false,
    )
    await expect(
      store.settleReservation("quota:1", "mac", "r-1"),
    ).resolves.toBe(true)
    await expect(
      store.releaseReservation("quota:1", "mac", "r-1"),
    ).resolves.toBe(false)
  })

  test("maps hsetWithInflight arguments, prune cutoff, and empty sentinels", async () => {
    const { client, commands } = makeFakeRedis()
    const store = distributedStoreFactory(async () => client)
    vi.useFakeTimers()
    vi.setSystemTime(1234 + LIVE_RESERVATION_MAX_AGE_MS)

    await store.hsetWithInflight("quota:1", "mac", 3, "setnx")

    expect(commands.hsetWithInflight).toHaveBeenCalledWith(
      "quota:1",
      "mac",
      "3",
      "setnx",
      "1234",
      "",
      "",
      "",
    )
  })

  test("passes optional extra and settled-since values", async () => {
    const { client, commands } = makeFakeRedis()
    const store = distributedStoreFactory(async () => client)
    vi.useFakeTimers()
    vi.setSystemTime(1234 + LIVE_RESERVATION_MAX_AGE_MS)

    await store.hsetWithInflight("quota:1", "mac", 3, "set", {
      extra: {
        field: "macPeriodStart",
        value: "2026-09-01T00:00:00.000Z",
      },
      settledSince: 7,
    })

    expect(commands.hsetWithInflight).toHaveBeenCalledWith(
      "quota:1",
      "mac",
      "3",
      "set",
      "1234",
      "macPeriodStart",
      "2026-09-01T00:00:00.000Z",
      "7",
    )
  })

  test.each([
    { raw: 4, expected: { status: "written", value: 4 } },
    { raw: -1, expected: { status: "exists" } },
    { raw: -2, expected: { status: "fenced" } },
  ])("maps hsetWithInflight result $raw", async ({ raw, expected }) => {
    const { client, commands } = makeFakeRedis()
    commands.hsetWithInflight.mockResolvedValue(raw)
    const store = distributedStoreFactory(async () => client)

    await expect(
      store.hsetWithInflight("quota:1", "mac", 3, "set"),
    ).resolves.toEqual(expected)
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
