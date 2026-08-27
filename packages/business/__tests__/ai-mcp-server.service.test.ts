import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockDeleteReturning,
  mockInsert,
  mockInsertReturning,
  mockUpdate,
  mockUpdateReturning,
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
    mockInsert,
    mockInsertReturning,
    mockUpdate,
    mockUpdateReturning,
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
    await aiMcpServerService.update("mcp-server-1", request)

    expect(lastAuditDetail()).toBe("updated an MCP Server (#mcp-server-1)")
  })

  test("delete logs by id", async () => {
    await aiMcpServerService.delete("mcp-server-1")

    expect(lastAuditDetail()).toBe("deleted an MCP Server (#mcp-server-1)")
  })

  test("update does not audit when the id does not exist", async () => {
    mockUpdateReturning.mockResolvedValue([])

    await aiMcpServerService.update("missing", request)

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("delete does not audit when the id does not exist", async () => {
    mockDeleteReturning.mockResolvedValue([])

    await aiMcpServerService.delete("missing")

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})
