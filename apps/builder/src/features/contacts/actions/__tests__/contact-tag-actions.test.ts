// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/client
// Chainable builder pattern (same shape as contact-analytics reference).
// We expose mutable result holders so each test can control what queries return.
// ---------------------------------------------------------------------------

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

// State holders — tests mutate these to control responses
const state = {
  txTagFindMany: [] as { id: string; name?: string; workspaceId?: string }[],
  txContactToTagsFindMany: [] as { tagId: string }[],
  contactFindMany: [] as { id: string }[],
  tagFindMany: [] as { id: string; name?: string }[],
  insertReturning: [] as { contactId: string; tagId: string }[],
  findOrFailResult: null as Record<string, unknown> | null,
  findOrFailError: null as Error | null,
}

// The transaction callback receives a tx object; we simulate it running inline.
const mockTx = {
  insert: vi.fn(() => mockTxInsertBuilder),
  delete: vi.fn(() => mockDeleteBuilder),
  query: {
    tagModel: {
      findMany: vi.fn(async () => state.txTagFindMany),
    },
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
      tagModel: {
        findMany: vi.fn(async () => state.tagFindMany),
      },
      contactModel: {
        findMany: vi.fn(async () => state.contactFindMany),
      },
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

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/schema — sentinel objects for model references
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: {
    workspaceId: "tagModel.workspaceId",
    name: "tagModel.name",
  },
  contactModel: {
    id: "contactModel.id",
    workspaceId: "contactModel.workspaceId",
  },
  contactsToTagsModel: {
    contactId: "contactsToTagsModel.contactId",
    tagId: "contactsToTagsModel.tagId",
  },
  // createSelectSchema is imported transitively by tag resource schema
  createSelectSchema: vi.fn(() => ({
    pick: vi.fn(() => ({})),
  })),
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business — tagSyncService
// ---------------------------------------------------------------------------
const enqueueAttach = vi.fn(async () => undefined)
const enqueueDetach = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  tagSyncService: { enqueueAttach, enqueueDetach },
  // update-contact-tag.action.ts resolves the contact via contactService.
  contactService: {
    findByIdOrFail: vi.fn(() => {
      if (state.findOrFailError) {
        return Promise.reject(state.findOrFailError)
      }
      return Promise.resolve(state.findOrFailResult ?? {})
    }),
  },
  // safe-action.ts also imports isPlatformAdmin
  isPlatformAdmin: vi.fn(async () => false),
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/events
// ---------------------------------------------------------------------------
const emitTagApplied = vi.fn(async () => undefined)
const emitTagRemoved = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied,
  emitTagRemoved,
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/utils — createId
// ---------------------------------------------------------------------------
let idCounter = 0
const createId = vi.fn(() => `generated-id-${++idCounter}`)

vi.mock("@chatbotx.io/utils", () => ({
  createId,
  zodBigintAsString: () => ({
    describe: vi.fn(),
    safeParse: vi.fn(() => ({ data: "ws-1" })),
    parse: vi.fn((v: unknown) => String(v)),
  }),
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/redis — invalidateCacheByTags
// ---------------------------------------------------------------------------
const invalidateCacheByTags = vi.fn()
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags }))

// ---------------------------------------------------------------------------
// Mock: @/lib/safe-action — stub workspaceActionClient to avoid auth chains
// ---------------------------------------------------------------------------
const stubActionChain = {
  bindArgsSchemas: vi.fn(),
  inputSchema: vi.fn(),
  action: vi.fn(),
}
stubActionChain.bindArgsSchemas.mockReturnValue(stubActionChain)
stubActionChain.inputSchema.mockReturnValue(stubActionChain)
stubActionChain.action.mockReturnValue({})

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: stubActionChain,
  authActionClient: stubActionChain,
  actionClient: stubActionChain,
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business/errors — ChatbotXException
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/sdk — SdkException
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

// ---------------------------------------------------------------------------
// Mock: remaining builder-internal modules that safe-action imports
// ---------------------------------------------------------------------------
vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(async () => []),
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}))
vi.mock("@/lib/log", () => ({ logger: { error: vi.fn(), info: vi.fn() } }))
vi.mock("@/features/tags/schema/resource", () => ({
  tagResource: {},
  publicTagResource: {},
}))

