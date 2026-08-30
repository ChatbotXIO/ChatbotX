// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const state = {
  linkedPairs: [] as { contactId: string; tagId: string }[],
  linkedTagIds: [] as string[],
  resolvedTags: [] as { id: string; name?: string; workspaceId?: string }[],
  contactFindMany: [] as { id: string }[],
  tagFindMany: [] as { id: string; name?: string }[],
  findOrFailResult: null as Record<string, unknown> | null,
  findOrFailError: null as Error | null,
}

// Mirrors what the real `DELETE ... RETURNING` would produce: every
// previously-linked tag not present in the resolved (kept) set.
const removedTagRows = () => {
  const keepIds = new Set(state.resolvedTags.map((tag) => tag.id))
  return state.linkedTagIds
    .filter((id) => !keepIds.has(id))
    .map((tagId) => ({ tagId }))
}

const linkContacts = vi.fn(async () => state.linkedPairs)
const findLinkedTagIds = vi.fn(async () => state.linkedTagIds)
const ensureByNames = vi.fn(async () => state.resolvedTags)
const unlinkContactExcept = vi.fn(async () => removedTagRows())
const unlinkContacts = vi.fn(async () => [])
const findManyByNames = vi.fn(async () => state.tagFindMany)
const findManyByIds = vi.fn(async () => state.tagFindMany)
const findUnsyncedPairs = vi.fn(async () => [])

const mockTx = { fake: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  },
  findOrFail: vi.fn(() => {
    if (state.findOrFailError) {
      return Promise.reject(state.findOrFailError)
    }
    return Promise.resolve(state.findOrFailResult ?? {})
  }),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagRepository: {
    linkContacts,
    findLinkedTagIds,
    ensureByNames,
    unlinkContactExcept,
    unlinkContacts,
    findManyByNames,
    findManyByIds,
    findUnsyncedPairs,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {},
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

vi.mock("../../ads-conversion/service", () => ({
  adsConversionService: { enqueueTagAppliedEvaluationsBulk },
}))

vi.mock("../../contact", () => ({
  contactService: {
    findByIdOrFail: contactFindByIdOrFail,
    findManyByIds: contactFindManyByIds,
  },
}))

vi.mock("../../folder", () => ({
  folderService: { ensureExists: vi.fn() },
}))

vi.mock("../../logger", () => ({
  logger: { error: vi.fn() },
}))

vi.mock("../sync.service", () => ({
  tagSyncService: { enqueueAttach, enqueueDetach },
}))

const emitTagApplied = vi.fn(async () => undefined)
const emitTagRemoved = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied,
  emitTagRemoved,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
  invalidateCacheByTags: vi.fn(),
}))

const { tagService } = await import("../service")
const { invalidateCacheByTags } = await import("@chatbotx.io/redis")

function resetState() {
  state.linkedPairs = []
  state.linkedTagIds = []
  state.resolvedTags = []
  state.contactFindMany = []
  state.tagFindMany = []
  state.findOrFailResult = null
  state.findOrFailError = null
}

function resetMocks() {
  vi.clearAllMocks()
  linkContacts.mockImplementation(async () => state.linkedPairs)
  findLinkedTagIds.mockImplementation(async () => state.linkedTagIds)
  ensureByNames.mockImplementation(async () => state.resolvedTags)
  unlinkContactExcept.mockImplementation(async () => removedTagRows())
  unlinkContacts.mockImplementation(async () => [])
  findManyByNames.mockImplementation(async () => state.tagFindMany)
  findManyByIds.mockImplementation(async () => state.tagFindMany)
  findUnsyncedPairs.mockImplementation(async () => [])
}

