import { beforeEach, describe, expect, test, vi } from "vitest"

// The broadcast policy import reaches quota/workspace modules these narrow mocks omit.
vi.mock("../plan-policy.service", () => ({ broadcastPlanPolicyService: {} }))

const mocks = vi.hoisted(() => ({
  resolveBroadcastInboxIds: vi.fn(),
  count: vi.fn(),
  findBroadcast: vi.fn(),
  selectRows: [] as Record<string, unknown>[],
  selectInnerJoin: vi.fn(),
  selectLeftJoin: vi.fn(),
  selectLimit: vi.fn(),
  selectOffset: vi.fn(),
  selectOrderBy: vi.fn(),
  selectWhere: vi.fn(),
  chunkById: vi.fn(),
  // Consumed in order by `limit()` when non-empty (queueing a preset batch
  // per query), else `limit()` falls back to the single static `selectRows`.
  // Used together with the real `chunkById` to drive a faithful multi-chunk
  // walk instead of a hand-rolled loop re-implementation.
  selectRowsQueue: [] as Record<string, unknown>[][],
  buildContactInboxContactFilterSQL: vi.fn(() => ({ RAW: "contact-filter" })),
  contactInboxInteractedWithin24hSQL: vi.fn(() => ({
    RAW: "recent-interaction",
  })),
  setIfAbsent: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  casStore: { setIfAbsent: mocks.setIfAbsent },
}))

vi.mock("../../logger", () => ({
  logger: { error: mocks.loggerError },
}))

