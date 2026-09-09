import { afterEach, describe, expect, test, vi } from "vitest"

const { mockFindOrFail, mockUpdate, mockUpdateSet, mockDispatchAuditRecord } =
  vi.hoisted(() => {
    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

    return {
      mockFindOrFail: vi.fn(),
      mockUpdate,
      mockUpdateSet,
      mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
    }
  })

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: mockUpdate },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
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
  broadcastModel: { id: "broadcast.id" },
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
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: vi.fn(),
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {
    listWithRelations: vi.fn(),
    count: vi.fn(),
    findIdIfActive: vi.fn(),
    listAudience: vi.fn(),
    countAudience: vi.fn(),
    findByIdOrName: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { broadcastService } = await import("../src/broadcast/service")

const WS = "ws-1"
const BROADCAST_ID = "bc-1"

describe("broadcastService.update", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("renames the broadcast and audits", async () => {
    mockFindOrFail.mockResolvedValue({ id: BROADCAST_ID, workspaceId: WS })

    await broadcastService.update(
      { workspaceId: WS, id: BROADCAST_ID },
      { name: "New Name" },
    )

    expect(mockFindOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: BROADCAST_ID,
          workspaceId: WS,
          deletedAt: { isNull: true },
        }),
      }),
    )
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "New Name" })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: `updated a broadcast (#${BROADCAST_ID})`,
    })
  })

  test("propagates the not-found error and never updates", async () => {
    mockFindOrFail.mockRejectedValue(new Error("Not found"))

    await expect(
      broadcastService.update(
        { workspaceId: WS, id: BROADCAST_ID },
        { name: "New Name" },
      ),
    ).rejects.toThrow("Not found")

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
