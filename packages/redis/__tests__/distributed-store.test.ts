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