vi.mock("../../inbox/service", () => ({
  inboxService: {
    resolveBroadcastInboxIds: mocks.resolveBroadcastInboxIds,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "Broadcast.id",
    name: "Broadcast.name",
    workspaceId: "Broadcast.workspaceId",
    channel: "Broadcast.channel",
    createdAt: "Broadcast.createdAt",
    deletedAt: "Broadcast.deletedAt",
  },
  contactInboxModel: {
    id: "ContactInbox.id",
    inboxId: "ContactInbox.inboxId",
    contactId: "ContactInbox.contactId",
    channel: "ContactInbox.channel",
  },
  contactModel: {
    id: "Contact.id",
    firstName: "Contact.firstName",
    lastName: "Contact.lastName",
    fullName: "Contact.fullName",
    avatar: "Contact.avatar",
    createdAt: "Contact.createdAt",
    workspaceId: "Contact.workspaceId",
  },
  conversationModel: {
    id: "Conversation.id",
    contactId: "Conversation.contactId",
    sourceId: "Conversation.sourceId",
    workspaceId: "Conversation.workspaceId",
    assignedUserId: "Conversation.assignedUserId",
  },
  integrationMessengerModel: {
    id: "IntegrationMessenger.id",
    name: "IntegrationMessenger.name",
    inboxId: "IntegrationMessenger.inboxId",
    workspaceId: "IntegrationMessenger.workspaceId",
  },
  integrationWhatsappModel: {
    id: "IntegrationWhatsapp.id",
    name: "IntegrationWhatsapp.name",
    inboxId: "IntegrationWhatsapp.inboxId",
    workspaceId: "IntegrationWhatsapp.workspaceId",
  },
  broadcastTargetModel: {
    broadcastId: "BroadcastTarget.broadcastId",
    inboxId: "BroadcastTarget.inboxId",
  },
  inboxModel: {
    id: "Inbox.id",
    name: "Inbox.name",
  },
  messengerMessageTemplateModel: {
    id: "MessengerMessageTemplate.id",
    name: "MessengerMessageTemplate.name",
    language: "MessengerMessageTemplate.language",
    category: "MessengerMessageTemplate.category",
    status: "MessengerMessageTemplate.status",
    parameterFormat: "MessengerMessageTemplate.parameterFormat",
    components: "MessengerMessageTemplate.components",
    integrationMessengerId: "MessengerMessageTemplate.integrationMessengerId",
  },
  whatsappMessageTemplateModel: {
    id: "WhatsappMessageTemplate.id",
    name: "WhatsappMessageTemplate.name",
    language: "WhatsappMessageTemplate.language",
    category: "WhatsappMessageTemplate.category",
    status: "WhatsappMessageTemplate.status",
    components: "WhatsappMessageTemplate.components",
    integrationWhatsappId: "WhatsappMessageTemplate.integrationWhatsappId",
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    $count: mocks.count,
    query: {
      broadcastModel: {
        findFirst: mocks.findBroadcast,
      },
    },
    select: (selection?: Record<string, unknown>) => {
      const isCountSelect = Boolean(selection?.count)
      const builder = {
        from: () => builder,
        innerJoin: (...args: unknown[]) => {
          mocks.selectInnerJoin(args)
          return builder
        },
        leftJoin: (...args: unknown[]) => {
          mocks.selectLeftJoin(args)
          return builder
        },
        where: (where: unknown) => {
          mocks.selectWhere(where)
          if (isCountSelect) {
            return Promise.resolve(mocks.selectRows)
          }
          return builder
        },
        orderBy: (orderBy: unknown) => {
          mocks.selectOrderBy(orderBy)
          return builder
        },
        // A real Promise (awaitable directly — the byte-identical,
        // un-windowed path) with a bonus `.offset(...)` method (the windowed
        // path). Mirrors real drizzle query builder shape without declaring
        // a literal `then` property.
        limit: (limit: number) => {
          mocks.selectLimit(limit)
          const rows =
            mocks.selectRowsQueue.length > 0
              ? (mocks.selectRowsQueue.shift() as Record<string, unknown>[])
              : mocks.selectRows
          return Object.assign(Promise.resolve(rows), {
            offset: (offset: number) => {
              mocks.selectOffset(offset)
              return Promise.resolve(rows)
            },
          })
        },
      }

      return builder
    },
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (value: unknown) => ({ __asc: value }),
  count: () => "count()",
  desc: (value: unknown) => ({ __desc: value }),
  eq: (left: unknown, right: unknown) => ({ __eq: [left, right] }),
  gt: (left: unknown, right: unknown) => ({ __gt: [left, right] }),
  inArray: (left: unknown, right: unknown) => ({ __inArray: [left, right] }),
  isNull: (value: unknown) => ({ __isNull: value }),
  isNotNull: (value: unknown) => ({ __isNotNull: value }),
  ne: (left: unknown, right: unknown) => ({ __ne: [left, right] }),
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: mocks.buildContactInboxContactFilterSQL,
  contactInboxInteractedWithin24hSQL: mocks.contactInboxInteractedWithin24hSQL,
  pruneEmailPhoneFilterConditions: (
    contactFilter: { operator: "and" | "or"; conditions: unknown[] },
    canViewEmailAndPhone: boolean,
  ) =>
    canViewEmailAndPhone
      ? contactFilter
      : {
          operator: contactFilter.operator,
          conditions: contactFilter.conditions.filter((condition) => {
            const field =
              typeof condition === "object" && condition !== null
                ? (condition as { field?: unknown }).field
                : undefined
            return ![
              "email",
              "phone",
              "hasContactInfo",
              "emailWasVerified",
              "optedInForEmail",
              "existingContact",
            ].includes(String(field))
          }),
        },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: mocks.chunkById,
}))

const { broadcastService, broadcastTemplateSelections } = await import(
  "../service"
)
// The real loop (packages/database/src/utils.ts), used by the
// `forEachAudienceChunk` window tests so they prove the actual stop/continue
// contract instead of a hand-rolled re-implementation of it.
const { chunkById: actualChunkById } = await vi.importActual<
  typeof import("@chatbotx.io/database/utils")
>("@chatbotx.io/database/utils")

const contactFilter = {
  operator: "and" as const,
  conditions: [
    {
      field: "fullName",
      operator: "contains",
      value: "Ada",
    },
  ],
}

beforeEach(() => {
  mocks.resolveBroadcastInboxIds.mockReset()
  mocks.count.mockReset()
  mocks.findBroadcast.mockReset()
  mocks.selectRows = []
  mocks.selectRowsQueue = []
  mocks.selectInnerJoin.mockReset()
  mocks.selectLeftJoin.mockReset()
  mocks.selectLimit.mockReset()
  mocks.selectOffset.mockReset()
  mocks.selectOrderBy.mockReset()
  mocks.selectWhere.mockReset()
  mocks.chunkById.mockReset()
  mocks.buildContactInboxContactFilterSQL.mockClear()
  mocks.contactInboxInteractedWithin24hSQL.mockClear()
  mocks.setIfAbsent.mockReset()
  mocks.loggerError.mockReset()
})

describe("broadcastService.listOptions", () => {
  test("returns newest broadcast options with a bounded payload", async () => {
    const result = await broadcastService.listOptions({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })

    expect(result).toEqual([])
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["Broadcast.workspaceId", "ws-1"] },
        { __eq: ["Broadcast.channel", "whatsapp"] },
        { __isNull: "Broadcast.deletedAt" },
      ],
    })
    expect(mocks.selectOrderBy).toHaveBeenCalledWith({
      __desc: "Broadcast.createdAt",
    })
    expect(mocks.selectLimit).toHaveBeenCalledWith(500)
  })
})

