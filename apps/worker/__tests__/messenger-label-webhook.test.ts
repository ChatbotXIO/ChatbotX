import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// DB mock — chainable builder pattern (mirrors sync-tag.test.ts)
// ---------------------------------------------------------------------------

type ChainBuilder = Record<string, unknown>

const queryResults = {
  integrationMessengerFindFirst: null as unknown,
  tagModelFindFirst: null as unknown,
  tagChannelFindFirst: null as unknown,
  contactInboxFindFirst: null as unknown,
}

// Shared mutable holder for insert returning values
const insertReturning = { current: [] as unknown[] }

// Generic chainable builder for insert / delete chains
function makeChain(): ChainBuilder {
  const builder: ChainBuilder = {}
  const noop = () => builder
  builder.values = vi.fn(noop)
  builder.where = vi.fn(noop)
  builder.onConflictDoNothing = vi.fn(noop)
  builder.returning = vi.fn(async () => insertReturning.current)
  return builder
}

const insertChain = makeChain()
const deleteChain = makeChain()

// deleteChain.where() must be awaitable (no .returning() call on delete path)
;(deleteChain.where as ReturnType<typeof vi.fn>).mockImplementation(
  async () => undefined,
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMessengerModel: {
        findFirst: vi.fn(
          async () => queryResults.integrationMessengerFindFirst,
        ),
      },
      tagModel: {
        findFirst: vi.fn(async () => queryResults.tagModelFindFirst),
      },
      tagChannelModel: {
        findFirst: vi.fn(async () => queryResults.tagChannelFindFirst),
      },
      contactInboxModel: {
        findFirst: vi.fn(async () => queryResults.contactInboxFindFirst),
      },
    },
    insert: vi.fn(() => insertChain),
    delete: vi.fn(() => deleteChain),
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
}))

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
    tagId: "tagId",
    tagChannelId: "tagChannelId",
    contactInboxId: "contactInboxId",
  },
}))

// ---------------------------------------------------------------------------
// createId mock — returns predictable ids
// ---------------------------------------------------------------------------

const createId = vi.fn(() => "generated-id")
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId }
})

// ---------------------------------------------------------------------------
// Logger — silence / spy
// ---------------------------------------------------------------------------

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Lazy imports AFTER mocks
// ---------------------------------------------------------------------------

const { handleMessengerLabelWebhook } = await import(
  "../src/integration/handlers/messenger-label-webhook"
)
const { logger } = await import("../src/lib/logger")
const { db } = await import("@chatbotx.io/database/client")
const {
  tagModel,
  tagChannelModel,
  contactsToTagsModel,
  contactToTagChannelModel,
} = await import("@chatbotx.io/database/schema")

// ---------------------------------------------------------------------------
// Typed cast helpers
// ---------------------------------------------------------------------------

const dbInsert = db.insert as ReturnType<typeof vi.fn>
const dbDelete = db.delete as ReturnType<typeof vi.fn>
const loggerWarn = logger.warn as ReturnType<typeof vi.fn>
const integrationFindFirst = db.query.integrationMessengerModel
  .findFirst as ReturnType<typeof vi.fn>
const tagFindFirst = db.query.tagModel.findFirst as ReturnType<typeof vi.fn>
const tagChannelFindFirst = db.query.tagChannelModel.findFirst as ReturnType<
  typeof vi.fn
>
const contactInboxFindFirst = db.query.contactInboxModel
  .findFirst as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

const PAGE_ID = "page-123"
const WS_ID = "ws-1"
const INTEGRATION_ID = "intg-msg-1"
const INBOX_ID = "inbox-1"
const LABEL_ID = "label-ext-1"
const LABEL_NAME = "VIP"
const USER_PSID = "psid-abc"

function makeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WS_ID,
    inboxId: INBOX_ID,
    pageId: PAGE_ID,
    syncTagEnabledAt: new Date("2026-01-01"),
    ...overrides,
  }
}

