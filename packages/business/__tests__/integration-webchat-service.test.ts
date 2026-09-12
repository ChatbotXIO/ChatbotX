// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCount,
  mockCreateId,
  mockDispatchAuditRecord,
  mockFindActiveFlowById,
  mockFindFirst,
  mockFindMany,
  mockInboxCreate,
  mockInsert,
  mockParsePagination,
  mockRelationsFilterToSQL,
  mockTransaction,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockWorkspaceCreate,
  mockWorkspaceFindOrFail,
} = vi.hoisted(() => {
  let createIdCallCount = 0
  const mockInsertReturning = vi.fn(async () => [{ id: "webchat-1" }])
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockUpdateWhere = vi.fn(async () => undefined)
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockCount: vi.fn(async () => 25),
    mockCreateId: vi.fn(() => `id-${++createIdCallCount}`),
    mockDispatchAuditRecord: vi.fn(),
    // `welcomeFlowId: null` in every existing fixture short-circuits before
    // this is ever called; kept so a future test exercising a non-null id
    // has something to mock against.
    mockFindActiveFlowById: vi.fn(async () => ({ id: "flow-1" })),
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(async () => []),
    mockInboxCreate: vi.fn(async () => ({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })),
    mockInsert,
    mockParsePagination: vi.fn(),
    mockRelationsFilterToSQL: vi.fn(),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ insert: mockInsert }),
    ),
    mockWorkspaceCreate: vi.fn(async () => ({
      id: "ws-new",
      ownerId: "user-1",
    })),
    mockWorkspaceFindOrFail: vi.fn(async () => ({
      id: "ws-1",
      ownerId: "owner-1",
    })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    $count: mockCount,
    query: {
      integrationWebchatModel: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
    transaction: mockTransaction,
    update: mockUpdate,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: vi.fn(async ({ where }: { where: unknown }) => {
    const row = await mockFindFirst(where)
    if (!row) {
      throw new Error("not found")
    }
    return row
  }),
  relationsFilterToSQL: mockRelationsFilterToSQL,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationWebchatModel: { id: "id", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  parsePagination: mockParsePagination,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mockInboxCreate, disconnect: vi.fn() },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

vi.mock("../src/flow/service", () => ({
  flowService: { findActiveById: mockFindActiveFlowById },
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(async () => undefined),
}))

vi.mock("../src/workspace", () => ({
  workspaceService: {
    create: mockWorkspaceCreate,
    findOrFail: mockWorkspaceFindOrFail,
  },
}))

const { integrationWebchatService } = await import(
  "../src/integration-webchat/service"
)

const baseData = {
  name: "My Webchat",
  auth: {},
  enable: true,
  authorizedDomains: [],
  conversationStarters: [],
  persistentMenus: [],
  brandColor: "#000000",
  hideHeader: false,
  showLogo: true,
  hideMessageInput: false,
  customCss: null,
  welcomeFlowId: null,
}

describe("integrationWebchatService.createWithWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ insert: mockInsert }),
    )
    mockWorkspaceFindOrFail.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
    } as never)
    mockWorkspaceCreate.mockResolvedValue({
      id: "ws-new",
      ownerId: "user-1",
    } as never)
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    } as never)
  })

  test("creates a workspace only when workspaceId is absent and reports createdWorkspace correctly", async () => {
    const withWorkspace = await integrationWebchatService.createWithWorkspace({
      workspaceId: "ws-1",
      createdBy: "user-1",
      workspaceName: "My Chatbot",
      data: baseData,
    })
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()
    expect(withWorkspace.createdWorkspace).toBe(false)
    expect(withWorkspace.workspaceId).toBe("ws-1")
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
      action: "connect",
      detail: "connected a new Webchat channel (#webchat-1)",
    })

    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ insert: mockInsert }),
    )
    mockWorkspaceCreate.mockResolvedValue({
      id: "ws-new",
      ownerId: "user-1",
    } as never)
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    } as never)

    const withoutWorkspace =
      await integrationWebchatService.createWithWorkspace({
        createdBy: "user-1",
        workspaceName: "My Chatbot",
        data: baseData,
      })
    expect(mockWorkspaceCreate).toHaveBeenCalledTimes(1)
    expect(withoutWorkspace.createdWorkspace).toBe(true)
    expect(withoutWorkspace.workspaceId).toBe("ws-new")
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-new",
      action: "connect",
      detail: "connected a new Webchat channel (#webchat-1)",
    })
  })
})

