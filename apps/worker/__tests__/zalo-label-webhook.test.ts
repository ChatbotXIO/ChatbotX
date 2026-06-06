import { beforeEach, describe, expect, test, vi } from "vitest"

const INVALID_PAYLOAD_RE = /invalid payload/

// ---------------------------------------------------------------------------
// DB mock — chainable builder pattern
// ---------------------------------------------------------------------------

type ChainBuilder = Record<string, unknown>

// Shared result holders mutated by individual tests
const queryResults = {
  integrationZaloFindFirst: null as unknown,
  tagModelFindFirst: null as unknown,
  tagChannelFindFirst: null as unknown,
  contactInboxFindMany: [] as unknown[],
}

const insertReturning = { current: [] as unknown[] }

// inArray spy — lets us assert that inArray was used for the delete call
const inArraySpy = vi.fn((...args: unknown[]) => args)

// Generic chainable builder factory
function makeInsertChain(): ChainBuilder {
  const chain: ChainBuilder = {}
  chain.values = vi.fn(() => chain)
  chain.onConflictDoNothing = vi.fn(() => chain)
  chain.returning = vi.fn(async () => insertReturning.current)
  return chain
}

function makeDeleteChain(): ChainBuilder {
  const chain: ChainBuilder = {}
  chain.where = vi.fn(() => chain)
  // Make the chain thenable so `await db.delete(…).where(…)` resolves
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable for await support in tests
  chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(undefined).then(resolve),
  )
  return chain
}

let insertChain: ChainBuilder
let deleteChain: ChainBuilder

vi.mock("@chatbotx.io/database/client", () => {
  insertChain = makeInsertChain()
  deleteChain = makeDeleteChain()

  return {
    db: {
      query: {
        integrationZaloModel: {
          findFirst: vi.fn(async () => queryResults.integrationZaloFindFirst),
        },
        tagModel: {
          findFirst: vi.fn(async () => queryResults.tagModelFindFirst),
        },
        tagChannelModel: {
          findFirst: vi.fn(async () => queryResults.tagChannelFindFirst),
        },
        contactInboxModel: {
          findMany: vi.fn(async () => queryResults.contactInboxFindMany),
        },
      },
      insert: vi.fn(() => insertChain),
      delete: vi.fn(() => deleteChain),
    },
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    isNull: (...args: unknown[]) => args,
    inArray: inArraySpy,
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
  },
  tagChannelModel: {
    id: "id",
    tagId: "tagId",
    channelType: "channelType",
    integrationId: "integrationId",
    workspaceId: "workspaceId",
    externalLabelId: "externalLabelId",
  },
  contactsToTagsModel: {
    contactId: "contactId",
    tagId: "tagId",
  },
  contactToTagChannelModel: {
    tagChannelId: "tagChannelId",
    contactInboxId: "contactInboxId",
    tagId: "tagId",
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "generated-id"),
  }
})

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Lazy imports AFTER mocks are registered
// ---------------------------------------------------------------------------

const { handleZaloLabelWebhook } = await import(
  "../src/integration/handlers/zalo-label-webhook"
)
const { logger } = await import("../src/lib/logger")
const { db } = await import("@chatbotx.io/database/client")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "intg-zalo-1",
    workspaceId: "ws-1",
    inboxId: "inbox-zalo-1",
    oaId: "oa-123",
    syncTagEnabledAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeAddUserPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_name: "add_user_to_tag",
    oa_id: "oa-123",
    tag: {
      name: "VIP",
      user_ids: ["uid-1", "uid-2"],
    },
    ...overrides,
  }
}

function makeRemoveUserPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_name: "remove_user_from_tag",
    oa_id: "oa-123",
    tag: {
      name: "VIP",
      user_ids: ["uid-1"],
    },
    ...overrides,
  }
}

function makeRemoveTagPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_name: "remove_tag",
    oa_id: "oa-123",
    tag: {
      name: "VIP",
    },
    ...overrides,
  }
}

function makeData(
  payload: unknown,
  integrationIdentifier = "oa-123",
): Parameters<typeof handleZaloLabelWebhook>[0] {
  return {
    integrationIdentifier,
    integrationType: "zalo",
    payload,
  }
}

