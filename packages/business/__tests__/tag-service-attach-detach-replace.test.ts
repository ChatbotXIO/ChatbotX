// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockTxInsertBuilder = {
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
}
mockTxInsertBuilder.values.mockReturnValue(mockTxInsertBuilder)
mockTxInsertBuilder.onConflictDoNothing.mockReturnValue(mockTxInsertBuilder)
mockTxInsertBuilder.returning.mockResolvedValue([])

const mockInsertBuilder = {
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
}
mockInsertBuilder.values.mockReturnValue(mockInsertBuilder)
mockInsertBuilder.onConflictDoNothing.mockReturnValue(mockInsertBuilder)
mockInsertBuilder.returning.mockResolvedValue([])

const mockDeleteBuilder = {
  where: vi.fn(),
}
mockDeleteBuilder.where.mockResolvedValue(undefined)

const state = {
  txTagFindMany: [] as { id: string; name?: string; workspaceId?: string }[],
  txContactToTagsFindMany: [] as { tagId: string }[],
  contactFindMany: [] as { id: string }[],
  tagFindMany: [] as { id: string; name?: string }[],
  findOrFailResult: null as Record<string, unknown> | null,
  findOrFailError: null as Error | null,
}

const mockTx = {
  insert: vi.fn(() => mockTxInsertBuilder),
  delete: vi.fn(() => mockDeleteBuilder),
  query: {
    tagModel: { findMany: vi.fn(async () => state.txTagFindMany) },
    contactsToTagsModel: {
      findMany: vi.fn(async () => state.txContactToTagsFindMany),
    },
  },
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
    insert: vi.fn(() => mockInsertBuilder),
    delete: vi.fn(() => mockDeleteBuilder),
    query: {
      tagModel: { findMany: vi.fn(async () => state.tagFindMany) },
      contactModel: { findMany: vi.fn(async () => state.contactFindMany) },
      contactsToTagsModel: {
        findMany: vi.fn(async () => state.txContactToTagsFindMany),
      },
    },
  },
  findOrFail: vi.fn(() => {
    if (state.findOrFailError) {
      return Promise.reject(state.findOrFailError)
    }
    return Promise.resolve(state.findOrFailResult ?? {})
  }),
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  notInArray: (col: unknown, vals: unknown) => ({ notInArray: [col, vals] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: { workspaceId: "tagModel.workspaceId", name: "tagModel.name" },
  contactModel: {
    id: "contactModel.id",
    workspaceId: "contactModel.workspaceId",
  },
  contactsToTagsModel: {
    contactId: "contactsToTagsModel.contactId",
    tagId: "contactsToTagsModel.tagId",
  },
}))

const enqueueAttach = vi.fn(async () => undefined)
const enqueueDetach = vi.fn(async () => undefined)
const contactFindManyByIds = vi.fn(async () => state.contactFindMany)
const contactFindByIdOrFail = vi.fn(() => {
  if (state.findOrFailError) {
    return Promise.reject(state.findOrFailError)
  }
  return Promise.resolve(state.findOrFailResult ?? {})
})
const enqueueTagAppliedEvaluationsBulk = vi.fn(async () => undefined)
const contactInvalidate = vi.fn(async () => undefined)

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueAttach, enqueueDetach },
}))

vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: { enqueueTagAppliedEvaluationsBulk },
}))

vi.mock("../src/contact", () => ({
  contactService: {
    findByIdOrFail: contactFindByIdOrFail,
    findManyByIds: contactFindManyByIds,
    invalidate: contactInvalidate,
  },
}))

vi.mock("../src/folder/service", () => ({
  folderService: {},
}))

const emitTagApplied = vi.fn(async () => undefined)
const emitTagRemoved = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied,
  emitTagRemoved,
}))

let idCounter = 0
const createId = vi.fn(() => `generated-id-${++idCounter}`)

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId }
})

const invalidateCacheByTags = vi.fn()
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

const { tagService } = await import("../src/tag/service")

function resetState() {
  state.txTagFindMany = []
  state.txContactToTagsFindMany = []
  state.contactFindMany = []
  state.tagFindMany = []
  state.findOrFailResult = null
  state.findOrFailError = null
  idCounter = 0
}

function resetMocks() {
  vi.clearAllMocks()
  mockTxInsertBuilder.values.mockReturnValue(mockTxInsertBuilder)
  mockTxInsertBuilder.onConflictDoNothing.mockReturnValue(mockTxInsertBuilder)
  mockTxInsertBuilder.returning.mockResolvedValue([])
  mockInsertBuilder.values.mockReturnValue(mockInsertBuilder)
  mockInsertBuilder.onConflictDoNothing.mockReturnValue(mockInsertBuilder)
  mockInsertBuilder.returning.mockResolvedValue([])
  mockDeleteBuilder.where.mockResolvedValue(undefined)
  createId.mockImplementation(() => `generated-id-${++idCounter}`)
  // vi.clearAllMocks() does not drain mockResolvedValueOnce queues — mockReset
  // drops them, then re-wire the base implementation.
  contactFindManyByIds.mockReset()
  contactFindManyByIds.mockImplementation(async () => state.contactFindMany)
}