// ============================================================================
// TagService.addToContacts
// ============================================================================
describe("TagService.addToContacts", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  test("returns early when ids array is empty", async () => {
    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: [],
      tags: ["tag-a"],
    })

    expect(contactFindManyByIds).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("returns early when tags array is empty", async () => {
    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: [],
    })

    expect(contactFindManyByIds).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
  })

  test("returns early when no tags found in DB (zero rows)", async () => {
    state.resolvedTags = []

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: ["ghost-tag"],
    })

    expect(contactFindManyByIds).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
  })

  test("continues (skips chunk) when contact chunk returns empty", async () => {
    state.resolvedTags = [{ id: "tag-1" }]
    state.contactFindMany = []

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-missing"],
      tags: ["tag-a"],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("does NOT call enqueueAttach when all pairs already exist (empty RETURNING)", async () => {
    state.resolvedTags = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    state.linkedPairs = []

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: ["tag-a"],
    })

    expect(emitTagApplied).toHaveBeenCalledOnce()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).not.toHaveBeenCalled()
  })

  test("calls enqueueAttach for each newly inserted pair", async () => {
    state.resolvedTags = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }]
    state.linkedPairs = [
      { contactId: "c-1", tagId: "tag-1" },
      { contactId: "c-1", tagId: "tag-2" },
    ]

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: ["tag-a", "tag-b"],
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
    state.resolvedTags = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    emitTagApplied.mockRejectedValue(new Error("event bus down"))
    state.linkedPairs = [{ contactId: "c-1", tagId: "tag-1" }]

    await expect(
      tagService.addToContacts({
        workspaceId: "ws-1",
        ids: ["c-1"],
        tags: ["tag-a"],
      }),
    ).resolves.toBeUndefined()

    expect(enqueueAttach).toHaveBeenCalledOnce()
  })

  test("processes contacts in chunks of 200", async () => {
    state.resolvedTags = [{ id: "tag-1" }]

    const ids = Array.from({ length: 250 }, (_, i) => `c-${i}`)
    contactFindManyByIds
      .mockResolvedValueOnce(ids.slice(0, 200).map((id) => ({ id })))
      .mockResolvedValueOnce(ids.slice(200).map((id) => ({ id })))
    state.linkedPairs = []

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids,
      tags: ["tag-a"],
    })

    expect(contactFindManyByIds).toHaveBeenCalledTimes(2)
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("passes assigned-contact access scope to contact lookup", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    state.resolvedTags = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: ["tag-a"],
      accessScope,
    })

    expect(contactFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-1"],
      accessScope,
    })
  })

  test("only enqueues attach for truly new pairs (mixed RETURNING)", async () => {
    state.resolvedTags = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }, { id: "c-2" }]
    state.linkedPairs = [
      { contactId: "c-1", tagId: "tag-2" },
      { contactId: "c-2", tagId: "tag-1" },
    ]

    await tagService.addToContacts({
      workspaceId: "ws-1",
      ids: ["c-1", "c-2"],
      tags: ["tag-a", "tag-b"],
    })

    expect(enqueueAttach).toHaveBeenCalledTimes(2)
  })

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.resolvedTags = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    state.linkedPairs = []

    await tagService.addToContacts({
      workspaceId: "ws-42",
      ids: ["c-1"],
      tags: ["tag-a"],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-42#contacts",
      "workspaces:ws-42#conversations",
      "workspaces:ws-42#tags",
    ])
  })
})

// ============================================================================
// TagService.removeFromContacts
// ============================================================================
describe("TagService.removeFromContacts", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  test("returns early when ids array is empty", async () => {
    await tagService.removeFromContacts({
      workspaceId: "ws-1",
      ids: [],
      tags: ["tag-a"],
    })

    expect(findManyByNames).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  test("returns early when tags array is empty", async () => {
    await tagService.removeFromContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: [],
    })

    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  test("returns early when tag names not found in DB", async () => {
    state.tagFindMany = []

    await tagService.removeFromContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: ["ghost"],
    })

    expect(findManyByNames).toHaveBeenCalledOnce()
    expect(contactFindManyByIds).not.toHaveBeenCalled()
  })

  test("skips chunk when no contacts found in chunk", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = []

    await tagService.removeFromContacts({
      workspaceId: "ws-1",
      ids: ["c-missing"],
      tags: ["tag-a"],
    })

    expect(unlinkContacts).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  test("deletes and enqueues detach for each contact×tag pair", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }, { id: "c-2" }]

    await tagService.removeFromContacts({
      workspaceId: "ws-1",
      ids: ["c-1", "c-2"],
      tags: ["tag-a", "tag-b"],
    })

    expect(unlinkContacts).toHaveBeenCalledTimes(1)
    expect(enqueueDetach).toHaveBeenCalledTimes(4)
  })

  test("swallows emitTagRemoved errors and completes normally", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    emitTagRemoved.mockRejectedValue(new Error("event bus down"))

    await expect(
      tagService.removeFromContacts({
        workspaceId: "ws-1",
        ids: ["c-1"],
        tags: ["tag-a"],
      }),
    ).resolves.toBeUndefined()

    expect(enqueueDetach).toHaveBeenCalledOnce()
  })

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await tagService.removeFromContacts({
      workspaceId: "ws-99",
      ids: ["c-1"],
      tags: ["tag-a"],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-99#contacts",
      "workspaces:ws-99#conversations",
      "workspaces:ws-99#tags",
    ])
  })

  test("passes assigned-contact access scope to contact lookup", async () => {
    const accessScope = { restrictToAssignedUserId: "user-1" }
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await tagService.removeFromContacts({
      workspaceId: "ws-1",
      ids: ["c-1"],
      tags: ["tag-a"],
      accessScope,
    })

    expect(contactFindManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-1"],
      accessScope,
    })
  })
})

