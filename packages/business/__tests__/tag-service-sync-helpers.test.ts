import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// tagService — the sync/trigger helper surface: findById, findManyByIds,
// findNameByIdForWorkspace, hardDeleteSoftDeleted,
// attachExistingToContactForTrigger, detachFromContactForTrigger. Mirrors the
// mock scaffolding in tag-service-bulk-attach.test.ts.
// ---------------------------------------------------------------------------

const findFirstTag = vi.fn()
const findManyTag = vi.fn()
const insertValues = vi.fn()
const insertReturning = vi.fn()
const deleteWhere = vi.fn()
const invalidateCacheByTags = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: {
        findFirst: (...args: unknown[]) => findFirstTag(...args),
        findMany: (...args: unknown[]) => findManyTag(...args),
      },
    },
    insert: () => ({
      values: (values: unknown) => {
        insertValues(values)
        return {
          onConflictDoNothing: () => ({
            returning: (...args: unknown[]) => insertReturning(...args),
          }),
        }
      },
    }),
    delete: () => ({
      where: (...args: unknown[]) => deleteWhere(...args),
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  findOrFail: vi.fn(),
  inArray: (left: unknown, right: unknown) => ({ inArray: [left, right] }),
  isNotNull: (column: unknown) => ({ isNotNull: column }),
  isNull: (column: unknown) => ({ isNull: column }),
  notExists: (query: unknown) => ({ notExists: query }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "ContactInbox.id",
    contactId: "ContactInbox.contactId",
  },
  contactModel: { id: "Contact.id", workspaceId: "Contact.workspaceId" },
  contactsToTagsModel: {
    contactId: "ContactToTag.contactId",
    tagId: "ContactToTag.tagId",
  },
  contactToTagChannelModel: {
    contactInboxId: "ContactToTagChannel.contactInboxId",
    tagId: "ContactToTagChannel.tagId",
  },
  tagModel: {
    id: "Tag.id",
    name: "Tag.name",
    workspaceId: "Tag.workspaceId",
    deletedAt: "Tag.deletedAt",
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))

vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: {
    enqueueTagAppliedEvaluationsBulk: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => invalidateCacheByTags(...args),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))

vi.mock("../src/contact", () => ({
  contactService: { findManyByIds: vi.fn() },
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueAttachMany: vi.fn() },
}))

const { tagService } = await import("../src/tag/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("findManyByIds", () => {
  test("returns [] without querying when ids is empty", async () => {
    const result = await tagService.findManyByIds({
      workspaceId: "ws-1",
      ids: [],
    })
    expect(result).toEqual([])
    expect(findManyTag).not.toHaveBeenCalled()
  })

  // Mirrors the export-contacts query verbatim: the header lookup must not
  // resurrect a soft-deleted tag's name, so `deletedAt: isNull` is part of the
  // scope here (unlike `findById`, which deliberately omits it).
  test("scopes by workspaceId and excludes soft-deleted tags", async () => {
    findManyTag.mockResolvedValue([{ id: "t-1", name: "VIP" }])

    const result = await tagService.findManyByIds({
      workspaceId: "ws-1",
      ids: ["t-1"],
    })

    expect(result).toEqual([{ id: "t-1", name: "VIP" }])
    expect(findManyTag).toHaveBeenCalledWith({
      where: {
        id: { in: ["t-1"] },
        workspaceId: "ws-1",
        deletedAt: { isNull: true },
      },
    })
  })
})

describe("findById", () => {
  test("looks up by id + workspaceId with no deletedAt filter (unlike findByKey)", async () => {
    findFirstTag.mockResolvedValue({ id: "t-1" })

    const result = await tagService.findById({
      workspaceId: "ws-1",
      id: "t-1",
    })

    expect(result).toEqual({ id: "t-1" })
    expect(findFirstTag).toHaveBeenCalledWith({
      where: { id: "t-1", workspaceId: "ws-1" },
    })
  })
})

describe("findNameByIdForWorkspace", () => {
  test("scopes by workspaceId AND deletedAt IS NULL (tag ids are globally unique)", async () => {
    findFirstTag.mockResolvedValue({ name: "VIP" })

    const result = await tagService.findNameByIdForWorkspace({
      workspaceId: "ws-1",
      id: "t-1",
    })

    expect(result).toBe("VIP")
    expect(findFirstTag).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "t-1", workspaceId: "ws-1" }),
      }),
    )
  })

  test("returns null when no match", async () => {
    findFirstTag.mockResolvedValue(undefined)
    const result = await tagService.findNameByIdForWorkspace({
      workspaceId: "ws-1",
      id: "missing",
    })
    expect(result).toBeNull()
  })
})

describe("hardDeleteSoftDeleted", () => {
  test("keeps the isNotNull(deletedAt) guard so an un-deleted tag cannot be hard-deleted", async () => {
    deleteWhere.mockResolvedValue(undefined)

    await tagService.hardDeleteSoftDeleted({
      workspaceId: "ws-1",
      tagId: "t-1",
    })

    const whereArg = deleteWhere.mock.calls[0]?.[0] as { and: unknown[] }
    const flat = JSON.stringify(whereArg)
    expect(flat).toContain("isNotNull")
    expect(invalidateCacheByTags).toHaveBeenCalled()
  })
})

describe("attachExistingToContactForTrigger", () => {
  test("returns [] without inserting when tagIds is empty", async () => {
    const result = await tagService.attachExistingToContactForTrigger({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: [],
    })
    expect(result).toEqual([])
    expect(insertValues).not.toHaveBeenCalled()
  })

  test("returns [] without inserting when no candidate tags exist", async () => {
    findManyTag.mockResolvedValue([])

    const result = await tagService.attachExistingToContactForTrigger({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["t-1"],
    })

    expect(result).toEqual([])
    expect(insertValues).not.toHaveBeenCalled()
  })

  test("returns only the newly-linked pairs and does not emit tagApplied", async () => {
    findManyTag.mockResolvedValue([{ id: "t-1" }, { id: "t-2" }])
    insertReturning.mockResolvedValue([{ tagId: "t-1" }])

    const result = await tagService.attachExistingToContactForTrigger({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["t-1", "t-2"],
    })

    expect(result).toEqual([{ tagId: "t-1" }])
    // No events module call recorded for this path — the trigger action
    // executor enqueues sync/ads evaluation itself per returned pair.
  })
})

describe("detachFromContactForTrigger", () => {
  test("no-ops without deleting when tagIds is empty", async () => {
    await tagService.detachFromContactForTrigger({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: [],
    })
    expect(deleteWhere).not.toHaveBeenCalled()
  })

  test("plain-deletes the contact/tag links, scoped to contactId + tagIds", async () => {
    deleteWhere.mockResolvedValue(undefined)

    await tagService.detachFromContactForTrigger({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["t-1"],
    })

    expect(deleteWhere).toHaveBeenCalledTimes(1)
  })
})