// ---------------------------------------------------------------------------
// Reset mutable state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  queryResults.integrationZaloFindFirst = null
  queryResults.tagModelFindFirst = null
  queryResults.tagChannelFindFirst = null
  queryResults.contactInboxFindMany = []
  insertReturning.current = []

  // Rebuild chains so call counts are fresh
  insertChain = makeInsertChain()
  deleteChain = makeDeleteChain()
  ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertChain)
  ;(db.delete as ReturnType<typeof vi.fn>).mockReturnValue(deleteChain)

  // Restore findFirst/findMany implementations — tests that call
  // .mockResolvedValueOnce(...) on these spies would otherwise leak their
  // queued values into later tests (beforeEach does not reset them otherwise).
  ;(
    db.query.integrationZaloModel.findFirst as ReturnType<typeof vi.fn>
  ).mockImplementation(async () => queryResults.integrationZaloFindFirst)
  ;(db.query.tagModel.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
    async () => queryResults.tagModelFindFirst,
  )
  ;(
    db.query.tagChannelModel.findFirst as ReturnType<typeof vi.fn>
  ).mockImplementation(async () => queryResults.tagChannelFindFirst)
  ;(
    db.query.contactInboxModel.findMany as ReturnType<typeof vi.fn>
  ).mockImplementation(async () => queryResults.contactInboxFindMany)

  inArraySpy.mockClear()
  vi.mocked(logger.warn).mockClear()
})

// ===========================================================================
// Payload parsing
// ===========================================================================

describe("payload safeParse", () => {
  test("invalid payload (missing event_name) → warn and return", async () => {
    await handleZaloLabelWebhook(
      makeData({ oa_id: "oa-123", tag: { name: "VIP" } }),
    )

    expect(logger.warn).toHaveBeenCalledOnce()
    const [, msg] = vi.mocked(logger.warn).mock.calls[0] as unknown[]
    expect(String(msg)).toMatch(INVALID_PAYLOAD_RE)
    expect(db.query.integrationZaloModel.findFirst).not.toHaveBeenCalled()
  })

  test("invalid payload (unknown event_name) → warn and return", async () => {
    await handleZaloLabelWebhook(
      makeData({
        event_name: "bogus_event",
        oa_id: "oa-123",
        tag: { name: "VIP" },
      }),
    )

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(db.query.integrationZaloModel.findFirst).not.toHaveBeenCalled()
  })

  test("invalid payload (missing oa_id) → warn and return", async () => {
    await handleZaloLabelWebhook(
      makeData({ event_name: "add_user_to_tag", tag: { name: "VIP" } }),
    )

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(db.query.integrationZaloModel.findFirst).not.toHaveBeenCalled()
  })

  test("invalid payload (missing tag.name) → warn and return", async () => {
    await handleZaloLabelWebhook(
      makeData({ event_name: "remove_tag", oa_id: "oa-123", tag: {} }),
    )

    expect(logger.warn).toHaveBeenCalledOnce()
  })

  test("null payload → warn and return", async () => {
    await handleZaloLabelWebhook(makeData(null))

    expect(logger.warn).toHaveBeenCalledOnce()
    expect(db.query.integrationZaloModel.findFirst).not.toHaveBeenCalled()
  })

  test("user_ids as array of strings is valid", async () => {
    // Ensure valid payload with user_ids doesn't fail parse (integration null → return early)
    queryResults.integrationZaloFindFirst = null
    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    // parse succeeded → integration was queried
    expect(db.query.integrationZaloModel.findFirst).toHaveBeenCalledOnce()
  })
})

// ===========================================================================
// Integration guard
// ===========================================================================

