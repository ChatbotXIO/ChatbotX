import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// userQuotaService.getAccessStateFromQuota / getAccessState — the allow-list
// access gate (`active` / non-expired `trial` only) plus the MAC-limit block.
// getAccessStateFromQuota is pure (DB row only); getAccessState additionally
// ORs in the live Redis MAC count, which can be ahead of the DB column.
// ---------------------------------------------------------------------------

const findFirstQuota = vi.fn(async () => null as unknown)
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userQuotaModel: { findFirst: findFirstQuota } } },
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({ userQuotaModel: {} }))

const redisClient = {
  hmget: vi.fn(async (..._args: unknown[]) => [] as (string | null)[]),
  hsetnx: vi.fn(async () => 1),
  hget: vi.fn(async () => null as string | null),
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

const baseQuota = {
  id: "quota-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: USER,
  planName: "Pro",
  workspacesUsed: 0,
  workspacesLimit: null,
  channelsUsed: 0,
  channelsLimit: null,
  teamMembersUsed: 0,
  teamMembersLimit: null,
  contactsUsed: 0,
  contactsLimit: null,
  macUsed: 0,
  macLimit: null,
  botMessagesUsed: 0,
  botMessagesLimit: null,
  monthlyBotMessagesUsed: 0,
  monthlyBotMessagesLimit: null,
  periodStart: new Date("2026-01-01T00:00:00.000Z"),
  periodEnd: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  cacheConnections.useExisting.mockResolvedValue(redisClient)
  findFirstQuota.mockResolvedValue(null)
  redisClient.hget.mockResolvedValue(null)
})

describe("getAccessStateFromQuota (pure, DB-only)", () => {
  test("no quota row is never blocked", () => {
    const state = userQuotaService.getAccessStateFromQuota(null)
    expect(state).toEqual({
      blocked: false,
      status: null,
      planName: null,
      trialEndsAt: null,
      reason: null,
    })
  })

  test("active plan is allowed", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "active",
    })
    expect(state).toMatchObject({ blocked: false, reason: null })
  })

  test("non-expired trial is allowed", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "trial",
      periodEnd: new Date(Date.now() + 86_400_000),
    })
    expect(state).toMatchObject({ blocked: false, reason: null })
    expect(state.trialEndsAt).toBeInstanceOf(Date)
  })

  test("expired trial blocks with reason status", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "trial",
      periodEnd: new Date(Date.now() - 86_400_000),
    })
    expect(state).toMatchObject({ blocked: true, reason: "status" })
  })

  test("expired plan blocks with reason status", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "expired",
    })
    expect(state).toMatchObject({ blocked: true, reason: "status" })
  })

  test("past_due blocks with reason status", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "past_due",
    })
    expect(state).toMatchObject({ blocked: true, reason: "status" })
  })

  test("an unrecognized status blocks with reason status", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "some_future_status",
    })
    expect(state).toMatchObject({ blocked: true, reason: "status" })
  })

  test("active plan at the DB mac limit blocks with reason mac", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "active",
      macLimit: 100,
      macUsed: 100,
    })
    expect(state).toMatchObject({ blocked: true, reason: "mac" })
  })

  test("active plan under the DB mac limit is allowed", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "active",
      macLimit: 100,
      macUsed: 99,
    })
    expect(state).toMatchObject({ blocked: false, reason: null })
  })

  test("status block takes precedence over a mac block", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "past_due",
      macLimit: 100,
      macUsed: 100,
    })
    expect(state).toMatchObject({ blocked: true, reason: "status" })
  })

  test("unlimited mac (null limit) never mac-blocks", () => {
    const state = userQuotaService.getAccessStateFromQuota({
      ...baseQuota,
      planStatus: "active",
      macLimit: null,
      macUsed: 999_999,
    })
    expect(state).toMatchObject({ blocked: false, reason: null })
  })
})

describe("getAccessState (async, live-count authoritative)", () => {
  test("blocked by status short-circuits before checking the live mac count", async () => {
    findFirstQuota.mockResolvedValue({ ...baseQuota, planStatus: "past_due" })

    const state = await userQuotaService.getAccessState(USER)

    expect(state).toMatchObject({ blocked: true, reason: "status" })
    expect(redisClient.hget).not.toHaveBeenCalled()
  })

  test("blocks when the live mac count is at the limit even though the DB column lags", async () => {
    findFirstQuota.mockResolvedValue({
      ...baseQuota,
      planStatus: "active",
      macLimit: 100,
      macUsed: 50, // DB column lags behind the live Redis counter
    })
    redisClient.hget.mockResolvedValue("100")

    const state = await userQuotaService.getAccessState(USER)

    expect(state).toMatchObject({ blocked: true, reason: "mac" })
  })

  test("allows when the live mac count is under the limit", async () => {
    findFirstQuota.mockResolvedValue({
      ...baseQuota,
      planStatus: "active",
      macLimit: 100,
      macUsed: 50,
    })
    redisClient.hget.mockResolvedValue("50")

    const state = await userQuotaService.getAccessState(USER)

    expect(state).toMatchObject({ blocked: false, reason: null })
  })
})
