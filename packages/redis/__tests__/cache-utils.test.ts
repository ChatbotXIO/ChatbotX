import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  invalidateCacheByTags,
  invalidateCacheKeys,
  withCache,
} from "../src/cache-utils"

const mocks = vi.hoisted(() => {
  // In-memory stand-in that replicates the real store's JSON round-trip so
  // the tests exercise the serialization behavior withCache depends on.
  const redisData = new Map<string, string>()
  // Real tag → member-key membership, so invalidateCacheByTags can be
  // exercised end-to-end instead of only asserting sadd's call args.
  const tagMembers = new Map<string, Set<string>>()
  return {
    redisData,
    tagMembers,
    distributedStore: {
      get: vi.fn((key: string) => {
        const value = redisData.get(key)
        return Promise.resolve(value ? JSON.parse(value) : null)
      }),
      put: vi.fn((key: string, value: unknown) => {
        redisData.set(key, JSON.stringify(value))
        return Promise.resolve()
      }),
      sadd: vi.fn((tagKey: string, member: string) => {
        const set = tagMembers.get(tagKey) ?? new Set<string>()
        set.add(member)
        tagMembers.set(tagKey, set)
        return Promise.resolve(1)
      }),
      smembers: vi.fn((tagKey: string) =>
        Promise.resolve([...(tagMembers.get(tagKey) ?? [])]),
      ),
      expire: vi.fn(() => Promise.resolve(1)),
      delete: vi.fn((keys: string | string[]) => {
        const keysArray = Array.isArray(keys) ? keys : [keys]
        for (const key of keysArray) {
          redisData.delete(key)
          tagMembers.delete(key)
        }
        return Promise.resolve()
      }),
    },
  }
})

vi.mock("../src/index.ts", () => ({
  distributedStore: mocks.distributedStore,
}))

vi.mock("@chatbotx.io/logger", () => ({
  default: { debug: vi.fn() },
}))

