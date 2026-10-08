// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"
import { webchatsAdapter } from "../src/template/adapters/webchats"

// The broadcast policy import reaches quota/workspace modules these narrow mocks omit.
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const {
  mockIsCommunity,
  mockCount,
  mockCreateId,
  mockDispatchAuditRecord,
  mockFindActiveFlowById,
  mockFindFirst,
  mockFindMany,
  mockInboxCreate,
  mockIsAtLimit,
  mockParsePagination,
  mockRelationsFilterToSQL,
  mockResolveTenantSettings,
  mockTransaction,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpsertConnectionRow,
  mockWorkspaceCreate,
  mockWorkspaceFindOrFail,
} = vi.hoisted(() => {
  let createIdCallCount = 0
  const mockUpdateWhere = vi.fn(async () => undefined)
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))
  const mockFindFirst = vi.fn()

  return {
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockIsCommunity: vi.fn(() => true),
    mockCount: vi.fn(async () => 25),
    mockCreateId: vi.fn(() => `id-${++createIdCallCount}`),
    mockDispatchAuditRecord: vi.fn(),
    // `welcomeFlowId: null` in every existing fixture short-circuits before
    // this is ever called; kept so a future test exercising a non-null id
    // has something to mock against.
    mockFindActiveFlowById: vi.fn(async () => ({ id: "flow-1" })),
    mockFindFirst,
    mockFindMany: vi.fn(async () => []),
    mockInboxCreate: vi.fn(async () => ({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })),
    mockIsAtLimit: vi.fn(async () => false),
    mockParsePagination: vi.fn(),
    mockRelationsFilterToSQL: vi.fn(),
    mockResolveTenantSettings: vi.fn(async () => ({
      appUrl: "https://app.example.com",
    })),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        query: { integrationWebchatModel: { findFirst: mockFindFirst } },
      }),
    ),
    mockUpsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
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
  zodBigintAsString: () => z.string(),
}))

vi.mock("../src/keys", () => ({
  isCommunity: mockIsCommunity,
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mockResolveTenantSettings,
}))