// ---------------------------------------------------------------------------
// Import helpers under test (after all vi.mock calls)
// ---------------------------------------------------------------------------
const { addContactTags } = await import("../add-contact-tag.action")
const { removeContactTags } = await import("../remove-contact-tag.action")
const { updateContactTags } = await import("../update-contact-tag.action")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetState() {
  state.txTagFindMany = []
  state.txContactToTagsFindMany = []
  state.contactFindMany = []
  state.tagFindMany = []
  state.insertReturning = []
  state.findOrFailResult = null
  state.findOrFailError = null
  idCounter = 0
}

function resetMocks() {
  vi.clearAllMocks()
  // Re-wire chains (clearAllMocks clears mockReturnValue state)
  mockTxInsertBuilder.values.mockReturnValue(mockTxInsertBuilder)
  mockTxInsertBuilder.onConflictDoNothing.mockReturnValue(mockTxInsertBuilder)
  mockTxInsertBuilder.returning.mockResolvedValue([])
  mockInsertBuilder.values.mockReturnValue(mockInsertBuilder)
  mockInsertBuilder.onConflictDoNothing.mockReturnValue(mockInsertBuilder)
  mockInsertBuilder.returning.mockResolvedValue([])
  mockDeleteBuilder.where.mockResolvedValue(undefined)
  stubActionChain.bindArgsSchemas.mockReturnValue(stubActionChain)
  stubActionChain.inputSchema.mockReturnValue(stubActionChain)
  stubActionChain.action.mockReturnValue({})
  createId.mockImplementation(() => `generated-id-${++idCounter}`)
}

// ============================================================================
// addContactTags
// ============================================================================
describe("addContactTags", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  // ── Early-return guards ──────────────────────────────────────────────────

  test("returns early when ids array is empty", async () => {
    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: [], tags: ["tag-a"] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.transaction).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("returns early when tags array is empty", async () => {
    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1"], tags: [] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.transaction).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  // ── Tags resolve to zero rows ────────────────────────────────────────────

  test("returns early when no tags found in DB (zero rows)", async () => {
    state.txTagFindMany = [] // transaction returns empty tag list

    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1"], tags: ["ghost-tag"] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.transaction).toHaveBeenCalledOnce()
    // No contact queries or inserts beyond the tag resolution
    expect(db.query.contactModel.findMany).not.toHaveBeenCalled()
    expect(enqueueAttach).not.toHaveBeenCalled()
  })

  // ── Chunk: contacts chunk returns empty ──────────────────────────────────

  test("continues (skips chunk) when contact chunk returns empty", async () => {
    state.txTagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [] // contacts not found

    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-missing"], tags: ["tag-a"] },
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  // ── onConflictDoNothing returns empty RETURNING (all pre-existing) ───────

  test("does NOT call enqueueAttach when all pairs already exist (empty RETURNING)", async () => {
    state.txTagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    mockInsertBuilder.returning.mockResolvedValue([]) // empty = all pre-existing

    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
    })

    expect(emitTagApplied).toHaveBeenCalledOnce()
    expect(enqueueAttach).not.toHaveBeenCalled()
  })

  // ── New rows → enqueueAttach once per new pair ───────────────────────────

  test("calls enqueueAttach for each newly inserted pair", async () => {
    state.txTagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }]
    mockInsertBuilder.returning.mockResolvedValue([
      { contactId: "c-1", tagId: "tag-1" },
      { contactId: "c-1", tagId: "tag-2" },
    ])

    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1"], tags: ["tag-a", "tag-b"] },
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
  })

  // ── emitTagApplied throws → swallowed, continues ─────────────────────────

  test("swallows emitTagApplied errors and continues to enqueueAttach", async () => {
    state.txTagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    emitTagApplied.mockRejectedValue(new Error("event bus down"))
    mockInsertBuilder.returning.mockResolvedValue([
      { contactId: "c-1", tagId: "tag-1" },
    ])

    await expect(
      addContactTags({
        workspaceId: "ws-1",
        parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
      }),
    ).resolves.toBeUndefined()

    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  // ── >200 contacts → multiple chunks ──────────────────────────────────────

  test("processes contacts in chunks of 200", async () => {
    state.txTagFindMany = [{ id: "tag-1" }]

    const ids = Array.from({ length: 250 }, (_, i) => `c-${i}`)
    // contactModel.findMany resolves with contacts from current chunk
    const { db } = await import("@chatbotx.io/database/client")
    const contactFindMany = db.query.contactModel.findMany as ReturnType<
      typeof vi.fn
    >
    // first chunk (200), second chunk (50)
    contactFindMany
      .mockResolvedValueOnce(ids.slice(0, 200).map((id) => ({ id })))
      .mockResolvedValueOnce(ids.slice(200).map((id) => ({ id })))

    mockInsertBuilder.returning.mockResolvedValue([]) // no new pairs

    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids, tags: ["tag-a"] },
    })

    expect(contactFindMany).toHaveBeenCalledTimes(2)
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  // ── partial mix: some pairs new, some existing ───────────────────────────

  test("only enqueues attach for truly new pairs (mixed RETURNING)", async () => {
    state.txTagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }, { id: "c-2" }]
    // only c-1/tag-2 and c-2/tag-1 are new
    mockInsertBuilder.returning.mockResolvedValue([
      { contactId: "c-1", tagId: "tag-2" },
      { contactId: "c-2", tagId: "tag-1" },
    ])

    await addContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1", "c-2"], tags: ["tag-a", "tag-b"] },
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

  // ── invalidateCacheByTags called with correct tags ──────────────────────────

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.txTagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    mockInsertBuilder.returning.mockResolvedValue([])

    await addContactTags({
      workspaceId: "ws-42",
      parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-42#contacts",
      "workspaces:ws-42#conversations",
      "workspaces:ws-42#tags",
    ])
  })
})

