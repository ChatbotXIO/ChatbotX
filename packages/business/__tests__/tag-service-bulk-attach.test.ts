import { beforeEach, describe, expect, test, vi } from "vitest"

const findTags = vi.fn()
const insertValues = vi.fn()
const insertReturning = vi.fn()
const findManyByIds = vi.fn()
const enqueueAttachMany = vi.fn()
const emitTagApplied = vi.fn()
const invalidateCacheByTags = vi.fn()
const selectWhere = vi.fn()
const enqueueTagAppliedEvaluationsBulk = vi.fn()

const createSelectBuilder = () => {
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: (...args: unknown[]) => selectWhere(...args),
  }
  return builder
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: {
        findMany: (...args: unknown[]) => findTags(...args),
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
    select: () => createSelectBuilder(),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  findOrFail: vi.fn(),
  inArray: (left: unknown, right: unknown) => ({ inArray: [left, right] }),
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
  emitTagApplied: (...args: unknown[]) => emitTagApplied(...args),
  emitTagRemoved: vi.fn(),
}))

vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: {
    enqueueTagAppliedEvaluationsBulk: (...args: unknown[]) =>
      enqueueTagAppliedEvaluationsBulk(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => invalidateCacheByTags(...args),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))

vi.mock("../src/contact", () => ({
  contactService: {
    findManyByIds: (...args: unknown[]) => findManyByIds(...args),
  },
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: {
    enqueueAttachMany: (...args: unknown[]) => enqueueAttachMany(...args),
  },
}))

const { tagService } = await import("../src/tag/service")

describe("TagService.bulkAttachToContacts", () => {
  beforeEach(() => {
    findTags.mockReset()
    insertValues.mockReset()
    insertReturning.mockReset()
    findManyByIds.mockReset()
    enqueueAttachMany.mockReset()
    emitTagApplied.mockReset()
    invalidateCacheByTags.mockReset()
    selectWhere.mockReset()
    selectWhere.mockResolvedValue([])
    enqueueTagAppliedEvaluationsBulk.mockReset()
  })

  test("attaches only scoped contacts and syncs only newly inserted pairs", async () => {
    findTags.mockResolvedValueOnce([{ id: "tag-1" }, { id: "tag-2" }])
    findManyByIds.mockResolvedValueOnce([{ id: "contact-1" }])
    insertReturning.mockResolvedValueOnce([
      { contactId: "contact-1", tagId: "tag-2" },
    ])

    const result = await tagService.bulkAttachToContacts({
      workspaceId: "workspace-1",
      contactIds: ["contact-1", "contact-1", "out-of-scope"],
      tagIds: ["tag-1", "tag-2"],
      accessScope: {
        restrictToAssignedUserId: "assignee-1",
        canViewEmailAndPhone: true,
      },
    })

    expect(findManyByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["contact-1", "out-of-scope"],
      accessScope: {
        restrictToAssignedUserId: "assignee-1",
        canViewEmailAndPhone: true,
      },
    })
    expect(insertValues).toHaveBeenCalledWith([
      { contactId: "contact-1", tagId: "tag-1" },
      { contactId: "contact-1", tagId: "tag-2" },
    ])
    expect(emitTagApplied).toHaveBeenCalledTimes(1)
    expect(emitTagApplied).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
      "tag-2",
    )
    expect(enqueueAttachMany).toHaveBeenCalledWith([
      {
        workspaceId: "workspace-1",
        contactId: "contact-1",
        tagId: "tag-2",
      },
    ])
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledTimes(1)
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      pairs: [{ contactId: "contact-1", tagId: "tag-2" }],
    })
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:workspace-1#contacts",
      "workspaces:workspace-1#conversations",
      "workspaces:workspace-1#tags",
    ])
    expect(result).toEqual({ attachedPairCount: 1 })
  })

  test("returns without writing when no active tag belongs to the workspace", async () => {
    findTags.mockResolvedValueOnce([])

    const result = await tagService.bulkAttachToContacts({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      tagIds: ["tag-1"],
    })

    expect(findManyByIds).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).not.toHaveBeenCalled()
    expect(result).toEqual({ attachedPairCount: 0 })
  })

  test("recovers already-inserted unsynced pairs on retry", async () => {
    findTags.mockResolvedValueOnce([{ id: "tag-1" }])
    findManyByIds.mockResolvedValueOnce([{ id: "contact-1" }])
    insertReturning.mockResolvedValueOnce([])
    selectWhere
      .mockReturnValueOnce({ subquery: "missing channel mapping" })
      .mockResolvedValueOnce([{ contactId: "contact-1", tagId: "tag-1" }])

    const result = await tagService.bulkAttachToContacts({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      tagIds: ["tag-1"],
      recoverUnsyncedPairs: true,
    })

    expect(emitTagApplied).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
      "tag-1",
    )
    expect(enqueueAttachMany).toHaveBeenCalledWith([
      {
        workspaceId: "workspace-1",
        contactId: "contact-1",
        tagId: "tag-1",
      },
    ])
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      pairs: [{ contactId: "contact-1", tagId: "tag-1" }],
    })
    expect(result).toEqual({ attachedPairCount: 0 })
  })
})
