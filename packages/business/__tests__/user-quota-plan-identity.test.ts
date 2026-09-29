// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirstQuota: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { userQuotaModel: { findFirst: mocks.findFirstQuota } },
  },
  and: vi.fn(),
  count: vi.fn(),
  countDistinct: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
  sum: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {},
  inboxModel: {},
  ROOT_TENANT_ID: "1",
  userQuotaModel: {},
  workspaceMacModel: {},
  workspaceMemberModel: {},
  workspaceModel: {},
}))

vi.mock("@chatbotx.io/redis", () => ({
  cacheConnections: { useExisting: vi.fn() },
  distributedStore: {},
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))

const { userQuotaService } = await import("../src/user-quota/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("userQuotaService.getPlanIdentity", () => {
  test.each([
    ["active", false],
    ["past_due", false],
    ["expired", false],
    [null, false],
    ["trial", true],
  ] as const)("maps stored planStatus %s to isOnTrial=%s", async (planStatus, isOnTrial) => {
    mocks.findFirstQuota.mockResolvedValue({
      planStatus,
      planName: "Stored plan",
    })
    const getForUser = vi.spyOn(userQuotaService, "getForUser")

    const result = await userQuotaService.getPlanIdentity("user-1")

    expect(result).toEqual({ isOnTrial, planName: "Stored plan" })
    expect(mocks.findFirstQuota).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      columns: { planStatus: true, planName: true },
    })
    expect(getForUser).not.toHaveBeenCalled()
  })

  test("returns an unrestricted null identity when the raw row is missing", async () => {
    mocks.findFirstQuota.mockResolvedValue(undefined)

    await expect(userQuotaService.getPlanIdentity("user-1")).resolves.toEqual({
      isOnTrial: false,
      planName: null,
    })
  })

  test("passes through a null raw plan name", async () => {
    mocks.findFirstQuota.mockResolvedValue({
      planStatus: "trial",
      planName: null,
    })

    await expect(userQuotaService.getPlanIdentity("user-1")).resolves.toEqual({
      isOnTrial: true,
      planName: null,
    })
  })
})
