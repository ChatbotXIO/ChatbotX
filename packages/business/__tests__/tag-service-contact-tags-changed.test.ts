// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Which tag paths publish `contactTagsChanged`, and for which contacts. The
// event must name only contacts whose links actually changed, and must never
// be published when the write failed.

const state = {
  oldTagIds: [] as { tagId: string }[],
  tags: [] as { id: string; name?: string }[],
}

const insertReturning = vi.fn()
const deleteReturning = vi.fn()
const insertBuilder = {
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: (...args: unknown[]) => insertReturning(...args),
}
insertBuilder.values.mockReturnValue(insertBuilder)
insertBuilder.onConflictDoNothing.mockReturnValue(insertBuilder)
const deleteBuilder = {
  where: vi.fn(),
  returning: (...args: unknown[]) => deleteReturning(...args),
}
deleteBuilder.where.mockReturnValue(deleteBuilder)

const selectDistinctRows = vi.fn()
const selectDistinctWhere = vi.fn()
const mockDb = {
  selectDistinct: vi.fn(() => ({
    from: () => ({
      where: (condition: unknown) => {
        selectDistinctWhere(condition)
        return selectDistinctRows()
      },
    }),
  })),
  insert: vi.fn(() => insertBuilder),
  delete: vi.fn(() => deleteBuilder),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(mockDb),
  ),
  query: {
    tagModel: { findMany: vi.fn(async () => state.tags) },
    contactsToTagsModel: { findMany: vi.fn(async () => state.oldTagIds) },
  },
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: mockDb,
  findOrFail: vi.fn(async () => ({})),
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (a: unknown) => ({ isNull: a }),
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
  notInArray: (a: unknown, b: unknown) => ({ notInArray: [a, b] }),
  notExists: (a: unknown) => ({ notExists: a }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: { id: "ci.id", contactId: "ci.contactId" },
  contactModel: { id: "c.id", workspaceId: "c.workspaceId" },
  conversationModel: {
    contactId: "conv.contactId",
    workspaceId: "conv.workspaceId",
  },
  contactsToTagsModel: { contactId: "ct.contactId", tagId: "ct.tagId" },
  contactToTagChannelModel: { contactInboxId: "x", tagId: "y" },
  tagChannelModel: {},
  tagModel: {
    id: "t.id",
    name: "t.name",
    workspaceId: "t.workspaceId",
    deletedAt: "t.deletedAt",
  },
}))

const listTagPreviewsByContactIds = vi.fn(async () => new Map())
vi.mock("@chatbotx.io/database/repositories/tag", () => ({
  tagRepository: { listTagPreviewsByContactIds },
}))

// The real publisher runs; only the Redis-backed broadcast is replaced.
const queueWorkspaceRealtimeEvent = vi.fn(async () => undefined)
vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent,
}))

type PublishedEvent = {
  eventType: string
  data: { contactIds: string[] }
}

/** Every event published, as `[workspaceId, contactIds]`. */
const published = (): [string, string[]][] =>
  queueWorkspaceRealtimeEvent.mock.calls.map((call) => {
    const [workspaceId, event] = call as unknown as [string, PublishedEvent]
    expect(event.eventType).toBe("contactTagsChanged")
    return [workspaceId, event.data.contactIds]
  })

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: vi.fn(async () => undefined),
  emitTagRemoved: vi.fn(async () => undefined),
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))
vi.mock("../src/folder/service", () => ({ folderService: {} }))
vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: {
    enqueueAttach: vi.fn(async () => undefined),
    enqueueAttachMany: vi.fn(async () => undefined),
    enqueueDetach: vi.fn(async () => undefined),
  },
}))
vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: {
    enqueueTagAppliedEvaluationsBulk: vi.fn(async () => undefined),
    enqueueTagAppliedEvaluationsForInbox: vi.fn(async () => undefined),
    isEligibleChannel: () => false,
  },
}))

const findManyByIds = vi.fn()
vi.mock("../src/contact", () => ({
  contactService: {
    findByIdOrFail: vi.fn(async () => ({ id: "c-1" })),
    findManyByIds,
    invalidate: vi.fn(async () => undefined),
  },
}))

const { tagService } = await import("../src/tag/service")

const contacts = (...ids: string[]) => ids.map((id) => ({ id }))

beforeEach(() => {
  vi.clearAllMocks()
  state.oldTagIds = []
  state.tags = [{ id: "tag-1", name: "alpha" }]
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.onConflictDoNothing.mockReturnValue(insertBuilder)
  deleteBuilder.where.mockReturnValue(deleteBuilder)
  insertReturning.mockResolvedValue([])
  deleteReturning.mockResolvedValue([])
  findManyByIds.mockReset()
})

