import { beforeEach, describe, expect, test, vi } from "vitest"

// The broadcast policy import reaches quota/workspace modules these narrow mocks omit.
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const { mockAssertDeletable, mockAssertEditable } = vi.hoisted(() => ({
  mockAssertDeletable: vi.fn(),
  mockAssertEditable: vi.fn(),
}))

// The template lock guard has its own suite; these tests cover the call sites.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: mockAssertDeletable,
    assertResourceEditable: mockAssertEditable,
  }),

  changedKeysOf: (
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) =>
    Object.keys(patch).filter(
      (key) => JSON.stringify(existing[key]) !== JSON.stringify(patch[key]),
    ),
}))

const mockLockOptions = vi.hoisted(() => vi.fn())

// Run the locked transaction against the same mocked client the test asserts on.
vi.mock("../src/template/template-resource-locks", async () => {
  const { db } = await import("@chatbotx.io/database/client")
  return {
    withTemplateLockedTransaction: (
      run: (tx: unknown) => unknown,
      options?: unknown,
    ) => {
      mockLockOptions(options)
      return run(db)
    },
  }
})

const {
  mockDelete,
  mockDeleteReturning,
  mockDeleteWhere,
  mockInsert,
  mockInsertReturning,
  mockUpdate,
  mockUpdateReturning,
  mockUpdateWhere,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  const mockDeleteReturning = vi.fn()
  const mockDeleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }))
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockDelete,
    mockDeleteReturning,
    mockDeleteWhere,
    mockInsert,
    mockInsertReturning,
    mockUpdate,
    mockUpdateReturning,
    mockUpdateWhere,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    insert: mockInsert,
    query: {
      aiMCPServerModel: {
        findFirst: vi.fn(),
        findMany: vi.fn(async () => []),
      },
    },
    update: mockUpdate,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  inArray: vi.fn((field: unknown, values: unknown) => ({ field, values })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiMCPServerModel: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "mcp-server-1",
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const { aiMcpServerService } = await import("../src/ai-mcp-server/service")

const workspaceId = "workspace-1"

const request = {
  name: "Docs MCP",
  url: "https://example.com/mcp",
  auth: { type: "none" } as never,
  availableTools: {},
  selectedTools: [],
}

function lastAuditDetail(): string {
  return dispatchAuditRecord.mock.calls.at(-1)?.[0]?.detail
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInsertReturning.mockResolvedValue([{ id: "mcp-server-1" }])
  mockUpdateReturning.mockResolvedValue([{ id: "mcp-server-1" }])
  mockDeleteReturning.mockResolvedValue([{ id: "mcp-server-1" }])
})

describe("aiMcpServerService audit messages", () => {
  test("create logs by id", async () => {
    await aiMcpServerService.create(workspaceId, request)

    expect(lastAuditDetail()).toBe("created a new MCP Server (#mcp-server-1)")
  })

  test("update logs by id", async () => {
    await aiMcpServerService.update(
      { workspaceId, id: "mcp-server-1" },
      request,
    )

    expect(lastAuditDetail()).toBe("updated an MCP Server (#mcp-server-1)")
  })

  test("delete logs by id", async () => {
    await aiMcpServerService.delete({ workspaceId, id: "mcp-server-1" })

    expect(lastAuditDetail()).toBe("deleted an MCP Server (#mcp-server-1)")
  })

  test("update does not audit when the id does not exist", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await aiMcpServerService.update({ workspaceId, id: "missing" }, request)

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("delete does not audit when the id does not exist", async () => {
    mockDeleteReturning.mockResolvedValue([])

    await aiMcpServerService.delete({ workspaceId, id: "missing" })

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("aiMcpServerService cross-workspace isolation", () => {
  test("update scopes its where-clause to the requesting workspace, not just the id", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await aiMcpServerService.update(
      { workspaceId: "workspace-b", id: "mcp-server-1" },
      request,
    )

    expect(mockUpdate).toHaveBeenCalled()
    const whereArgs = mockUpdateWhere.mock.calls.at(-1)?.[0]
    expect(whereArgs).toEqual(
      expect.objectContaining({
        and: expect.arrayContaining([
          expect.objectContaining({
            field: "workspaceId",
            value: "workspace-b",
          }),
        ]),
      }),
    )
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("delete scopes its where-clause to the requesting workspace, not just the id", async () => {
    mockDeleteReturning.mockResolvedValue([])

    await aiMcpServerService.delete({
      workspaceId: "workspace-b",
      id: "mcp-server-1",
    })

    const whereArgs = mockDeleteWhere.mock.calls.at(-1)?.[0]
    expect(whereArgs).toEqual(
      expect.objectContaining({
        and: expect.arrayContaining([
          expect.objectContaining({
            field: "workspaceId",
            value: "workspace-b",
          }),
        ]),
      }),
    )
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("aiMcpServerService template locks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delete is refused for a server a template installed with deletion disallowed", async () => {
    mockAssertDeletable.mockRejectedValueOnce(
      Object.assign(new Error("locked"), {
        code: "templateAllowDeleteViolation",
      }),
    )

    await expect(
      aiMcpServerService.delete({ workspaceId: "ws-1", id: "m1" }),
    ).rejects.toMatchObject({ code: "templateAllowDeleteViolation" })
    expect(mockAssertDeletable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      resourceKind: "aiMcpServer",
      resourceIds: ["m1"],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })
})

describe("aiMcpServerService.update template lock", () => {
  const existing = {
    id: "mcp-server-1",
    name: "Old name",
    url: "https://example.com/mcp",
    auth: { type: "none" },
    availableTools: {},
    selectedTools: [],
  }

  test("guards first on the locked transaction, before the write", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    // The duplicate-name lookup runs first, then the row read.
    vi.mocked(db.query.aiMCPServerModel.findFirst)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(existing as never)

    await aiMcpServerService.update(
      { workspaceId, id: "mcp-server-1" },
      request,
    )

    expect(mockAssertEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "aiMcpServer",
        resourceIds: ["mcp-server-1"],
        changedKeys: ["name"],
        tx: db,
      }),
    )
    expect(mockAssertEditable.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdate.mock.invocationCallOrder[0] as number,
    )
  })

  test("locks the server before the stored row is read inside the transaction", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    const findFirst = vi.mocked(db.query.aiMCPServerModel.findFirst)
    findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(existing as never)

    await aiMcpServerService.update(
      { workspaceId, id: "mcp-server-1" },
      request,
    )

    expect(mockLockOptions).toHaveBeenCalledWith({
      workspaceId: expect.any(String),
      initialKeys: [{ kind: "aiMcpServer", resourceId: "mcp-server-1" }],
    })
    // The second findFirst is the row read; it follows the lock.
    expect(mockLockOptions.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[1] as number,
    )
  })

  test("a blocked edit never writes or audits", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    // The duplicate-name lookup runs first, then the row read.
    vi.mocked(db.query.aiMCPServerModel.findFirst)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(existing as never)
    mockAssertEditable.mockRejectedValueOnce(new Error("locked"))

    await expect(
      aiMcpServerService.update({ workspaceId, id: "mcp-server-1" }, request),
    ).rejects.toThrow("locked")
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})
