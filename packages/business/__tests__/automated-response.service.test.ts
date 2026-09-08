import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const deleteReturning = vi.fn()
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))
  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))

  return {
    assertDeletable: vi.fn(),
    deleteReturning,
    deleteWhere,
    dispatchAuditRecord: vi.fn(),
    ensureExists: vi.fn(),
    findFirst: vi.fn(),
    flowExists: vi.fn(),
    insertReturning,
    insertValues,
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
  insert: vi.fn(() => ({ values: mocks.insertValues })),
  update: vi.fn(() => ({ set: mocks.updateSet })),
  delete: vi.fn(() => ({ where: mocks.deleteWhere })),
})

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: mocks.assertDeletable,
}))

// This suite doesn't exercise `create` (which needs `flowService.exists`),
// but the real `flow/service.ts` transitively needs `@chatbotx.io/flow-config`
// (needs the real `zodBigintAsString` from `@chatbotx.io/utils`, conflicting
// with the narrow mock below).
vi.mock("../src/flow/service", () => ({
  flowService: { exists: mocks.flowExists },
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: mocks.ensureExists },
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
  automatedResponseFolderTypeByType: { keyword: "automatedResponse" },
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

describe("automatedResponseService.create — flowId XOR text", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insertReturning.mockResolvedValue([{ id: "automation-1" }])
  })

  test("verifies flowId exists and inserts it when only flowId is given", async () => {
    mocks.flowExists.mockResolvedValue(true)

    await automatedResponseService.create("workspace-1", {
      type: "keyword",
      text: null,
      flowId: "flow-1",
      folderId: null,
      keywords: ["hi"],
    })

    expect(mocks.flowExists).toHaveBeenCalledWith(
      "workspace-1",
      "flow-1",
      undefined,
    )
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "flow-1", text: undefined }),
    )
  })

  // Regression: this used to silently null `text` when both were given.
  // Template install (`template/adapters/keywords.ts`) forwards the
  // manifest's `text` and `flowId` verbatim, so nulling there dropped
  // authored content with no error surfaced.
  test("throws instead of dropping text when both flowId and text are given", async () => {
    mocks.flowExists.mockResolvedValue(true)

    await expect(
      automatedResponseService.create("workspace-1", {
        type: "keyword",
        text: "do not drop me",
        flowId: "flow-1",
        folderId: null,
        keywords: ["hi"],
      }),
    ).rejects.toThrow("A keyword replies with either text or a flow, not both")

    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("throws a field-scoped validation error when flowId does not exist", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      automatedResponseService.create("workspace-1", {
        type: "keyword",
        text: null,
        flowId: "missing-flow",
        folderId: null,
        keywords: ["hi"],
      }),
    ).rejects.toMatchObject({ field: "flowId", message: "Flow not found" })

    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("nulls out flowId when only text is given", async () => {
    await automatedResponseService.create("workspace-1", {
      type: "keyword",
      text: "Hello there",
      flowId: null,
      folderId: null,
      keywords: ["hi"],
    })

    expect(mocks.flowExists).not.toHaveBeenCalled()
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: undefined, text: "Hello there" }),
    )
  })

  test("ensures the folder exists before creating when a folderId is given", async () => {
    await automatedResponseService.create("workspace-1", {
      type: "keyword",
      text: "Hello there",
      flowId: null,
      folderId: "folder-1",
      keywords: ["hi"],
    })

    expect(mocks.ensureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "workspace-1",
      folderType: "automatedResponse",
      tx: undefined,
    })
  })

  test("does not check folder existence when no folderId is given", async () => {
    await automatedResponseService.create("workspace-1", {
      type: "keyword",
      text: "Hello there",
      flowId: null,
      folderId: null,
      keywords: ["hi"],
    })

    expect(mocks.ensureExists).not.toHaveBeenCalled()
  })
})
