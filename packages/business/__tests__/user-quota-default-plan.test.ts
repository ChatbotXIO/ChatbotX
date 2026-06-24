import { beforeEach, describe, expect, test, vi } from "vitest"

const DEFAULT_PLAN_ENTITLEMENT_KEY = "entitlements:default-plan"

const findFirstQuota = vi.fn(async () => null as unknown)
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userQuotaModel: { findFirst: findFirstQuota } } },
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({ userQuotaModel: {} }))

const storeGet = vi.fn(async (_key: string) => null as unknown)
const distributedStore = {
  get: storeGet,
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}
const cacheConnections = {
  useExisting: vi.fn(async () => ({
    hget: vi.fn(async () => null),
    hsetnx: vi.fn(async () => 1),
    hincrby: vi.fn(async () => 1),
  })),
}
vi.mock("@chatbotx.io/redis", () => ({
  distributedStore,
  cacheConnections,
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { userQuotaService } = await import("../src/user-quota/service")

const USER = "user-1"

/** Default-plan snapshot the enterprise billing layer publishes to Redis. */
const snapshot = {
  channelsLimit: 2,
  contactsLimit: 1000,
  macLimit: 100,
  planName: "Free",
  saasMode: false,
  ssoSaml: false,
  teamMembersLimit: 1,
  trialDays: 0,
  whiteLabel: false,
  workspacesLimit: 1,
}

/**
 * Route `distributedStore.get` by key: the row cache returns `cached`, the
 * default-plan key returns `plan`. Mirrors the two reads `getForUser` makes.
 */
const stubStore = (cached: unknown, plan: unknown) => {
  storeGet.mockImplementation(async (key: string) =>
    key === DEFAULT_PLAN_ENTITLEMENT_KEY ? plan : cached,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  storeGet.mockResolvedValue(null)
  findFirstQuota.mockResolvedValue(null)
})

describe("userQuotaService default-plan overlay (macLimit)", () => {
  test("free-tier user (no row) inherits macLimit from the snapshot", async () => {
    findFirstQuota.mockResolvedValue(null)
    stubStore(null, snapshot)

    const quota = await userQuotaService.getForUser(USER)

    expect(quota?.macLimit).toBe(100)
    expect(quota?.contactsLimit).toBe(1000)
  })

  test("usage-only row (planStatus null) inherits macLimit from the snapshot", async () => {
    findFirstQuota.mockResolvedValue({
      id: "q1",
      userId: USER,
      contactsLimit: null,
      contactsUsed: 5,
      workspacesLimit: null,
      workspacesUsed: 0,
      channelsLimit: null,
      channelsUsed: 0,
      teamMembersLimit: null,
      teamMembersUsed: 0,
      macLimit: null,
      macUsed: 3,
      whiteLabel: false,
      ssoSaml: false,
      saasMode: false,
      planName: null,
      planStatus: null,
      periodStart: null,
      periodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      syncedAt: new Date(),
    })
    stubStore(null, snapshot)

    const quota = await userQuotaService.getForUser(USER)

    expect(quota?.macLimit).toBe(100)
    expect(quota?.macUsed).toBe(3)
  })

  test("an explicit stored macLimit is preserved over the snapshot", async () => {
    findFirstQuota.mockResolvedValue({
      id: "q1",
      userId: USER,
      contactsLimit: null,
      contactsUsed: 0,
      workspacesLimit: null,
      workspacesUsed: 0,
      channelsLimit: null,
      channelsUsed: 0,
      teamMembersLimit: null,
      teamMembersUsed: 0,
      macLimit: 5000,
      macUsed: 0,
      whiteLabel: false,
      ssoSaml: false,
      saasMode: false,
      planName: null,
      planStatus: null,
      periodStart: null,
      periodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      syncedAt: new Date(),
    })
    stubStore(null, snapshot)

    const quota = await userQuotaService.getForUser(USER)

    expect(quota?.macLimit).toBe(5000)
  })

  test("no published snapshot leaves macLimit null (OSS unlimited)", async () => {
    findFirstQuota.mockResolvedValue(null)
    stubStore(null, null)

    const quota = await userQuotaService.getForUser(USER)

    expect(quota).toBeNull()
  })
})