/** Build a valid messengerWebhookEventSchema payload with an inbox_labels change */
function makePayload(changeValue: Record<string, unknown>) {
  return {
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        time: 1_700_000_000,
        changes: [
          {
            field: "inbox_labels",
            value: changeValue,
          },
        ],
      },
    ],
  }
}

function makeData(
  payload: unknown,
): Parameters<typeof handleMessengerLabelWebhook>[0] {
  return {
    integrationIdentifier: PAGE_ID,
    integrationType: "messenger",
    payload,
  }
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  queryResults.integrationMessengerFindFirst = null
  queryResults.tagModelFindFirst = null
  queryResults.tagChannelFindFirst = null
  queryResults.contactInboxFindFirst = null
  insertReturning.current = []

  vi.clearAllMocks()

  // Restore delete chain where to async no-op after clearAllMocks
  ;(deleteChain.where as ReturnType<typeof vi.fn>).mockImplementation(
    async () => undefined,
  )

  // Restore insert chain defaults after clearAllMocks
  ;(insertChain.values as ReturnType<typeof vi.fn>).mockReturnValue(insertChain)
  ;(
    insertChain.onConflictDoNothing as ReturnType<typeof vi.fn>
  ).mockReturnValue(insertChain)
  ;(insertChain.returning as ReturnType<typeof vi.fn>).mockImplementation(
    async () => insertReturning.current,
  )

  dbInsert.mockReturnValue(insertChain)
  dbDelete.mockReturnValue(deleteChain)

  // Restore findFirst implementations after clearAllMocks — tests that call
  // .mockResolvedValue(...) on these spies would otherwise leak into later tests
  // (config uses clearMocks, which does not reset implementations).
  integrationFindFirst.mockImplementation(
    async () => queryResults.integrationMessengerFindFirst,
  )
  tagFindFirst.mockImplementation(async () => queryResults.tagModelFindFirst)
  tagChannelFindFirst.mockImplementation(
    async () => queryResults.tagChannelFindFirst,
  )
  contactInboxFindFirst.mockImplementation(
    async () => queryResults.contactInboxFindFirst,
  )
})

// ===========================================================================
// Test suites
// ===========================================================================

describe("handleMessengerLabelWebhook — payload parsing", () => {
  test("warns and returns early when payload fails safeParse", async () => {
    await handleMessengerLabelWebhook(makeData({ not: "valid" }))

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: PAGE_ID }),
      "messenger inbox_labels: invalid payload",
    )
    expect(dbInsert).not.toHaveBeenCalled()
    expect(dbDelete).not.toHaveBeenCalled()
    expect(integrationFindFirst).not.toHaveBeenCalled()
  })

  test("returns early when entry has no inbox_labels change", async () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          time: 1_700_000_000,
          changes: [
            {
              field: "messaging",
              value: { action: "some_other", label: { id: LABEL_ID } },
            },
          ],
        },
      ],
    }
    await handleMessengerLabelWebhook(makeData(payload))

    expect(integrationFindFirst).not.toHaveBeenCalled()
    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("returns early when entry has no changes at all", async () => {
    const payload = {
      object: "page",
      entry: [{ id: PAGE_ID, time: 1_700_000_000 }],
    }
    await handleMessengerLabelWebhook(makeData(payload))

    expect(integrationFindFirst).not.toHaveBeenCalled()
    expect(dbInsert).not.toHaveBeenCalled()
  })
})

