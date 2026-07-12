import { beforeEach, describe, expect, test, vi } from "vitest"

const getBroadcastContactIdsPage = vi.fn()
const getSequenceContactIdsPage = vi.fn()
const bulkAttachToContacts = vi.fn()

vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: {
    getContactIdsPage: (...args: unknown[]) =>
      getBroadcastContactIdsPage(...args),
  },
  sequenceAnalyticsService: {
    getContactIdsPage: (...args: unknown[]) =>
      getSequenceContactIdsPage(...args),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    bulkAttachToContacts: (...args: unknown[]) => bulkAttachToContacts(...args),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  loopableItemsCount: 2,
}))

const { handleBulkTagContacts } = await import(
  "../src/default/handlers/bulk-tag-contacts"
)

describe("handleBulkTagContacts", () => {
  beforeEach(() => {
    getBroadcastContactIdsPage.mockReset()
    getSequenceContactIdsPage.mockReset()
    bulkAttachToContacts.mockReset()
  })

  test("dispatches broadcast pages and forwards exclusions", async () => {
    getBroadcastContactIdsPage.mockResolvedValueOnce([
      { id: "1", contactId: "contact-1" },
    ])

    await handleBulkTagContacts({
      source: "broadcast",
      workspaceId: "workspace-1",
      requestedUserId: "user-1",
      broadcastId: "broadcast-1",
      eventType: "message:sent",
      tagIds: ["tag-1"],
      excludedContactIds: ["contact-2"],
    })

    expect(getBroadcastContactIdsPage).toHaveBeenCalledWith({
      broadcastId: "broadcast-1",
      eventType: "message:sent",
      cursor: null,
      limit: 2,
      excludeContactIds: ["contact-2"],
    })
    expect(getSequenceContactIdsPage).not.toHaveBeenCalled()
    expect(bulkAttachToContacts).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      tagIds: ["tag-1"],
      accessScope: undefined,
      recoverUnsyncedPairs: false,
    })
  })

  test("dispatches sequence step pages with workspace and step scope", async () => {
    getSequenceContactIdsPage.mockResolvedValueOnce([
      { id: "dispatch-1", contactId: "contact-1" },
    ])

    await handleBulkTagContacts({
      source: "sequenceStep",
      workspaceId: "workspace-1",
      requestedUserId: "user-1",
      sequenceId: "sequence-1",
      stepId: "step-1",
      eventType: "message:failed",
      tagIds: ["tag-1"],
      excludedContactIds: [],
    })

    expect(getSequenceContactIdsPage).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sequenceId: "sequence-1",
      stepId: "step-1",
      eventType: "message:failed",
      cursor: null,
      limit: 2,
      excludeContactIds: [],
    })
    expect(getBroadcastContactIdsPage).not.toHaveBeenCalled()
  })

  test("dedupes repeated contact ids within a page", async () => {
    getSequenceContactIdsPage.mockResolvedValueOnce([
      { id: "dispatch-1", contactId: "contact-1" },
      { id: "dispatch-2", contactId: "contact-1" },
    ])
    getSequenceContactIdsPage.mockResolvedValueOnce([])

    await handleBulkTagContacts({
      source: "sequenceStep",
      workspaceId: "workspace-1",
      requestedUserId: "user-1",
      sequenceId: "sequence-1",
      stepId: "step-1",
      eventType: "message:sent",
      tagIds: ["tag-1", "tag-2"],
      excludedContactIds: [],
      restrictToAssignedUserId: "assignee-1",
    })

    expect(bulkAttachToContacts).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      tagIds: ["tag-1", "tag-2"],
      accessScope: {
        restrictToAssignedUserId: "assignee-1",
        canViewEmailAndPhone: true,
      },
      recoverUnsyncedPairs: false,
    })
  })

  test("enables unsynced pair recovery on BullMQ retry attempts", async () => {
    getBroadcastContactIdsPage.mockResolvedValueOnce([
      { id: "1", contactId: "contact-1" },
    ])

    await handleBulkTagContacts(
      {
        source: "broadcast",
        workspaceId: "workspace-1",
        requestedUserId: "user-1",
        broadcastId: "broadcast-1",
        eventType: "message:sent",
        tagIds: ["tag-1"],
        excludedContactIds: [],
      },
      { attemptsMade: 1 },
    )

    expect(bulkAttachToContacts).toHaveBeenCalledWith(
      expect.objectContaining({ recoverUnsyncedPairs: true }),
    )
  })
})