// ============================================================================
// removeContactTags
// ============================================================================
describe("removeContactTags", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  // ── Early-return guards ──────────────────────────────────────────────────

  test("returns early when ids array is empty", async () => {
    await removeContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: [], tags: ["tag-a"] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.query.tagModel.findMany).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  test("returns early when tags array is empty", async () => {
    await removeContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1"], tags: [] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.query.tagModel.findMany).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  // ── Tag names not found → return (no deletes/sync) ───────────────────────

  test("returns early when tag names not found in DB", async () => {
    state.tagFindMany = [] // tagModel.findMany returns empty

    await removeContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1"], tags: ["ghost"] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.query.tagModel.findMany).toHaveBeenCalledOnce()
    expect(db.query.contactModel.findMany).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  // ── Chunk with no matching contacts → continue ───────────────────────────

  test("skips chunk when no contacts found in chunk", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [] // no contacts in this chunk

    await removeContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-missing"], tags: ["tag-a"] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.delete).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledOnce()
  })

  // ── Happy path: per-contact delete + enqueueDetach per contact×tag ────────

  test("deletes and enqueues detach for each contact×tag pair", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]
    state.contactFindMany = [{ id: "c-1" }, { id: "c-2" }]

    await removeContactTags({
      workspaceId: "ws-1",
      parsedInput: { ids: ["c-1", "c-2"], tags: ["tag-a", "tag-b"] },
    })

    const { db } = await import("@chatbotx.io/database/client")
    // delete called once per contact
    expect(db.delete).toHaveBeenCalledTimes(2)

    // enqueueDetach: 2 contacts × 2 tags = 4 calls
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

  // ── emitTagRemoved throws → swallowed ────────────────────────────────────

  test("swallows emitTagRemoved errors and completes normally", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]
    emitTagRemoved.mockRejectedValue(new Error("event bus down"))

    await expect(
      removeContactTags({
        workspaceId: "ws-1",
        parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
      }),
    ).resolves.toBeUndefined()

    // enqueueDetach still called despite emitTagRemoved failing
    expect(enqueueDetach).toHaveBeenCalledOnce()
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  // ── invalidateCacheByTags called ─────────────────────────────────────────

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.tagFindMany = [{ id: "tag-1" }]
    state.contactFindMany = [{ id: "c-1" }]

    await removeContactTags({
      workspaceId: "ws-99",
      parsedInput: { ids: ["c-1"], tags: ["tag-a"] },
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-99#contacts",
      "workspaces:ws-99#conversations",
      "workspaces:ws-99#tags",
    ])
  })
})

// ============================================================================
// updateContactTags
// ============================================================================
describe("updateContactTags", () => {
  beforeEach(() => {
    resetState()
    resetMocks()
  })

  // ── contact not found → throws ────────────────────────────────────────────

  test("throws when contact not found (findOrFail rejects)", async () => {
    state.findOrFailError = new Error("Contact not found")

    await expect(
      updateContactTags({
        workspaceId: "ws-1",
        parsedInput: { contactId: "c-999", tags: ["tag-a"] },
      }),
    ).rejects.toThrow("Contact not found")

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
  })

  // ── tags:[] (clear all) → only enqueueDetach for each removed ────────────

  test("clears all tags: only enqueues detach for each previously set tag", async () => {
    state.findOrFailResult = { id: "c-1" }
    // Contact currently has tag-1 and tag-2
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }, { tagId: "tag-2" }]
    // With tags:[], tx tagModel.findMany returns []
    state.txTagFindMany = []

    await updateContactTags({
      workspaceId: "ws-1",
      parsedInput: { contactId: "c-1", tags: [] },
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

  // ── purely additive → only enqueueAttach ─────────────────────────────────

  test("purely additive: only enqueues attach for new tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    // Contact currently has no tags
    state.txContactToTagsFindMany = []
    // tx tagModel.findMany returns the tags we're adding
    state.txTagFindMany = [
      { id: "tag-1", name: "alpha" },
      { id: "tag-2", name: "beta" },
    ]

    await updateContactTags({
      workspaceId: "ws-1",
      parsedInput: { contactId: "c-1", tags: ["alpha", "beta"] },
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
  })

  // ── purely subtractive → only enqueueDetach ──────────────────────────────

  test("purely subtractive: only enqueues detach for removed tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    // Contact currently has tag-1 and tag-2, new set is only tag-1
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }, { tagId: "tag-2" }]
    // After update, only tag-1 remains in tx
    state.txTagFindMany = [{ id: "tag-1", name: "alpha" }]

    await updateContactTags({
      workspaceId: "ws-1",
      parsedInput: { contactId: "c-1", tags: ["alpha"] },
    })

    // tag-1 already existed → not newly applied
    expect(enqueueAttach).not.toHaveBeenCalled()
    // tag-2 was removed
    expect(enqueueDetach).toHaveBeenCalledOnce()
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })
  })

  // ── mixed: some added, some removed ──────────────────────────────────────

  test("mixed update: enqueues both attach for new and detach for removed tags", async () => {
    state.findOrFailResult = { id: "c-1" }
    // Contact has tag-1 and tag-2; new selection is tag-2 and tag-3
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }, { tagId: "tag-2" }]
    state.txTagFindMany = [
      { id: "tag-2", name: "beta" },
      { id: "tag-3", name: "gamma" },
    ]

    await updateContactTags({
      workspaceId: "ws-1",
      parsedInput: { contactId: "c-1", tags: ["beta", "gamma"] },
    })

    // tag-3 is new → attach
    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-3",
    })
    // tag-1 was removed → detach
    expect(enqueueDetach).toHaveBeenCalledOnce()
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  // ── pre-existing unchanged tags → neither attach nor detach ──────────────

  test("unchanged tags are not re-synced (no attach or detach)", async () => {
    state.findOrFailResult = { id: "c-1" }
    // Contact has exactly tag-1; new selection is still tag-1
    state.txContactToTagsFindMany = [{ tagId: "tag-1" }]
    state.txTagFindMany = [{ id: "tag-1", name: "alpha" }]

    await updateContactTags({
      workspaceId: "ws-1",
      parsedInput: { contactId: "c-1", tags: ["alpha"] },
    })

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  // ── emitTagApplied throws during update → swallowed, enqueueAttach still called

  test("swallows emitTagApplied errors in updateContactTags and still calls enqueueAttach", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    state.txTagFindMany = [{ id: "tag-1", name: "alpha" }]
    emitTagApplied.mockRejectedValue(new Error("bus failure"))

    await expect(
      updateContactTags({
        workspaceId: "ws-1",
        parsedInput: { contactId: "c-1", tags: ["alpha"] },
      }),
    ).resolves.toBeDefined()

    expect(enqueueAttach).toHaveBeenCalledOnce()
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
  })

  // ── returns the tag list from the transaction ─────────────────────────────

  test("returns the resolved tag list as TagResource[]", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    const resolvedTags = [{ id: "tag-1", name: "alpha", workspaceId: "ws-1" }]
    state.txTagFindMany = resolvedTags

    const result = await updateContactTags({
      workspaceId: "ws-1",
      parsedInput: { contactId: "c-1", tags: ["alpha"] },
    })

    expect(result).toEqual(resolvedTags)
  })

  // ── invalidateCacheByTags called ────────────────────────────────────────────

  test("calls invalidateCacheByTags with correct workspace cache keys", async () => {
    state.findOrFailResult = { id: "c-1" }
    state.txContactToTagsFindMany = []
    state.txTagFindMany = []

    await updateContactTags({
      workspaceId: "ws-7",
      parsedInput: { contactId: "c-1", tags: [] },
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "workspaces:ws-7#contacts",
      "workspaces:ws-7#conversations",
      "workspaces:ws-7#tags",
    ])
  })
})