// Records the trackers handed to `withQuotaCompensation` on the failure
// path and rethrows, like the real helper (whose own compensation is covered
// in src/connection/__tests__/upsert.test.ts).
const compensationInputs = vi.hoisted(() => [] as unknown[])
const mockWithQuotaCompensation = vi.hoisted(() =>
  vi.fn(async (input: unknown, operation: () => Promise<unknown>) => {
    try {
      return await operation()
    } catch (err) {
      compensationInputs.push(input)
      throw err
    }
  }),
)
vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: { webchat: { duplicateConstraint: undefined } },
  upsertConnectionRow: mockUpsertConnectionRow,
  withQuotaCompensation: mockWithQuotaCompensation,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mockInboxCreate, disconnect: vi.fn() },
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: vi.fn() },
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: { isAtLimit: mockIsAtLimit },
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
    compensationInputs.length = 0
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          query: { integrationWebchatModel: { findFirst: mockFindFirst } },
        }),
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
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" } as never)
    mockFindFirst.mockResolvedValue({ id: "webchat-1" } as never)
  })

  test("releases the new workspace's seat when the transaction fails after the workspace was created", async () => {
    // `workspaceService.create` consumed the seat (Redis, outside the tx) and
    // marked the tracker; the webchat insert then fails and the tx rolls
    // back the Workspace row — the seat must be handed back too.
    mockWorkspaceCreate.mockImplementation((props: unknown) => {
      const { quotaConsumption } = props as {
        quotaConsumption?: { consumed: boolean; userId?: string }
      }
      if (quotaConsumption) {
        Object.assign(quotaConsumption, { consumed: true, userId: "user-1" })
      }
      return Promise.resolve({ id: "ws-new", ownerId: "user-1" } as never)
    })
    const failure = new Error("webchat insert failed")
    mockUpsertConnectionRow.mockRejectedValueOnce(failure)

    await expect(
      integrationWebchatService.createWithWorkspace({
        createdBy: "user-1",
        workspaceName: "My Chatbot",
        data: baseData,
      }),
    ).rejects.toBe(failure)

    expect(compensationInputs).toHaveLength(1)
    expect(compensationInputs[0]).toMatchObject({
      ownerId: "user-1",
      workspaceQuotaConsumption: { consumed: true, userId: "user-1" },
    })
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("hands the channel quota back when the transaction fails after connect.completed already consumed it", async () => {
    // `upsertConnectionRow` consumed the channel slot (tracker mutated by
    // reference, as the real transition does); the read-back of the webchat
    // row then fails and the whole transaction rolls back.
    mockUpsertConnectionRow.mockImplementation((props: unknown) => {
      const { quotaConsumption } = props as {
        quotaConsumption: Record<string, unknown>
      }
      Object.assign(quotaConsumption, {
        consumed: true,
        workspaceId: "ws-1",
        workspaceUsageIncremented: true,
      })
      return Promise.resolve({ id: "conn-1" } as never)
    })
    mockFindFirst.mockResolvedValue(undefined as never)

    await expect(
      integrationWebchatService.createWithWorkspace({
        workspaceId: "ws-1",
        createdBy: "user-1",
        workspaceName: "My Chatbot",
        data: baseData,
      }),
    ).rejects.toThrow("IntegrationWebchat row missing")

    expect(compensationInputs).toHaveLength(1)
    expect(compensationInputs[0]).toMatchObject({
      ownerId: "owner-1",
      quotaConsumption: {
        consumed: true,
        workspaceId: "ws-1",
        workspaceUsageIncremented: true,
      },
      workspaceQuotaConsumption: { consumed: false },
    })
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
        callback({
          query: { integrationWebchatModel: { findFirst: mockFindFirst } },
        }),
    )
    mockWorkspaceCreate.mockResolvedValue({
      id: "ws-new",
      ownerId: "user-1",
    } as never)
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    } as never)
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" } as never)
    mockFindFirst.mockResolvedValue({ id: "webchat-1" } as never)

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

describe("integrationWebchatService.create — quota gate", () => {
  const tx = {
    query: { integrationWebchatModel: { findFirst: mockFindFirst } },
  } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAtLimit.mockResolvedValue(false)
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    } as never)
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" } as never)
    mockFindFirst.mockResolvedValue({ id: "webchat-1" } as never)
    mockIsCommunity.mockReturnValue(true)
  })

  test("throws channelLimitReached and creates no Inbox/Connection row when the owner's channel quota is already full", async () => {
    mockIsAtLimit.mockResolvedValue(true)

    await expect(
      integrationWebchatService.create(
        { workspaceId: "ws-1", ownerId: "owner-1", data: baseData },
        tx,
      ),
    ).rejects.toMatchObject({ code: "channelLimitReached" })

    expect(mockInboxCreate).not.toHaveBeenCalled()
    expect(mockUpsertConnectionRow).not.toHaveBeenCalled()
  })

  test("creates the Inbox + Connection row when quota has capacity", async () => {
    mockIsAtLimit.mockResolvedValue(false)

    const created = await integrationWebchatService.create(
      { workspaceId: "ws-1", ownerId: "owner-1", data: baseData },
      tx,
    )

    expect(created).toEqual({
      integration: { id: "webchat-1" },
      connection: { id: "conn-1" },
    })
    expect(mockInboxCreate).toHaveBeenCalledTimes(1)
    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        extraConfig: expect.objectContaining({
          persistentMenus: [
            {
              label: "⚡ Built with chatbotx.io",
              type: "url",
              url: "https://app.example.com/?ref=selfhosted&channel=webchat",
            },
          ],
        }),
      }),
    )
    expect(mockResolveTenantSettings).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tx,
    })
  })

  test("replaces a foreign-host branding entry instead of duplicating it", async () => {
    await integrationWebchatService.create(
      {
        workspaceId: "ws-1",
        ownerId: "owner-1",
        data: {
          ...baseData,
          persistentMenus: [
            {
              label: "⚡ Built with chatbotx.io",
              type: "url",
              url: "https://old.example.com/?ref=selfhosted&channel=webchat",
            },
            { label: "Docs", type: "url", url: "https://docs.example.com" },
          ],
        },
      },
      tx,
    )

    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        extraConfig: expect.objectContaining({
          persistentMenus: [
            { label: "Docs", type: "url", url: "https://docs.example.com" },
            {
              label: "⚡ Built with chatbotx.io",
              type: "url",
              url: "https://app.example.com/?ref=selfhosted&channel=webchat",
            },
          ],
        }),
      }),
    )
  })

  test("does not resolve tenant settings when community branding is disabled", async () => {
    mockIsCommunity.mockReturnValue(false)

    await integrationWebchatService.create(
      { workspaceId: "ws-1", ownerId: "owner-1", data: baseData },
      tx,
    )

    expect(mockResolveTenantSettings).not.toHaveBeenCalled()
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

describe("webchatsAdapter.insert — quota exhausted during template install", () => {
  const buildEntry = (sourceId: string) => ({
    sourceId,
    name: `Webchat ${sourceId}`,
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
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-2" },
      wasCreated: true,
    } as never)
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-2" } as never)
  })

  test("skips the quota-exhausted webchat without creating any Inbox/Connection row, while still installing the rest of the batch", async () => {
    mockIsAtLimit
      .mockResolvedValueOnce(true) // first entry: quota already full
      .mockResolvedValueOnce(false) // second entry: capacity available
    mockFindFirst.mockResolvedValueOnce({ id: "webchat-2" } as never)

    const tx = {
      query: {
        workspaceModel: {
          findFirst: vi.fn(async () => ({ ownerId: "owner-1" })),
        },
        integrationWebchatModel: { findFirst: mockFindFirst },
      },
    }
    const track = vi.fn()
    const warn = vi.fn()

    await webchatsAdapter.insert(
      {
        tx: tx as never,
        workspaceId: "ws-1",
        installationId: "install-1",
        idMaps: {},
        track,
        warn,
      },
      [buildEntry("src-1"), buildEntry("src-2")],
    )

    // The quota-exhausted entry (src-1) must never reach the Inbox or
    // Connection tables — proving the fix moved the quota check ahead of
    // both inserts instead of inserting first and swallowing the failure.
    expect(mockInboxCreate).toHaveBeenCalledTimes(1)
    expect(mockUpsertConnectionRow).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "webchats",
        entityKind: "quota",
        path: "webchats.src-1",
        value: "channelLimitReached",
      }),
    )
    // Only the entry with capacity gets tracked as an installed resource —
    // the skipped one is never counted as connected.
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceId: "src-2",
        resourceId: "webchat-2",
      }),
    )
  })
})
