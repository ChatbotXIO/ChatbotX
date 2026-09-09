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
    type: "automatedResponse.type",
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
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      { text: "Hello" },
      tx as never,
    )

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("update throws not-found and never audits when returning no row", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await expect(
      automatedResponseService.update(
        { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
        { text: "Hello" },
      ),
    ).rejects.toThrow("Automated response not found")

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("does not audit setStatus when returning no row", async () => {
    mocks.updateReturning.mockResolvedValue([])

    await automatedResponseService.setStatus(
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      false,
    )

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("does not audit deleteMany when delete returning finds no rows", async () => {
    mocks.deleteReturning.mockResolvedValue([])

    await automatedResponseService.deleteMany(
      "workspace-1",
      ["automation-1"],
      "inbound",
    )

    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits normal non-transaction update and delete", async () => {
    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      { text: "Hello" },
    )
    await automatedResponseService.deleteMany(
      "workspace-1",
      ["automation-1"],
      "inbound",
    )

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

describe("automatedResponseService — type scoping (Contact vs Page keywords)", () => {
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

  test("update includes an explicit type predicate in the WHERE clause", async () => {
    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1", type: "outbound" },
      { text: "Hello" },
    )

    const whereArgs = mocks.updateWhere.mock.calls.at(0)?.[0] as {
      and: unknown[]
    }
    const typePredicate = whereArgs.and.find(
      (predicate) =>
        (predicate as { eq: unknown[] }).eq?.[0] ===
        "automatedResponse.workspaceId",
    )
    expect(whereArgs.and).toContainEqual({
      eq: ["automatedResponse.workspaceId", "workspace-1"],
    })
    expect(typePredicate).toBeDefined()
  })

  test("setStatus scopes the read and the write by type", async () => {
    await automatedResponseService.setStatus(
      { workspaceId: "workspace-1", id: "automation-1", type: "outbound" },
      true,
    )

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "outbound" }),
      }),
    )
  })

  test("deleteMany scopes the DELETE by type so it never removes the other type's row", async () => {
    await automatedResponseService.deleteMany(
      "workspace-1",
      ["automation-1"],
      "outbound",
    )

    const whereArgs = mocks.deleteWhere.mock.calls.at(0)?.[0] as {
      and: unknown[]
    }
    expect(whereArgs.and).toContainEqual({
      eq: ["automatedResponse.workspaceId", "workspace-1"],
    })
  })

  test("findOrFail scopes the lookup by type", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined)

    await expect(
      automatedResponseService.findOrFail({
        workspaceId: "workspace-1",
        id: "automation-1",
        type: "outbound",
      }),
    ).rejects.toThrow("Automated response not found")

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "outbound" }),
      }),
    )
  })
})

describe("automatedResponseService.update — keywords and flowId/text invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue({
      folderId: null,
      keywords: ["hello", "hi"],
      text: null,
      flowId: null,
      status: true,
    })
    mocks.updateReturning.mockResolvedValue([
      { id: "automation-1", keywords: ["hello", "hi"] },
    ])
  })

  // Regression: PUT /v1/keywords/{id} with only `{ text }` used to
  // unconditionally set keywords to `[]`, silently wiping the automation.
  test("omitting keywords does not wipe the existing keywords column", async () => {
    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      { text: "hi" },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ keywords: expect.anything() }),
    )
  })

  test("explicitly supplied keywords are still applied", async () => {
    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      { keywords: [{ value: "new" }] },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: ["new"] }),
    )
  })

  test("nulls flowId when text is set", async () => {
    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      { text: "hi", flowId: "flow-1" },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: null, text: "hi" }),
    )
    expect(mocks.flowExists).not.toHaveBeenCalled()
  })

  test("validates flowId against the workspace and nulls text when flowId is set", async () => {
    mocks.flowExists.mockResolvedValue(true)

    await automatedResponseService.update(
      { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
      { flowId: "flow-1" },
    )

    expect(mocks.flowExists).toHaveBeenCalledWith(
      "workspace-1",
      "flow-1",
      undefined,
    )
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "flow-1", text: null }),
    )
  })

  test("rejects a flowId that does not belong to the workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      automatedResponseService.update(
        { workspaceId: "workspace-1", id: "automation-1", type: "inbound" },
        { flowId: "foreign-flow" },
      ),
    ).rejects.toMatchObject({ field: "flowId", message: "Flow not found" })

    expect(mocks.updateSet).not.toHaveBeenCalled()
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
