import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Write-through regression for the DB/cache split-brain: every quota mutation
// must update BOTH the Redis live counter (HINCRBY) AND the durable DB column
// (upsert), then bust the row cache. Before the fix, `consume` wrote only the DB
// column and `incrementBy` wrote only Redis, so the display and the gate read
// different numbers until the scheduled reconcile. Exercised through
// `userQuotaService.consume` / `.incrementBy`, which delegate to the real store.
// ---------------------------------------------------------------------------

const onConflictDoUpdate = vi.fn(async () => undefined)
const values = vi.fn(() => ({ onConflictDoUpdate }))
const insert = vi.fn(() => ({ values }))
const findFirstQuota = vi.fn(async () => null as unknown)

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userQuotaModel: { findFirst: findFirstQuota } }, insert },
  and: vi.fn(),
  count: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  lte: vi.fn(),
  ne: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
  sum: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  userQuotaModel: {
    userId: "userId",
    workspacesUsed: "workspacesUsed",
    channelsUsed: "channelsUsed",
    teamMembersUsed: "teamMembersUsed",
    contactsUsed: "contactsUsed",
    macUsed: "macUsed",
  },
  contactModel: {},
  inboxModel: {},
  workspaceMacModel: {},
  workspaceMemberModel: {},
  workspaceModel: {},
}))

const redisClient = {
  hmget: vi.fn(async () => [] as (string | null)[]),
  hsetnx: vi.fn(async () => 1),
  // A present value so the live counter resolves without cold-seeding from the DB.
  hget: vi.fn(async () => "5"),
  hincrby: vi.fn(async () => 6),
  hset: vi.fn(async () => 1),
}
const cacheConnections = { useExisting: vi.fn(async () => redisClient) }
const distributedStore = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore,
  cacheConnections,
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { userQuotaService } = await import("../src/user-quota/service")

const USER = "user-1"

beforeEach(() => {
  vi.clearAllMocks()
  cacheConnections.useExisting.mockResolvedValue(redisClient)
  redisClient.hget.mockResolvedValue("5")
})

describe("userQuotaService write-through", () => {
  test("consume bumps BOTH the live counter and the DB column, then busts the cache", async () => {
    await userQuotaService.consume(USER, "workspaces")

    // Redis live counter incremented.
    expect(redisClient.hincrby).toHaveBeenCalledWith(
      `user-quota-live:${USER}`,
      "workspaces",
      1,
    )
    // Durable DB column upserted (+1) — the half that the old `consume` did and
    // the old `incrementBy` skipped.
    expect(insert).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, workspacesUsed: 1 }),
    )
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1)
    // Row cache busted so the next read reflects the new value.
    expect(distributedStore.delete).toHaveBeenCalledWith(`user-quota:${USER}`)
  })

  test("incrementBy(count) write-throughs the same count to both stores", async () => {
    await userQuotaService.incrementBy(USER, "mac", 3)

    expect(redisClient.hincrby).toHaveBeenCalledWith(
      `user-quota-live:${USER}`,
      "mac",
      3,
    )
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, macUsed: 3 }),
    )
    expect(distributedStore.delete).toHaveBeenCalledWith(`user-quota:${USER}`)
  })

  test("a non-positive count is a no-op on both stores", async () => {
    await userQuotaService.incrementBy(USER, "contacts", 0)

    expect(redisClient.hincrby).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
