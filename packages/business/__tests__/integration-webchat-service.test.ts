// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCount,
  mockCreateId,
  mockFindFirst,
  mockFindMany,
  mockInboxCreate,
  mockInsert,
  mockParsePagination,
  mockRelationsFilterToSQL,
  mockTransaction,
  mockWorkspaceCreate,
  mockWorkspaceFindOrFail,
} = vi.hoisted(() => {
  let createIdCallCount = 0
  const mockInsertReturning = vi.fn(async () => [{ id: "webchat-1" }])
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockCount: vi.fn(async () => 25),
    mockCreateId: vi.fn(() => `id-${++createIdCallCount}`),
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
  db: {
    $count: mockCount,
    query: {
      integrationWebchatModel: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
    transaction: mockTransaction,
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
