import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateWhere = vi.fn(() => Promise.resolve())
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  return {
    update,
    updateSet,
    updateWhere,
    dispatchAuditRecord: vi.fn(),
    invalidateCacheByTags: vi.fn(),
    findOrFail: vi.fn(),
  }
})

const makeClient = () => ({
  update: mocks.update,
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { findOrFail: mocks.findOrFail },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: makeClient(),
  eq: (...args: unknown[]) => ({ eq: args }),
  ilike: (...args: unknown[]) => ({ ilike: args }),
  or: (...args: unknown[]) => ({ or: args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...args: unknown[]) => ({
      strings,
      args,
    }),
    {},
  ),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tenantModel: {},
  userModel: {},
  workspaceModel: {
    id: "workspace.id",
    supportAccessUntil: "workspace.supportAccessUntil",
  },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: {
    page?: number | null
    perPage?: number | null
  }) => ({
    limit: input.perPage ?? 20,
    offset: ((input.page ?? 1) - 1) * (input.perPage ?? 20),
  }),
  likeContains: (keyword: string) => `%${keyword}%`,
}))

const { workspaceSupportAccessService, SUPPORT_ACCESS_WINDOW_DAYS } =
  await import("../src/workspace-support-access/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("enable", () => {
  test("sets supportAccessUntil to now + SUPPORT_ACCESS_WINDOW_DAYS", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "workspace-1" })

    const before = Date.now()
    await workspaceSupportAccessService.enable({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
    })
    const after = Date.now()

    expect(mocks.updateSet).toHaveBeenCalledTimes(1)
    const setArg = mocks.updateSet.mock.calls[0][0] as {
      supportAccessUntil: Date
    }
    const expectedMin =
      before + SUPPORT_ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const expectedMax = after + SUPPORT_ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000
    expect(setArg.supportAccessUntil.getTime()).toBeGreaterThanOrEqual(
      expectedMin,
    )
    expect(setArg.supportAccessUntil.getTime()).toBeLessThanOrEqual(expectedMax)

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support_access_enabled" }),
    )
  })
})

describe("disable", () => {
  test("clears supportAccessUntil and audits, with no membership rows to delete", async () => {
    await workspaceSupportAccessService.disable({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ supportAccessUntil: null })
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support_access_disabled" }),
    )
  })
})
