import { macAnalyticsService } from "@chatbotx.io/analytics"
import { db } from "@chatbotx.io/database/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { contactService } from "../src/contact"
import { messageCleanupService } from "../src/message-cleanup"
import { quotaEnforcementService } from "../src/quota-enforcement/service"
import { userQuotaService } from "../src/user-quota/service"
import { workspaceService } from "../src/workspace/service"

type FakeContact = {
  id: string
  workspaceId: string
  contactInboxes: {
    id: string
    inboxId: string
    sourceId: string
    firstInteractionAt: Date | null
    createdAt: Date
  }[]
}

const makeContact = (
  index: number,
  inboxCount = 1,
  firstInteractionAt: Date | null = null,
): FakeContact => ({
  id: `contact-${index}`,
  workspaceId: "ws-1",
  contactInboxes: Array.from({ length: inboxCount }, (_, inboxIndex) => ({
    id: `ci-${index}-${inboxIndex}`,
    inboxId: "inbox-1",
    sourceId: `source-${index}-${inboxIndex}`,
    firstInteractionAt,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  })),
})

const stubConversations = (rows: { id: string; contactId: string }[]): void => {
  vi.spyOn(db, "select").mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  } as never)
}

describe("contactService.delete", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("chunks deletes and records tombstones atomically per chunk", async () => {
    const contacts = Array.from({ length: 120 }, (_, i) => makeContact(i))
    vi.spyOn(db.query.contactModel, "findMany").mockResolvedValue(
      contacts as never,
    )
    stubConversations([{ id: "conv-1", contactId: "contact-0" }])

    const callOrder: string[] = []
    const record = vi
      .spyOn(messageCleanupService, "record")
      .mockImplementation(() => {
        callOrder.push("record")
        return Promise.resolve()
      })
    const invalidate = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue()
    const transaction = vi
      .spyOn(db, "transaction")
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        await fn({
          delete: () => ({
            where: () => {
              callOrder.push("delete")
              return Promise.resolve()
            },
          }),
        })
      })

    const result = await contactService.delete({
      workspaceId: "ws-1",
      ids: contacts.map((c) => c.id),
    })

    // 120 contacts / 50 per chunk = 3 transactions, tombstones written before
    // the contact delete inside each one.
    expect(transaction).toHaveBeenCalledTimes(3)
    expect(record).toHaveBeenCalledTimes(3)
    expect(callOrder).toEqual([
      "record",
      "delete",
      "record",
      "delete",
      "record",
      "delete",
    ])

    const chunkSizes = record.mock.calls.map(([props]) => props.entries.length)
    expect(chunkSizes).toEqual([50, 50, 20])

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: contacts.map((c) => c.id),
    })
    expect(result).toHaveLength(120)
  })

  test("tombstone entries snapshot inbox identity, conversations, and sinceTime", async () => {
    const firstInteractionAt = new Date("2026-02-01T00:00:00Z")
    const withInteraction = makeContact(0, 2, firstInteractionAt)
    const withoutInboxes: FakeContact = {
      id: "contact-1",
      workspaceId: "ws-1",
      contactInboxes: [],
    }
    vi.spyOn(db.query.contactModel, "findMany").mockResolvedValue([
      withInteraction,
      withoutInboxes,
    ] as never)
    stubConversations([
      { id: "conv-a", contactId: "contact-0" },
      { id: "conv-b", contactId: "contact-0" },
    ])

    const record = vi.spyOn(messageCleanupService, "record").mockResolvedValue()
    vi.spyOn(contactService, "invalidate").mockResolvedValue()
    vi.spyOn(db, "transaction").mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        await fn({
          delete: () => ({ where: () => Promise.resolve() }),
        })
      },
    )

    await contactService.delete({
      workspaceId: "ws-1",
      ids: ["contact-0", "contact-1"],
    })

    // A contact without inboxes leaves no tombstone; each inbox of the other
    // contact snapshots the shared conversation list and its own sinceTime.
    expect(record).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      entries: [
        {
          contactId: "contact-0",
          contactInboxId: "ci-0-0",
          inboxId: "inbox-1",
          sourceId: "source-0-0",
          conversationIds: ["conv-a", "conv-b"],
          sinceTime: firstInteractionAt,
        },
        {
          contactId: "contact-0",
          contactInboxId: "ci-0-1",
          inboxId: "inbox-1",
          sourceId: "source-0-1",
          conversationIds: ["conv-a", "conv-b"],
          sinceTime: firstInteractionAt,
        },
      ],
      tx: expect.anything(),
    })
  })

  test("falls back to the inbox createdAt when there is no first interaction", async () => {
    const contactRow = makeContact(0, 1, null)
    vi.spyOn(db.query.contactModel, "findMany").mockResolvedValue([
      contactRow,
    ] as never)
    stubConversations([])

    const record = vi.spyOn(messageCleanupService, "record").mockResolvedValue()
    vi.spyOn(contactService, "invalidate").mockResolvedValue()
    vi.spyOn(db, "transaction").mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        await fn({
          delete: () => ({ where: () => Promise.resolve() }),
        })
      },
    )

    await contactService.delete({ workspaceId: "ws-1", ids: ["contact-0"] })

    const [props] = record.mock.calls[0] ?? []
    expect(props?.entries[0]?.sinceTime).toEqual(
      new Date("2026-01-01T00:00:00Z"),
    )
    expect(props?.entries[0]?.conversationIds).toEqual([])
  })

  test("returns early without touching the database when nothing matches", async () => {
    vi.spyOn(db.query.contactModel, "findMany").mockResolvedValue([] as never)
    const select = vi.spyOn(db, "select")
    const transaction = vi.spyOn(db, "transaction")
    const record = vi.spyOn(messageCleanupService, "record")

    const result = await contactService.delete({
      workspaceId: "ws-1",
      ids: ["contact-404"],
    })

    expect(result).toEqual([])
    expect(select).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })
})

