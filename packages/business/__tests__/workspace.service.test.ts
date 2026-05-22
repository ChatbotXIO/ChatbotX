import { beforeEach, describe, expect, test, vi } from "vitest"

// --- Mocks ---------------------------------------------------------------

// Insert+returning chain — `workspaceModel` first call returns the workspace,
// `workspaceUsageModel` second call returns the usage stub.
const returningWorkspace = vi.fn(async () => [
  { id: "ws-1", organizationId: "org-1" },
])
const valuesWorkspace = vi.fn(() => ({ returning: returningWorkspace }))
const insert = vi.fn(() => ({ values: valuesWorkspace }))

const db = { insert }
vi.mock("@chatbotx.io/database/client", () => ({ db }))
vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceModel: {},
  workspaceUsageModel: {},
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  workspaceMemberRoles: { enum: { owner: "owner" } },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}))
vi.mock("@chatbotx.io/utils", () => ({ createId: () => "usage-1" }))

const billingService = {
  find: vi.fn(async () => undefined as unknown),
}
vi.mock("../src/billing/service", () => ({ billingService }))

const workspaceMemberService = {
  create: vi.fn(async () => undefined),
}
vi.mock("../src/workspace-member/service", () => ({ workspaceMemberService }))

const macRepository = {
  ensureBillingMac: vi.fn(async () => new Map<string, string>()),
  ensureWorkspaceMac: vi.fn(async () => new Map<string, string>()),
}
const anchoredPeriod = vi.fn(() => ({
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-06-01T00:00:00.000Z"),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macRepository, anchoredPeriod }))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
vi.mock("../src/logger", () => ({ logger }))

const { workspaceService } = await import("../src/workspace/service")

// --- Fixtures ------------------------------------------------------------

const organization = {
  id: "org-1",
  defaultMaxContacts: 100,
} as never

function createInput() {
  return {
    data: { name: "WS", organizationId: "org-1" } as never,
    organization,
    createdBy: "user-1",
  }
}

beforeEach(() => {
  returningWorkspace
    .mockReset()
    .mockResolvedValue([{ id: "ws-1", organizationId: "org-1" }])
  valuesWorkspace.mockClear()
  insert.mockClear()
  billingService.find.mockReset().mockResolvedValue(undefined)
  workspaceMemberService.create.mockClear()
  macRepository.ensureBillingMac
    .mockReset()
    .mockResolvedValue(new Map<string, string>())
  macRepository.ensureWorkspaceMac
    .mockReset()
    .mockResolvedValue(new Map<string, string>())
  anchoredPeriod.mockClear()
  logger.error.mockClear()
})

// --- Tests ---------------------------------------------------------------

describe("WorkspaceService.create — MAC pre-provisioning", () => {
  test("creates BillingMac + WorkspaceMac when the creator has a Billing row", async () => {
    billingService.find.mockResolvedValue({
      id: "bill-1",
      userId: "user-1",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
    })
    macRepository.ensureBillingMac.mockResolvedValue(new Map([["key", "bm-1"]]))

    await workspaceService.create(createInput())

    expect(billingService.find).toHaveBeenCalledWith({
      userId: "user-1",
      tx: db,
    })
    expect(anchoredPeriod).toHaveBeenCalledTimes(1)
    expect(macRepository.ensureBillingMac).toHaveBeenCalledWith(
      [
        {
          billingId: "bill-1",
          periodStart: new Date("2026-05-01T00:00:00.000Z"),
          periodEnd: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      db,
    )
    expect(macRepository.ensureWorkspaceMac).toHaveBeenCalledWith(
      [{ workspaceId: "ws-1", billingMacId: "bm-1" }],
      db,
    )
  })

  test("skips MAC pre-provisioning when the user has no Billing row", async () => {
    billingService.find.mockResolvedValue(undefined)

    await workspaceService.create(createInput())

    expect(macRepository.ensureBillingMac).not.toHaveBeenCalled()
    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  test("skips WorkspaceMac when ensureBillingMac returns an empty map", async () => {
    billingService.find.mockResolvedValue({
      id: "bill-1",
      userId: "user-1",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
    })
    macRepository.ensureBillingMac.mockResolvedValue(new Map())

    await workspaceService.create(createInput())

    expect(macRepository.ensureBillingMac).toHaveBeenCalled()
    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
  })

  test("never blocks workspace creation if MAC provisioning throws", async () => {
    billingService.find.mockRejectedValue(new Error("db down"))

    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(macRepository.ensureWorkspaceMac).not.toHaveBeenCalled()
  })

  test("logs and continues if ensureWorkspaceMac throws", async () => {
    billingService.find.mockResolvedValue({
      id: "bill-1",
      userId: "user-1",
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
    })
    macRepository.ensureBillingMac.mockResolvedValue(new Map([["key", "bm-1"]]))
    macRepository.ensureWorkspaceMac.mockRejectedValue(new Error("boom"))

    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe("WorkspaceService.create — happy path", () => {
  test("returns the newly inserted workspace and creates the owner member", async () => {
    const result = await workspaceService.create(createInput())

    expect(result).toEqual({ id: "ws-1", organizationId: "org-1" })
    expect(workspaceMemberService.create).toHaveBeenCalledTimes(1)
    const memberArg = workspaceMemberService.create.mock.calls[0][0]
    expect(memberArg.data.workspaceId).toBe("ws-1")
    expect(memberArg.data.role).toBe("owner")
  })
})
