// @vitest-environment node

import { randomUUID as createId } from "node:crypto"
import Redis from "ioredis"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { distributedStoreFactory } from "../../src/distributed-store"
import { LIVE_RESERVATION_MAX_AGE_MS } from "../../src/live-counter-scripts"
import { realRedisUrl } from "./redis-url"

const redisUrl = realRedisUrl()

describe.skipIf(!redisUrl)(
  "distributed-store Lua scripts against Redis",
  () => {
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
      const key = `test:distributed-store:${createId()}`
      keys.add(key)
      return key
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(1000)
    })

    afterEach(async () => {
      if (keys.size > 0) {
        await client.del(...keys)
        keys.clear()
      }
      vi.useRealTimers()
    })

    afterAll(async () => {
      await client.quit()
    })

    test("reserve admits, refuses, and reports a missing field", async () => {
      const key = uniqueKey()
      await expect(
        store.reserveWithinLimit(key, "mac", 2, "r-0"),
      ).resolves.toEqual({ status: "missing", value: 0 })

      await client.hset(key, "mac", "0")
      await expect(
        store.reserveWithinLimit(key, "mac", 1, "r-1"),
      ).resolves.toEqual({ status: "reserved", value: 1 })
      await expect(
        store.reserveWithinLimit(key, "mac", 1, "r-2"),
      ).resolves.toEqual({ status: "refused", value: 1 })
    })

    test("replaying a reservation at the limit returns its original outcome", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "0")

      await expect(
        store.reserveWithinLimit(key, "mac", 1, "r-1"),
      ).resolves.toEqual({ status: "reserved", value: 1 })
      vi.setSystemTime(2000)
      await expect(
        store.reserveWithinLimit(key, "mac", 1, "r-1"),
      ).resolves.toEqual({ status: "reserved", value: 1 })
      await expect(
        client.hmget(key, "mac", "macInflight", "mac:r:r-1"),
      ).resolves.toEqual(["1", "1", "1000"])
    })

    test("reserve at the limit reclaims only stale reservations", async () => {
      const key = uniqueKey()
      vi.setSystemTime(LIVE_RESERVATION_MAX_AGE_MS + 2000)
      await client.hset(
        key,
        "mac",
        "2",
        "macInflight",
        "2",
        "mac:r:stale",
        "1999",
        "mac:r:fresh",
        "2000",
      )

      await expect(
        store.reserveWithinLimit(key, "mac", 2, "r-new"),
      ).resolves.toEqual({ status: "reserved", value: 2 })
      await expect(
        client.hmget(
          key,
          "mac",
          "macInflight",
          "mac:r:stale",
          "mac:r:fresh",
          "mac:r:r-new",
        ),
      ).resolves.toEqual([
        "2",
        "2",
        null,
        "2000",
        String(LIVE_RESERVATION_MAX_AGE_MS + 2000),
      ])
    })

    test("reserve at the limit leaves fresh reservations unchanged", async () => {
      const key = uniqueKey()
      vi.setSystemTime(LIVE_RESERVATION_MAX_AGE_MS + 2000)
      await client.hset(
        key,
        "mac",
        "2",
        "macInflight",
        "2",
        "mac:r:fresh-1",
        "2000",
        "mac:r:fresh-2",
        "2001",
      )
      const before = await client.hgetall(key)

      await expect(
        store.reserveWithinLimit(key, "mac", 2, "r-new"),
      ).resolves.toEqual({ status: "refused", value: 2 })
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test("reserve reclaim validates every timestamp before writing", async () => {
      const key = uniqueKey()
      vi.setSystemTime(LIVE_RESERVATION_MAX_AGE_MS + 2000)
      await client.hset(
        key,
        "mac",
        "2",
        "macInflight",
        "2",
        "mac:r:stale",
        "1999",
        "mac:r:bad",
        "bad",
      )
      const before = await client.hgetall(key)

      await expect(
        store.reserveWithinLimit(key, "mac", 2, "r-new"),
      ).rejects.toThrow(
        "ERR live counter reservation timestamp is not an integer",
      )
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test("reserve below the limit leaves stale reservations untouched", async () => {
      const key = uniqueKey()
      vi.setSystemTime(LIVE_RESERVATION_MAX_AGE_MS + 2000)
      await client.hset(
        key,
        "mac",
        "1",
        "macInflight",
        "1",
        "mac:r:stale",
        "1999",
      )

      await expect(
        store.reserveWithinLimit(key, "mac", 2, "r-new"),
      ).resolves.toEqual({ status: "reserved", value: 2 })
      await expect(
        client.hmget(key, "mac", "macInflight", "mac:r:stale", "mac:r:r-new"),
      ).resolves.toEqual([
        "2",
        "2",
        "1999",
        String(LIVE_RESERVATION_MAX_AGE_MS + 2000),
      ])
    })

    test.each([
      "reserve",
      "settle",
      "release",
    ] as const)("%s rejects a non-integer inflight field without changing the hash", async (operation) => {
      const key = uniqueKey()
      await client.hset(
        key,
        "mac",
        "1",
        "macInflight",
        "bad",
        "mac:r:r-1",
        "1000",
      )
      const before = await client.hgetall(key)

      let result: Promise<unknown>
      if (operation === "reserve") {
        result = store.reserveWithinLimit(key, "mac", 2, "r-2")
      } else if (operation === "settle") {
        result = store.settleReservation(key, "mac", "r-1")
      } else {
        result = store.releaseReservation(key, "mac", "r-1")
      }

      await expect(result).rejects.toThrow(
        "ERR live counter field is not an integer",
      )
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test("reserve rejects a non-integer counter without changing the hash", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "bad", "macInflight", "0")
      const before = await client.hgetall(key)

      await expect(
        store.reserveWithinLimit(key, "mac", 1, "r-1"),
      ).rejects.toThrow("ERR live counter field is not an integer")
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test.each([
      {
        field: "counter",
        values: ["mac", "1.5", "macInflight", "0"],
        run: (key: string) => store.reserveWithinLimit(key, "mac", 2, "r-2"),
        error: "ERR live counter field is not an integer",
      },
      {
        field: "inflight",
        values: ["mac", "1", "macInflight", "1.5"],
        run: (key: string) => store.reserveWithinLimit(key, "mac", 2, "r-2"),
        error: "ERR live counter field is not an integer",
      },
      {
        field: "settled",
        values: [
          "mac",
          "1",
          "macInflight",
          "1",
          "macSettled",
          "1.5",
          "mac:r:r-1",
          "1000",
        ],
        run: (key: string) => store.settleReservation(key, "mac", "r-1"),
        error: "ERR live counter field is not an integer",
      },
      {
        field: "reservation timestamp",
        values: ["mac", "1", "macInflight", "1", "mac:r:r-1", "1.5"],
        run: (key: string) => store.touchReservation(key, "mac", "r-1"),
        error: "ERR live counter reservation timestamp is not an integer",
      },
    ])("rejects a fractional $field without changing the hash", async ({
      values,
      run,
      error,
    }) => {
      const key = uniqueKey()
      await client.hset(key, ...values)
      const before = await client.hgetall(key)

      await expect(run(key)).rejects.toThrow(error)
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test("touch refreshes a reservation and reports a gone reservation", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "0")
      await store.reserveWithinLimit(key, "mac", 2, "r-1")
      vi.setSystemTime(2000)

      await expect(store.touchReservation(key, "mac", "r-1")).resolves.toBe(
        true,
      )
      await expect(client.hget(key, "mac:r:r-1")).resolves.toBe("2000")
      await expect(store.touchReservation(key, "mac", "gone")).resolves.toBe(
        false,
      )
    })

    test("settle removes reservation metadata and bumps the settled fence", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "0")
      await store.reserveWithinLimit(key, "mac", 2, "r-1")

      await expect(store.settleReservation(key, "mac", "r-1")).resolves.toBe(
        true,
      )
      await expect(
        client.hmget(key, "mac", "macInflight", "mac:r:r-1", "macSettled"),
      ).resolves.toEqual(["1", "0", null, "1"])
    })

    test("release decrements counter and inflight, while gone is a no-op", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "0")
      await store.reserveWithinLimit(key, "mac", 2, "r-1")

      await expect(store.releaseReservation(key, "mac", "r-1")).resolves.toBe(
        true,
      )
      await expect(
        client.hmget(key, "mac", "macInflight", "mac:r:r-1"),
      ).resolves.toEqual(["0", "0", null])
      await expect(store.releaseReservation(key, "mac", "r-1")).resolves.toBe(
        false,
      )
    })

    test("hsetWithInflight prunes old reservations and writes an extra field", async () => {
      const key = uniqueKey()
      vi.setSystemTime(1000 + LIVE_RESERVATION_MAX_AGE_MS)
      await client.hset(
        key,
        "mac",
        "9",
        "mac:r:old",
        "999",
        "mac:r:edge",
        "1000",
        "mac:r:new",
        "1001",
        "contacts:r:other",
        "1",
      )

      await expect(
        store.hsetWithInflight(key, "mac", 5, "set", {
          extra: {
            field: "macPeriodStart",
            value: "period-1",
          },
        }),
      ).resolves.toEqual({ status: "written", value: 7 })
      await expect(
        client.hmget(
          key,
          "mac",
          "macInflight",
          "mac:r:old",
          "mac:r:edge",
          "mac:r:new",
          "contacts:r:other",
          "macPeriodStart",
        ),
      ).resolves.toEqual(["7", "2", null, "1000", "1001", "1", "period-1"])
    })

    test("hsetWithInflight deletes stale reservations in bounded chunks", async () => {
      const key = uniqueKey()
      vi.setSystemTime(1000 + LIVE_RESERVATION_MAX_AGE_MS)
      const staleFields = Object.fromEntries(
        Array.from({ length: 2500 }, (_, index) => [
          `mac:r:stale-${index}`,
          "999",
        ]),
      )
      await client.hset(key, {
        mac: "2501",
        macInflight: "2501",
        ...staleFields,
        "mac:r:live": "1000",
      })

      await expect(
        store.hsetWithInflight(key, "mac", 5, "set"),
      ).resolves.toEqual({ status: "written", value: 6 })
      const hash = await client.hgetall(key)
      expect(hash.mac).toBe("6")
      expect(hash.macInflight).toBe("1")
      expect(hash["mac:r:live"]).toBe("1000")
      expect(
        Object.keys(hash).filter((field) => field.startsWith("mac:r:stale-")),
      ).toHaveLength(0)
    })

    test("hsetWithInflight leaves the hash unchanged when a reservation timestamp is invalid", async () => {
      const key = uniqueKey()
      vi.setSystemTime(1000 + LIVE_RESERVATION_MAX_AGE_MS)
      await client.hset(key, "mac", "9", "mac:r:old", "999", "mac:r:bad", "bad")
      const before = await client.hgetall(key)

      await expect(
        store.hsetWithInflight(key, "mac", 5, "set"),
      ).rejects.toThrow(
        "ERR live counter reservation timestamp is not an integer",
      )
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test("hsetWithInflight setnx returns -1 without pruning an existing field", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "4", "mac:r:old", "1")

      await expect(
        store.hsetWithInflight(key, "mac", 9, "setnx"),
      ).resolves.toEqual({ status: "exists" })
      await expect(client.hmget(key, "mac", "mac:r:old")).resolves.toEqual([
        "4",
        "1",
      ])
    })

    test("hsetWithInflight adds settled delta and current inflight", async () => {
      const key = uniqueKey()
      vi.setSystemTime(LIVE_RESERVATION_MAX_AGE_MS)
      await client.hset(
        key,
        "mac",
        "9",
        "macSettled",
        "5",
        "macInflight",
        "1",
        "mac:r:r-1",
        "1000",
      )

      await expect(
        store.hsetWithInflight(key, "mac", 10, "set", {
          settledSince: 3,
        }),
      ).resolves.toEqual({ status: "written", value: 13 })
      await expect(client.hmget(key, "mac", "macInflight")).resolves.toEqual([
        "13",
        "1",
      ])
    })

    test("hsetWithInflight skips without writing when settled is below the baseline", async () => {
      const key = uniqueKey()
      vi.setSystemTime(LIVE_RESERVATION_MAX_AGE_MS)
      await client.hset(key, "mac", "9", "macSettled", "3", "mac:r:r-1", "1000")
      const before = await client.hgetall(key)

      await expect(
        store.hsetWithInflight(key, "mac", 10, "set", {
          settledSince: 5,
        }),
      ).resolves.toEqual({ status: "fenced" })
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test.each([
      "settle",
      "hsetWithInflight",
    ] as const)("%s rejects a corrupt settled field without changing the hash", async (operation) => {
      const key = uniqueKey()
      await client.hset(
        key,
        "mac",
        "1",
        "macInflight",
        "1",
        "mac:r:r-1",
        "1000",
        "macSettled",
        "bad",
      )
      const before = await client.hgetall(key)

      const result =
        operation === "settle"
          ? store.settleReservation(key, "mac", "r-1")
          : store.hsetWithInflight(key, "mac", 10, "set", {
              settledSince: 0,
            })

      await expect(result).rejects.toThrow(
        "ERR live counter field is not an integer",
      )
      await expect(client.hgetall(key)).resolves.toEqual(before)
    })

    test("concurrent reservations atomically admit exactly the limit", async () => {
      const key = uniqueKey()
      await client.hset(key, "mac", "0")

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          store.reserveWithinLimit(key, "mac", 2, `r-${index}`),
        ),
      )

      expect(
        results.filter((result) => result.status === "reserved"),
      ).toHaveLength(2)
      await expect(client.hmget(key, "mac", "macInflight")).resolves.toEqual([
        "2",
        "2",
      ])
    })
  },
)