describe("handleMessengerLabelWebhook — integration guard", () => {
  test("returns early when integration is not found", async () => {
    queryResults.integrationMessengerFindFirst = null
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    expect(dbInsert).not.toHaveBeenCalled()
    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("returns early when integration exists but syncTagEnabledAt is null", async () => {
    queryResults.integrationMessengerFindFirst = makeIntegration({
      syncTagEnabledAt: null,
    })
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    expect(dbInsert).not.toHaveBeenCalled()
  })
})

describe("handleMessengerLabelWebhook — create_label", () => {
  beforeEach(() => {
    queryResults.integrationMessengerFindFirst = makeIntegration()
  })

  test("returns early when page_label_name is missing", async () => {
    // label with no page_label_name (FB omits it on user add/remove events)
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({ action: "create_label", label: { id: LABEL_ID } }),
      ),
    )

    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("skips tag insert when tag already exists by name", async () => {
    queryResults.tagModelFindFirst = { id: "existing-tag-id" }
    insertReturning.current = [{ id: "tc-new-1" }]

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    // tagModel insert should NOT be called because tag was found
    const insertCalls = dbInsert.mock.calls.map((c: unknown[]) => c[0])
    expect(insertCalls).not.toContain(tagModel)
    // tagChannelModel insert SHOULD be called
    expect(insertCalls).toContain(tagChannelModel)
  })

  test("inserts tag with onConflictDoNothing when tag not found", async () => {
    queryResults.tagModelFindFirst = null
    insertReturning.current = [{ id: "new-tag-id" }]

    // tagChannelModel insert also returns an id
    let insertCallCount = 0
    dbInsert.mockImplementation((_model: unknown) => {
      insertCallCount++
      return insertChain
    })
    ;(insertChain.returning as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        // First insert = tagModel → return tag id
        // Second insert = tagChannelModel → return tagChannel id
        return Promise.resolve(
          insertCallCount === 1 ? [{ id: "new-tag-id" }] : [{ id: "tc-new-1" }],
        )
      },
    )

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    expect(dbInsert).toHaveBeenCalledWith(tagModel)
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled()
  })

  test("falls back to tagModel findFirst when insert returns empty (race)", async () => {
    queryResults.tagModelFindFirst = null
    // First insert (tagModel) returns empty → triggers fallback findFirst
    // Fallback findFirst returns an id
    let _insertCallCount = 0
    dbInsert.mockImplementation(() => {
      _insertCallCount++
      return insertChain
    })
    ;(insertChain.returning as ReturnType<typeof vi.fn>).mockImplementation(
      async () => [],
    )
    // Set up the fallback findFirst to return a tag
    tagFindFirst
      .mockResolvedValueOnce(null) // initial check → not found
      .mockResolvedValueOnce({ id: "race-tag-id" }) // fallback after empty insert

    // tagChannelModel insert returns id
    insertReturning.current = [{ id: "tc-race-1" }]
    ;(insertChain.returning as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // tagModel insert → empty
      .mockResolvedValueOnce([{ id: "tc-race-1" }]) // tagChannel insert → ok

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    // findFirst called twice: initial check + fallback
    expect(tagFindFirst).toHaveBeenCalledTimes(2)
    // tagChannelModel insert was reached (tag was resolved via fallback)
    expect(dbInsert).toHaveBeenCalledWith(tagChannelModel)
  })

  test("returns undefined (no-op) when both tag insert and fallback return nothing", async () => {
    queryResults.tagModelFindFirst = null
    tagFindFirst.mockResolvedValue(null) // all findFirst calls → null
    ;(insertChain.returning as ReturnType<typeof vi.fn>).mockResolvedValue([]) // insert returns empty

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    // Should not insert tagChannel since tagId is undefined
    const insertCalls = dbInsert.mock.calls.map((c: unknown[]) => c[0])
    expect(insertCalls).not.toContain(tagChannelModel)
  })

  test("falls back to tagChannelModel findFirst when tagChannel insert returns empty", async () => {
    queryResults.tagModelFindFirst = { id: "existing-tag-id" }
    queryResults.tagChannelFindFirst = { id: "existing-tc-id" }

    // tagChannel insert returns empty → triggers findFirst fallback
    ;(insertChain.returning as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    // tagChannelModel findFirst should be called as fallback
    expect(tagChannelFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        columns: { id: true },
      }),
    )
  })

  test("uses createId for new tag and tagChannel ids", async () => {
    queryResults.tagModelFindFirst = null
    createId.mockReturnValueOnce("tag-new-id").mockReturnValueOnce("tc-new-id")
    let callIdx = 0
    ;(insertChain.returning as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        callIdx++
        return Promise.resolve(
          callIdx === 1 ? [{ id: "tag-new-id" }] : [{ id: "tc-new-id" }],
        )
      },
    )

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "create_label",
          label: { id: LABEL_ID, page_label_name: LABEL_NAME },
        }),
      ),
    )

    expect(createId).toHaveBeenCalled()
    // Values passed to insert should include the generated ids
    const valuesCalls = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls
    expect(
      valuesCalls.some(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>)?.id === "tag-new-id",
      ),
    ).toBe(true)
  })
})

