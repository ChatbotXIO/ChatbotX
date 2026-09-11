import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  getContacts: vi.fn(),
  findManyByIds: vi.fn(),
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
  },
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({
    inArray: [column, values],
  }),
  isNull: (column: unknown) => ({ isNull: column }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "broadcast.id", workspaceId: "broadcast.workspaceId" },
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

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  escapeLikePattern: (value: string) => value,
  getPaginationWithDefaults: vi.fn(),
  likeContains: (value: string) => `%${value}%`,
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

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: { getContacts: mocks.getContacts },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findManyByIds: mocks.findManyByIds },
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

const { broadcastService } = await import("../src/broadcast/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.select.mockReturnValue({ from: mocks.from })
  mocks.from.mockReturnValue({ where: mocks.where })
})

describe("broadcastService.listContactsPage", () => {
  test("throws not-found when the broadcast doesn't exist in this workspace", async () => {
    mocks.where.mockResolvedValueOnce([])

    await expect(
      broadcastService.listContactsPage({
        workspaceId: "ws-1",
        broadcastId: "b-1",
        eventType: "message:sent",
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow("Broadcast not found")

    expect(mocks.getContacts).not.toHaveBeenCalled()
  })

  test("returns an empty page without a contact-inbox lookup when there are no matching recipients", async () => {
    mocks.where.mockResolvedValueOnce([{ id: "b-1" }])
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: [],
      contactEventMap: new Map(),
      total: 0,
    })

    const result = await broadcastService.listContactsPage({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      eventType: "message:sent",
      page: 1,
      perPage: 20,
    })

    expect(result).toEqual({ data: [], total: 0, pageCount: 0 })
    expect(mocks.findManyByIds).not.toHaveBeenCalled()
  })

  test("joins recipient events with contact-inbox details, defaulting a missing conversationId to an empty string", async () => {
    mocks.where.mockResolvedValueOnce([{ id: "b-1" }])
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1", "ci-no-conversation"],
      contactEventMap: new Map([
        [
          "ci-1",
          {
            contactId: "contact-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
            errorContent: null,
          },
        ],
        [
          "ci-no-conversation",
          {
            contactId: "contact-2",
            occurredAt: "2026-01-02T00:00:00.000Z",
            errorContent: null,
          },
        ],
      ]),
      total: 2,
    })
    mocks.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        conversation: { id: "conv-1" },
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          avatar: null,
        },
      },
      {
        id: "ci-no-conversation",
        sourceId: "src-2",
        channel: "whatsapp",
        conversation: null,
        contact: {
          id: "contact-2",
          firstName: "Bea",
          lastName: null,
          fullName: "Bea",
          avatar: null,
        },
      },
    ])

    const result = await broadcastService.listContactsPage({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      eventType: "message:sent",
      page: 1,
      perPage: 20,
    })

    // Both rows are kept — a contact inbox with no conversation still
    // belongs in the page; `data.length` must not disagree with `total`.
    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.pageCount).toBe(1)
    expect(result.data[0]).toMatchObject({
      contactId: "contact-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
    })
    expect(result.data[1]).toMatchObject({
      contactId: "contact-2",
      contactInboxId: "ci-no-conversation",
      conversationId: "",
    })
  })

  test("drops a recipient whose contact-inbox no longer resolves, leaving pageCount driven by the DB total", async () => {
    mocks.where.mockResolvedValueOnce([{ id: "b-1" }])
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1", "ci-gone"],
      contactEventMap: new Map([
        [
          "ci-1",
          {
            contactId: "contact-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
            errorContent: null,
          },
        ],
        [
          "ci-gone",
          {
            contactId: "contact-gone",
            occurredAt: "2026-01-02T00:00:00.000Z",
            errorContent: null,
          },
        ],
      ]),
      total: 2,
    })
    // `getContacts` scopes by `Broadcast.workspaceId` while `findManyByIds`
    // scopes by `Contact.workspaceId`, so a contact deleted or moved out of
    // the workspace after the send is counted in `total` but has no row here.
    mocks.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        conversation: { id: "conv-1" },
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: null,
          fullName: "Ada",
          avatar: null,
        },
      },
    ])

    const result = await broadcastService.listContactsPage({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      eventType: "message:sent",
      page: 1,
      perPage: 20,
    })

    // Unresolvable rows are dropped rather than emitted as nulls, and
    // `pageCount` stays anchored to the DB total — so `data.length` can be
    // shorter than the total implies.
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(2)
    expect(result.pageCount).toBe(1)
    expect(result.data[0]).toMatchObject({
      contactId: "contact-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
    })
  })

  test("threads workspaceId through the existence check, analytics lookup, and contact-inbox fetch", async () => {
    mocks.where.mockResolvedValueOnce([{ id: "b-1" }])
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1"],
      contactEventMap: new Map([
        [
          "ci-1",
          {
            contactId: "contact-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
            errorContent: null,
          },
        ],
      ]),
      total: 1,
    })
    mocks.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        conversation: { id: "conv-1" },
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: null,
          fullName: "Ada",
          avatar: null,
        },
      },
    ])

    await broadcastService.listContactsPage({
      workspaceId: "ws-1",
      broadcastId: "b-1",
      eventType: "message:sent",
      page: 1,
      perPage: 20,
    })

    expect(mocks.getContacts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["ci-1"],
    })
  })
})
