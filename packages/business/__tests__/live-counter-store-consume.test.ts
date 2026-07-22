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
const whereUpdate = vi.fn(async () => undefined)
const setUpdate = vi.fn(() => ({ where: whereUpdate }))
const update = vi.fn(() => ({ set: setUpdate }))
const findFirstQuota = vi.fn(async () => null as unknown)
const eq = vi.fn()
const reconcileCounts: number[] = []
const select = vi.fn(() => {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() =>
    Promise.resolve([{ count: reconcileCounts.shift() ?? 0 }]),
  )
  return chain
})
const countDistinct = vi.fn((column: unknown) => ({ countDistinct: column }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { userQuotaModel: { findFirst: findFirstQuota } },
    insert,
    select,
    update,
  },
  and: vi.fn(),
  count: vi.fn(),
  countDistinct,
  eq,
  gt: vi.fn(),
  lte: vi.fn(),
  ne: vi.fn(),
  sql: Object.assign(
    vi.fn(() => ({ sql: true })),
    { raw: vi.fn() },
  ),
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
  contactModel: { workspaceId: "contact.workspaceId" },
  inboxModel: { workspaceId: "inbox.workspaceId" },
  workspaceMacModel: {
    macCount: "workspaceMac.macCount",
    periodStart: "workspaceMac.periodStart",
    periodEnd: "workspaceMac.periodEnd",
    workspaceId: "workspaceMac.workspaceId",
  },
  workspaceMemberModel: {
    userId: "workspaceMember.userId",
    workspaceId: "workspaceMember.workspaceId",
  },
  workspaceModel: {
    id: "workspace.id",
    ownerId: "workspace.ownerId",
    tenantId: "workspace.tenantId",
  },
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
  reconcileCounts.length = 0
  findFirstQuota.mockResolvedValue(null)
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

  test("release floors Redis and the durable counter at zero without inserting", async () => {
    redisClient.hincrby.mockResolvedValueOnce(-2)

    await userQuotaService.releaseBy(USER, "teamMembers", 3)

    expect(redisClient.hincrby).toHaveBeenCalledWith(
      `user-quota-live:${USER}`,
      "teamMembers",
      -3,
    )
    expect(redisClient.hset).toHaveBeenCalledWith(
      `user-quota-live:${USER}`,
      "teamMembers",
      "0",
    )
    expect(update).toHaveBeenCalledTimes(1)
    expect(setUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.anything() }),
    )
    expect(insert).not.toHaveBeenCalled()
    expect(distributedStore.delete).toHaveBeenCalledWith(`user-quota:${USER}`)
  })

  test("release with a non-positive count is a no-op", async () => {
    await userQuotaService.releaseBy(USER, "teamMembers", 0)

    expect(redisClient.hincrby).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})

describe("userQuotaService.reconcileOwnerPoolUsage", () => {
  test("counts a human shared across tenant workspaces once", async () => {
    // Two workspaces with an owner and one shared teammate have four member
    // rows, but only two distinct humans in the owner pool.
    reconcileCounts.push(0, 2, 2, 0, 0)

    await userQuotaService.reconcileOwnerPoolUsage("owner-1", "tenant-1")

    expect(countDistinct).toHaveBeenCalledWith("workspaceMember.userId")
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        teamMembersUsed: 2,
      }),
    )
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ teamMembersUsed: 2 }),
      }),
    )
    expect(redisClient.hset).toHaveBeenCalledWith(
      "user-quota-live:owner-1",
      "contacts",
      "0",
      "teamMembers",
      "2",
      "workspaces",
      "2",
      "channels",
      "0",
      "mac",
      "0",
    )
  })
})

describe("userQuotaService.isTeamMemberLimitReached", () => {
  test("uses the owner-scoped distinct DB count instead of the stale live counter", async () => {
    findFirstQuota.mockResolvedValue({
      planStatus: "active",
      teamMembersLimit: 2,
      teamMembersUsed: 0,
    })
    reconcileCounts.push(2)

    await expect(
      userQuotaService.isTeamMemberLimitReached(
        { ownerId: "owner-1" },
        "owner-1",
      ),
    ).resolves.toBe(true)

    expect(countDistinct).toHaveBeenCalledWith("workspaceMember.userId")
    expect(eq).toHaveBeenCalledWith("workspace.ownerId", "owner-1")
  })

  test("uses tenant scope for a reseller pool while retaining the owner quota limit", async () => {
    findFirstQuota.mockResolvedValue({
      planStatus: "active",
      teamMembersLimit: 3,
      teamMembersUsed: 99,
    })
    reconcileCounts.push(2)

    await expect(
      userQuotaService.isTeamMemberLimitReached(
        { tenantId: "tenant-1" },
        "owner-1",
      ),
    ).resolves.toBe(false)

    expect(countDistinct).toHaveBeenCalledWith("workspaceMember.userId")
    expect(eq).toHaveBeenCalledWith("workspace.tenantId", "tenant-1")
  })
})
