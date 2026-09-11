import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirstBroadcast = vi.fn()
const selectHighestCopy = vi.fn()
const findManyBroadcastTarget = vi.fn()
const broadcastInsert = vi.fn()
const targetInsert = vi.fn()
const pruneFilter = vi.fn()

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: vi.fn() },
  sequenceAnalyticsService: { getContacts: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findFirst: (...args: unknown[]) => findFirstBroadcast(...args),
      },
    },
    // Clone name numbering: `select({ highestCopy }).from().where()`.
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => selectHighestCopy(...args),
      }),
    }),
    transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        query: {
          broadcastTargetModel: {
            findMany: (...args: unknown[]) => findManyBroadcastTarget(...args),
          },
        },
        insert: () => ({
          values: (vals: unknown) => {
            // The per-page target rows are inserted as an array; the broadcast
            // row as a single object that is then `.returning()`-ed.
            if (Array.isArray(vals)) {
              targetInsert(vals)
              return Promise.resolve()
            }
            broadcastInsert(vals)
            return {
              returning: () =>
                Promise.resolve([{ id: "clone-1", ...(vals as object) }]),
            }
          },
        }),
      }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gt: vi.fn(),
  ilike: (a: unknown, b: unknown) => ({ __ilike: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
  isNotNull: (a: unknown) => ({ __isNotNull: a }),
  isNull: (a: unknown) => ({ __isNull: a }),
  or: (...args: unknown[]) => ({ __or: args }),
  sql: (...args: unknown[]) => ({ __sql: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
  broadcastTargetModel: {},
  inboxModel: {},
  flowModel: {},
  contactsOnBroadcastsModel: {},
  contactInboxModel: {},
  contactModel: {},
  conversationModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
  messengerMessageTemplateModel: {},
  whatsappMessageTemplateModel: {},
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: (...args: unknown[]) => pruneFilter(...args),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: (value: string) => `%${value}%`,
  escapeLikePattern: (value: string) => value,
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

const { broadcastService } = await import("../src/broadcast/service")

const CONTACT_FILTER = {
  operator: "and",
  conditions: [{ field: "fullName", operator: "contains", value: "titan" }],
}

const source = {
  id: "src-1",
  workspaceId: "ws-1",
  name: "Promo",
  channel: "messenger",
  subaction: "messengerTemplateMessage",
  targetMode: "targets",
  flowId: null,
  templateId: null,
  templateData: null,
  integrationWhatsappId: null,
  integrationMessengerId: null,
  contactFilter: CONTACT_FILTER,
  schedulesType: "future",
  schedulesAt: new Date("2030-01-01T09:00:00.000Z"),
  status: "sent",
  deletedAt: null,
}

const clone = (input?: {
  workspaceId?: string
  broadcastId?: string
  canViewEmailAndPhone?: boolean
}) =>
  broadcastService.cloneBroadcast({
    workspaceId: input?.workspaceId ?? "ws-1",
    broadcastId: input?.broadcastId ?? "src-1",
    canViewEmailAndPhone: input?.canViewEmailAndPhone ?? true,
  })

beforeEach(() => {
  findFirstBroadcast.mockReset().mockResolvedValue(source)
  // No existing copies by default → next number is 1.
  selectHighestCopy.mockReset().mockResolvedValue([{ highestCopy: 0 }])
  findManyBroadcastTarget.mockReset().mockResolvedValue([])
  broadcastInsert.mockReset()
  targetInsert.mockReset()
  pruneFilter.mockReset().mockImplementation((filter: unknown) => filter)
})

describe("broadcastService.cloneBroadcast", () => {
  test("creates a draft copy carrying every config column and the schedule", async () => {
    const result = await clone()

    expect(broadcastInsert).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Promo (Copy 1)",
      status: "draft",
      channel: "messenger",
      subaction: "messengerTemplateMessage",
      targetMode: "targets",
      flowId: null,
      templateId: null,
      templateData: null,
      integrationWhatsappId: null,
      integrationMessengerId: null,
      contactFilter: CONTACT_FILTER,
      schedulesType: "future",
      schedulesAt: source.schedulesAt,
    })
    expect(result.id).toBe("clone-1")
  })

  test("numbers the copy after the highest existing (Copy N) of the same base", async () => {
    selectHighestCopy.mockResolvedValue([{ highestCopy: 2 }])

    await clone()

    expect(broadcastInsert.mock.calls[0][0].name).toBe("Promo (Copy 3)")
  })

  test("strips an existing (Copy N) so a clone of a clone keeps one suffix", async () => {
    findFirstBroadcast.mockResolvedValue({
      ...source,
      name: "Promo (Copy 2)",
    })
    selectHighestCopy.mockResolvedValue([{ highestCopy: 2 }])

    await clone()

    expect(broadcastInsert.mock.calls[0][0].name).toBe("Promo (Copy 3)")
  })

  test("prunes email/phone filter conditions the actor cannot view", async () => {
    pruneFilter.mockReturnValue({ operator: "and", conditions: [] })

    await clone({ canViewEmailAndPhone: false })

    expect(pruneFilter).toHaveBeenCalledWith(CONTACT_FILTER, false)
    expect(broadcastInsert.mock.calls[0][0].contactFilter).toEqual({
      operator: "and",
      conditions: [],
    })
  })

  test("copies the source's per-page target rows onto the new draft", async () => {
    findManyBroadcastTarget.mockResolvedValue([
      {
        inboxId: "inbox-a",
        flowId: null,
        templateId: "tpl-a",
        templateData: { body: [{ text: "A" }] },
      },
      {
        inboxId: "inbox-b",
        flowId: "flow-b",
        templateId: null,
        templateData: null,
      },
    ])

    await clone()

    expect(targetInsert).toHaveBeenCalledWith([
      {
        broadcastId: "clone-1",
        inboxId: "inbox-a",
        flowId: null,
        templateId: "tpl-a",
        templateData: { body: [{ text: "A" }] },
      },
      {
        broadcastId: "clone-1",
        inboxId: "inbox-b",
        flowId: "flow-b",
        templateId: null,
        templateData: null,
      },
    ])
  })

  test("skips the target insert when the source has no pages", async () => {
    await clone()
    expect(targetInsert).not.toHaveBeenCalled()
  })

  test("throws when the source broadcast is missing or not in this workspace", async () => {
    findFirstBroadcast.mockResolvedValue(undefined)
    await expect(clone()).rejects.toThrow("Broadcast not found")
    expect(broadcastInsert).not.toHaveBeenCalled()
  })
})
