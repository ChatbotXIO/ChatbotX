import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const deleteReturning = vi.fn()
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))

  return {
    assertDeletable: vi.fn(),
    deleteReturning,
    deleteWhere,
    dispatchAuditRecord: vi.fn(),
    findFirst: vi.fn(),
    invalidateCacheKeys: vi.fn(),
    updateReturning,
    updateSet,
    updateWhere,
  }
})

const makeClient = () => ({
  query: {
    automatedResponseModel: {
      findFirst: mocks.findFirst,
      findMany: vi.fn(),
    },
  },
  update: vi.fn(() => ({ set: mocks.updateSet })),
  delete: vi.fn(() => ({ where: mocks.deleteWhere })),
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: mocks.assertDeletable,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: makeClient(),
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  relationsFilterToSQL: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "root",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  automatedResponseModel: {
    id: "automatedResponse.id",
    workspaceId: "automatedResponse.workspaceId",
  },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
  likeContains: vi.fn(),
  parseOrderByAsObject: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheKeys: mocks.invalidateCacheKeys,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

const { automatedResponseService } = await import(
  "../src/automated-response/service"
)

describe("automatedResponseService audit side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue({
      folderId: null,
      keywords: ["hello"],
      text: "Hi",
      flowId: null,
      status: true,
    })
    mocks.updateReturning.mockResolvedValue([
      { id: "automation-1", keywords: ["hello"] },
    ])
    mocks.deleteReturning.mockResolvedValue([{ id: "automation-1" }])
  })

  test("does not dispatch update audit inside a caller-owned transaction", async () => {
    const tx = makeClient()

    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1" },
      { text: "Hello" },
      tx as never,
    )

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("does not audit update or setStatus when returning no row", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1" },
      { text: "Hello" },
    )
    await automatedResponseService.setStatus(
      { workspaceId: "workspace-1", id: "automation-1" },
      false,
    )

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("does not audit deleteMany when delete returning finds no rows", async () => {
    mocks.deleteReturning.mockResolvedValue([])

    await automatedResponseService.deleteMany("workspace-1", ["automation-1"])

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits normal non-transaction update and delete", async () => {
    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1" },
      { text: "Hello" },
    )
    await automatedResponseService.deleteMany("workspace-1", ["automation-1"])

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "updated a keyword automation (#automation-1)",
    })
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: "deleted keyword automation (#automation-1)",
    })
  })
})
