import type Redis from "ioredis"
import superjson from "superjson"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  createReadCacheWith,
  type ReadCacheOptions,
  type VersionedValue,
} from "../src/read-cache"

vi.mock("@chatbotx.io/logger", () => ({
  default: { debug: vi.fn(), warn: vi.fn() },
}))

type Snapshot = { name: string; at?: Date }

class FakeRedis {
  hashes = new Map<string, Map<string, string>>()
  hmget = vi.fn((key: string, ...fields: string[]) => {
    const hash = this.hashes.get(key)
    return Promise.resolve(fields.map((field) => hash?.get(field) ?? null))
  })
  expiresAt = new Map<string, number>()
  // MULTI twin: HMGET (through the `hmget` mock) + PTTL in one exec.
  multi = () => {
    const steps: (() => Promise<unknown>)[] = []
    const chain = {
      hmget: (key: string, ...fields: string[]) => {
        steps.push(() => this.hmget(key, ...fields))
        return chain
      },
      pttl: (key: string) => {
        steps.push(() => Promise.resolve(this.pttl(key)))
        return chain
      },
      exec: async () =>
        await Promise.all(
          steps.map(async (step) => [null, await step()] as [null, unknown]),
        ),
    }
    return chain
  }
  // Seeded hashes without a recorded expiry read as 60 s left.
  pttl = (key: string) =>
    this.hashes.has(key)
      ? (this.expiresAt.get(key) ?? Date.now() + 60_000) - Date.now()
      : -2
  defineCommand = vi.fn()
  // JS twin of the Lua compare-and-set; the real script is covered by the integration test.
  readCacheSetIfNewer = vi.fn(
    (key: string, version: string, payload: string, ttlMs?: string) => {
      const hash = this.hashes.get(key) ?? new Map<string, string>()
      const current = hash.get("v")
      if (
        current !== undefined &&
        (current.length > version.length ||
          (current.length === version.length && current > version))
      ) {
        return Promise.resolve(0)
      }
      hash.set("v", version)
      hash.set("d", payload)
      this.hashes.set(key, hash)
      this.expiresAt.set(key, Date.now() + Number(ttlMs ?? 60_000))
      return Promise.resolve(1)
    },
  )
}

const CANONICAL_ERROR = /canonical/
const REQUESTED_ERROR = /requested/
const REJECTED_BY_ACCEPT_ERROR = /rejected by accept/

const baseOptions: ReadCacheOptions = {
  namespace: "test:v1",
  ttlMs: 60_000,
  maxEntryBytes: 10_000,
  redisTimeoutMs: 50,
  memory: { maxBytes: 10_000 },
}

const setup = (options: Partial<ReadCacheOptions> = {}) => {
  const redis = new FakeRedis()
  const cache = createReadCacheWith<Snapshot>(
    async () => redis as unknown as Redis,
    { ...baseOptions, ...options },
  )
  return { redis, cache }
}

const loaded = (version: string, name = "n"): VersionedValue<Snapshot> => ({
  version,
  value: { name },
})