describe("broadcastService.countAudience", () => {
  test("returns zero without counting when no inboxes resolve", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue([])

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
    })

    expect(total).toBe(0)
    expect(mocks.count).not.toHaveBeenCalled()
  })

  test("includes the 24h predicate for windowed broadcast subactions", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(7)

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["whatsapp"],
      contactFilter,
      subaction: "whatsappWithin24Hours",
    })

    expect(total).toBe(7)
    expect(mocks.count).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        __and: expect.arrayContaining([
          { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
          { RAW: "contact-filter" },
          { RAW: "recent-interaction" },
        ]),
      }),
    )
    expect(mocks.buildContactInboxContactFilterSQL).toHaveBeenCalledWith({
      contactIdColumn: "ContactInbox.contactId",
      workspaceId: "ws-1",
      contactFilter,
    })
  })

  test("includes the 24h predicate for Instagram active contacts", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-instagram"])
    mocks.count.mockResolvedValue(5)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["instagram"],
      subaction: "instagramActiveContacts",
    })

    const where = mocks.count.mock.calls[0]?.[1] as { __and?: unknown[] }
    expect(where.__and).toContainEqual({ RAW: "recent-interaction" })
  })

  test("includes the 24h predicate for TikTok active contacts", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-tiktok"])
    mocks.count.mockResolvedValue(5)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["tiktok"],
      subaction: "tiktokActiveContacts",
    })

    const where = mocks.count.mock.calls[0]?.[1] as { __and?: unknown[] }
    expect(where.__and).toContainEqual({ RAW: "recent-interaction" })
  })

  test("prunes email/phone contact filters when the audience caller lacks emailAndPhone permission", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(1)
    const restrictedFilter = {
      operator: "and" as const,
      conditions: [
        { field: "email", operator: "eq", value: "ada@example.com" },
        { field: "fullName", operator: "contains", value: "Ada" },
      ],
    }

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      canViewEmailAndPhone: false,
      contactFilter: restrictedFilter,
    })

    expect(mocks.buildContactInboxContactFilterSQL).toHaveBeenCalledWith({
      contactIdColumn: "ContactInbox.contactId",
      workspaceId: "ws-1",
      contactFilter: {
        operator: "and",
        conditions: [{ field: "fullName", operator: "contains", value: "Ada" }],
      },
    })
  })

  test("omits the 24h predicate for non-windowed broadcast subactions", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(3)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      subaction: "messengerTemplateMessage",
    })

    const where = mocks.count.mock.calls[0]?.[1] as { __and?: unknown[] }
    expect(where.__and).toContainEqual({
      __inArray: ["ContactInbox.inboxId", ["inbox-1"]],
    })
    expect(where.__and).not.toContainEqual({ RAW: "recent-interaction" })
    expect(mocks.buildContactInboxContactFilterSQL).not.toHaveBeenCalled()
  })

  test("omits the 24h predicate for Telegram all contacts", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-telegram"])
    mocks.count.mockResolvedValue(8)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["telegram"],
      subaction: "telegramAllContacts",
    })

    const where = mocks.count.mock.calls[0]?.[1] as { __and?: unknown[] }
    expect(where.__and).not.toContainEqual({ RAW: "recent-interaction" })
  })

  test("forwards explicit inboxIds when resolving the audience inboxes", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue([])

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["whatsapp"],
      inboxIds: ["inbox-a", "inbox-b"],
    })

    expect(mocks.resolveBroadcastInboxIds).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channels: ["whatsapp"],
        inboxIds: ["inbox-a", "inbox-b"],
      }),
    )
  })

  test("forwards integrationMessengerId when resolving the audience inboxes", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-messenger"])
    mocks.count.mockResolvedValue(4)

    await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationMessengerId: "messenger-1",
      subaction: "messengerTemplateMessage",
    })

    expect(mocks.resolveBroadcastInboxIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: undefined,
      integrationMessengerId: "messenger-1",
    })
  })

  test("counts only assigned DM conversations for restricted contact scope", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.selectRows = [{ count: 2 }]

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      restrictToAssignedUserId: "user-1",
    })

    expect(total).toBe(2)
    expect(mocks.count).not.toHaveBeenCalled()
    expect(mocks.selectInnerJoin).toHaveBeenCalledWith([
      expect.anything(),
      {
        __and: [
          { __eq: ["Conversation.contactId", "ContactInbox.contactId"] },
          { __isNull: "Conversation.sourceId" },
        ],
      },
    ])
    expect(mocks.selectWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        __and: expect.arrayContaining([
          expect.objectContaining({
            __and: expect.arrayContaining([
              { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
            ]),
          }),
          {
            __and: [
              { __eq: ["Conversation.workspaceId", "ws-1"] },
              { __eq: ["Conversation.assignedUserId", "user-1"] },
            ],
          },
        ]),
      }),
    )
  })

  test("counts null sourceId DM conversations for a restricted TikTok scope", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-tiktok"])
    mocks.selectRows = [{ count: 3 }]

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["tiktok"],
      subaction: "tiktokActiveContacts",
      restrictToAssignedUserId: "user-1",
    })

    expect(total).toBe(3)
    expect(mocks.selectInnerJoin).toHaveBeenCalledWith([
      expect.anything(),
      {
        __and: [
          { __eq: ["Conversation.contactId", "ContactInbox.contactId"] },
          { __isNull: "Conversation.sourceId" },
        ],
      },
    ])
  })

  test("clamps the plain-branch count to the audience range", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(100)

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      audienceRange: { offset: 10, size: 20 },
    })

    expect(total).toBe(20)
  })

  test("does not clamp the plain-branch count when audienceRange is absent", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.count.mockResolvedValue(100)

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
    })

    expect(total).toBe(100)
  })

  test("clamps the restricted-branch count to the audience range", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.selectRows = [{ count: 100 }]

    const total = await broadcastService.countAudience({
      workspaceId: "ws-1",
      channels: ["messenger"],
      restrictToAssignedUserId: "user-1",
      audienceRange: { offset: 90, size: 100 },
    })

    expect(total).toBe(10)
  })
})

