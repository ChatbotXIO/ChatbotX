import { beforeEach, describe, expect, test, vi } from "vitest"

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
  buildContactInboxContactFilterSQL: vi.fn(() => ({ RAW: "contact-filter" })),
  contactInboxInteractedWithin24hSQL: vi.fn(() => ({
    RAW: "recent-interaction",
  })),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
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
    workspaceId: "IntegrationMessenger.workspaceId",
  },
  integrationWhatsappModel: {
    id: "IntegrationWhatsapp.id",
    name: "IntegrationWhatsapp.name",
    workspaceId: "IntegrationWhatsapp.workspaceId",
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
      const isAudiencePreview = Boolean(selection?.contactId)
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
        limit: (limit: number) => {
          mocks.selectLimit(limit)
          if (isAudiencePreview) {
            return {
              offset: (offset: number) => {
                mocks.selectOffset(offset)
                return Promise.resolve(mocks.selectRows)
              },
            }
          }
          return Promise.resolve(mocks.selectRows)
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

const { broadcastService } = await import("../service")

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
  mocks.selectInnerJoin.mockReset()
  mocks.selectLeftJoin.mockReset()
  mocks.selectLimit.mockReset()
  mocks.selectOffset.mockReset()
  mocks.selectOrderBy.mockReset()
  mocks.selectWhere.mockReset()
  mocks.chunkById.mockReset()
  mocks.buildContactInboxContactFilterSQL.mockClear()
  mocks.contactInboxInteractedWithin24hSQL.mockClear()
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

  test("counts non-null sourceId DM conversations for a restricted TikTok scope", async () => {
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
          { __isNotNull: "Conversation.sourceId" },
        ],
      },
    ])
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

  test("joins the non-null sourceId DM conversation for a TikTok preview", async () => {
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
          { __isNotNull: "Conversation.sourceId" },
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
})

describe("broadcastService.getTemplateDetail", () => {
  test("returns null when the broadcast has no template", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: null,
      channel: "whatsapp",
    })

    const detail = await broadcastService.getTemplateDetail({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(detail).toBeNull()
    expect(mocks.selectWhere).not.toHaveBeenCalled()
  })

  test("loads a whatsapp template scoped through its integration workspace", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: "template-1",
      channel: "whatsapp",
    })
    mocks.selectRows = [
      {
        id: "template-1",
        name: "Order update",
        language: "en",
        category: "UTILITY",
        status: "APPROVED",
        components: [],
        integrationName: "WhatsApp Main",
      },
    ]

    const detail = await broadcastService.getTemplateDetail({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(detail).toEqual({
      ...mocks.selectRows[0],
      channel: "whatsapp",
    })
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["WhatsappMessageTemplate.id", "template-1"] },
        { __eq: ["IntegrationWhatsapp.workspaceId", "ws-1"] },
      ],
    })
  })

  test("loads a messenger template with its integration name", async () => {
    mocks.findBroadcast.mockResolvedValue({
      templateId: "template-2",
      channel: "messenger",
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
        integrationName: "Messenger Page",
      },
    ]

    const detail = await broadcastService.getTemplateDetail({
      workspaceId: "ws-1",
      broadcastId: "broadcast-1",
    })

    expect(detail).toEqual({
      ...mocks.selectRows[0],
      channel: "messenger",
    })
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["MessengerMessageTemplate.id", "template-2"] },
        { __eq: ["IntegrationMessenger.workspaceId", "ws-1"] },
      ],
    })
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
      templateId: "template-1",
      integrationWhatsappId: "whatsapp-1",
    })

    expect(name).toBe("Acme WhatsApp - order_confirmation")
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["WhatsappMessageTemplate.id", "template-1"] },
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
      templateId: "template-2",
      integrationMessengerId: "messenger-1",
    })

    expect(name).toBe("Acme Page - promo_update")
    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["MessengerMessageTemplate.id", "template-2"] },
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
      templateId: "template-3",
      integrationWhatsappId: "whatsapp-1",
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
      templateId: "template-4",
    })

    expect(mocks.selectWhere).toHaveBeenCalledWith({
      __and: [
        { __eq: ["WhatsappMessageTemplate.id", "template-4"] },
        { __eq: ["IntegrationWhatsapp.workspaceId", "ws-1"] },
      ],
    })
  })

  test("returns null when the template is not found in the workspace/page", async () => {
    mocks.selectRows = []

    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "whatsapp",
      templateId: "missing-template",
      integrationWhatsappId: "whatsapp-1",
    })

    expect(name).toBeNull()
  })

  test("returns null for channels that do not support template broadcasts", async () => {
    const name = await broadcastService.resolveTemplateBroadcastName({
      workspaceId: "ws-1",
      channel: "telegram",
      templateId: "template-5",
    })

    expect(name).toBeNull()
    expect(mocks.selectWhere).not.toHaveBeenCalled()
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
})