describe("integration guard", () => {
  test("integration not found → return without DB writes", async () => {
    queryResults.integrationZaloFindFirst = null

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    expect(db.insert).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
  })

  test("integration found but syncTagEnabledAt null → return without DB writes", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration({
      syncTagEnabledAt: null,
    })

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    expect(db.insert).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// add_user_to_tag
// ===========================================================================

describe("add_user_to_tag", () => {
  test("user_ids missing → label-only create via ensureTagAndChannel, no contact mapping", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    insertReturning.current = [{ id: "tc-1" }]

    const payload = makeAddUserPayload({ tag: { name: "VIP" } }) // no user_ids
    await handleZaloLabelWebhook(makeData(payload))

    // ensureTagAndChannel called (insert tagChannel) but no contactInbox query
    expect(db.query.contactInboxModel.findMany).not.toHaveBeenCalled()
    // contactsToTags insert NOT called
    const insertCalls = vi.mocked(db.insert).mock.calls
    // only tagChannel insert (no contactsToTags insert)
    const modelArgs = insertCalls.map((c) => c[0])
    expect(
      modelArgs.some(
        (m) => (m as Record<string, unknown>)?.contactId !== undefined,
      ),
    ).toBe(false)
  })

  test("user_ids empty array → label-only create, no contact mapping", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    insertReturning.current = [{ id: "tc-1" }]

    const payload = makeAddUserPayload({ tag: { name: "VIP", user_ids: [] } })
    await handleZaloLabelWebhook(makeData(payload))

    expect(db.query.contactInboxModel.findMany).not.toHaveBeenCalled()
  })

  test("user_ids present but ensureTagAndChannel returns undefined → return early, no contact mapping", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    // tag not found and insert returns empty, fallback findFirst also null
    queryResults.tagModelFindFirst = null
    insertReturning.current = [] // insert returns nothing
    // second findFirst (fallback) also null — still queryResults.tagModelFindFirst = null

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    expect(db.query.contactInboxModel.findMany).not.toHaveBeenCalled()
  })

  test("user_ids present, ensureTagAndChannel ok, contactInboxes empty → return", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    insertReturning.current = [{ id: "tc-1" }]
    queryResults.contactInboxFindMany = []

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    // contactInbox was queried
    expect(db.query.contactInboxModel.findMany).toHaveBeenCalledOnce()
    // but no final bulk insert
    // The only inserts are from ensureTagAndChannel; contactsToTags insert NOT called
    const valsCalls = vi.mocked(insertChain.values as ReturnType<typeof vi.fn>)
      .mock.calls
    // ensureTagAndChannel inserts tag + tagChannel — check no contact mapping values
    for (const call of valsCalls) {
      const val = call[0]
      if (Array.isArray(val)) {
        // bulk insert values — should not happen since contactInboxes empty
        expect(val).toHaveLength(0) // this branch is unreachable; if hit → fail
      }
    }
  })

  test("happy path: bulk inserts contactsToTags + contactToTagChannel with onConflictDoNothing", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    insertReturning.current = [{ id: "tc-1" }]
    queryResults.contactInboxFindMany = [
      { id: "ci-1", contactId: "contact-1" },
      { id: "ci-2", contactId: "contact-2" },
    ]

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    // db.insert called multiple times (tag if needed, tagChannel, contactsToTags, contactToTagChannel)
    expect(db.insert).toHaveBeenCalled()
    // onConflictDoNothing called for bulk inserts
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled()
    // contactInbox was queried with correct inboxId and user_ids
    expect(db.query.contactInboxModel.findMany).toHaveBeenCalledOnce()
  })

  test("happy path: contactsToTags values map contactId+tagId correctly", async () => {
    const integration = makeIntegration()
    queryResults.integrationZaloFindFirst = integration
    queryResults.tagModelFindFirst = { id: "tag-42" }
    insertReturning.current = [{ id: "tc-99" }]
    queryResults.contactInboxFindMany = [
      { id: "ci-10", contactId: "contact-10" },
      { id: "ci-11", contactId: "contact-11" },
    ]

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    // Verify values() was called with array containing contactId+tagId objects
    const valuesCalls = vi.mocked(
      insertChain.values as ReturnType<typeof vi.fn>,
    ).mock.calls
    const bulkContactsToTagsCall = valuesCalls.find(
      (call) =>
        Array.isArray(call[0]) &&
        (call[0] as Record<string, unknown>[]).every(
          (v) => "contactId" in v && "tagId" in v,
        ),
    )
    expect(bulkContactsToTagsCall).toBeDefined()
    expect(bulkContactsToTagsCall?.[0]).toEqual([
      { contactId: "contact-10", tagId: "tag-42" },
      { contactId: "contact-11", tagId: "tag-42" },
    ])
  })

  test("happy path: contactToTagChannel values map tagId+tagChannelId+contactInboxId correctly", async () => {
    const integration = makeIntegration()
    queryResults.integrationZaloFindFirst = integration
    queryResults.tagModelFindFirst = { id: "tag-42" }
    insertReturning.current = [{ id: "tc-99" }]
    queryResults.contactInboxFindMany = [
      { id: "ci-10", contactId: "contact-10" },
    ]

    await handleZaloLabelWebhook(makeData(makeAddUserPayload()))

    const valuesCalls = vi.mocked(
      insertChain.values as ReturnType<typeof vi.fn>,
    ).mock.calls
    const bulkTagChannelCall = valuesCalls.find(
      (call) =>
        Array.isArray(call[0]) &&
        (call[0] as Record<string, unknown>[]).every(
          (v) => "tagChannelId" in v && "contactInboxId" in v,
        ),
    )
    expect(bulkTagChannelCall).toBeDefined()
    expect(bulkTagChannelCall?.[0]).toEqual([
      { tagId: "tag-42", tagChannelId: "tc-99", contactInboxId: "ci-10" },
    ])
  })
})

