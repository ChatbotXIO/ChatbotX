import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindOrFail,
  mockTxInsert,
  mockTxInsertValues,
  mockTxInsertReturning,
  mockDbTransaction,
  mockCreateId,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockTxInsertReturning = vi.fn()
  const mockTxInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockTxInsertReturning })
  const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues })

  return {
    mockFindOrFail: vi.fn(),
    mockTxInsert,
    mockTxInsertValues,
    mockTxInsertReturning,
    mockDbTransaction: vi.fn(),
    mockCreateId: vi.fn(() => "new-broadcast-id"),
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mockDbTransaction,
  },
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  findOrFail: mockFindOrFail,
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: { enum: { draft: "draft", scheduled: "scheduled" } },
  findBroadcastChannelCapability: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
  contactInboxModel: {},
  contactModel: {},
  contactsOnBroadcastsModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: vi.fn((filter: unknown) => filter),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { broadcastService } = await import("../src/broadcast/service")

const WS = "ws-1"
const SOURCE_ID = "broadcast-1"

const sourceBroadcast = {
  id: SOURCE_ID,
  workspaceId: WS,
  status: "sent",
  flowId: "flow-1",
  integrationWhatsappId: "wa-1",
  integrationMessengerId: null,
  channel: "whatsapp",
  subaction: "sendMessage",
  templateId: null,
  templateData: null,
  name: "My Broadcast",
}

describe("broadcastService.resend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbTransaction.mockImplementation(
      async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) =>
        fn({ insert: mockTxInsert }),
    )
    mockTxInsertReturning.mockResolvedValue([
      { id: "new-broadcast-id", name: "My Broadcast (Resend)" },
    ])
  })

  test("throws when the source broadcast status is not sent or failed", async () => {
    mockFindOrFail.mockResolvedValue({ ...sourceBroadcast, status: "draft" })

    await expect(
      broadcastService.resend({ workspaceId: WS, id: SOURCE_ID }),
    ).rejects.toThrow("Broadcast is not sent")

    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  test("clones a 'sent' broadcast as a new scheduled-now broadcast, appending (Resend) to the name", async () => {
    mockFindOrFail.mockResolvedValue(sourceBroadcast)

    const result = await broadcastService.resend({
      workspaceId: WS,
      id: SOURCE_ID,
    })

    expect(result).toEqual({
      id: "new-broadcast-id",
      name: "My Broadcast (Resend)",
    })
    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        flowId: "flow-1",
        integrationWhatsappId: "wa-1",
        integrationMessengerId: null,
        channel: "whatsapp",
        subaction: "sendMessage",
        templateId: null,
        templateData: null,
        status: "scheduled",
        schedulesType: "now",
        name: "My Broadcast (Resend)",
        id: "new-broadcast-id",
      }),
    )
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "launch",
      detail: "launched a broadcast (#new-broadcast-id)",
    })
  })

  test("clones a 'failed' broadcast too", async () => {
    mockFindOrFail.mockResolvedValue({ ...sourceBroadcast, status: "failed" })

    await expect(
      broadcastService.resend({ workspaceId: WS, id: SOURCE_ID }),
    ).resolves.toEqual({
      id: "new-broadcast-id",
      name: "My Broadcast (Resend)",
    })
  })
})