describe("withCache", () => {
  beforeEach(() => {
    mocks.redisData.clear()
    mocks.tagMembers.clear()
    vi.clearAllMocks()
  })

  test("preserves Date instances across the cache round-trip", async () => {
    const workspace = {
      id: "1",
      name: "Acme",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      scheduledDeletionAt: null,
    }

    const firstResult = await withCache("workspaces:1", () =>
      Promise.resolve(workspace),
    )
    expect(firstResult).toEqual(workspace)

    const source = vi.fn()
    const cachedResult = await withCache<typeof workspace>(
      "workspaces:1",
      source,
    )
    expect(source).not.toHaveBeenCalled()
    expect(cachedResult.createdAt).toBeInstanceOf(Date)
    expect(cachedResult).toEqual(workspace)
  })

  test("ignores legacy plain-JSON entries written under unprefixed keys", async () => {
    mocks.redisData.set(
      "workspaces:legacy",
      JSON.stringify({ id: "1", createdAt: "2026-07-01T00:00:00.000Z" }),
    )

    const fresh = { id: "1", createdAt: new Date("2026-07-01T00:00:00.000Z") }
    const result = await withCache("workspaces:legacy", () =>
      Promise.resolve(fresh),
    )
    expect(result).toBe(fresh)
  })

  test("registers tags against the prefixed cache key", async () => {
    await withCache("workspaces:1", () => Promise.resolve({ id: "1" }), {
      dynamicTags: (result) => [`workspaces:${result.id}`],
    })

    expect(mocks.distributedStore.sadd).toHaveBeenCalledWith(
      "tags:workspaces:1",
      "sj:workspaces:1",
    )
  })

  test("invalidateCacheKeys removes entries stored by withCache", async () => {
    await withCache("workspaces:1", () => Promise.resolve({ id: "1" }))
    // Legacy entry from a pre-SuperJSON writer under the unprefixed key.
    mocks.redisData.set("workspaces:1", JSON.stringify({ id: "1" }))

    await invalidateCacheKeys("workspaces:1")

    expect(mocks.redisData.size).toBe(0)
    const source = vi.fn(() => Promise.resolve({ id: "2" }))
    const result = await withCache("workspaces:1", source)
    expect(source).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: "2" })
  })

  test("ttlFor overrides the write TTL per result (short negative, long positive)", async () => {
    const ttlFor = (hasRule: boolean) => (hasRule ? 60 : 10)

    await withCache("gate:neg", () => Promise.resolve(false), {
      ttl: 60,
      ttlFor,
    })
    expect(mocks.distributedStore.put).toHaveBeenLastCalledWith(
      "sj:gate:neg",
      expect.anything(),
      10,
    )

    await withCache("gate:pos", () => Promise.resolve(true), {
      ttl: 60,
      ttlFor,
    })
    expect(mocks.distributedStore.put).toHaveBeenLastCalledWith(
      "sj:gate:pos",
      expect.anything(),
      60,
    )
  })

  test("a short-lived negative entry never truncates the shared tag set's expiry", async () => {
    await withCache("gate:neg", () => Promise.resolve(false), {
      ttl: 60,
      ttlFor: () => 10,
      tags: ["ws-1"],
    })

    expect(mocks.distributedStore.expire).toHaveBeenCalledWith("tags:ws-1", 60)
  })

  test("deduplicates concurrent cache misses for the same key", async () => {
    const sourceStarted = Promise.withResolvers<void>()
    const sourceUnblock = Promise.withResolvers<void>()
    const source = vi.fn(async () => {
      sourceStarted.resolve()
      await sourceUnblock.promise
      return { id: "1" }
    })

    const resultsPromise = Promise.all(
      Array.from({ length: 100 }, () => withCache("workspaces:burst", source)),
    )
    await sourceStarted.promise
    sourceUnblock.resolve()
    const results = await resultsPromise

    expect(source).toHaveBeenCalledTimes(1)
    expect(results).toEqual(new Array(100).fill({ id: "1" }))
  })

  test("does not cache null or undefined results", async () => {
    const result = await withCache("workspaces:missing", () =>
      Promise.resolve(undefined),
    )
    expect(result).toBeUndefined()
    expect(mocks.distributedStore.put).not.toHaveBeenCalled()
  })

  test("concurrent joiners all reject when fn rejects, and the entry is cleared for the next call", async () => {
    const sourceStarted = Promise.withResolvers<void>()
    const sourceUnblock = Promise.withResolvers<void>()
    const failingSource = vi.fn(async () => {
      sourceStarted.resolve()
      await sourceUnblock.promise
      throw new Error("boom")
    })

    const resultsPromise = Promise.allSettled(
      Array.from({ length: 5 }, () =>
        withCache("workspaces:reject", failingSource),
      ),
    )
    await sourceStarted.promise
    sourceUnblock.resolve()
    const results = await resultsPromise

    expect(failingSource).toHaveBeenCalledTimes(1)
    for (const result of results) {
      expect(result.status).toBe("rejected")
    }

    const nextSource = vi.fn(() => Promise.resolve({ id: "ok" }))
    const result = await withCache("workspaces:reject", nextSource)
    expect(nextSource).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: "ok" })
  })

  test("invalidateCacheKeys during an in-flight fetch makes the next caller run fn again", async () => {
    const sourceStarted = Promise.withResolvers<void>()
    const sourceUnblock = Promise.withResolvers<void>()
    const stale = vi.fn(async () => {
      sourceStarted.resolve()
      await sourceUnblock.promise
      return { id: "stale" }
    })

    const stalePromise = withCache("workspaces:invalidate-keys", stale)
    await sourceStarted.promise

    await invalidateCacheKeys("workspaces:invalidate-keys")

    const fresh = vi.fn(() => Promise.resolve({ id: "fresh" }))
    const freshPromise = withCache("workspaces:invalidate-keys", fresh)

    sourceUnblock.resolve()
    const [staleResult, freshResult] = await Promise.all([
      stalePromise,
      freshPromise,
    ])

    expect(stale).toHaveBeenCalledTimes(1)
    expect(fresh).toHaveBeenCalledTimes(1)
    expect(staleResult).toEqual({ id: "stale" })
    expect(freshResult).toEqual({ id: "fresh" })
  })

  test("invalidateCacheByTags during an in-flight fetch makes the next caller run fn again", async () => {
    const cacheKey = "workspaces:invalidate-tags"
    // Warm the cache once so `ws-tag` is registered against this key, then
    // simulate the cached value expiring while the tag membership survives —
    // the next read misses the cache but the tag set still points at it.
    await withCache(cacheKey, () => Promise.resolve({ id: "warm" }), {
      tags: ["ws-tag"],
    })
    mocks.redisData.delete(`sj:${cacheKey}`)

    const sourceStarted = Promise.withResolvers<void>()
    const sourceUnblock = Promise.withResolvers<void>()
    const stale = vi.fn(async () => {
      sourceStarted.resolve()
      await sourceUnblock.promise
      return { id: "stale" }
    })
    const stalePromise = withCache(cacheKey, stale)
    await sourceStarted.promise

    await invalidateCacheByTags(["ws-tag"])

    const fresh = vi.fn(() => Promise.resolve({ id: "fresh" }))
    const freshPromise = withCache(cacheKey, fresh)

    sourceUnblock.resolve()
    const [staleResult, freshResult] = await Promise.all([
      stalePromise,
      freshPromise,
    ])

    expect(stale).toHaveBeenCalledTimes(1)
    expect(fresh).toHaveBeenCalledTimes(1)
    expect(staleResult).toEqual({ id: "stale" })
    expect(freshResult).toEqual({ id: "fresh" })
  })
})
