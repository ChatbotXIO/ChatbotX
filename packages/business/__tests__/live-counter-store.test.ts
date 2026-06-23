import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// LiveCounterStore.getLiveCounts — the batched, near-real-time read that backs
// the usage display. Exercised through userQuotaService.getLiveUsage (which
// delegates to the real store with the per-user config). Verifies: one HMGET
// for all metrics, single-fetch cold-seeding of missing fields, fail-closed
// handling of corrupt fields, and a full DB fallback on any Redis error.
// ---------------------------------------------------------------------------

const findFirstQuota = vi.fn(async () => null as unknown)
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userQuotaModel: { findFirst: findFirstQuota } } },
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({ userQuotaModel: {} }))

// Metric → live-hash field order, as the store derives it from `usedColumns`.
const METRIC_ORDER = [
  "workspaces",
  "channels",
  "teamMembers",
  "contacts",
  "mac",
] as const

const redisClient = {
  hmget: vi.fn(async (..._args: unknown[]) => [] as (string | null)[]),
  hsetnx: vi.fn(async () => 1),
  hget: vi.fn(async () => null),
  hincrby: vi.fn(async () => 1),
}
const cacheConnections = {
  useExisting: vi.fn(async () => redisClient),
}
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
  cacheConnections,
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { userQuotaService } = await import("../src/user-quota/service")

const USER = "user-1"

/** A full UserQuota row so the store's `getUsed` can read every used column. */
const dbRow = {
  workspacesUsed: 10,
  channelsUsed: 20,
  teamMembersUsed: 30,
  contactsUsed: 40,
  macUsed: 50,
}

beforeEach(() => {
  vi.clearAllMocks()
  cacheConnections.useExisting.mockResolvedValue(redisClient)
  findFirstQuota.mockResolvedValue(dbRow)
})

describe("LiveCounterStore.getLiveCounts (via getLiveUsage)", () => {
  test("returns parsed live values in one HMGET without touching the DB", async () => {
    redisClient.hmget.mockResolvedValue(["1", "2", "3", "4", "5"])

    const usage = await userQuotaService.getLiveUsage(USER)

    expect(usage).toEqual({
      workspaces: 1,
      channels: 2,
      teamMembers: 3,
      contacts: 4,
      mac: 5,
    })
    expect(redisClient.hmget).toHaveBeenCalledTimes(1)
    expect(redisClient.hmget).toHaveBeenCalledWith(
      `user-quota-live:${USER}`,
      ...METRIC_ORDER,
    )
    // Every field present → no cold-start seed, no DB read.
    expect(findFirstQuota).not.toHaveBeenCalled()
    expect(redisClient.hsetnx).not.toHaveBeenCalled()
  })

  test("cold-seeds a missing field from a single DB fetch", async () => {
    // mac field absent (cold start); the rest are live.
    redisClient.hmget.mockResolvedValue(["1", "2", "3", "4", null])

    const usage = await userQuotaService.getLiveUsage(USER)

    // Missing mac resolves to the DB value (50); live fields keep their values.
    expect(usage).toEqual({
      workspaces: 1,
      channels: 2,
      teamMembers: 3,
      contacts: 4,
      mac: 50,
    })
    // One row fetch shared across all missing fields, and the field is seeded.
    expect(findFirstQuota).toHaveBeenCalledTimes(1)
    expect(redisClient.hsetnx).toHaveBeenCalledWith(
      `user-quota-live:${USER}`,
      "mac",
      "50",
    )
  })

  test("fails closed on a corrupt field by using the DB value", async () => {
    // contacts is non-numeric → must not coerce to NaN.
    redisClient.hmget.mockResolvedValue(["1", "2", "3", "not-a-number", "5"])

    const usage = await userQuotaService.getLiveUsage(USER)

    expect(usage.contacts).toBe(40)
    expect(usage.workspaces).toBe(1)
    expect(usage.mac).toBe(5)
  })

  test("falls back to the DB for every metric on a Redis error", async () => {
    cacheConnections.useExisting.mockRejectedValueOnce(new Error("redis down"))

    const usage = await userQuotaService.getLiveUsage(USER)

    expect(usage).toEqual({
      workspaces: 10,
      channels: 20,
      teamMembers: 30,
      contacts: 40,
      mac: 50,
    })
    expect(findFirstQuota).toHaveBeenCalledTimes(1)
  })
})