describe("broadcastService.listAudiencePreview", () => {
  test("returns an empty preview without querying when no inboxes resolve", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue([])

    const rows = await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
    })

    expect(rows).toEqual([])
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("joins contacts and the bounded DM conversation for a paginated preview", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.selectRows = [
      {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        avatar: null,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
        channel: "messenger",
        conversationId: "conversation-1",
      },
    ]

    const rows = await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
      contactFilter,
      page: 3,
      perPage: 10,
    })

    expect(rows).toEqual(mocks.selectRows)
    expect(mocks.selectLeftJoin).toHaveBeenCalledWith([
      expect.anything(),
      {
        __and: [
          {
            __eq: ["Conversation.contactId", "ContactInbox.contactId"],
          },
          { __isNull: "Conversation.sourceId" },
        ],
      },
    ])
    expect(mocks.selectWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        __and: expect.arrayContaining([
          expect.objectContaining({
            __and: expect.arrayContaining([
              { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
              { RAW: "contact-filter" },
            ]),
          }),
          { __eq: ["Contact.workspaceId", "ws-1"] },
        ]),
      }),
    )
    expect(mocks.selectOrderBy).toHaveBeenCalledWith({
      __asc: "ContactInbox.id",
    })
    expect(mocks.selectLimit).toHaveBeenCalledWith(10)
    expect(mocks.selectOffset).toHaveBeenCalledWith(20)
  })

  test("joins the null sourceId DM conversation for a TikTok preview", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-tiktok"])
    mocks.selectRows = []

    await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["tiktok"],
      subaction: "tiktokActiveContacts",
    })

    expect(mocks.selectLeftJoin).toHaveBeenCalledWith([
      expect.anything(),
      {
        __and: [
          { __eq: ["Conversation.contactId", "ContactInbox.contactId"] },
          { __isNull: "Conversation.sourceId" },
        ],
      },
    ])
  })

  test("caps preview page size at fifty rows", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])

    await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
      page: 1,
      perPage: 500,
    })

    expect(mocks.selectLimit).toHaveBeenCalledWith(50)
  })

  test("filters preview rows to assigned DM conversations for restricted contact scope", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])

    await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
      restrictToAssignedUserId: "user-1",
    })

    expect(mocks.selectWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        __and: expect.arrayContaining([
          { __eq: ["Contact.workspaceId", "ws-1"] },
          {
            __and: [
              { __eq: ["Conversation.workspaceId", "ws-1"] },
              { __eq: ["Conversation.assignedUserId", "user-1"] },
            ],
          },
        ]),
      }),
    )
  })

  test("applies the range's offset and caps the page within the window", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.selectRows = []

    await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
      page: 2,
      perPage: 10,
      audienceRange: { offset: 100, size: 25 },
    })

    // page 2 (offset 10 within the window) + the range's own offset (100).
    expect(mocks.selectLimit).toHaveBeenCalledWith(10)
    expect(mocks.selectOffset).toHaveBeenCalledWith(110)
  })

  test("returns an empty page without querying once the page lies past the range", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])

    const rows = await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
      page: 3,
      perPage: 10,
      audienceRange: { offset: 0, size: 20 },
    })

    expect(rows).toEqual([])
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("keeps the offset/limit byte-identical to today when audienceRange is absent", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.selectRows = []

    await broadcastService.listAudiencePreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
      page: 3,
      perPage: 10,
    })

    expect(mocks.selectLimit).toHaveBeenCalledWith(10)
    expect(mocks.selectOffset).toHaveBeenCalledWith(20)
  })
})