describe("tagService.attachByNamesToContacts", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  test("returns early when contactIds array is empty", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: [],
      names: ["tag-a"],
    })

    expect(db.transaction).not.toHaveBeenCalled()
    expect(mockInsertBuilder.values).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("returns early when names array is empty", async () => {
    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: [],
    })

    expect(mockInsertBuilder.values).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("returns early when no tags found (zero rows)", async () => {
    state.tagFindMany = []

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["ghost-tag"],
    })

    expect(mockInsertBuilder.values).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "ghost-tag" })]),
    )
    expect(contactFindManyByIds).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
  })

  test("continues (skips chunk) when contact chunk returns empty", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = []

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-missing"],
      names: ["tag-a"],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("does NOT call enqueueAttach when all pairs already exist (empty RETURNING)", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    mockInsertBuilder.returning.mockResolvedValue([])

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["tag-a"],
    })

    expect(emitTagApplied).toHaveBeenCalledOnce()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).not.toHaveBeenCalled()
  })

  test("calls enqueueAttach for each newly inserted pair", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }]
    mockInsertBuilder.returning.mockResolvedValue([
      { contactId: "c-1", tagId: "tag-1" },
      { contactId: "c-1", tagId: "tag-2" },
    ])

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["tag-a", "tag-b"],
    })

    expect(enqueueAttach).toHaveBeenCalledTimes(2)
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledOnce()
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pairs: [
        { contactId: "c-1", tagId: "tag-1" },
        { contactId: "c-1", tagId: "tag-2" },
      ],
    })
  })

  test("swallows emitTagApplied errors and continues to enqueueAttach", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    emitTagApplied.mockRejectedValue(new Error("event bus down"))
    mockInsertBuilder.returning.mockResolvedValue([
      { contactId: "c-1", tagId: "tag-1" },
    ])

    await expect(
      tagService.attachByNamesToContacts({
        workspaceId: "ws-1",
        contactIds: ["c-1"],
        names: ["tag-a"],
      }),
    ).resolves.toEqual({ processedContactIds: ["c-1"], skippedContactIds: [] })

    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  test("processes contacts in chunks of 200", async () => {
    state.tagFindMany = [{ id: "tag-1" }]

    const ids = Array.from({ length: 250 }, (_, i) => `c-${i}`)
    contactFindManyByIds
      .mockResolvedValueOnce(ids.slice(0, 200).map((id) => ({ id })))
      .mockResolvedValueOnce(ids.slice(200).map((id) => ({ id })))

    mockInsertBuilder.returning.mockResolvedValue([])

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ids,
      names: ["tag-a"],
    })

    expect(contactFindManyByIds).toHaveBeenCalledTimes(2)
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("passes assigned-contact access scope to contact lookup", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["tag-a"],
      accessScope,
    })

    expect(contactFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-1"],
      accessScope,
    })
  })

  test("only enqueues attach for truly new pairs (mixed RETURNING)", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }, { id: "c-2" }]
    mockInsertBuilder.returning.mockResolvedValue([
      { contactId: "c-1", tagId: "tag-2" },
      { contactId: "c-2", tagId: "tag-1" },
    ])

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1", "c-2"],
      names: ["tag-a", "tag-b"],
    })

    expect(enqueueAttach).toHaveBeenCalledTimes(2)
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-2",
      tagId: "tag-1",
    })
  })

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    mockInsertBuilder.returning.mockResolvedValue([])

    await tagService.attachByNamesToContacts({
      workspaceId: "ws-42",
      contactIds: ["c-1"],
      names: ["tag-a"],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith(["tags", "tags:ws-42"])
    expect(contactInvalidate).toHaveBeenCalledWith({
      workspaceId: "ws-42",
      ids: ["c-1"],
    })
  })
})