describe("attachByNamesToContacts", () => {
  test("publishes only the contacts whose link was newly inserted", async () => {
    findManyByIds.mockResolvedValue(contacts("c-1", "c-2"))
    insertReturning.mockResolvedValue([{ contactId: "c-2", tagId: "tag-1" }])

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1", "c-2"],
      names: ["alpha"],
    })

    expect(published()).toEqual([["ws-1", ["c-2"]]])
  })

  test("publishes nothing when every pair already existed", async () => {
    findManyByIds.mockResolvedValue(contacts("c-1"))

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["alpha"],
    })

    expect(published()).toEqual([])
  })

  test("publishes nothing when the write fails", async () => {
    findManyByIds.mockResolvedValue(contacts("c-1"))
    insertReturning.mockRejectedValue(new Error("db down"))

    await expect(
      tagService.attachByNamesToContacts({
        workspaceId: "ws-1",
        contactIds: ["c-1"],
        names: ["alpha"],
      }),
    ).rejects.toThrow("db down")

    expect(published()).toEqual([])
  })

  test("a later chunk failing still publishes the chunk that committed", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `c-${index}`)
    findManyByIds
      .mockResolvedValueOnce(contacts(...ids.slice(0, 200)))
      .mockResolvedValueOnce(contacts(ids[200] as string))
    insertReturning
      .mockResolvedValueOnce([{ contactId: "c-0", tagId: "tag-1" }])
      .mockRejectedValueOnce(new Error("second chunk failed"))

    await expect(
      tagService.attachByNamesToContacts({
        workspaceId: "ws-1",
        contactIds: ids,
        names: ["alpha"],
      }),
    ).rejects.toThrow("second chunk failed")

    expect(published()).toEqual([["ws-1", ["c-0"]]])
  })
})

describe("detachByNamesFromContacts", () => {
  test("publishes only the contacts a DELETE actually unlinked", async () => {
    mockDb.query.tagModel.findMany.mockResolvedValueOnce([{ id: "tag-1" }])
    findManyByIds.mockResolvedValue(contacts("c-1", "c-2"))
    deleteReturning.mockResolvedValue([{ contactId: "c-1", tagId: "tag-1" }])

    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1", "c-2"],
      names: ["alpha"],
    })

    expect(published()).toEqual([["ws-1", ["c-1"]]])
  })

  test("publishes nothing when the DELETE fails", async () => {
    mockDb.query.tagModel.findMany.mockResolvedValueOnce([{ id: "tag-1" }])
    findManyByIds.mockResolvedValue(contacts("c-1"))
    deleteReturning.mockRejectedValue(new Error("db down"))

    await expect(
      tagService.detachByNamesFromContacts({
        workspaceId: "ws-1",
        contactIds: ["c-1"],
        names: ["alpha"],
      }),
    ).rejects.toThrow("db down")

    expect(published()).toEqual([])
  })
})

describe("replaceContactTagsByNames", () => {
  test("publishes the contact when tags were added or removed", async () => {
    state.oldTagIds = [{ tagId: "tag-old" }]

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha"],
    })

    expect(published()).toEqual([["ws-1", ["c-1"]]])
  })

  test("publishes nothing when the set is unchanged", async () => {
    state.oldTagIds = [{ tagId: "tag-1" }]

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha"],
    })

    expect(published()).toEqual([])
  })

  test("publishes nothing when the transaction fails", async () => {
    mockDb.transaction.mockRejectedValueOnce(new Error("rolled back"))

    await expect(
      tagService.replaceContactTagsByNames({
        workspaceId: "ws-1",
        contactId: "c-1",
        names: ["alpha"],
      }),
    ).rejects.toThrow("rolled back")

    expect(published()).toEqual([])
  })
})

describe("attachToContact / detachFromContact", () => {
  test("attachToContact publishes when a link was inserted", async () => {
    insertReturning.mockResolvedValue([{ tagId: "tag-1" }])

    await tagService.attachToContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
    })

    expect(published()).toEqual([["ws-1", ["c-1"]]])
  })

  test("attachToContact publishes nothing when the tag was already on the contact", async () => {
    await tagService.attachToContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
    })

    expect(published()).toEqual([])
  })

  test("attachToContact leaves publishing to a caller that owns the transaction", async () => {
    insertReturning.mockResolvedValue([{ tagId: "tag-1" }])

    await tagService.attachToContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
      tx: mockDb as never,
    })

    expect(published()).toEqual([])
  })

  test("detachFromContact publishes only when a link was removed", async () => {
    deleteReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ tagId: "tag-1" }])

    await tagService.detachFromContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
    })
    expect(published()).toEqual([])

    await tagService.detachFromContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
    })
    expect(published()).toEqual([["ws-1", ["c-1"]]])
  })

  test("detachFromContact publishes nothing when the DELETE fails", async () => {
    deleteReturning.mockRejectedValue(new Error("db down"))

    await expect(
      tagService.detachFromContact({
        workspaceId: "ws-1",
        contactId: "c-1",
        tagIds: ["tag-1"],
      }),
    ).rejects.toThrow("db down")

    expect(published()).toEqual([])
  })
})