// ============================================================================
// TagService.syncContactTags
// ============================================================================
describe("TagService.syncContactTags", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  test("throws when contact not found (findByIdOrFail rejects)", async () => {
    state.findOrFailError = new Error("Contact not found")

    await expect(
      tagService.syncContactTags({
        workspaceId: "ws-1",
        contactId: "c-999",
        tags: ["tag-a"],
      }),
    ).rejects.toThrow("Contact not found")

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  test("clears all tags: only enqueues detach for each previously set tag", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = ["tag-1", "tag-2"]
    state.resolvedTags = []

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: [],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).toHaveBeenCalledTimes(2)
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("purely additive: only enqueues attach for new tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = []
    state.resolvedTags = [
      { id: "tag-1", name: "alpha" },
      { id: "tag-2", name: "beta" },
    ]

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["alpha", "beta"],
    })

    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(enqueueAttach).toHaveBeenCalledTimes(2)
    expect(emitTagApplied).toHaveBeenCalledTimes(2)
    expect(emitTagRemoved).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).toHaveBeenCalledOnce()
  })

  test("purely subtractive: only enqueues detach for removed tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = ["tag-1", "tag-2"]
    state.resolvedTags = [{ id: "tag-1", name: "alpha" }]

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["alpha"],
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
    state.linkedTagIds = ["tag-1", "tag-2"]
    state.resolvedTags = [
      { id: "tag-2", name: "beta" },
      { id: "tag-3", name: "gamma" },
    ]

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["beta", "gamma"],
    })

    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-3",
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
    state.linkedTagIds = ["tag-1"]
    state.resolvedTags = [{ id: "tag-1", name: "alpha" }]

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["alpha"],
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
    expect(enqueueTagAppliedEvaluationsBulk).not.toHaveBeenCalled()
  })

  test("swallows emitTagApplied errors and still calls enqueueAttach", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = []
    state.resolvedTags = [{ id: "tag-1", name: "alpha" }]
    emitTagApplied.mockRejectedValue(new Error("bus failure"))

    await expect(
      tagService.syncContactTags({
        workspaceId: "ws-1",
        contactId: "c-1",
        tags: ["alpha"],
      }),
    ).resolves.toBeDefined()

    expect(enqueueAttach).toHaveBeenCalledOnce()
  })

  test("returns the resolved tag list", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = []
    const resolvedTags = [{ id: "tag-1", name: "alpha", workspaceId: "ws-1" }]
    state.resolvedTags = resolvedTags

    const result = await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["alpha"],
    })

    expect(result).toEqual(resolvedTags)
  })

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = []
    state.resolvedTags = []

    await tagService.syncContactTags({
      workspaceId: "ws-7",
      contactId: "c-1",
      tags: [],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-7#contacts",
      "workspaces:ws-7#conversations",
      "workspaces:ws-7#tags",
    ])
  })

  test("passes tx into ensureByNames and linkContacts within db.transaction", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = ["tag-2"]
    state.resolvedTags = [{ id: "tag-1", name: "alpha" }]

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["alpha"],
    })

    expect(ensureByNames).toHaveBeenCalledWith(
      { workspaceId: "ws-1", names: ["alpha"] },
      mockTx,
    )
    expect(linkContacts).toHaveBeenCalledWith(
      [{ contactId: "c-1", tagId: "tag-1" }],
      mockTx,
    )
    expect(unlinkContactExcept).toHaveBeenCalledWith(
      { contactId: "c-1", keepTagIds: ["tag-1"] },
      mockTx,
    )
  })

  test("skips the DELETE entirely when the snapshot diff shows nothing to remove", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.linkedTagIds = []
    state.resolvedTags = [{ id: "tag-1", name: "alpha" }]

    await tagService.syncContactTags({
      workspaceId: "ws-1",
      contactId: "c-1",
      tags: ["alpha"],
    })

    expect(unlinkContactExcept).not.toHaveBeenCalled()
  })
})