describe("tagService.detachByNamesFromContacts", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  test("returns early when contactIds array is empty", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: [],
      names: ["tag-a"],
    })

    expect(db.query.tagModel.findMany).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  test("returns early when names array is empty", async () => {
    const { db } = await import("@chatbotx.io/database/client")
    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: [],
    })

    expect(db.query.tagModel.findMany).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  test("returns early when tag names not found in DB", async () => {
    state.tagFindMany = []
    const { db } = await import("@chatbotx.io/database/client")

    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["ghost"],
    })

    expect(db.query.tagModel.findMany).toHaveBeenCalledOnce()
    expect(contactFindManyByIds).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  test("skips chunk when no contacts found in chunk", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = []
    const { db } = await import("@chatbotx.io/database/client")

    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: ["c-missing"],
      names: ["tag-a"],
    })

    expect(db.delete).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("deletes and enqueues detach for each contact×tag pair", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }, { id: "c-2" }]
    const { db } = await import("@chatbotx.io/database/client")

    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1", "c-2"],
      names: ["tag-a", "tag-b"],
    })

    // One DELETE per chunk (both contacts fall in the same 200-sized chunk),
    // not one per contact.
    expect(db.delete).toHaveBeenCalledTimes(1)
    expect(enqueueDetach).toHaveBeenCalledTimes(4)
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-2",
      tagId: "tag-1",
    })
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-2",
      tagId: "tag-2",
    })
  })

  test("swallows emitTagRemoved errors and completes normally", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    emitTagRemoved.mockRejectedValue(new Error("event bus down"))

    await expect(
      tagService.detachByNamesFromContacts({
        workspaceId: "ws-1",
        contactIds: ["c-1"],
        names: ["tag-a"],
      }),
    ).resolves.toBeUndefined()

    expect(enqueueDetach).toHaveBeenCalledOnce()
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-99",
      contactIds: ["c-1"],
      names: ["tag-a"],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith(["tags", "tags:ws-99"])
    expect(contactInvalidate).toHaveBeenCalledWith({
      workspaceId: "ws-99",
      ids: ["c-1"],
    })
  })

  test("passes assigned-contact access scope to contact lookup", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await tagService.detachByNamesFromContacts({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["tag-a"],
      accessScope,
    })

    expect(contactFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-1"],
      accessScope,
    })
  })
})

describe("tagService.replaceContactTagsByNames", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  test("throws when contact not found (findByIdOrFail rejects)", async () => {
    state.findOrFailError = new Error("Contact not found")

    await expect(
      tagService.replaceContactTagsByNames({
        workspaceId: "ws-1",
        contactId: "c-999",
        names: ["tag-a"],
      }),
    ).rejects.toThrow("Contact not found")

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  test("clears all tags: only enqueues detach for each previously set tag", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }, { tagId: "tag-2" }]
    state.txTagFindMany = []

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: [],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).toHaveBeenCalledTimes(2)
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("purely additive: only enqueues attach for new tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    state.txTagFindMany = [
      { id: "tag-1", name: "alpha" },
      { id: "tag-2", name: "beta" },
    ]

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha", "beta"],
    })

    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(enqueueAttach).toHaveBeenCalledTimes(2)
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
    expect(emitTagApplied).toHaveBeenCalledTimes(2)
    expect(emitTagRemoved).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledOnce()
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pairs: [
        { contactId: "c-1", tagId: "tag-1" },
        { contactId: "c-1", tagId: "tag-2" },
      ],
    })
  })

  test("purely subtractive: only enqueues detach for removed tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }, { tagId: "tag-2" }]
    state.txTagFindMany = [{ id: "tag-1", name: "alpha" }]

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha"],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).toHaveBeenCalledOnce()
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
  })

  test("mixed update: enqueues both attach for new and detach for removed tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }, { tagId: "tag-2" }]
    state.txTagFindMany = [
      { id: "tag-2", name: "beta" },
      { id: "tag-3", name: "gamma" },
    ]

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["beta", "gamma"],
    })

    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-3",
    })
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledOnce()
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      pairs: [{ contactId: "c-1", tagId: "tag-3" }],
    })
    expect(enqueueDetach).toHaveBeenCalledOnce()
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  test("unchanged tags are not re-synced (no attach or detach)", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }]
    state.txTagFindMany = [{ id: "tag-1", name: "alpha" }]

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha"],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).not.toHaveBeenCalled()
  })

  test("swallows emitTagApplied errors and still calls enqueueAttach", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    state.txTagFindMany = [{ id: "tag-1", name: "alpha" }]
    emitTagApplied.mockRejectedValue(new Error("bus failure"))

    await expect(
      tagService.replaceContactTagsByNames({
        workspaceId: "ws-1",
        contactId: "c-1",
        names: ["alpha"],
      }),
    ).resolves.toBeDefined()

    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  test("returns the resolved tag list", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    const resolvedTags = [{ id: "tag-1", name: "alpha", workspaceId: "ws-1" }]
    state.txTagFindMany = resolvedTags

    const result = await tagService.replaceContactTagsByNames({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha"],
    })

    expect(result).toEqual(resolvedTags)
  })

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    state.txTagFindMany = []

    await tagService.replaceContactTagsByNames({
      workspaceId: "ws-7",
      contactId: "c-1",
      names: [],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith(["tags", "tags:ws-7"])
    expect(contactInvalidate).toHaveBeenCalledWith({
      workspaceId: "ws-7",
      ids: ["c-1"],
    })
  })
})