describe("handleMessengerLabelWebhook — delete_label (workspace isolation)", () => {
  beforeEach(() => {
    queryResults.integrationMessengerFindFirst = makeIntegration()
  })

  test("calls db.delete(tagChannelModel) with correct where clause", async () => {
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "delete_label",
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(dbDelete).toHaveBeenCalledWith(tagChannelModel)
    expect(deleteChain.where).toHaveBeenCalled()
  })

  test("where clause includes workspaceId — workspace isolation", async () => {
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "delete_label",
          label: { id: LABEL_ID },
        }),
      ),
    )

    const whereArgs = (deleteChain.where as ReturnType<typeof vi.fn>).mock
      .calls[0]
    // The `and(...)` call returns its args as an array (per our mock)
    // whereArgs[0] is the result of and(...conditions)
    const conditions = whereArgs[0] as unknown[]
    // Conditions should include workspaceId, channelType, integrationId, externalLabelId
    expect(conditions).toHaveLength(4)
  })

  test("where clause uses integration.workspaceId (not some other workspace)", async () => {
    const integration = makeIntegration({ workspaceId: "ws-specific" })
    queryResults.integrationMessengerFindFirst = integration

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "delete_label",
          label: { id: LABEL_ID },
        }),
      ),
    )

    // eq() mock returns its args — find the eq call with workspaceId field
    // The and() wrapper returns array of eq results
    // Each eq() call is captured in the conditions
    const whereArgs = (deleteChain.where as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const conditions = whereArgs[0] as unknown[][]
    // One condition should be [tagChannelModel.workspaceId, "ws-specific"]
    const wsCondition = conditions.find(
      (c) => Array.isArray(c) && c[1] === "ws-specific",
    )
    expect(wsCondition).toBeDefined()
  })

  test("scopes delete by integrationId and externalLabelId", async () => {
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "delete_label",
          label: { id: "specific-label-ext-id" },
        }),
      ),
    )

    const whereArgs = (deleteChain.where as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const conditions = whereArgs[0] as unknown[][]
    // externalLabelId condition
    const labelCondition = conditions.find(
      (c) => Array.isArray(c) && c[1] === "specific-label-ext-id",
    )
    expect(labelCondition).toBeDefined()
    // integrationId condition
    const integrationCondition = conditions.find(
      (c) => Array.isArray(c) && c[1] === INTEGRATION_ID,
    )
    expect(integrationCondition).toBeDefined()
  })
})

