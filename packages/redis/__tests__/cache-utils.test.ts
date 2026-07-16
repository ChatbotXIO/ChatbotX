import { beforeEach, describe, expect, test, vi } from "vitest"
import { invalidateCacheKeys, withCache } from "../src/cache-utils"

const mocks = vi.hoisted(() => {
  // In-memory stand-in that replicates the real store's JSON round-trip so
  // the tests exercise the serialization behavior withCache depends on.
  const redisData = new Map<string, string>()
  return {
    redisData,
    distributedStore: {
      get: vi.fn((key: string) => {
        const value = redisData.get(key)
        return Promise.resolve(value ? JSON.parse(value) : null)
      }),
      put: vi.fn((key: string, value: unknown) => {
        redisData.set(key, JSON.stringify(value))
        return Promise.resolve()
      }),
      sadd: vi.fn(() => Promise.resolve(1)),
      expire: vi.fn(() => Promise.resolve(1)),
      delete: vi.fn((keys: string | string[]) => {
        const keysArray = Array.isArray(keys) ? keys : [keys]
        for (const key of keysArray) {
          redisData.delete(key)
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

  test("does not cache null or undefined results", async () => {
    const result = await withCache("workspaces:missing", () =>
      Promise.resolve(undefined),
    )
    expect(result).toBeUndefined()
    expect(mocks.distributedStore.put).not.toHaveBeenCalled()
  })
})