describe("broadcastService.listTemplateDetails", () => {
  test("returns an empty list when the broadcast has no template", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: null,
      channel: "whatsapp",
      targets: [],
    })

    const details = await broadcastService.listTemplateDetails({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(details).toEqual([])
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("returns an empty list when the broadcast is missing", async () => {
    mocks.findBroadcast.mockResolvedValue(undefined)

    const details = await broadcastService.listTemplateDetails({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(details).toEqual([])
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("loads a legacy whatsapp template scoped through its integration workspace", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: "template-1",
      integrationWhatsappId: null,
      integrationMessengerId: null,
      channel: "whatsapp",
      targets: [],
    })
    mocks.selectRows = [
      {
        id: "template-1",
        name: "Order update",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-1",
        integrationName: "WhatsApp Main",
      },
    ]

    const details = await broadcastService.listTemplateDetails({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(details).toEqual([{ ...mocks.selectRows[0], channel: "whatsapp" }])
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __inArray: ["WhatsappMessageTemplate.id", ["template-1"]] },
        { __eq: ["IntegrationWhatsapp.workspaceId", "ws-1"] },
      ],
    })
  })

  test("loads a legacy messenger template with its integration name", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: "template-2",
      integrationWhatsappId: null,
      integrationMessengerId: null,
      channel: "messenger",
      targets: [],
    })
    mocks.selectRows = [
      {
        id: "template-2",
        name: "Promo",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        parameterFormat: "POSITIONAL",
        components: [],
        inboxId: "inbox-2",
        integrationName: "Messenger Page",
      },
    ]

    const details = await broadcastService.listTemplateDetails({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(details).toEqual([{ ...mocks.selectRows[0], channel: "messenger" }])
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __inArray: ["MessengerMessageTemplate.id", ["template-2"]] },
        { __eq: ["IntegrationMessenger.workspaceId", "ws-1"] },
      ],
    })
  })

  test("returns one detail per target, in target order, each pinned to its own page", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: null,
      integrationWhatsappId: null,
      integrationMessengerId: null,
      channel: "whatsapp",
      targets: [
        { inboxId: "inbox-b", templateId: "template-b" },
        { inboxId: "inbox-a", templateId: "template-a" },
      ],
    })
    const templateA = {
      id: "template-a",
      name: "promo",
      language: "en",
      category: "MARKETING",
      status: "APPROVED",
      components: [],
      inboxId: "inbox-a",
      integrationName: "Page A",
    }
    const templateB = {
      ...templateA,
      id: "template-b",
      inboxId: "inbox-b",
      integrationName: "Page B",
    }
    mocks.selectRows = [templateA, templateB]

    const details = await broadcastService.listTemplateDetails({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(details.map((detail) => detail.id)).toEqual([
      "template-b",
      "template-a",
    ])
    expect(mocks.selectWhere).toHaveBeenCalledTimes(1)
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        {
          __inArray: [
            "WhatsappMessageTemplate.id",
            ["template-b", "template-a"],
          ],
        },
        { __eq: ["IntegrationWhatsapp.workspaceId", "ws-1"] },
      ],
    })
  })

  test("drops a target whose template belongs to a different page", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: null,
      integrationWhatsappId: null,
      integrationMessengerId: null,
      channel: "whatsapp",
      targets: [{ inboxId: "inbox-b", templateId: "template-a" }],
    })
    mocks.selectRows = [
      {
        id: "template-a",
        name: "promo",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-a",
        integrationName: "Page A",
      },
    ]

    const details = await broadcastService.listTemplateDetails({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(details).toEqual([])
  })
})

