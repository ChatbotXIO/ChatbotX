import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindOrFail,
  mockTxInsert,
  mockTxInsertValues,
  mockTxInsertReturning,
  mockTxTargetFindMany,
  mockDbTransaction,
  mockCreateId,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockTxInsertReturning = vi.fn()
  const mockTxInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockTxInsertReturning })
  const mockTxInsert = vi.fn().mockReturnValue({ values: mockTxInsertValues })
  const mockTxTargetFindMany = vi.fn().mockResolvedValue([])

  return {
    mockFindOrFail: vi.fn(),
    mockTxInsert,
    mockTxInsertValues,
    mockTxInsertReturning,
    mockTxTargetFindMany,
    mockDbTransaction: vi.fn(),
    mockCreateId: vi.fn(() => "new-broadcast-id"),
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
  sequenceAnalyticsService: { getContacts: vi.fn() },
}))

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
  // Mirrors the real `contactFilterFields` zod enum closely enough for
  // `isContactFilterShape`'s `.safeParse(field).success` check: a known
  // field name succeeds, anything else (including a renamed/removed field)
  // fails, matching `z.enum([...]).safeParse` semantics.
  contactFilterFields: {
    safeParse: (value: unknown) => ({
      success: value === "email" || value === "fullName",
    }),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
  broadcastTargetModel: {},
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
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {
    listWithRelations: vi.fn(),
    count: vi.fn(),
    listAudience: vi.fn(),
    countAudience: vi.fn(),
    findByIdOrName: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  findTemplateStartStep: vi.fn(),
  stepTypes: {
    enum: {
      sendWaTemplateMessage: "sendWaTemplateMessage",
      sendMessengerTemplateMessage: "sendMessengerTemplateMessage",
    },
  },
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { pruneEmailPhoneFilterConditions } = await import(
  "@chatbotx.io/database/queries"
)
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

describe("broadcastService.resendWithPruning", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbTransaction.mockImplementation(
      async (
        fn: (tx: {
          insert: typeof mockTxInsert
          query: {
            broadcastTargetModel: { findMany: typeof mockTxTargetFindMany }
          }
        }) => Promise<unknown>,
      ) =>
        fn({
          insert: mockTxInsert,
          query: { broadcastTargetModel: { findMany: mockTxTargetFindMany } },
        }),
    )
    mockTxInsertReturning.mockResolvedValue([
      { id: "new-broadcast-id", name: "My Broadcast (Resend)" },
    ])
  })

  test("passes the persisted contactFilter through to resend when it has the expected shape", async () => {
    mockFindOrFail.mockResolvedValue({
      ...sourceBroadcast,
      contactFilter: { operator: "and", conditions: [] },
    })

    const result = await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    expect(result).toEqual({
      id: "new-broadcast-id",
      name: "My Broadcast (Resend)",
    })
    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contactFilter: { operator: "and", conditions: [] },
      }),
    )
  })

  test("passes undefined contactFilter when the source has none stored", async () => {
    mockFindOrFail.mockResolvedValue({
      ...sourceBroadcast,
      contactFilter: null,
    })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter: undefined }),
    )
  })

  test("passes undefined contactFilter when the persisted value has an unexpected shape", async () => {
    mockFindOrFail.mockResolvedValue({
      ...sourceBroadcast,
      contactFilter: { unexpected: true },
    })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter: undefined }),
    )
  })

  test.each([
    ["xor", { operator: "xor", conditions: [] }],
    ["AND (uppercase)", { operator: "AND", conditions: [] }],
    ["a non-array conditions", { operator: "and", conditions: "nope" }],
    ["a missing operator", { conditions: [] }],
  ])("drops the persisted contactFilter when it has %s", async (_label, contactFilter) => {
    mockFindOrFail.mockResolvedValue({ ...sourceBroadcast, contactFilter })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    // `applyContactFilter` branches only on `operator === "or"`, so any
    // other value would silently degrade to AND and resend to a different
    // audience than the filter describes. Dropping it reproduces the
    // pre-refactor `safeParse` failure path: full eligible audience.
    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter: undefined }),
    )
  })

  test("passes the persisted contactFilter through when every condition has a known field", async () => {
    const contactFilter = {
      operator: "and",
      conditions: [{ field: "email", operator: "eq", value: "a@b.com" }],
    }
    mockFindOrFail.mockResolvedValue({ ...sourceBroadcast, contactFilter })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter }),
    )
  })

  test.each([
    [
      "one condition has an unrecognised field",
      {
        operator: "and",
        conditions: [
          { field: "email", operator: "eq", value: "a@b.com" },
          { field: "aFieldThatWasRenamedOrRemoved", operator: "eq", value: 1 },
        ],
      },
    ],
    [
      "every condition has an unrecognised field",
      {
        operator: "and",
        conditions: [
          { field: "aFieldThatWasRenamedOrRemoved", operator: "eq", value: 1 },
        ],
      },
    ],
    [
      "a condition is missing its field",
      { operator: "and", conditions: [{ operator: "eq", value: 1 }] },
    ],
    [
      "a condition is not an object",
      { operator: "and", conditions: ["not-an-object"] },
    ],
  ])(// A malformed *condition* must drop the whole filter, not just the bad
  // condition: `buildConditionWhere`'s `default` case returns `{}` for an
  // unrecognised field, `applyContactFilter` filters out every empty
  // where, and if every condition is dropped it returns `{}` — i.e. NO
  // filtering, silently widening the resend to the full workspace
  // audience instead of throwing or narrowing. This is the regression
  // `isContactFilterShape` must prevent.
  "drops the persisted contactFilter when %s", async (_label, contactFilter) => {
    mockFindOrFail.mockResolvedValue({ ...sourceBroadcast, contactFilter })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter: undefined }),
    )
  })

  test("keeps an 'or' filter, which is a valid operator", async () => {
    mockFindOrFail.mockResolvedValue({
      ...sourceBroadcast,
      contactFilter: { operator: "or", conditions: [] },
    })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
    })

    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contactFilter: { operator: "or", conditions: [] },
      }),
    )
  })

  test("prunes email/phone conditions when the caller may not view them", async () => {
    const persisted = { operator: "and", conditions: [{ field: "email" }] }
    const pruned = { operator: "and", conditions: [] }
    vi.mocked(pruneEmailPhoneFilterConditions).mockReturnValueOnce(
      pruned as never,
    )
    mockFindOrFail.mockResolvedValue({
      ...sourceBroadcast,
      contactFilter: persisted,
    })

    await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: false,
    })

    expect(pruneEmailPhoneFilterConditions).toHaveBeenCalledWith(
      persisted,
      false,
    )
    expect(mockTxInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ contactFilter: pruned }),
    )
  })

  test("propagates a 'Broadcast is not sent' error from the existence/status guard", async () => {
    mockFindOrFail.mockResolvedValue({ ...sourceBroadcast, status: "draft" })

    await expect(
      broadcastService.resendWithPruning({
        workspaceId: WS,
        id: SOURCE_ID,
        canViewEmailAndPhone: true,
      }),
    ).rejects.toThrow("Broadcast is not sent")

    expect(mockDbTransaction).not.toHaveBeenCalled()
  })

  test("clones a 'sent' broadcast as a new scheduled-now broadcast, appending (Resend) to the name", async () => {
    mockFindOrFail.mockResolvedValue(sourceBroadcast)

    const result = await broadcastService.resendWithPruning({
      workspaceId: WS,
      id: SOURCE_ID,
      canViewEmailAndPhone: true,
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
      broadcastService.resendWithPruning({
        workspaceId: WS,
        id: SOURCE_ID,
        canViewEmailAndPhone: true,
      }),
    ).resolves.toEqual({
      id: "new-broadcast-id",
      name: "My Broadcast (Resend)",
    })
  })
})
