import type { PgTable } from "@chatbotx.io/database/client"
import type { PgColumn } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  inflightFieldFor,
  reservationFieldFor,
  settledFieldFor,
} from "../../redis/src/live-counter-scripts"

const LIVE_RESERVATION_MAX_AGE_MS = vi.hoisted(() => 15 * 60_000)
const idState = vi.hoisted(() => ({ next: 0 }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => `reservation-${++idState.next}` }
})

const onConflictDoUpdate = vi.fn(async () => undefined)
const values = vi.fn(() => ({ onConflictDoUpdate }))
const insert = vi.fn(() => ({ values }))
const update = vi.fn(() => ({ set: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert, update },
  eq: vi.fn(),
  sql: Object.assign(
    vi.fn(() => ({ sql: true })),
    { raw: vi.fn() },
  ),
}))

const hashes = new Map<string, Record<string, string>>()
const hashFor = (key: string): Record<string, string> => {
  const existing = hashes.get(key)
  if (existing) {
    return existing
  }
  const created: Record<string, string> = {}
  hashes.set(key, created)
  return created
}

/** Lua `tonumber`: nil for a missing, blank, or non-numeric string. */
const luaToNumber = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === "") {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const integerField = (value: string | undefined): number => {
  const parsed = luaToNumber(value)
  if (parsed === null || !Number.isInteger(parsed)) {
    throw new Error("ERR live counter field is not an integer")
  }
  return parsed
}

const fakeReserveWithinLimit = (
  key: string,
  field: string,
  limit: number | null,
  reservationId: string,
) => {
  const hash = hashFor(key)
  if (!(field in hash)) {
    return Promise.resolve({ status: "missing" as const, value: 0 })
  }
  const current = integerField(hash[field])
  const inflightField = inflightFieldFor(field)
  const inflight = integerField(hash[inflightField] ?? "0")
  const reservationField = reservationFieldFor(field, reservationId)
  if (reservationField in hash) {
    if (!Number.isInteger(luaToNumber(hash[reservationField]))) {
      throw new Error(
        "ERR live counter reservation timestamp is not an integer",
      )
    }
    return Promise.resolve({ status: "reserved" as const, value: current })
  }
  if (limit !== null && current + 1 > limit) {
    return Promise.resolve({ status: "refused" as const, value: current })
  }
  hash[field] = String(current + 1)
  hash[inflightField] = String(inflight + 1)
  hash[reservationField] = String(Date.now())
  return Promise.resolve({ status: "reserved" as const, value: current + 1 })
}

const fakeTouchReservation = (
  key: string,
  field: string,
  reservationId: string,
) => {
  const hash = hashFor(key)
  const reservationField = reservationFieldFor(field, reservationId)
  if (!(reservationField in hash)) {
    return Promise.resolve(false)
  }
  if (!Number.isInteger(luaToNumber(hash[reservationField]))) {
    throw new Error("ERR live counter reservation timestamp is not an integer")
  }
  hash[reservationField] = String(Date.now())
  return Promise.resolve(true)
}

const fakeSettleReservation = (
  key: string,
  field: string,
  reservationId: string,
) => {
  const hash = hashFor(key)
  const reservationField = reservationFieldFor(field, reservationId)
  if (!(reservationField in hash)) {
    return Promise.resolve(false)
  }
  if (!Number.isInteger(luaToNumber(hash[reservationField]))) {
    throw new Error("ERR live counter reservation timestamp is not an integer")
  }
  const inflightField = inflightFieldFor(field)
  const inflight = integerField(hash[inflightField] ?? "0")
  const settledField = settledFieldFor(field)
  const settled = integerField(hash[settledField] ?? "0")
  delete hash[reservationField]
  hash[inflightField] = String(inflight - 1)
  hash[settledField] = String(settled + 1)
  return Promise.resolve(true)
}

const fakeReleaseReservation = (
  key: string,
  field: string,
  reservationId: string,
) => {
  const hash = hashFor(key)
  const reservationField = reservationFieldFor(field, reservationId)
  if (!(reservationField in hash)) {
    return Promise.resolve(false)
  }
  if (!Number.isInteger(luaToNumber(hash[reservationField]))) {
    throw new Error("ERR live counter reservation timestamp is not an integer")
  }
  const inflightField = inflightFieldFor(field)
  const current = integerField(hash[field] ?? "0")
  const inflight = integerField(hash[inflightField] ?? "0")
  delete hash[reservationField]
  hash[field] = String(current - 1)
  hash[inflightField] = String(inflight - 1)
  return Promise.resolve(true)
}

const fakeHsetWithInflight = (
  key: string,
  field: string,
  base: number,
  mode: "set" | "setnx",
  options?: {
    extra?: { field: string; value: string }
    settledSince?: number
  },
) => {
  const hash = hashFor(key)
  if (mode === "setnx" && field in hash) {
    return Promise.resolve({ status: "exists" as const })
  }
  let delta = 0
  if (options?.settledSince !== undefined) {
    const settled = integerField(hash[settledFieldFor(field)] ?? "0")
    if (settled < options.settledSince) {
      return Promise.resolve({ status: "fenced" as const })
    }
    delta = settled - options.settledSince
  }
  const prefix = `${field}:r:`
  const stale: string[] = []
  let inflight = 0
  for (const [hashField, value] of Object.entries(hash)) {
    if (!hashField.startsWith(prefix)) {
      continue
    }
    const at = luaToNumber(value)
    if (at === null || !Number.isInteger(at)) {
      throw new Error(
        "ERR live counter reservation timestamp is not an integer",
      )
    }
    if (at < Date.now() - LIVE_RESERVATION_MAX_AGE_MS) {
      stale.push(hashField)
    } else {
      inflight += 1
    }
  }
  for (const hashField of stale) {
    delete hash[hashField]
  }
  hash[inflightFieldFor(field)] = String(inflight)
  hash[field] = String(base + delta + inflight)
  if (options?.extra) {
    hash[options.extra.field] = options.extra.value
  }
  return Promise.resolve({
    status: "written" as const,
    value: base + delta + inflight,
  })
}

const reserveWithinLimit = vi.fn(fakeReserveWithinLimit)
const touchReservation = vi.fn(fakeTouchReservation)
const settleReservation = vi.fn(fakeSettleReservation)
const releaseReservation = vi.fn(fakeReleaseReservation)
const hsetWithInflight = vi.fn(fakeHsetWithInflight)

const distributedStore = {
  delete: vi.fn(async () => undefined),
  reserveWithinLimit,
  touchReservation,
  settleReservation,
  releaseReservation,
  hsetWithInflight,
}
const redisClient = {
  hget: vi.fn(
    async (key: string, field: string) => hashFor(key)[field] ?? null,
  ),
  hmget: vi.fn(async (key: string, ...fields: string[]) =>
    fields.map((field) => hashFor(key)[field] ?? null),
  ),
  hincrby: vi.fn((key: string, field: string, count: number) => {
    const hash = hashFor(key)
    const next = Number(hash[field] ?? 0) + count
    hash[field] = String(next)
    return Promise.resolve(next)
  }),
  hset: vi.fn((key: string, field: string, value: string) => {
    hashFor(key)[field] = value
    return Promise.resolve(1)
  }),
  del: vi.fn(async (key: string) => (hashes.delete(key) ? 1 : 0)),
}
const cacheConnections = { useExisting: vi.fn(async () => redisClient) }

vi.mock("@chatbotx.io/redis", () => ({
  LIVE_RESERVATION_MAX_AGE_MS,
  cacheConnections,
  distributedStore,
}))

const logger = { warn: vi.fn() }
vi.mock("../src/logger", () => ({ logger }))

const { LiveCounterStore } = await import(
  "../src/quota-shared/live-counter-store"
)

type QuotaRow = { macUsed: number; contactsUsed: number }
const fetchRow = vi.fn(
  async (): Promise<QuotaRow | null> => ({ macUsed: 5, contactsUsed: 2 }),
)
const store = new LiveCounterStore<QuotaRow>({
  fetchRow,
  getUsed: (row, metric) =>
    metric === "mac" ? (row?.macUsed ?? 0) : (row?.contactsUsed ?? 0),
  idColumn: "userId" as unknown as PgColumn,
  idKey: "userId",
  label: "test-quota",
  table: "quotaTable" as unknown as PgTable,
  usedColumns: {
    mac: "macUsed" as unknown as PgColumn,
    contacts: "contactsUsed" as unknown as PgColumn,
  },
})

const USER = "user-1"
const LIVE_KEY = `test-quota-live:${USER}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  hashes.clear()
  idState.next = 0
  fetchRow.mockResolvedValue({ macUsed: 5, contactsUsed: 2 })
  reserveWithinLimit.mockImplementation(fakeReserveWithinLimit)
  touchReservation.mockImplementation(fakeTouchReservation)
  settleReservation.mockImplementation(fakeSettleReservation)
  releaseReservation.mockImplementation(fakeReleaseReservation)
  hsetWithInflight.mockImplementation(fakeHsetWithInflight)
})

describe("LiveCounterStore reservations", () => {
  test("returns null when the reservation is refused", async () => {
    hashFor(LIVE_KEY).mac = "5"
    await expect(store.reserve(USER, "mac", 5)).resolves.toBeNull()
  })

  test("returns the reservation id and reserved value", async () => {
    hashFor(LIVE_KEY).mac = "5"
    await expect(store.reserve(USER, "mac", 10)).resolves.toEqual({
      id: "reservation-1",
      value: 6,
    })
  })

  test("replaying a reservation id does not take a second slot", async () => {
    hashFor(LIVE_KEY).mac = "0"

    await expect(store.reserve(USER, "mac", 1)).resolves.toEqual({
      id: "reservation-1",
      value: 1,
    })
    idState.next = 0
    await expect(store.reserve(USER, "mac", 1)).resolves.toEqual({
      id: "reservation-1",
      value: 1,
    })
    expect(hashFor(LIVE_KEY).mac).toBe("1")
    expect(hashFor(LIVE_KEY).macInflight).toBe("1")
  })

  test("seeds a missing field with DB plus inflight and retries once", async () => {
    hashFor(LIVE_KEY)[reservationFieldFor("mac", "existing")] = String(
      Date.now(),
    )
    await expect(store.reserve(USER, "mac", 10)).resolves.toEqual({
      id: "reservation-1",
      value: 7,
    })
    expect(hsetWithInflight).toHaveBeenCalledWith(LIVE_KEY, "mac", 5, "setnx")
  })

  test("throws when the field remains missing after the seed retry", async () => {
    reserveWithinLimit.mockResolvedValue({ status: "missing", value: 0 })
    await expect(store.reserve(USER, "mac", 10)).rejects.toThrow(
      "test-quota: live counter still missing for mac after cold seed",
    )
    expect(reserveWithinLimit).toHaveBeenCalledTimes(2)
  })

  test("propagates Redis errors so admission fails closed", async () => {
    const error = new Error("redis unavailable")
    reserveWithinLimit.mockRejectedValueOnce(error)
    await expect(store.reserve(USER, "mac", 10)).rejects.toBe(error)
  })

  test("touch refreshes the timestamp and reports a missing reservation", async () => {
    hashFor(LIVE_KEY).mac = "0"
    const reservation = await store.reserve(USER, "mac", 10)
    if (!reservation) {
      throw new Error("expected reservation")
    }

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"))
    await expect(
      store.touchReservation(USER, "mac", reservation),
    ).resolves.toBe(true)
    expect(hashFor(LIVE_KEY)[reservationFieldFor("mac", reservation.id)]).toBe(
      String(Date.now()),
    )

    delete hashFor(LIVE_KEY)[reservationFieldFor("mac", reservation.id)]
    await expect(
      store.touchReservation(USER, "mac", reservation),
    ).resolves.toBe(false)
  })

  test("commit persists, invalidates, and warns when settle finds no reservation", async () => {
    settleReservation.mockResolvedValueOnce(false)

    await store.commitReservation(USER, "mac", { id: "r-1", value: 1 })

    expect(insert).toHaveBeenCalledOnce()
    expect(distributedStore.delete).toHaveBeenCalledWith(`test-quota:${USER}`)
    expect(settleReservation).toHaveBeenCalledWith(LIVE_KEY, "mac", "r-1")
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(releaseReservation).not.toHaveBeenCalled()
  })

  test("release removes only the live reservation and never durable usage", async () => {
    hashFor(LIVE_KEY).mac = "1"
    hashFor(LIVE_KEY).macInflight = "1"
    hashFor(LIVE_KEY)[reservationFieldFor("mac", "r-1")] = "1000"

    await store.releaseReservation(USER, "mac", { id: "r-1", value: 1 })

    expect(hashFor(LIVE_KEY).mac).toBe("0")
    expect(hashFor(LIVE_KEY).macInflight).toBe("0")
    expect(hashFor(LIVE_KEY)[reservationFieldFor("mac", "r-1")]).toBeUndefined()
    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  test("release of a gone reservation is a no-op", async () => {
    hashFor(LIVE_KEY).mac = "1"
    await store.releaseReservation(USER, "mac", { id: "gone", value: 1 })
    expect(hashFor(LIVE_KEY).mac).toBe("1")
  })

  test("logs and swallows Redis errors during release", async () => {
    const error = new Error("redis unavailable")
    releaseReservation.mockRejectedValueOnce(error)
    await expect(
      store.releaseReservation(USER, "mac", { id: "r-1", value: 1 }),
    ).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(
      { err: error },
      expect.stringContaining("reservation release failed"),
    )
  })

  test("fails closed when reserve sees a non-numeric counter field", async () => {
    hashFor(LIVE_KEY).mac = "corrupt"

    await expect(store.reserve(USER, "mac", 10)).rejects.toThrow(
      "ERR live counter field is not an integer",
    )
  })

  test.each([
    {
      field: "counter",
      arrange: (hash: Record<string, string>) => {
        hash.mac = "1.5"
      },
      act: () => reserveWithinLimit(LIVE_KEY, "mac", 10, "r-1"),
      error: "ERR live counter field is not an integer",
    },
    {
      field: "inflight",
      arrange: (hash: Record<string, string>) => {
        hash.mac = "1"
        hash.macInflight = "1.5"
      },
      act: () => reserveWithinLimit(LIVE_KEY, "mac", 10, "r-1"),
      error: "ERR live counter field is not an integer",
    },
    {
      field: "settled",
      arrange: (hash: Record<string, string>) => {
        hash.mac = "1"
        hash.macInflight = "1"
        hash.macSettled = "1.5"
        hash[reservationFieldFor("mac", "r-1")] = "1000"
      },
      act: () => settleReservation(LIVE_KEY, "mac", "r-1"),
      error: "ERR live counter field is not an integer",
    },
    {
      field: "reservation timestamp",
      arrange: (hash: Record<string, string>) => {
        hash.mac = "1"
        hash.macInflight = "1"
        hash[reservationFieldFor("mac", "r-1")] = "1.5"
      },
      act: () => touchReservation(LIVE_KEY, "mac", "r-1"),
      error: "ERR live counter reservation timestamp is not an integer",
    },
  ])("rejects a fractional $field without changing the hash", async ({
    arrange,
    act,
    error,
  }) => {
    const hash = hashFor(LIVE_KEY)
    arrange(hash)
    const before = { ...hash }

    await expect(Promise.resolve().then(act)).rejects.toThrow(error)
    expect(hashFor(LIVE_KEY)).toEqual(before)
  })

  test("fails closed when release sees a non-numeric counter field", async () => {
    hashFor(LIVE_KEY).mac = "corrupt"
    hashFor(LIVE_KEY).macInflight = "1"
    hashFor(LIVE_KEY)[reservationFieldFor("mac", "r-1")] = "1000"

    await store.releaseReservation(USER, "mac", { id: "r-1", value: 1 })

    expect(logger.warn).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({
          message: "ERR live counter field is not an integer",
        }),
      },
      expect.stringContaining("reservation release failed"),
    )
    expect(hashFor(LIVE_KEY).mac).toBe("corrupt")
    expect(hashFor(LIVE_KEY).macInflight).toBe("1")
    expect(hashFor(LIVE_KEY)[reservationFieldFor("mac", "r-1")]).toBe("1000")
  })

  test.each([
    "settle",
    "hsetWithInflight",
  ] as const)("%s rejects a corrupt settled field without changing the hash", async (operation) => {
    const hash = hashFor(LIVE_KEY)
    hash.mac = "1"
    hash.macInflight = "1"
    hash.macSettled = "bad"
    hash[reservationFieldFor("mac", "r-1")] = "1000"
    const before = { ...hash }

    const result = Promise.resolve().then(() =>
      operation === "settle"
        ? settleReservation(LIVE_KEY, "mac", "r-1")
        : hsetWithInflight(LIVE_KEY, "mac", 10, "set", {
            settledSince: 0,
          }),
    )

    await expect(result).rejects.toThrow(
      "ERR live counter field is not an integer",
    )
    expect(hashFor(LIVE_KEY)).toEqual(before)
  })

  test("reconcile preserves an in-flight slot until commit settles it", async () => {
    hashFor(LIVE_KEY).mac = "0"
    const reservation = await store.reserve(USER, "mac", 1)
    if (!reservation) {
      throw new Error("expected reservation")
    }

    await hsetWithInflight(LIVE_KEY, "mac", 0, "set")
    await expect(store.reserve(USER, "mac", 1)).resolves.toBeNull()
    await expect(
      store.touchReservation(USER, "mac", reservation),
    ).resolves.toBe(true)
    await store.commitReservation(USER, "mac", reservation)

    expect(hashFor(LIVE_KEY).mac).toBe("1")
    expect(hashFor(LIVE_KEY).macInflight).toBe("0")
  })

  test("settling after a durable-ledger overwrite keeps the live count", async () => {
    hashFor(LIVE_KEY).mac = "0"
    const reservation = await store.reserve(USER, "mac", 1)
    if (!reservation) {
      throw new Error("expected reservation")
    }

    await hsetWithInflight(LIVE_KEY, "mac", 1, "set")
    expect(hashFor(LIVE_KEY).mac).toBe("2")
    expect(hashFor(LIVE_KEY).macInflight).toBe("1")

    await store.commitReservation(USER, "mac", reservation)

    expect(hashFor(LIVE_KEY).mac).toBe("2")
    expect(hashFor(LIVE_KEY).macInflight).toBe("0")
    expect(hashFor(LIVE_KEY).macSettled).toBe("1")
    expect(
      hashFor(LIVE_KEY)[reservationFieldFor("mac", reservation.id)],
    ).toBeUndefined()
  })

  test("a stale ledger overwrite keeps a reservation that settled after its baseline", async () => {
    hashFor(LIVE_KEY).mac = "0"
    const reservation = await store.reserve(USER, "mac", 1)
    if (!reservation) {
      throw new Error("expected reservation")
    }
    const settledBaseline = Number(hashFor(LIVE_KEY).macSettled ?? 0)
    const staleLedgerCount = 0

    await store.commitReservation(USER, "mac", reservation)
    await hsetWithInflight(LIVE_KEY, "mac", staleLedgerCount, "set", {
      settledSince: settledBaseline,
    })

    expect(hashFor(LIVE_KEY).mac).toBe("1")
    await expect(store.reserve(USER, "mac", 1)).resolves.toBeNull()
  })

  test("prunes an old reservation so touch fails and release stays a no-op", async () => {
    hashFor(LIVE_KEY).mac = "1"
    hashFor(LIVE_KEY).macInflight = "1"
    hashFor(LIVE_KEY)[reservationFieldFor("mac", "old")] = String(
      Date.now() - LIVE_RESERVATION_MAX_AGE_MS - 1,
    )

    await hsetWithInflight(LIVE_KEY, "mac", 0, "set")
    const reservation = { id: "old", value: 1 }
    await expect(
      store.touchReservation(USER, "mac", reservation),
    ).resolves.toBe(false)
    await store.releaseReservation(USER, "mac", reservation)
    expect(hashFor(LIVE_KEY).mac).toBe("0")
    expect(hashFor(LIVE_KEY).macInflight).toBe("0")
  })

  test("cold getLiveCount writes DB plus inflight without overwriting later", async () => {
    hashFor(LIVE_KEY)[reservationFieldFor("mac", "r-1")] = String(Date.now())

    await expect(store.getLiveCount(USER, "mac")).resolves.toBe(6)
    fetchRow.mockResolvedValue({ macUsed: 99, contactsUsed: 2 })
    await expect(store.getLiveCount(USER, "mac")).resolves.toBe(6)
    expect(hashFor(LIVE_KEY).mac).toBe("6")
  })

  test("bulk cold seed writes each DB value plus that metric's inflight", async () => {
    hashFor(LIVE_KEY)[reservationFieldFor("mac", "r-1")] = String(Date.now())
    await expect(store.getLiveCounts(USER)).resolves.toMatchObject({
      mac: 6,
      contacts: 2,
    })
  })

  test("hash eviction makes touch fail and the next reserve use a fresh seed", async () => {
    hashFor(LIVE_KEY).mac = "0"
    const reservation = await store.reserve(USER, "mac", 1)
    if (!reservation) {
      throw new Error("expected reservation")
    }
    hashes.delete(LIVE_KEY)

    await expect(
      store.touchReservation(USER, "mac", reservation),
    ).resolves.toBe(false)
    fetchRow.mockResolvedValue({ macUsed: 0, contactsUsed: 2 })
    await expect(store.reserve(USER, "mac", 1)).resolves.toMatchObject({
      value: 1,
    })
  })

  test("atomically admits exactly two of five concurrent reservations", async () => {
    hashFor(LIVE_KEY).mac = "0"
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.reserve(USER, "mac", 2)),
    )

    expect(results.filter(Boolean)).toHaveLength(2)
    expect(hashFor(LIVE_KEY).mac).toBe("2")
    expect(hashFor(LIVE_KEY).macInflight).toBe("2")
    expect(
      Object.keys(hashFor(LIVE_KEY)).filter((field) =>
        field.startsWith("mac:r:"),
      ),
    ).toHaveLength(2)
  })
})