describe("broadcastService.resolveTemplateBroadcastName", () => {
  test("prefixes the whatsapp page name and scopes to the chosen integration", async () => {
    mocks.selectRows = [
      {
        id: "template-1",
        name: "order_confirmation",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        components: [],
        integrationName: "Acme WhatsApp",
      },
    ]

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [
        { templateId: "template-1", integrationWhatsappId: "whatsapp-1" },
      ],
    })

    expect(name).toBe("Acme WhatsApp - order_confirmation")
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __inArray: ["WhatsappMessageTemplate.id", ["template-1"]] },
        { __eq: ["IntegrationWhatsapp.workspaceId", "ws-1"] },
        {
          __eq: ["WhatsappMessageTemplate.integrationWhatsappId", "whatsapp-1"],
        },
      ],
    })
  })

  test("prefixes the messenger page name and scopes to the chosen integration", async () => {
    mocks.selectRows = [
      {
        id: "template-2",
        name: "promo_update",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        parameterFormat: "POSITIONAL",
        components: [],
        integrationName: "Acme Page",
      },
    ]

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "messenger",
      selections: [
        { templateId: "template-2", integrationMessengerId: "messenger-1" },
      ],
    })

    expect(name).toBe("Acme Page - promo_update")
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __inArray: ["MessengerMessageTemplate.id", ["template-2"]] },
        { __eq: ["IntegrationMessenger.workspaceId", "ws-1"] },
        {
          __eq: [
            "MessengerMessageTemplate.integrationMessengerId",
            "messenger-1",
          ],
        },
      ],
    })
  })

  test("falls back to the template name when the page name is missing", async () => {
    mocks.selectRows = [
      {
        id: "template-3",
        name: "standalone_template",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        components: [],
        integrationName: null,
      },
    ]

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [
        { templateId: "template-3", integrationWhatsappId: "whatsapp-1" },
      ],
    })

    expect(name).toBe("standalone_template")
  })

  test("omits the integration scope when no integration id is provided", async () => {
    mocks.selectRows = [
      {
        id: "template-4",
        name: "order_confirmation",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        components: [],
        integrationName: "Acme WhatsApp",
      },
    ]

    await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [{ templateId: "template-4" }],
    })

    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __inArray: ["WhatsappMessageTemplate.id", ["template-4"]] },
        { __eq: ["IntegrationWhatsapp.workspaceId", "ws-1"] },
      ],
    })
  })

  test("returns null when the template is not found in the workspace/page", async () => {
    mocks.selectRows = []

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [
        { templateId: "missing-template", integrationWhatsappId: "whatsapp-1" },
      ],
    })

    expect(name).toBeNull()
  })

  test("returns null for channels that do not support template broadcasts", async () => {
    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "telegram",
      selections: [{ templateId: "template-5" }],
    })

    expect(name).toBeNull()
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("returns null without querying when nothing is selected", async () => {
    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [],
    })

    expect(name).toBeNull()
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("joins one page-prefixed segment per target for a multi-page broadcast", async () => {
    mocks.selectRows = [
      {
        id: "template-a",
        name: "promo",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-a",
        integrationName: "Page A",
      },
      {
        id: "template-b",
        name: "welcome",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-b",
        integrationName: "Page B",
      },
    ]

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [
        { templateId: "template-a", inboxId: "inbox-a" },
        { templateId: "template-b", inboxId: "inbox-b" },
      ],
    })

    expect(name).toBe("Page A - promo / Page B - welcome")
    expect(mocks.selectWhere).toHaveBeenCalledTimes(1)
  })

  test("returns null when a target's template belongs to another page", async () => {
    mocks.selectRows = [
      {
        id: "template-a",
        name: "promo",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-a",
        integrationName: "Page A",
      },
    ]

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [{ templateId: "template-a", inboxId: "inbox-b" }],
    })

    expect(name).toBeNull()
  })

  test("truncates a long multi-page name to 255 characters", async () => {
    const longPageName = "P".repeat(200)
    mocks.selectRows = [
      {
        id: "template-a",
        name: "promo",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-a",
        integrationName: longPageName,
      },
      {
        id: "template-b",
        name: "promo",
        language: "en",
        category: "MARKETING",
        status: "APPROVED",
        components: [],
        inboxId: "inbox-b",
        integrationName: longPageName,
      },
    ]

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      selections: [
        { templateId: "template-a", inboxId: "inbox-a" },
        { templateId: "template-b", inboxId: "inbox-b" },
      ],
    })

    expect(name).toHaveLength(255)
  })
})

describe("broadcastTemplateSelections", () => {
  test("pins one selection per target that carries a template", () => {
    expect(
      broadcastTemplateSelections({
        templateId: "legacy",
        integrationWhatsappId: "wa-1",
        targets: [
          { inboxId: "inbox-a", templateId: "template-a" },
          { inboxId: "inbox-flow" },
        ],
      }),
    ).toEqual([{ templateId: "template-a", inboxId: "inbox-a" }])
  })

  test("falls back to the legacy single template scoped by its integration ids", () => {
    expect(
      broadcastTemplateSelections({
        templateId: "legacy",
        integrationWhatsappId: "wa-1",
        integrationMessengerId: undefined,
        targets: [],
      }),
    ).toEqual([
      {
        templateId: "legacy",
        integrationWhatsappId: "wa-1",
        integrationMessengerId: undefined,
      },
    ])
  })

  test("is empty for a flow broadcast", () => {
    expect(broadcastTemplateSelections({ targets: [] })).toEqual([])
  })
})

