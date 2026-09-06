import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// broadcastService — the prepare/process-broadcast-contacts surface moved
// from the schedule handlers: listDueScheduled, listSendingAwaitingHandoff,
// findScheduledForPrepare, resolveTemplateIntegrationMessengerId,
// insertRecipients, promoteAfterPrepare (the resumeCount CAS), listSendableById,
// listPendingRecipients, markContactFailed. Mirrors the mock scaffolding in
// broadcast-service-lifecycle.test.ts.
// ---------------------------------------------------------------------------

const findManyBroadcast = vi.fn()
const findFirstBroadcast = vi.fn()
const findFirstTemplate = vi.fn()
const findManyContactsOnBroadcasts = vi.fn()
const updateReturning = vi.fn()
const updateWhere = vi.fn()
const insertOnConflictDoNothing = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
        findFirst: (...args: unknown[]) => findFirstBroadcast(...args),
      },
      messengerMessageTemplateModel: {
        findFirst: (...args: unknown[]) => findFirstTemplate(...args),
      },
      contactsOnBroadcastsModel: {
        findMany: (...args: unknown[]) => findManyContactsOnBroadcasts(...args),
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateWhere({ values, condition })
          return { returning: () => updateReturning({ values, condition }) }
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => ({
        onConflictDoNothing: () => insertOnConflictDoNothing({ values }),
      }),
    }),
    select: () => ({ from: () => ({ where: () => [] }) }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: (a: unknown) => ({ __isNotNull: a }),
  isNull: (a: unknown) => ({ __isNull: a }),
  or: (...args: unknown[]) => ({ __or: args }),
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({
      mapWith: (_fn: unknown) => ({ __sql: true }),
    }),
    { raw: vi.fn() },
  ),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "broadcast.id",
    workspaceId: "broadcast.workspaceId",
    status: "broadcast.status",
    handoffCompletedAt: "broadcast.handoffCompletedAt",
    resumeCount: "broadcast.resumeCount",
    deletedAt: "broadcast.deletedAt",
  },
  contactsOnBroadcastsModel: {
    broadcastId: "cob.broadcastId",
    contactId: "cob.contactId",
    deliveredAt: "cob.deliveredAt",
    failedAt: "cob.failedAt",
    errorContent: "cob.errorContent",
  },
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
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(),
  likeContains: (value: string) => `%${value}%`,
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

const { broadcastService } = await import("../src/broadcast/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listDueScheduled", () => {
  test("returns id-only rows for scheduled broadcasts due at or before dueAt", async () => {
    findManyBroadcast.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.listDueScheduled({
      dueAt: new Date("2026-01-01T00:00:00Z"),
    })

    expect(result).toEqual([{ id: "b-1" }])
    expect(findManyBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ columns: { id: true } }),
    )
  })
})

describe("listSendingAwaitingHandoff", () => {
  test("returns sending broadcasts whose handoff has not completed", async () => {
    findManyBroadcast.mockResolvedValue([{ id: "b-1" }])

    const result = await broadcastService.listSendingAwaitingHandoff()

    expect(result).toEqual([{ id: "b-1" }])
  })
})

describe("findScheduledForPrepare", () => {
  test("looks up the scheduled, non-deleted broadcast by id", async () => {
    const row = { id: "b-1", workspaceId: "ws-1", resumeCount: 0 }
    findFirstBroadcast.mockResolvedValue(row)

    const result = await broadcastService.findScheduledForPrepare({
      broadcastId: "b-1",
    })

    expect(result).toEqual(row)
  })
})

describe("resolveTemplateIntegrationMessengerId", () => {
  test("resolves the page id scoping through the nested integrationMessenger relation", async () => {
    findFirstTemplate.mockResolvedValue({ integrationMessengerId: "im-1" })

    const result = await broadcastService.resolveTemplateIntegrationMessengerId(
      { workspaceId: "ws-1", templateId: "t-1" },
    )

    expect(result).toBe("im-1")
    expect(findFirstTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "t-1",
          integrationMessenger: { workspaceId: "ws-1" },
        }),
      }),
    )
  })

  test("returns null when no template matches", async () => {
    findFirstTemplate.mockResolvedValue(undefined)

    const result = await broadcastService.resolveTemplateIntegrationMessengerId(
      { workspaceId: "ws-1", templateId: "missing" },
    )

    expect(result).toBeNull()
  })
})

describe("insertRecipients", () => {
  test("no-ops without an insert when recipients is empty", async () => {
    await broadcastService.insertRecipients({ recipients: [] })
    expect(insertOnConflictDoNothing).not.toHaveBeenCalled()
  })

  test("bulk-inserts recipient rows with onConflictDoNothing", async () => {
    await broadcastService.insertRecipients({
      recipients: [
        {
          broadcastId: "b-1",
          contactId: "c-1",
          contactInboxId: "ci-1",
          conversationId: "conv-1",
        },
      ],
    })

    expect(insertOnConflictDoNothing).toHaveBeenCalledTimes(1)
  })
})

describe("promoteAfterPrepare", () => {
  test("returns true when the CAS update affects a row", async () => {
    updateReturning.mockReturnValue([{ id: "b-1" }])

    const result = await broadcastService.promoteAfterPrepare({
      broadcastId: "b-1",
      status: "sending",
      contactCount: 5,
      promotionEpoch: 0,
    })

    expect(result).toBe(true)
  })

  test("returns false when the epoch CAS loses the race (resumeCount moved on)", async () => {
    updateReturning.mockReturnValue([])

    const result = await broadcastService.promoteAfterPrepare({
      broadcastId: "b-1",
      status: "sending",
      contactCount: 5,
      promotionEpoch: 0,
    })

    expect(result).toBe(false)
  })
})

describe("listSendableById", () => {
  test("returns the array of sending broadcasts matching the id", async () => {
    findManyBroadcast.mockResolvedValue([{ id: "b-1", status: "sending" }])

    const result = await broadcastService.listSendableById({
      broadcastId: "b-1",
    })

    expect(result).toEqual([{ id: "b-1", status: "sending" }])
    // Scoping relocated from process-broadcast-contacts.test.ts: only a
    // `sending`, non-deleted broadcast with this id is sendable.
    expect(findManyBroadcast).toHaveBeenCalledWith({
      where: {
        id: "b-1",
        status: "sending",
        deletedAt: { isNull: true },
      },
    })
  })
})

describe("listPendingRecipients", () => {
  test("passes the limit through and includes conversation/contactInbox relations", async () => {
    findManyContactsOnBroadcasts.mockResolvedValue([])

    await broadcastService.listPendingRecipients({
      broadcastId: "b-1",
      limit: 500,
    })

    // Scoping relocated from process-broadcast-contacts.test.ts: only unsent,
    // non-terminal-failed recipients are fetched.
    expect(findManyContactsOnBroadcasts).toHaveBeenCalledWith({
      where: {
        broadcastId: "b-1",
        sent: false,
        failedAt: { isNull: true },
      },
      with: { conversation: true, contactInbox: true },
      limit: 500,
    })
  })
})

describe("markContactFailed", () => {
  test("updates failedAt/errorContent scoped to (broadcastId, contactId)", async () => {
    await broadcastService.markContactFailed({
      broadcastId: "b-1",
      contactId: "c-1",
      reason: "missing conversation for flow send",
    })

    expect(updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          errorContent: "missing conversation for flow send",
        }),
      }),
    )
  })
})
