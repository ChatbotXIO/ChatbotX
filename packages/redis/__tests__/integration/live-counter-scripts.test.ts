// @vitest-environment node

import { randomUUID as createId } from "node:crypto"
import Redis from "ioredis"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import { distributedStoreFactory } from "../../src/distributed-store"
import { realRedisUrl } from "./redis-url"

const redisUrl = realRedisUrl()

describe.skipIf(!redisUrl)("live counter scripts against Redis", () => {
  let client: Redis
  let store: ReturnType<typeof distributedStoreFactory>
  const keys = new Set<string>()

  beforeAll(() => {
    if (!redisUrl) {
      throw new Error("REDIS_URL is required for Redis integration tests")
    }
    client = new Redis(redisUrl)
    store = distributedStoreFactory(async () => client)
  })

  const uniqueKey = (): string => {
    const key = `test:live-counter:${createId()}`
    keys.add(key)
    return key
  }

  afterEach(async () => {
    if (keys.size > 0) {
      await client.del(...keys)
      keys.clear()
    }
  })

  afterAll(async () => {
    await client.quit()
  })

  test("admitWithinLimit admits below the limit", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "2")

    await expect(store.admitWithinLimit(key, "mac", 3)).resolves.toEqual({
      status: "admitted",
      value: 3,
    })
    await expect(client.hget(key, "mac")).resolves.toBe("3")
  })

  test("admitWithinLimit refuses at the limit without writing", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "3")
    const before = await client.hgetall(key)

    await expect(store.admitWithinLimit(key, "mac", 3)).resolves.toEqual({
      status: "refused",
      value: 3,
    })
    await expect(client.hgetall(key)).resolves.toEqual(before)
  })

  test("admitWithinLimit repairs a negative counter when admitting", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "-2")

    await expect(store.admitWithinLimit(key, "mac", 1)).resolves.toEqual({
      status: "admitted",
      value: 1,
    })
    await expect(client.hget(key, "mac")).resolves.toBe("1")
  })

  test("admitWithinLimit refuses a negative counter at zero without writing", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "-2")
    const before = await client.hgetall(key)

    await expect(store.admitWithinLimit(key, "mac", 0)).resolves.toEqual({
      status: "refused",
      value: 0,
    })
    await expect(client.hgetall(key)).resolves.toEqual(before)
  })

  test("admitWithinLimit treats a null limit as unlimited", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "3")

    await expect(store.admitWithinLimit(key, "mac", null)).resolves.toEqual({
      status: "admitted",
      value: 4,
    })
  })

  test("admitWithinLimit reports a missing field without writing", async () => {
    const key = uniqueKey()

    await expect(store.admitWithinLimit(key, "mac", 3)).resolves.toEqual({
      status: "missing",
      value: 0,
    })
    await expect(client.exists(key)).resolves.toBe(0)
  })

  test("admitWithinLimit rejects a non-integer field without writing", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "1.5")
    const before = await client.hgetall(key)

    await expect(store.admitWithinLimit(key, "mac", 3)).rejects.toThrow(
      "ERR live counter field is not an integer",
    )
    await expect(client.hgetall(key)).resolves.toEqual(before)
  })

  test("admitWithinLimit rejects a fractional limit without writing", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "1")
    const before = await client.hgetall(key)

    await expect(store.admitWithinLimit(key, "mac", 1.5)).rejects.toThrow(
      "ERR live counter argument is not an integer",
    )
    await expect(client.hgetall(key)).resolves.toEqual(before)
  })

  test("admitWithinLimit admits exactly the available concurrent slots", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "0")

    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.admitWithinLimit(key, "mac", 10)),
    )

    expect(
      results.filter((result) => result.status === "admitted"),
    ).toHaveLength(10)
    await expect(client.hget(key, "mac")).resolves.toBe("10")
  })

  test("decrementFloor floors the result at zero", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "2")

    await expect(store.decrementFloor(key, "mac", 5)).resolves.toBe(0)
    await expect(client.hget(key, "mac")).resolves.toBe("0")
  })

  test("decrementFloor reports a missing field without writing", async () => {
    const key = uniqueKey()

    await expect(store.decrementFloor(key, "mac", 1)).resolves.toBeNull()
    await expect(client.hexists(key, "mac")).resolves.toBe(0)
  })

  test("decrementFloor does not lose concurrent increments", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "100")
    // A second connection so the increments genuinely interleave with the
    // scripts instead of queueing behind them on one socket.
    const other = new Redis(redisUrl as string)

    try {
      // Connect first, otherwise the increments sit in the offline queue until
      // every decrement has already run.
      await other.ping()
      await Promise.all(
        Array.from({ length: 50 }, () => [
          store.decrementFloor(key, "mac", 1),
          other.hincrby(key, "mac", 1),
        ]).flat(),
      )
    } finally {
      await other.quit()
    }

    // The floor is never reached (the value stays >= 50), so any lost update
    // from a non-atomic read-then-write would show up as a value other than 100.
    await expect(client.hget(key, "mac")).resolves.toBe("100")
  })

  test("decrementFloor rejects a non-integer field without writing", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "bad")
    const before = await client.hgetall(key)

    await expect(store.decrementFloor(key, "mac", 1)).rejects.toThrow(
      "ERR live counter field is not an integer",
    )
    await expect(client.hgetall(key)).resolves.toEqual(before)
  })

  test("decrementFloor rejects a fractional count without writing", async () => {
    const key = uniqueKey()
    await client.hset(key, "mac", "2")
    const before = await client.hgetall(key)

    await expect(store.decrementFloor(key, "mac", 1.5)).rejects.toThrow(
      "ERR live counter argument is not an integer",
    )
    await expect(client.hgetall(key)).resolves.toEqual(before)
  })
})