describe("broadcastService.forEachAudienceChunk", () => {
  test("does not invoke the chunk callback when no inboxes resolve", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue([])
    const onChunk = vi.fn()

    await broadcastService.forEachAudienceChunk(
      { workspaceId: "ws-1", channels: ["messenger"] },
      onChunk,
    )

    expect(mocks.chunkById).not.toHaveBeenCalled()
    expect(onChunk).not.toHaveBeenCalled()
  })

  test("queries chunks and forwards rows to the chunk callback", async () => {
    const rows = [{ id: "ci-1", contactId: "contact-1" }]
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    mocks.chunkById.mockImplementation(
      async (
        queryFn: (lastId?: string) => Promise<unknown>,
        opts: { callback: (items: typeof rows) => Promise<unknown> },
      ) => {
        await queryFn("last-ci")
        await opts.callback(rows)
      },
    )
    const onChunk = vi.fn()

    await broadcastService.forEachAudienceChunk(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
        subaction: "messengerActiveContacts",
        chunkSize: 50,
      },
      onChunk,
    )

    expect(mocks.chunkById).toHaveBeenCalledWith(expect.any(Function), {
      chunkSize: 50,
      callback: onChunk,
    })
    expect(mocks.selectWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        __and: expect.arrayContaining([
          expect.objectContaining({
            __and: expect.arrayContaining([
              { __inArray: ["ContactInbox.inboxId", ["inbox-1"]] },
              { RAW: "recent-interaction" },
            ]),
          }),
          { __gt: ["ContactInbox.id", "last-ci"] },
        ]),
      }),
    )
    expect(onChunk).toHaveBeenCalledWith(rows)
  })

  test("is byte-identical to today when audienceRange is absent: no offset call, plain chunkSize limit", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    const rows = [{ id: "ci-1" }, { id: "ci-2" }]
    mocks.selectRows = rows
    mocks.chunkById.mockImplementation(async (queryFn, opts) => {
      await queryFn(null)
      await opts.callback(rows)
    })
    const onChunk = vi.fn()

    await broadcastService.forEachAudienceChunk(
      { workspaceId: "ws-1", channels: ["messenger"], chunkSize: 500 },
      onChunk,
    )

    expect(mocks.selectLimit).toHaveBeenCalledWith(500)
    expect(mocks.selectOffset).not.toHaveBeenCalled()
  })

  // The following three tests use the REAL `chunkById` (via
  // `vi.importActual`, see `actualChunkById` above), driven off
  // `mocks.selectRowsQueue` preset batches, so they prove the actual
  // stop/continue contract rather than a hand-rolled re-implementation of it.

  test("offsets only the first query; keyset queries after it carry no offset", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    const firstBatch = Array.from({ length: 3 }, (_, i) => ({
      id: `ci-${i + 1}`,
    }))
    const secondBatch = [{ id: "ci-4" }]
    mocks.selectRowsQueue = [firstBatch, secondBatch]
    mocks.chunkById.mockImplementation(actualChunkById)
    const onChunk = vi.fn().mockResolvedValue(undefined)

    await broadcastService.forEachAudienceChunk(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
        chunkSize: 3,
        audienceRange: { offset: 50, size: null },
      },
      onChunk,
    )

    expect(mocks.selectOffset).toHaveBeenCalledTimes(1)
    expect(mocks.selectOffset).toHaveBeenCalledWith(50)
    expect(onChunk).toHaveBeenCalledTimes(2)
  })

  test("caps each query's limit by the remaining window size", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    const firstBatch = Array.from({ length: 3 }, (_, i) => ({
      id: `ci-${i + 1}`,
    }))
    const secondBatch = [{ id: "ci-4" }, { id: "ci-5" }]
    mocks.selectRowsQueue = [firstBatch, secondBatch]
    mocks.chunkById.mockImplementation(actualChunkById)
    const onChunk = vi.fn().mockResolvedValue(undefined)

    await broadcastService.forEachAudienceChunk(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
        chunkSize: 3,
        audienceRange: { offset: 0, size: 5 },
      },
      onChunk,
    )

    expect(mocks.selectLimit).toHaveBeenNthCalledWith(1, 3)
    expect(mocks.selectLimit).toHaveBeenNthCalledWith(2, 2)
  })

  test("stops exactly at the window end when the window is an exact multiple of chunkSize", async () => {
    mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
    const firstBatch = Array.from({ length: 3 }, (_, i) => ({
      id: `ci-${i + 1}`,
    }))
    const secondBatch = Array.from({ length: 3 }, (_, i) => ({
      id: `ci-${i + 4}`,
    }))
    // A third batch that must never be fetched: without the explicit
    // remaining-based stop, `chunkById`'s own `records.length < chunkSize`
    // check would keep going past the window (both batches equal chunkSize).
    const thirdBatch = [{ id: "ci-7" }]
    mocks.selectRowsQueue = [firstBatch, secondBatch, thirdBatch]
    mocks.chunkById.mockImplementation(actualChunkById)
    const onChunk = vi.fn().mockResolvedValue(undefined)

    await broadcastService.forEachAudienceChunk(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
        chunkSize: 3,
        audienceRange: { offset: 0, size: 6 },
      },
      onChunk,
    )

    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenNthCalledWith(1, firstBatch)
    expect(onChunk).toHaveBeenNthCalledWith(2, secondBatch)
  })
})

