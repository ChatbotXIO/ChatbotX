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