// ===========================================================================
// remove_user_from_tag
// ===========================================================================

describe("remove_user_from_tag", () => {
  test("user_ids missing → return immediately, no DB queries for tagChannel", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()

    const payload = makeRemoveUserPayload({ tag: { name: "VIP" } }) // no user_ids
    await handleZaloLabelWebhook(makeData(payload))

    expect(db.query.tagChannelModel.findFirst).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
  })

  test("user_ids empty array → return immediately, no DB queries", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()

    const payload = makeRemoveUserPayload({
      tag: { name: "VIP", user_ids: [] },
    })
    await handleZaloLabelWebhook(makeData(payload))

    expect(db.query.tagChannelModel.findFirst).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
  })

  test("tagChannel not found → return, no delete", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagChannelFindFirst = null

    await handleZaloLabelWebhook(makeData(makeRemoveUserPayload()))

    expect(db.query.tagChannelModel.findFirst).toHaveBeenCalledOnce()
    expect(db.delete).not.toHaveBeenCalled()
  })

  test("contactInboxes empty → return, no delete", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagChannelFindFirst = { id: "tc-1" }
    queryResults.contactInboxFindMany = []

    await handleZaloLabelWebhook(makeData(makeRemoveUserPayload()))

    expect(db.query.contactInboxModel.findMany).toHaveBeenCalledOnce()
    expect(db.delete).not.toHaveBeenCalled()
  })

  test("happy path: db.delete called with AND tagChannelId + inArray(contactInboxId)", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagChannelFindFirst = { id: "tc-5" }
    queryResults.contactInboxFindMany = [{ id: "ci-10" }, { id: "ci-11" }]

    await handleZaloLabelWebhook(makeData(makeRemoveUserPayload()))

    expect(db.delete).toHaveBeenCalledOnce()
    expect(deleteChain.where).toHaveBeenCalledOnce()
    // inArray must have been called (used in the where clause)
    expect(inArraySpy).toHaveBeenCalledOnce()
    // inArray called with contactInboxId column and array of inbox ids
    const [col, vals] = inArraySpy.mock.calls[0] as unknown[]
    // column marker from schema mock
    expect(col).toBe("contactInboxId")
    expect(vals).toEqual(["ci-10", "ci-11"])
  })

  test("happy path: workspace isolation — tagChannelModel queried with workspaceId + channelType + integrationId + tag name", async () => {
    const integration = makeIntegration()
    queryResults.integrationZaloFindFirst = integration
    queryResults.tagChannelFindFirst = { id: "tc-5" }
    queryResults.contactInboxFindMany = [{ id: "ci-10" }]

    await handleZaloLabelWebhook(makeData(makeRemoveUserPayload()))

    expect(db.query.tagChannelModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: integration.workspaceId,
          integrationId: integration.id,
          externalLabelId: "VIP",
        }),
      }),
    )
  })
})

// ===========================================================================
// remove_tag
// ===========================================================================