describe("handleMessengerLabelWebhook — add_label", () => {
  beforeEach(() => {
    queryResults.integrationMessengerFindFirst = makeIntegration()
  })

  test("returns early when user is missing from change value", async () => {
    // No user field
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "add_label",
          label: { id: LABEL_ID },
          // user omitted
        }),
      ),
    )

    expect(contactInboxFindFirst).not.toHaveBeenCalled()
    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("returns early when contactInbox not found (resolveContactAndTagChannel → null)", async () => {
    queryResults.contactInboxFindFirst = null
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "add_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("returns early when tagChannel not found (resolveContactAndTagChannel → null)", async () => {
    queryResults.contactInboxFindFirst = { id: "ci-1", contactId: "contact-1" }
    queryResults.tagChannelFindFirst = null

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "add_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("inserts contactsToTags and contactToTagChannel when resolved", async () => {
    queryResults.contactInboxFindFirst = { id: "ci-1", contactId: "contact-1" }
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }
    insertReturning.current = []

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "add_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    const insertCalls = dbInsert.mock.calls.map((c: unknown[]) => c[0])
    expect(insertCalls).toContain(contactsToTagsModel)
    expect(insertCalls).toContain(contactToTagChannelModel)
  })

  test("uses onConflictDoNothing for both inserts (idempotent)", async () => {
    queryResults.contactInboxFindFirst = { id: "ci-1", contactId: "contact-1" }
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "add_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(2)
  })

  test("passes correct contactId, tagId, tagChannelId, contactInboxId to inserts", async () => {
    queryResults.contactInboxFindFirst = {
      id: "ci-resolved",
      contactId: "contact-resolved",
    }
    queryResults.tagChannelFindFirst = {
      id: "tc-resolved",
      tagId: "tag-resolved",
    }

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "add_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    const valuesCalls = (insertChain.values as ReturnType<typeof vi.fn>).mock
      .calls
    const contactsToTagsValues = valuesCalls[0]?.[0] as Record<string, string>
    expect(contactsToTagsValues).toMatchObject({
      contactId: "contact-resolved",
      tagId: "tag-resolved",
    })
    const contactToTagChannelValues = valuesCalls[1]?.[0] as Record<
      string,
      string
    >
    expect(contactToTagChannelValues).toMatchObject({
      tagId: "tag-resolved",
      tagChannelId: "tc-resolved",
      contactInboxId: "ci-resolved",
    })
  })
})

describe("handleMessengerLabelWebhook — remove_label", () => {
  beforeEach(() => {
    queryResults.integrationMessengerFindFirst = makeIntegration()
  })

  test("returns early when user is missing", async () => {
    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "remove_label",
          label: { id: LABEL_ID },
          // no user
        }),
      ),
    )

    expect(contactInboxFindFirst).not.toHaveBeenCalled()
    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("returns early when contactInbox not found", async () => {
    queryResults.contactInboxFindFirst = null
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "remove_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("returns early when tagChannel not found", async () => {
    queryResults.contactInboxFindFirst = { id: "ci-1", contactId: "contact-1" }
    queryResults.tagChannelFindFirst = null

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "remove_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("deletes contactToTagChannel row when resolved", async () => {
    queryResults.contactInboxFindFirst = { id: "ci-1", contactId: "contact-1" }
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "remove_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(dbDelete).toHaveBeenCalledWith(contactToTagChannelModel)
    expect(deleteChain.where).toHaveBeenCalled()
  })

  test("where clause for remove_label scoped by tagChannelId and contactInboxId", async () => {
    queryResults.contactInboxFindFirst = {
      id: "ci-specific",
      contactId: "contact-1",
    }
    queryResults.tagChannelFindFirst = {
      id: "tc-specific",
      tagId: "tag-1",
    }

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "remove_label",
          user: { id: USER_PSID },
          label: { id: LABEL_ID },
        }),
      ),
    )

    const whereArgs = (deleteChain.where as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const conditions = whereArgs[0] as unknown[][]
    // Should scope by tagChannelId
    const tcCondition = conditions.find(
      (c) => Array.isArray(c) && c[1] === "tc-specific",
    )
    expect(tcCondition).toBeDefined()
    // Should scope by contactInboxId
    const ciCondition = conditions.find(
      (c) => Array.isArray(c) && c[1] === "ci-specific",
    )
    expect(ciCondition).toBeDefined()
  })
})

describe("handleMessengerLabelWebhook — unknown action", () => {
  test("warns with action name and does not throw", async () => {
    queryResults.integrationMessengerFindFirst = makeIntegration()

    await handleMessengerLabelWebhook(
      makeData(
        makePayload({
          action: "some_future_action",
          label: { id: LABEL_ID },
        }),
      ),
    )

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "some_future_action" }),
      "messenger inbox_labels: unknown action",
    )
    expect(dbInsert).not.toHaveBeenCalled()
    expect(dbDelete).not.toHaveBeenCalled()
  })
})
