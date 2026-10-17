import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Same license-mocking style as `entitlements.test.ts`: mock the edition
// flags and the license verifier, and let the real `hasEnterpriseFeatures()`
// wire them together — this is what proves the server-side gate (not just
// the individual unit) behaves correctly for a licensed self-hosted
// enterprise install, not only for cloud.
const mocks = vi.hoisted(() => ({
  getLicenseStatus: vi.fn(),
  isCloud: vi.fn(),
  isEnterprise: vi.fn(),
}))

vi.mock("../src/keys", () => ({
  isCloud: mocks.isCloud,
  isEnterprise: mocks.isEnterprise,
  keys: () => ({ NEXT_PUBLIC_BUILDER_URL: "https://app.example.test" }),
}))

vi.mock("../src/enterprise/license/service", () => ({
  getLicenseStatus: mocks.getLicenseStatus,
}))

const DEFAULT_PLAN_ENTITLEMENT_KEY = "entitlements:default-plan"

const userQuotaModel = { userId: "userId-column" }

const insertBuilder = {
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(async () => [{ userId: "stamped" }]),
}
insertBuilder.values.mockReturnValue(insertBuilder)
insertBuilder.onConflictDoNothing.mockReturnValue(insertBuilder)

const dbInsert = vi.fn(() => insertBuilder)
const findFirstQuota = vi.fn(async () => null as unknown)
const findFirstUser = vi.fn(async () => null as unknown)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: dbInsert,
    query: {
      userQuotaModel: { findFirst: findFirstQuota },
      userModel: { findFirst: findFirstUser },
    },
  },
  eq: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  userQuotaModel,
}))

const storeGet = vi.fn(async (_key: string) => null as unknown)
const distributedStore = {
  get: storeGet,
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}
vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: {
    useExisting: vi.fn(async () => ({
      hget: vi.fn(async () => null),
      hsetnx: vi.fn(async () => 1),
      hincrby: vi.fn(async () => 1),
    })),
  },
  distributedStore,
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { billingService } = await import("../src/enterprise/billing/service")
const { userQuotaService } = await import("../src/user-quota/service")

const snapshot = {
  channelsLimit: 5,
  contactsLimit: 2000,
  macLimit: 200,
  planName: "Starter",
  saasMode: false,
  ssoSaml: false,
  teamMembersLimit: 2,
  trialDays: 0,
  whiteLabel: false,
  workspacesLimit: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isCloud.mockReturnValue(false)
  mocks.isEnterprise.mockReturnValue(false)
  mocks.getLicenseStatus.mockResolvedValue({ state: "missing" })
  storeGet.mockResolvedValue(null)
  findFirstQuota.mockResolvedValue(null)
  findFirstUser.mockResolvedValue(null)
  insertBuilder.values.mockClear().mockReturnValue(insertBuilder)
  insertBuilder.onConflictDoNothing.mockClear().mockReturnValue(insertBuilder)
  insertBuilder.returning.mockClear().mockResolvedValue([{ userId: "stamped" }])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("billingService.provisionDefaultPlan on a licensed self-hosted enterprise", () => {
  test("posts to the portal when enterprise has a valid license", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await billingService.provisionDefaultPlan({ userId: "1" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as [URL]
    expect(String(url)).toBe(
      "https://app.example.test/portal/api/users/provision",
    )
  })

  test("never calls the portal when the license is missing", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "missing" })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await billingService.provisionDefaultPlan({ userId: "1" })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("userQuotaService.ensureBootstrapPlan across editions", () => {
  test("licensed self-hosted enterprise with no published plan stays unlimited", async () => {
    // No portal configured yet (Redis has no default-plan snapshot). Must
    // never stamp the 1-day/all-zero lockdown fallback — that would lock the
    // operator out of their own box.
    mocks.isEnterprise.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })

    await userQuotaService.ensureBootstrapPlan({ userId: "user-1" })

    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("cloud with no published plan stamps the lockdown trial fallback", async () => {
    mocks.isCloud.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })

    await userQuotaService.ensureBootstrapPlan({ userId: "user-1" })

    expect(dbInsert).toHaveBeenCalledWith(userQuotaModel)
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", contactsLimit: 0 }),
    )
  })
})

describe("userQuotaService default-plan overlay across editions", () => {
  test("enterprise with a valid license and a published snapshot overlays the free-tier limits", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })
    storeGet.mockImplementation(async (key: string) =>
      key === DEFAULT_PLAN_ENTITLEMENT_KEY ? snapshot : null,
    )

    const quota = await userQuotaService.getForUser("user-2")

    expect(quota?.workspacesLimit).toBe(2)
    expect(quota?.planName).toBe("Starter")
  })

  test("community never reads or applies the published snapshot", async () => {
    storeGet.mockImplementation(async (key: string) =>
      key === DEFAULT_PLAN_ENTITLEMENT_KEY ? snapshot : null,
    )

    const quota = await userQuotaService.getForUser("user-2")

    expect(quota).toBeNull()
    expect(storeGet).not.toHaveBeenCalledWith(DEFAULT_PLAN_ENTITLEMENT_KEY)
  })
})
