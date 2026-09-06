import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn(() => Promise.resolve([{ id: "workspace-1" }]))
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const selectData = vi.fn(() => Promise.resolve([]))
  const selectCount = vi.fn(() => Promise.resolve([{ count: 0 }]))

  return {
    update,
    updateSet,
    updateWhere,
    updateReturning,
    select: vi.fn(),
    selectData,
    selectCount,
    dispatchAuditRecord: vi.fn(),
    invalidateCacheByTags: vi.fn(),
    loggerInfo: vi.fn(),
  }
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mocks.update,
    select: mocks.select,
  },
  and: (...args: unknown[]) => ({ and: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  ilike: (...args: unknown[]) => ({ ilike: args }),
  isNotNull: (...args: unknown[]) => ({ isNotNull: args }),
  lt: (...args: unknown[]) => ({ lt: args }),
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
  tenantModel: { id: "tenant.id", brandName: "tenant.brandName" },
  userModel: { id: "user.id", name: "user.name", email: "user.email" },
  workspaceModel: {
    id: "workspace.id",
    name: "workspace.name",
    ownerId: "workspace.ownerId",
    tenantId: "workspace.tenantId",
    createdAt: "workspace.createdAt",
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

const { addDays } = await import("date-fns")
const { workspaceSupportAccessService, SUPPORT_ACCESS_WINDOW_DAYS } =
  await import("../src/workspace-support-access/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateReturning.mockResolvedValue([{ id: "workspace-1" }])
})

describe("enable", () => {
  test("sets supportAccessUntil to now + SUPPORT_ACCESS_WINDOW_DAYS", async () => {
    const before = new Date()
    await workspaceSupportAccessService.enable({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
    })
    const after = new Date()

    expect(mocks.updateSet).toHaveBeenCalledTimes(1)
    const setArg = mocks.updateSet.mock.calls[0][0] as {
      supportAccessUntil: Date
    }
    const expectedMin = addDays(before, SUPPORT_ACCESS_WINDOW_DAYS).getTime()
    const expectedMax = addDays(after, SUPPORT_ACCESS_WINDOW_DAYS).getTime()
    expect(setArg.supportAccessUntil.getTime()).toBeGreaterThanOrEqual(
      expectedMin,
    )
    expect(setArg.supportAccessUntil.getTime()).toBeLessThanOrEqual(expectedMax)

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:workspace-1",
    ])
    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support_access_enabled" }),
    )
  })

  test("throws and skips cache invalidation + audit when the workspace does not exist", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      workspaceSupportAccessService.enable({
        workspaceId: "missing",
        actorUserId: "owner-1",
      }),
    ).rejects.toThrow()

    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("disable", () => {
  test("clears supportAccessUntil and audits, with no membership rows to delete", async () => {
    await workspaceSupportAccessService.disable({
      workspaceId: "workspace-1",
      actorUserId: "owner-1",
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ supportAccessUntil: null })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:workspace-1",
    ])
    expect(mocks.loggerInfo).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support_access_disabled" }),
    )
  })

  test("throws and skips cache invalidation + audit when the workspace does not exist", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      workspaceSupportAccessService.disable({
        workspaceId: "missing",
        actorUserId: "owner-1",
      }),
    ).rejects.toThrow()

    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("clearExpired", () => {
  test("clears supportAccessUntil for workspaces whose window has passed and returns the count", async () => {
    mocks.updateReturning.mockResolvedValue([
      { id: "workspace-1" },
      { id: "workspace-2" },
    ])

    const result = await workspaceSupportAccessService.clearExpired()

    expect(mocks.updateSet).toHaveBeenCalledWith({ supportAccessUntil: null })
    expect(mocks.updateWhere).toHaveBeenCalledWith({
      and: [
        { isNotNull: ["workspace.supportAccessUntil"] },
        { lt: ["workspace.supportAccessUntil", expect.any(Date)] },
      ],
    })
    expect(result).toBe(2)
  })

  test("returns 0 and does not audit or invalidate cache when nothing is expired", async () => {
    mocks.updateReturning.mockResolvedValue([])

    const result = await workspaceSupportAccessService.clearExpired()

    expect(result).toBe(0)
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("listWorkspaces", () => {
  function mockSelectChain(rows: unknown[], count: number) {
    let call = 0
    mocks.select.mockImplementation(() => {
      call += 1
      const isDataQuery = call === 1
      const chain = {
        from: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        where: vi.fn(() =>
          isDataQuery ? chain : Promise.resolve([{ count }]),
        ),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        offset: vi.fn(() => Promise.resolve(rows)),
      }
      return chain
    })
  }

  test("applies no keyword filter when keyword is absent", async () => {
    mockSelectChain([], 0)

    await workspaceSupportAccessService.listWorkspaces({ page: 1, perPage: 20 })

    const dataChain = mocks.select.mock.results[0].value
    expect(dataChain.where).toHaveBeenCalledWith(undefined)
  })

  test("builds an OR ilike filter across name, owner email, and id when keyword is present", async () => {
    mockSelectChain([], 0)

    await workspaceSupportAccessService.listWorkspaces({
      page: 1,
      perPage: 20,
      keyword: "acme",
    })

    const dataChain = mocks.select.mock.results[0].value
    expect(dataChain.where).toHaveBeenCalledWith({
      or: [
        { ilike: ["workspace.name", "%acme%"] },
        { ilike: ["user.email", "%acme%"] },
        { ilike: ["workspace.id", "%acme%"] },
      ],
    })
  })

  test("computes offset from page/perPage and pageCount from the count query", async () => {
    mockSelectChain([{ id: "workspace-1" }], 45)

    const result = await workspaceSupportAccessService.listWorkspaces({
      page: 2,
      perPage: 20,
    })

    const dataChain = mocks.select.mock.results[0].value
    expect(dataChain.limit).toHaveBeenCalledWith(20)
    expect(dataChain.offset).toHaveBeenCalledWith(20)
    expect(result.pageCount).toBe(3)
    expect(result.data).toEqual([{ id: "workspace-1" }])
  })

  test("orders support-enabled workspaces first, then newest created first", async () => {
    mockSelectChain([], 0)

    await workspaceSupportAccessService.listWorkspaces({ page: 1, perPage: 20 })

    const dataChain = mocks.select.mock.results[0].value
    const [orderByFragment, orderBySecondary] = dataChain.orderBy.mock.calls[0]
    expect(orderByFragment.strings.join("")).toContain(
      "> now()) DESC NULLS LAST",
    )
    expect(orderByFragment.args[0]).toBe("workspace.supportAccessUntil")
    expect(orderBySecondary).toEqual({ desc: ["workspace.createdAt"] })
  })
})