describe("attachToContact / detachFromContact by id for a member", () => {
  const scope = { restrictToAssignedUserId: "user-1" }

  test("a member's scope is enforced through contactService before anything is written", async () => {
    const { contactService } = await import("../src/contact")
    vi.mocked(contactService.findByIdOrFail).mockRejectedValueOnce(
      new Error("Contact not found"),
    )

    await expect(
      tagService.attachToContact({
        workspaceId: "ws-1",
        contactId: "c-out",
        tagIds: ["tag-1"],
        accessScope: scope,
      }),
    ).rejects.toThrow("Contact not found")

    expect(contactService.findByIdOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "c-out",
      accessScope: scope,
    })
    expect(insertReturning).not.toHaveBeenCalled()
    expect(published()).toEqual([])
  })

  test("detach enforces the scope the same way", async () => {
    const { contactService } = await import("../src/contact")
    vi.mocked(contactService.findByIdOrFail).mockRejectedValueOnce(
      new Error("Contact not found"),
    )

    await expect(
      tagService.detachFromContact({
        workspaceId: "ws-1",
        contactId: "c-out",
        tagIds: ["tag-1"],
        accessScope: scope,
      }),
    ).rejects.toThrow("Contact not found")

    expect(deleteReturning).not.toHaveBeenCalled()
  })

  test("attach and detach publish the change but never drop shared caches (hot public/minigame paths)", async () => {
    const { contactService } = await import("../src/contact")
    const { invalidateCacheByTags } = await import("@chatbotx.io/redis")
    insertReturning.mockResolvedValue([{ tagId: "tag-1" }])
    deleteReturning.mockResolvedValue([{ tagId: "tag-1" }])

    await tagService.attachToContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
      accessScope: scope,
    })
    await tagService.detachFromContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
    })

    expect(published()).toEqual([
      ["ws-1", ["c-1"]],
      ["ws-1", ["c-1"]],
    ])
    expect(contactService.invalidate).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("assertLiveTags passes for live tags and throws not-found when one is gone", async () => {
    await expect(
      tagService.assertLiveTags({ workspaceId: "ws-1", tagIds: ["tag-1"] }),
    ).resolves.toBeUndefined()

    await expect(
      tagService.assertLiveTags({
        workspaceId: "ws-1",
        tagIds: ["tag-1", "tag-deleted"],
      }),
    ).rejects.toThrow("Tag not found")
  })
})

describe("bulkAttachToContacts (bulk and flow volume)", () => {
  test("publishes the newly linked contacts of every chunk", async () => {
    const ids = Array.from({ length: 450 }, (_, index) => `c-${index}`)
    findManyByIds
      .mockResolvedValueOnce(contacts(...ids.slice(0, 200)))
      .mockResolvedValueOnce(contacts(...ids.slice(200, 400)))
      .mockResolvedValueOnce(contacts(...ids.slice(400)))
    insertReturning
      .mockResolvedValueOnce([{ contactId: "c-1", tagId: "tag-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ contactId: "c-449", tagId: "tag-1" }])

    await tagService.bulkAttachToContacts({
      workspaceId: "ws-1",
      contactIds: ids,
      tagIds: ["tag-1"],
    })

    expect(published()).toEqual([["ws-1", ["c-1", "c-449"]]])
  })
})

describe("listTagPreviewsForConversationContacts", () => {
  test("reads previews only for contacts that have a conversation in the workspace", async () => {
    selectDistinctRows.mockResolvedValue([{ contactId: "c-1" }])

    await tagService.listTagPreviewsForConversationContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1", "c-without-conversation"],
      limit: 3,
    })

    expect(listTagPreviewsByContactIds).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      limit: 3,
    })
    // The lookup is scoped to the workspace and the requested ids.
    const where = JSON.stringify(selectDistinctWhere.mock.calls[0]?.[0])
    expect(where).toContain("ws-1")
    expect(where).toContain("c-without-conversation")
  })
})