describe("broadcastService.findByIdForResponse", () => {
  test("returns the legacy broadcast params when there are no targets", async () => {
    mocks.findBroadcast.mockResolvedValue({
      id: "broadcast-1",
      integrationWhatsappId: "wa-1",
      templateId: "template-1",
      templateData: { body: ["legacy"] },
      targets: [],
    })

    const row = await broadcastService.findByIdForResponse({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      inboxId: "inbox-any",
    })

    expect(row).toEqual({
      id: "broadcast-1",
      integrationWhatsappId: "wa-1",
      templateData: { body: ["legacy"] },
    })
  })

  test("returns the params of the target matching the contact's inbox", async () => {
    mocks.findBroadcast.mockResolvedValue({
      id: "broadcast-1",
      integrationWhatsappId: null,
      templateId: null,
      templateData: null,
      targets: [
        {
          inboxId: "inbox-a",
          templateId: "t-a",
          templateData: { body: ["A"] },
        },
        {
          inboxId: "inbox-b",
          templateId: "t-b",
          templateData: { body: ["B"] },
        },
      ],
    })

    const row = await broadcastService.findByIdForResponse({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      inboxId: "inbox-b",
    })

    expect(row).toEqual({
      id: "broadcast-1",
      integrationWhatsappId: null,
      templateData: { body: ["B"] },
    })
  })

  test("returns null params when the contact's inbox is not a target", async () => {
    mocks.findBroadcast.mockResolvedValue({
      id: "broadcast-1",
      integrationWhatsappId: null,
      templateId: null,
      templateData: null,
      targets: [
        {
          inboxId: "inbox-a",
          templateId: "t-a",
          templateData: { body: ["A"] },
        },
      ],
    })

    const row = await broadcastService.findByIdForResponse({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
      inboxId: "inbox-z",
    })

    expect(row?.templateData).toBeNull()
  })

  test("returns null when the broadcast is missing", async () => {
    mocks.findBroadcast.mockResolvedValue(undefined)

    await expect(
      broadcastService.findByIdForResponse({
        workspaceId: "ws-1",
        broadcastId: "missing",
        inboxId: "inbox-a",
      }),
    ).resolves.toBeNull()
  })
})

describe("broadcastService.claimDispatchWindow", () => {
  test("returns true and sets the TTL when the lease is free", async () => {
    mocks.setIfAbsent.mockResolvedValue(true)

    const claimed = await broadcastService.claimDispatchWindow({
      broadcastId: "broadcast-1",
    })

    expect(claimed).toBe(true)
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      "broadcast:broadcast-1:dispatch-window",
      true,
      55_000,
    )
  })

  test("returns false while the previous batch's lease is still live", async () => {
    mocks.setIfAbsent.mockResolvedValue(false)

    const claimed = await broadcastService.claimDispatchWindow({
      broadcastId: "broadcast-1",
    })

    expect(claimed).toBe(false)
  })

  test("fails open (true) and logs with the err key when Redis throws", async () => {
    const error = new Error("redis unavailable")
    mocks.setIfAbsent.mockRejectedValue(error)

    const claimed = await broadcastService.claimDispatchWindow({
      broadcastId: "broadcast-1",
    })

    expect(claimed).toBe(true)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, broadcastId: "broadcast-1" }),
      expect.any(String),
    )
  })
})

describe("broadcastService.claimDispatchWindow lease timing", () => {
  test("refuses a claim inside the 55s lease and allows one again once it expires", async () => {
    vi.useFakeTimers()
    try {
      // In-memory `SET NX PX` fake: a key is claimable again only once its
      // recorded expiry has passed, mirroring casStore.setIfAbsent's TTL
      // semantics without a real Redis.
      const leaseExpiryByKey = new Map<string, number>()
      mocks.setIfAbsent.mockImplementation(
        (key: string, _value: unknown, ttlMs: number) => {
          const now = Date.now()
          const expiresAt = leaseExpiryByKey.get(key)
          if (expiresAt != null && expiresAt > now) {
            return Promise.resolve(false)
          }
          leaseExpiryByKey.set(key, now + ttlMs)
          return Promise.resolve(true)
        },
      )

      const t0 = await broadcastService.claimDispatchWindow({
        broadcastId: "broadcast-1",
      })
      expect(t0).toBe(true)

      vi.advanceTimersByTime(54_999)
      const beforeExpiry = await broadcastService.claimDispatchWindow({
        broadcastId: "broadcast-1",
      })
      expect(beforeExpiry).toBe(false)

      vi.advanceTimersByTime(1)
      const atExpiry = await broadcastService.claimDispatchWindow({
        broadcastId: "broadcast-1",
      })
      expect(atExpiry).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