describe("read cache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("miss loads, then serves from memory without another load", async () => {
    const { cache, redis } = setup()
    const load = vi.fn(async () => loaded("5"))
    const input = { scope: "s", entry: "e", version: "5", load }

    await cache.getOrLoad(input)
    const second = await cache.getOrLoad(input)

    expect(load).toHaveBeenCalledTimes(1)
    expect(second).toEqual(loaded("5"))
    expect(redis.hmget).toHaveBeenCalledTimes(1)
  })

  test("Redis hit populates memory and round-trips rich types", async () => {
    const { redis } = setup()
    const at = new Date("2026-01-02T03:04:05.000Z")
    redis.hashes.set(
      "test:v1:s:e",
      new Map([
        ["v", "7"],
        ["d", superjson.stringify({ name: "x", at })],
      ]),
    )
    const second = createReadCacheWith<Snapshot>(
      async () => redis as unknown as Redis,
      baseOptions,
    )
    const load = vi.fn(async () => loaded("7"))

    const first = await second.getOrLoad({
      scope: "s",
      entry: "e",
      version: "7",
      load,
    })
    await second.getOrLoad({ scope: "s", entry: "e", version: "7", load })

    expect(load).not.toHaveBeenCalled()
    expect(first.value.at).toEqual(at)
    expect(redis.hmget).toHaveBeenCalledTimes(1)
  })

  test("a version mismatch in Redis is a miss", async () => {
    const { cache, redis } = setup()
    redis.hashes.set(
      "test:v1:s:e",
      new Map([
        ["v", "4"],
        ["d", superjson.stringify({ name: "old" })],
      ]),
    )
    const load = vi.fn(async () => loaded("5", "new"))

    const result = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "5",
      load,
    })

    expect(load).toHaveBeenCalledTimes(1)
    expect(result.value.name).toBe("new")
    expect(redis.hashes.get("test:v1:s:e")?.get("v")).toBe("5")
  })

  test("a newer version replaces the older one in memory", async () => {
    const { cache } = setup({ redisTimeoutMs: 5 })
    await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "1",
      load: async () => loaded("1", "a"),
    })
    await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "2",
      load: async () => loaded("2", "b"),
    })

    const load = vi.fn(async () => loaded("1", "again"))
    const old = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "1",
      load,
    })

    expect(load).toHaveBeenCalledTimes(1)
    expect(old.value.name).toBe("again")
    const current = vi.fn(async () => loaded("2", "x"))
    const hit = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "2",
      load: current,
    })
    expect(current).not.toHaveBeenCalled()
    expect(hit.value.name).toBe("b")
  })

  test("the loader may return a newer version, stored and returned under it", async () => {
    const { cache, redis } = setup()
    const result = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "5",
      load: async () => loaded("6"),
    })

    expect(result.version).toBe("6")
    expect(redis.hashes.get("test:v1:s:e")?.get("v")).toBe("6")
    const load = vi.fn(async () => loaded("6"))
    await cache.getOrLoad({ scope: "s", entry: "e", version: "6", load })
    expect(load).not.toHaveBeenCalled()
  })

  test("evicts least recently used entries by encoded bytes", async () => {
    const payloadBytes = superjson.stringify({ name: "n" }).length
    const { cache, redis } = setup({
      memory: { maxBytes: payloadBytes * 2 },
      redisTimeoutMs: 5,
    })
    redis.hmget.mockResolvedValue([null, null])
    const get = (entry: string, load = vi.fn(async () => loaded("1"))) =>
      cache
        .getOrLoad({ scope: "s", entry, version: "1", load })
        .then(() => load)

    await get("a")
    await get("b")
    await get("a") // refresh a
    await get("c") // evicts b
    expect((await get("a")).mock.calls.length).toBe(0)
    expect((await get("b")).mock.calls.length).toBe(1)
  })

  test("an entry above memory.maxBytes is skipped without evicting others", async () => {
    const small = superjson.stringify({ name: "n" }).length
    const { cache } = setup({
      memory: { maxBytes: small + 5 },
      redisTimeoutMs: 5,
    })
    await cache.getOrLoad({
      scope: "s",
      entry: "small",
      version: "1",
      load: async () => loaded("1"),
    })
    await cache.getOrLoad({
      scope: "s",
      entry: "big",
      version: "1",
      load: async () => loaded("1", "x".repeat(200)),
    })

    const load = vi.fn(async () => loaded("1"))
    await cache.getOrLoad({ scope: "s", entry: "small", version: "1", load })
    expect(load).not.toHaveBeenCalled()
  })

  test("memory entries expire ttlMs after they are stored", async () => {
    vi.useFakeTimers()
    const { cache } = setup({ ttlMs: 1000 })
    const load = vi.fn(async () => loaded("1"))
    const input = { scope: "s", entry: "e", version: "1", load }
    await cache.getOrLoad(input)
    vi.advanceTimersByTime(999)
    await cache.getOrLoad(input)
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2)
    // Redis still holds it in the fake, so make Redis miss to observe memory expiry.
    const { cache: other, redis } = setup({ ttlMs: 1000 })
    redis.hmget.mockResolvedValue([null, null])
    await other.getOrLoad(input)
    vi.advanceTimersByTime(1001)
    await other.getOrLoad(input)
    expect(load).toHaveBeenCalledTimes(3)
  })

  test("a Redis hit promoted to memory expires when its Redis TTL would", async () => {
    vi.useFakeTimers()
    const { redis, cache } = setup({ ttlMs: 60_000 })
    const key = "test:v1:s:e"
    redis.hashes.set(
      key,
      new Map([
        ["v", "1"],
        ["d", superjson.stringify({ name: "stale" })],
      ]),
    )
    redis.expiresAt.set(key, Date.now() + 1000)
    const load = vi.fn(async () => loaded("1", "fresh"))
    const input = { scope: "s", entry: "e", version: "1", load }

    expect((await cache.getOrLoad(input)).value.name).toBe("stale")
    vi.advanceTimersByTime(999)
    expect((await cache.getOrLoad(input)).value.name).toBe("stale")
    expect(load).not.toHaveBeenCalled()

    // Redis would have dropped the key by now, so memory must too.
    redis.hashes.delete(key)
    vi.advanceTimersByTime(2)
    expect((await cache.getOrLoad(input)).value.name).toBe("fresh")
    expect(load).toHaveBeenCalledTimes(1)
  })

  test("a Redis entry without a TTL is treated as a miss", async () => {
    const { redis, cache } = setup()
    redis.hashes.set(
      "test:v1:s:e",
      new Map([
        ["v", "1"],
        ["d", superjson.stringify({ name: "forever" })],
      ]),
    )
    redis.expiresAt.set("test:v1:s:e", Number.NEGATIVE_INFINITY)
    redis.pttl = () => -1
    const load = vi.fn(async () => loaded("1", "fresh"))
    const result = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "1",
      load,
    })
    expect(result.value.name).toBe("fresh")
  })

  test("an oversized entry is returned but not stored anywhere, with a warning", async () => {
    const logger = (await import("@chatbotx.io/logger")).default
    const { cache, redis } = setup({ maxEntryBytes: 20 })
    const load = vi.fn(async () => loaded("1", "x".repeat(100)))
    const input = { scope: "s", entry: "e", version: "1", load }

    const result = await cache.getOrLoad(input)
    await cache.getOrLoad(input)

    expect(result.value.name).toHaveLength(100)
    expect(load).toHaveBeenCalledTimes(2)
    expect(redis.readCacheSetIfNewer).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "test:v1",
        scope: "s",
        entry: "e",
        maxEntryBytes: 20,
      }),
      expect.any(String),
    )
  })

  test("an oversized Redis payload at the current version is a miss: not parsed, not stored in memory", async () => {
    const logger = (await import("@chatbotx.io/logger")).default
    const { cache, redis } = setup({ maxEntryBytes: 50 })
    const parse = vi.spyOn(superjson, "parse")
    redis.hashes.set(
      "test:v1:s:e",
      new Map([
        ["v", "3"],
        ["d", superjson.stringify({ name: "y".repeat(200) })],
      ]),
    )
    const load = vi.fn(() => Promise.resolve(loaded("3", "ok")))
    const input = { scope: "s", entry: "e", version: "3", load }

    const first = await cache.getOrLoad(input)
    const second = await cache.getOrLoad(input)

    expect(parse).not.toHaveBeenCalled()
    expect(first.value.name).toBe("ok")
    // The reload repaired Redis with a small value, which memory then serves.
    expect(second.value.name).toBe("ok")
    expect(load).toHaveBeenCalledTimes(1)
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "test:v1",
        scope: "s",
        entry: "e",
        maxEntryBytes: 50,
      }),
      expect.any(String),
    )
    parse.mockRestore()
  })

  test("single-flight: one loader call, every waiter gets the same result", async () => {
    const { cache } = setup()
    let release: (v: VersionedValue<Snapshot>) => void = () => undefined
    const load = vi.fn(
      () =>
        new Promise<VersionedValue<Snapshot>>((resolve) => {
          release = resolve
        }),
    )
    const input = { scope: "s", entry: "e", version: "5", load }
    const calls = [
      cache.getOrLoad(input),
      cache.getOrLoad(input),
      cache.getOrLoad(input),
    ]
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    release(loaded("6"))

    const results = await Promise.all(calls)
    expect(load).toHaveBeenCalledTimes(1)
    expect(results.every((r) => r.version === "6")).toBe(true)
  })

  test("a loader error propagates, is not cached, and the flight is removed", async () => {
    const { cache } = setup()
    const boom = new Error("boom")
    const input = (load: () => Promise<VersionedValue<Snapshot>>) => ({
      scope: "s",
      entry: "e",
      version: "1",
      load,
    })
    await expect(
      cache.getOrLoad(input(() => Promise.reject(boom))),
    ).rejects.toBe(boom)

    const ok = await cache.getOrLoad(input(async () => loaded("1")))
    expect(ok.version).toBe("1")
  })

  test("an invalid loader version throws", async () => {
    const { cache } = setup()
    for (const bad of ["01", "-1", "1.5", "abc", ""]) {
      await expect(
        cache.getOrLoad({
          scope: "s",
          entry: "e",
          version: "1",
          load: async () => loaded(bad),
        }),
      ).rejects.toThrow(CANONICAL_ERROR)
    }
  })

  test("an invalid requested version throws", async () => {
    const { cache } = setup()
    await expect(
      cache.getOrLoad({
        scope: "s",
        entry: "e",
        version: "x",
        load: async () => loaded("1"),
      }),
    ).rejects.toThrow(REQUESTED_ERROR)
  })

  test("encodes ':' and '%' so distinct scopes and entries never collide", async () => {
    const { cache, redis } = setup()
    await cache.getOrLoad({
      scope: "a:b",
      entry: "c",
      version: "1",
      load: async () => loaded("1"),
    })
    await cache.getOrLoad({
      scope: "a",
      entry: "b:c",
      version: "1",
      load: async () => loaded("1"),
    })
    await cache.getOrLoad({
      scope: "100%",
      entry: "x",
      version: "1",
      load: async () => loaded("1"),
    })

    expect([...redis.hashes.keys()].sort()).toEqual([
      "test:v1:100%25:x",
      "test:v1:a%3Ab:c",
      "test:v1:a:b%3Ac",
    ])
  })

  test("Redis errors and undecodable payloads are misses, never failures", async () => {
    const { cache, redis } = setup()
    redis.hmget.mockRejectedValueOnce(new Error("down"))
    const first = await cache.getOrLoad({
      scope: "s",
      entry: "e1",
      version: "1",
      load: async () => loaded("1"),
    })
    expect(first.version).toBe("1")

    redis.hmget.mockResolvedValueOnce(["1", "{not superjson"])
    const garbage = await cache.getOrLoad({
      scope: "s",
      entry: "e2",
      version: "1",
      load: async () => loaded("1", "fresh"),
    })
    expect(garbage.value.name).toBe("fresh")
  })

  test("memory keeps serving while Redis is down, and Redis write errors are ignored", async () => {
    const { cache, redis } = setup()
    const load = vi.fn(async () => loaded("1"))
    const input = { scope: "s", entry: "e", version: "1", load }
    await cache.getOrLoad(input)
    redis.hmget.mockRejectedValue(new Error("down"))
    redis.readCacheSetIfNewer.mockRejectedValue(new Error("down"))

    await cache.getOrLoad(input)
    await cache.getOrLoad({ ...input, entry: "other" })
    expect(load).toHaveBeenCalledTimes(2)
  })

  test("a Redis call that exceeds redisTimeoutMs counts as a miss", async () => {
    vi.useFakeTimers()
    const { cache, redis } = setup({ redisTimeoutMs: 100 })
    redis.hmget.mockImplementation(() => new Promise(() => undefined))
    redis.readCacheSetIfNewer.mockImplementation(
      () => new Promise(() => undefined),
    )
    const load = vi.fn(async () => loaded("1"))

    const pending = cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "1",
      load,
    })
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(100)

    await expect(pending).resolves.toEqual(loaded("1"))
    expect(load).toHaveBeenCalledTimes(1)
  })

  test("garbage payload at the current version is repaired by the next load", async () => {
    const { cache, redis } = setup({ memory: undefined })
    redis.hashes.set(
      "test:v1:s:e",
      new Map([
        ["v", "3"],
        ["d", "{not superjson"],
      ]),
    )
    const load = vi.fn(() => Promise.resolve(loaded("3", "fixed")))
    await cache.getOrLoad({ scope: "s", entry: "e", version: "3", load })

    const again = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "3",
      load,
    })
    expect(load).toHaveBeenCalledTimes(1)
    expect(again.value.name).toBe("fixed")
  })

  test("every write sweeps expired memory entries", async () => {
    vi.useFakeTimers()
    const small = superjson.stringify({ name: "n" }).length
    const { cache, redis } = setup({
      ttlMs: 1000,
      memory: { maxBytes: small * 2 },
    })
    redis.hmget.mockResolvedValue([null, null])
    const get = (
      entry: string,
      load = vi.fn(() => Promise.resolve(loaded("1"))),
    ) =>
      cache
        .getOrLoad({ scope: "s", entry, version: "1", load })
        .then(() => load)
    await get("a")
    await get("b")
    vi.advanceTimersByTime(1001)
    await get("c") // sweeps a and b, so no live entry is evicted for room
    await get("d")

    expect((await get("c")).mock.calls.length).toBe(0)
    expect((await get("d")).mock.calls.length).toBe(0)
  })

  test("the returned value is readonly at the type level", async () => {
    const { cache } = setup()
    const result = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "1",
      load: () => Promise.resolve(loaded("1")),
    })
    // @ts-expect-error DeepReadonly forbids mutation
    result.value.name = "changed"
    expect(result.value.name).toBe("changed")
  })

  test("works without a memory tier", async () => {
    const { cache, redis } = setup({ memory: undefined })
    const load = vi.fn(async () => loaded("1"))
    const input = { scope: "s", entry: "e", version: "1", load }
    await cache.getOrLoad(input)
    await cache.getOrLoad(input)

    expect(load).toHaveBeenCalledTimes(1)
    expect(redis.hmget).toHaveBeenCalledTimes(2)
  })

  describe("accept", () => {
    const notWrong = (value: { name: string }) => value.name !== "wrong"

    test("a memory entry failing accept is dropped and reloaded", async () => {
      const { cache } = setup()
      const bad = vi.fn(async () => loaded("5", "wrong"))
      await cache.getOrLoad({ scope: "s", entry: "e", version: "5", load: bad })
      const good = vi.fn(async () => loaded("5", "right"))

      const result = await cache.getOrLoad({
        scope: "s",
        entry: "e",
        version: "5",
        load: good,
        accept: notWrong,
      })
      const again = await cache.getOrLoad({
        scope: "s",
        entry: "e",
        version: "5",
        load: good,
        accept: notWrong,
      })

      expect(good).toHaveBeenCalledTimes(1)
      expect(result.value.name).toBe("right")
      expect(again.value.name).toBe("right")
    })

    test("a Redis value failing accept is a miss and the reload repairs Redis at the same version", async () => {
      const { cache, redis } = setup({ memory: undefined })
      redis.hashes.set(
        "test:v1:s:e",
        new Map([
          ["v", "5"],
          ["d", superjson.stringify({ name: "wrong" })],
        ]),
      )
      const load = vi.fn(async () => loaded("5", "right"))
      const input = {
        scope: "s",
        entry: "e",
        version: "5",
        load,
        accept: notWrong,
      }

      await cache.getOrLoad(input)
      const again = await cache.getOrLoad(input)

      expect(load).toHaveBeenCalledTimes(1)
      expect(again.value.name).toBe("right")
      expect(redis.hashes.get("test:v1:s:e")?.get("d")).toContain("right")
    })

    test("a value the loader returns failing accept throws and is not stored", async () => {
      const { cache, redis } = setup()
      const load = vi.fn(async () => loaded("5", "wrong"))

      await expect(
        cache.getOrLoad({
          scope: "s",
          entry: "e",
          version: "5",
          load,
          accept: notWrong,
        }),
      ).rejects.toThrow(REJECTED_BY_ACCEPT_ERROR)
      expect(redis.readCacheSetIfNewer).not.toHaveBeenCalled()
      expect(load).toHaveBeenCalledTimes(1)
    })

    test("accepted values are served without extra loads", async () => {
      const { cache } = setup()
      const load = vi.fn(async () => loaded("5", "right"))
      const input = {
        scope: "s",
        entry: "e",
        version: "5",
        load,
        accept: notWrong,
      }
      await cache.getOrLoad(input)
      await cache.getOrLoad(input)
      expect(load).toHaveBeenCalledTimes(1)
    })
  })
})