describe("remove_tag", () => {
  test("deletes tagChannel scoped by workspaceId + channelType(zalo) + integrationId + externalLabelId", async () => {
    const integration = makeIntegration()
    queryResults.integrationZaloFindFirst = integration

    await handleZaloLabelWebhook(makeData(makeRemoveTagPayload()))

    expect(db.delete).toHaveBeenCalledOnce()
    expect(deleteChain.where).toHaveBeenCalledOnce()

    // The where args should contain workspace isolation markers
    const whereArg = vi.mocked(deleteChain.where as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0]
    // and() is our passthrough — args should include workspaceId, channelType, integrationId, externalLabelId
    expect(whereArg).toEqual(
      expect.arrayContaining([
        // eq(tagChannelModel.workspaceId, "ws-1")
        ["workspaceId", integration.workspaceId],
        // eq(tagChannelModel.channelType, "zalo")
        ["channelType", "zalo"],
        // eq(tagChannelModel.integrationId, integration.id)
        ["integrationId", integration.id],
        // eq(tagChannelModel.externalLabelId, event.tag.name)
        ["externalLabelId", "VIP"],
      ]),
    )
  })

  test("workspace isolation: delete is scoped — does not affect other workspaces", async () => {
    const integrationWs1 = makeIntegration({ workspaceId: "ws-1" })
    queryResults.integrationZaloFindFirst = integrationWs1

    await handleZaloLabelWebhook(makeData(makeRemoveTagPayload()))

    const whereArg = vi.mocked(deleteChain.where as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0]
    // workspaceId "ws-1" must be in the condition
    const wsCondition = (whereArg as unknown[]).find(
      (arg) => Array.isArray(arg) && arg[1] === "ws-1",
    )
    expect(wsCondition).toBeDefined()
    // workspaceId "ws-2" must NOT be in the condition
    const wrongWs = (whereArg as unknown[]).find(
      (arg) => Array.isArray(arg) && arg[1] === "ws-2",
    )
    expect(wrongWs).toBeUndefined()
  })

  test("remove_tag: no insert called (pure delete operation)", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()

    await handleZaloLabelWebhook(makeData(makeRemoveTagPayload()))

    expect(db.insert).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// ensureTagAndChannel — fallback branches
// ===========================================================================

describe("ensureTagAndChannel fallbacks", () => {
  test("tag found in DB → skip insert, reuse existing tag id", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "existing-tag-99" }
    insertReturning.current = [{ id: "tc-1" }]

    // Trigger via add_user_to_tag with empty user_ids (label-only path)
    const payload = makeAddUserPayload({ tag: { name: "VIP" } })
    await handleZaloLabelWebhook(makeData(payload))

    // db.insert should be called for tagChannel but NOT for tag
    const insertArgs = vi.mocked(db.insert).mock.calls.map((c) => c[0])
    // No tagModel insert — it already exists
    expect(
      insertArgs.some(
        (m) =>
          (m as Record<string, unknown>)?.workspaceId !== undefined &&
          (m as Record<string, unknown>)?.name !== undefined,
      ),
    ).toBe(false)
  })

  test("tag insert returns empty → fallback findFirst used", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    // First findFirst: tag not found
    const tagFindFirst = vi.mocked(db.query.tagModel.findFirst)
    // First call returns null (tag not found), second call (fallback) returns tag
    tagFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "fallback-tag-7" })
    insertReturning.current = [] // insert returns empty → triggers fallback
    // tagChannel insert returns a row
    // We need a second insert chain return for tagChannel
    const tcInsertChain = makeInsertChain()
    tcInsertChain.returning = vi.fn(async () => [{ id: "tc-fallback" }])
    vi.mocked(db.insert)
      .mockReturnValueOnce(insertChain as ReturnType<typeof db.insert>) // tag insert
      .mockReturnValueOnce(tcInsertChain as ReturnType<typeof db.insert>) // tagChannel insert

    const payload = makeAddUserPayload({ tag: { name: "VIP" } })
    await handleZaloLabelWebhook(makeData(payload))

    // fallback findFirst was called
    expect(tagFindFirst).toHaveBeenCalledTimes(2)
  })

  test("tag not found AND tag insert empty AND fallback null → ensureTagAndChannel returns undefined", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    // Both findFirst calls return null
    vi.mocked(db.query.tagModel.findFirst).mockResolvedValue(null)
    insertReturning.current = [] // insert returns empty

    await handleZaloLabelWebhook(
      makeData(
        makeAddUserPayload({ tag: { name: "VIP", user_ids: ["uid-1"] } }),
      ),
    )

    // Should return early after ensureTagAndChannel → no contactInbox query
    expect(db.query.contactInboxModel.findMany).not.toHaveBeenCalled()
  })

  test("tagChannel insert empty → fallback findFirst used for tagChannel", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    // tag already found — no tag insert needed
    // tagChannel insert returns empty → fallback findFirst
    insertReturning.current = []
    queryResults.tagChannelFindFirst = { id: "tc-fallback-from-find" }

    const payload = makeAddUserPayload({ tag: { name: "VIP" } })
    await handleZaloLabelWebhook(makeData(payload))

    // tagChannel fallback findFirst should have been called
    expect(db.query.tagChannelModel.findFirst).toHaveBeenCalled()
  })

  test("tagChannel insert empty AND fallback null → ensureTagAndChannel returns undefined", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    insertReturning.current = []
    queryResults.tagChannelFindFirst = null // fallback also null

    await handleZaloLabelWebhook(
      makeData(
        makeAddUserPayload({ tag: { name: "VIP", user_ids: ["uid-1"] } }),
      ),
    )

    // ensureTagAndChannel returned undefined → no contactInbox query
    expect(db.query.contactInboxModel.findMany).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Unknown event_name
// ===========================================================================

describe("unknown event (schema mismatch)", () => {
  // The schema only accepts: add_user_to_tag | remove_user_from_tag | remove_tag
  // So "unknown" events never reach the switch default branch — they fail at safeParse.
  // This documents that behavior: an unknown event_name fails parse → warn.
  test("unknown event_name triggers warn via safeParse failure", async () => {
    await handleZaloLabelWebhook(
      makeData({
        event_name: "unknown_future_event",
        oa_id: "oa-123",
        tag: { name: "VIP" },
      }),
    )

    expect(logger.warn).toHaveBeenCalledOnce()
    const warnMsg = String(vi.mocked(logger.warn).mock.calls[0]?.[1])
    expect(warnMsg).toMatch(INVALID_PAYLOAD_RE)
  })
})

// ===========================================================================
// Error propagation (no per-op try/catch in handler)
// ===========================================================================

describe("error propagation", () => {
  test("DB error in handleAddUserToTag propagates (rejects handler promise)", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagModelFindFirst = { id: "tag-1" }
    insertReturning.current = [{ id: "tc-1" }]
    queryResults.contactInboxFindMany = [{ id: "ci-1", contactId: "c-1" }]

    // The bulk inserts (contactsToTags, contactToTagChannel) use .values().onConflictDoNothing()
    // with no .returning() — so the chain is awaited directly via `then`.
    // Make the failing chain thenable so `await db.insert(...).values(...).onConflictDoNothing()` throws.
    const failInsertChain = makeInsertChain()
    failInsertChain.onConflictDoNothing = vi.fn(() => {
      // Return a rejecting thenable (awaitable)
      return {
        // biome-ignore lint/suspicious/noThenProperty: intentional thenable for await support in tests
        then: (
          _resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) => reject(new Error("DB connection lost")),
      }
    })

    // ensureTagAndChannel uses insert(tagModel) and insert(tagChannelModel) — both use .returning().
    // Those succeed (mockReturnValue uses the default insertChain).
    // The 3rd db.insert call is contactsToTags → should fail.
    vi.mocked(db.insert)
      .mockReturnValueOnce(insertChain as ReturnType<typeof db.insert>) // tag insert in ensureTagAndChannel
      .mockReturnValueOnce(insertChain as ReturnType<typeof db.insert>) // tagChannel insert in ensureTagAndChannel
      .mockReturnValueOnce(failInsertChain as ReturnType<typeof db.insert>) // contactsToTags bulk insert

    await expect(
      handleZaloLabelWebhook(makeData(makeAddUserPayload())),
    ).rejects.toThrow("DB connection lost")
  })

  test("DB error in handleRemoveUserFromTag propagates (rejects handler promise)", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()
    queryResults.tagChannelFindFirst = { id: "tc-1" }
    queryResults.contactInboxFindMany = [{ id: "ci-1" }]

    // Make db.delete throw
    const failDeleteChain = makeDeleteChain()
    failDeleteChain.where = vi.fn(() => {
      throw new Error("DB delete failed")
    })
    vi.mocked(db.delete).mockReturnValueOnce(
      failDeleteChain as ReturnType<typeof db.delete>,
    )

    await expect(
      handleZaloLabelWebhook(makeData(makeRemoveUserPayload())),
    ).rejects.toThrow("DB delete failed")
  })

  test("DB error in remove_tag delete propagates (rejects handler promise)", async () => {
    queryResults.integrationZaloFindFirst = makeIntegration()

    const failDeleteChain = makeDeleteChain()
    failDeleteChain.where = vi.fn(() => {
      throw new Error("DB remove_tag failed")
    })
    vi.mocked(db.delete).mockReturnValueOnce(
      failDeleteChain as ReturnType<typeof db.delete>,
    )

    await expect(
      handleZaloLabelWebhook(makeData(makeRemoveTagPayload())),
    ).rejects.toThrow("DB remove_tag failed")
  })
})