describe("integrationWebchatService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("computes pageCount as ceil(total/limit)", async () => {
    mockParsePagination.mockReturnValue({ limit: 10, offset: 0 })
    mockCount.mockResolvedValue(25)
    mockFindMany.mockResolvedValue([])

    const result = await integrationWebchatService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    expect(result.pageCount).toBe(3)
  })

  test("returns pageCount 1 when unpaginated", async () => {
    mockParsePagination.mockReturnValue(null)
    mockFindMany.mockResolvedValue([])

    const result = await integrationWebchatService.list({
      workspaceId: "ws-1",
    })

    expect(result.pageCount).toBe(1)
    expect(mockCount).not.toHaveBeenCalled()
  })
})

describe("integrationWebchatService.findByIdForWorkspaceOrNull", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns undefined instead of throwing when no row matches", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    const result = await integrationWebchatService.findByIdForWorkspaceOrNull({
      id: "missing",
      workspaceId: "ws-1",
    })

    expect(result).toBeUndefined()
  })
})

describe("integrationWebchatService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // The action layer pre-checks ownership, but the method takes a
  // `workspaceId` and must scope on it itself — a mismatched (id, workspaceId)
  // pair must update nothing rather than another workspace's row.
  test("scopes the update by workspaceId as well as id", async () => {
    await integrationWebchatService.update({
      workspaceId: "ws-1",
      id: "webchat-1",
      data: { name: "Support" },
    })

    expect(mockUpdateWhere).toHaveBeenCalledWith({
      conditions: [
        { field: "id", value: "webchat-1" },
        { field: "workspaceId", value: "ws-1" },
      ],
    })
  })

  // `workspaceId` scopes the row; writing it would let a mismatched pair move
  // the webchat into another workspace.
  test("never writes workspaceId into the update payload", async () => {
    await integrationWebchatService.update({
      workspaceId: "ws-1",
      id: "webchat-1",
      data: { name: "Support" },
    })

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ workspaceId: expect.anything() }),
    )
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Support" }),
    )
  })

  // The public API handler spreads a partial update straight through, so an
  // omitted `welcomeFlowId` must leave the stored value alone rather than
  // being coerced to null — this is the "in" check in the service, not
  // something either caller pre-normalizes.
  test("leaves welcomeFlowId untouched when the field is absent from data", async () => {
    await integrationWebchatService.update({
      workspaceId: "ws-1",
      id: "webchat-1",
      data: { name: "Support" },
    })

    expect(mockFindActiveFlowById).not.toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ welcomeFlowId: expect.anything() }),
    )
  })

  test("normalizes an explicit falsy welcomeFlowId to null", async () => {
    await integrationWebchatService.update({
      workspaceId: "ws-1",
      id: "webchat-1",
      data: { welcomeFlowId: "" },
    })

    expect(mockFindActiveFlowById).not.toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ welcomeFlowId: null }),
    )
  })

  test("validates a non-null welcomeFlowId belongs to the same workspace before writing it", async () => {
    mockFindActiveFlowById.mockResolvedValueOnce({ id: "flow-1" })

    await integrationWebchatService.update({
      workspaceId: "ws-1",
      id: "webchat-1",
      data: { welcomeFlowId: "flow-1" },
    })

    expect(mockFindActiveFlowById).toHaveBeenCalledWith({
      id: "flow-1",
      workspaceId: "ws-1",
      tx: expect.anything(),
    })
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ welcomeFlowId: "flow-1" }),
    )
  })

  // Prevents a caller from pointing welcomeFlowId at another workspace's
  // flow — findActiveById is itself workspace-scoped, so a foreign or
  // nonexistent id resolves to undefined and must reject rather than write.
  test("rejects a welcomeFlowId that does not belong to the workspace", async () => {
    mockFindActiveFlowById.mockResolvedValueOnce(undefined)

    await expect(
      integrationWebchatService.update({
        workspaceId: "ws-1",
        id: "webchat-1",
        data: { welcomeFlowId: "foreign-flow" },
      }),
    ).rejects.toThrow("Welcome flow not found")

    expect(mockUpdateSet).not.toHaveBeenCalled()
  })
})
