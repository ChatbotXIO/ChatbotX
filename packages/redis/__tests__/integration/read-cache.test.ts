// @vitest-environment node

import { randomUUID as createId } from "node:crypto"
import Redis from "ioredis"
import superjson from "superjson"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createReadCacheWith } from "../../src/read-cache"
import { realRedisUrl } from "./redis-url"

const redisUrl = realRedisUrl()

type Doc = { n: string }

describe.skipIf(!redisUrl)("read cache against Redis", () => {
  let client: Redis
  const prefix = `test:read-cache:${createId()}`
  const TTL_MS = 60_000

  beforeAll(() => {
    if (!redisUrl) {
      throw new Error("REDIS_URL is required for Redis integration tests")
    }
    client = new Redis(redisUrl)
  })

  afterAll(async () => {
    const keys = await client.keys(`${prefix}:*`)
    if (keys.length > 0) {
      await client.del(...keys)
    }
    await client.quit()
  })

  const makeCache = (name: string) =>
    createReadCacheWith<Doc>(async () => client, {
      namespace: `${prefix}:${name}`,
      ttlMs: TTL_MS,
      maxEntryBytes: 10_000,
      redisTimeoutMs: 1000,
    })

  const write = async (
    cache: ReturnType<typeof makeCache>,
    entry: string,
    version: string,
  ) =>
    await cache.getOrLoad({
      scope: "s",
      entry,
      version,
      load: async () => ({ version, value: { n: version } }),
    })

  const storedVersion = async (name: string, entry: string) =>
    await client.hget(`${prefix}:${name}:s:${entry}`, "v")

  test("keeps the newer version under interleaved writes, including 2^53 and int64 max", async () => {
    const ladders = [
      ["9007199254740991", "9007199254740992", "9007199254740993"],
      ["9223372036854775806", "9223372036854775807"],
      ["9", "10", "100"],
    ]
    for (const [index, ladder] of ladders.entries()) {
      const name = `ladder${index}`
      const cache = makeCache(name)
      const newest = ladder.at(-1) as string
      // Write newest first, then every older one: none may win.
      for (const version of [...ladder].reverse()) {
        await write(cache, "e", version)
      }
      expect(await storedVersion(name, "e")).toBe(newest)
    }
  })

  test("an older write after a newer one is rejected", async () => {
    const cache = makeCache("order")
    await write(cache, "e", "9007199254740993")
    await write(cache, "e", "9007199254740992")

    expect(await storedVersion("order", "e")).toBe("9007199254740993")
    expect(await client.hget(`${prefix}:order:s:e`, "d")).toContain(
      "9007199254740993",
    )
  })

  test("an equal-version write repairs a corrupt payload", async () => {
    const cache = makeCache("repair")
    await client.hset(`${prefix}:repair:s:e`, { v: "7", d: "garbage" })
    await write(cache, "e", "7")

    expect(await client.hget(`${prefix}:repair:s:e`, "d")).toContain('"7"')
  })

  test("applies the TTL, and a newer write refreshes it", async () => {
    const cache = makeCache("ttl")
    await write(cache, "e", "1")
    const ttl = await client.pttl(`${prefix}:ttl:s:e`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(TTL_MS)

    await client.pexpire(`${prefix}:ttl:s:e`, 1000)
    await write(cache, "e", "2")
    expect(await client.pttl(`${prefix}:ttl:s:e`)).toBeGreaterThan(1000)
  })

  test("reloads an entry that has no TTL and rewrites it with one", async () => {
    const cache = makeCache("nottl")
    const key = `${prefix}:nottl:s:e`
    await client.hset(key, { v: "1", d: superjson.stringify({ n: "old" }) })
    expect(await client.pttl(key)).toBe(-1)

    const result = await cache.getOrLoad({
      scope: "s",
      entry: "e",
      version: "1",
      load: async () => ({ version: "1", value: { n: "fresh" } }),
    })
    expect(result.value.n).toBe("fresh")
    expect(await client.pttl(key)).toBeGreaterThan(0)
  })

  test("overwrites a corrupt stored version", async () => {
    const cache = makeCache("corrupt")
    await client.hset(`${prefix}:corrupt:s:e`, { v: "garbage", d: "x" })
    await write(cache, "e", "1")

    expect(await storedVersion("corrupt", "e")).toBe("1")
  })

  test("a second cache instance reads what the first stored", async () => {
    await write(makeCache("shared"), "e", "42")
    let loads = 0
    const result = await makeCache("shared").getOrLoad({
      scope: "s",
      entry: "e",
      version: "42",
      load: () => {
        loads += 1
        return Promise.resolve({ version: "42", value: { n: "loaded" } })
      },
    })

    expect(loads).toBe(0)
    expect(result.value).toEqual({ n: "42" })
  })

  test("a value failing accept in Redis is reloaded and the same version is overwritten", async () => {
    const cache = makeCache("accept")
    await write(cache, "e", "7")
    await client.hset(`${prefix}:accept:s:e`, {
      v: "7",
      d: JSON.stringify({ json: { n: "wrong" } }),
    })
    let loads = 0
    const input = {
      scope: "s",
      entry: "e",
      version: "7",
      accept: (value: { n: string }) => value.n !== "wrong",
      load: () => {
        loads += 1
        return Promise.resolve({ version: "7", value: { n: "right" } })
      },
    }

    const first = await cache.getOrLoad(input)
    const second = await cache.getOrLoad(input)

    expect(first.value.n).toBe("right")
    expect(second.value.n).toBe("right")
    expect(loads).toBe(1)
    expect(await client.hget(`${prefix}:accept:s:e`, "d")).toContain("right")
  })
})