describe("contactService.delete — quota release", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const stubDelete = (contacts: FakeContact[]) => {
    vi.spyOn(db.query.contactModel, "findMany").mockResolvedValue(
      contacts as never,
    )
    stubConversations([])
    vi.spyOn(messageCleanupService, "record").mockResolvedValue()
    vi.spyOn(contactService, "invalidate").mockResolvedValue()
    vi.spyOn(db, "transaction").mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        await fn({
          delete: () => ({ where: () => Promise.resolve() }),
        })
      },
    )
  }

  test("releases contacts for every deleted contact", async () => {
    const contacts = [makeContact(0), makeContact(1)]
    stubDelete(contacts)
    vi.spyOn(workspaceService, "find").mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
    } as never)
    vi.spyOn(userQuotaService, "getForUser").mockResolvedValue({
      periodStart: null,
    } as never)
    const releaseBy = vi
      .spyOn(quotaEnforcementService, "releaseBy")
      .mockResolvedValue()

    await contactService.delete({
      workspaceId: "ws-1",
      ids: contacts.map((c) => c.id),
    })

    expect(releaseBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "contacts",
      count: 2,
    })
  })

  test("does not release mac when the owner has no billing period", async () => {
    const contacts = [makeContact(0)]
    stubDelete(contacts)
    vi.spyOn(workspaceService, "find").mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
    } as never)
    vi.spyOn(userQuotaService, "getForUser").mockResolvedValue({
      periodStart: null,
    } as never)
    const releaseBy = vi
      .spyOn(quotaEnforcementService, "releaseBy")
      .mockResolvedValue()

    await contactService.delete({ workspaceId: "ws-1", ids: ["contact-0"] })

    expect(releaseBy).not.toHaveBeenCalledWith(
      expect.objectContaining({ metric: "mac" }),
    )
  })

  test("releases mac only for contacts active in the current period", async () => {
    const contactA = makeContact(0)
    const contactB = makeContact(1)
    stubDelete([contactA, contactB])
    vi.spyOn(workspaceService, "find").mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
    } as never)
    vi.spyOn(userQuotaService, "getForUser").mockResolvedValue({
      periodStart: new Date("2026-07-01T00:00:00Z"),
    } as never)
    // Only contact 0's contactInbox is MAC-active this period.
    vi.spyOn(macAnalyticsService, "getActiveContactInboxIds").mockResolvedValue(
      new Set([contactA.contactInboxes[0]?.id as string]),
    )
    const releaseBy = vi
      .spyOn(quotaEnforcementService, "releaseBy")
      .mockResolvedValue()

    await contactService.delete({
      workspaceId: "ws-1",
      ids: [contactA.id, contactB.id],
    })

    expect(releaseBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "contacts",
      count: 2,
    })
    expect(releaseBy).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "mac",
      count: 1,
    })
  })

  test("does not release mac when no deleted contact was active this period", async () => {
    const contacts = [makeContact(0)]
    stubDelete(contacts)
    vi.spyOn(workspaceService, "find").mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
    } as never)
    vi.spyOn(userQuotaService, "getForUser").mockResolvedValue({
      periodStart: new Date("2026-07-01T00:00:00Z"),
    } as never)
    vi.spyOn(macAnalyticsService, "getActiveContactInboxIds").mockResolvedValue(
      new Set(),
    )
    const releaseBy = vi
      .spyOn(quotaEnforcementService, "releaseBy")
      .mockResolvedValue()

    await contactService.delete({ workspaceId: "ws-1", ids: ["contact-0"] })

    expect(releaseBy).not.toHaveBeenCalledWith(
      expect.objectContaining({ metric: "mac" }),
    )
  })

  test("does not throw and still returns deleted contacts when release fails", async () => {
    const contacts = [makeContact(0)]
    stubDelete(contacts)
    vi.spyOn(workspaceService, "find").mockRejectedValue(new Error("db down"))
    const releaseBy = vi.spyOn(quotaEnforcementService, "releaseBy")

    const result = await contactService.delete({
      workspaceId: "ws-1",
      ids: ["contact-0"],
    })

    expect(result).toHaveLength(1)
    expect(releaseBy).not.toHaveBeenCalled()
  })
})
