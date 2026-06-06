import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Design notes:
//
// - chunkById is mocked to call queryBuilder(null) then stop (single chunk).
//   Dedicated pagination tests override this mock per-test with a two-call
//   sequence so we can assert cursor-pagination args against findMany.
// - Each insert builder is a shared chainable stub; state.* slots let tests
//   override what .returning() resolves to.
// - insertCalls[] tracks the table-name sequence across a single test run and
//   is reset in beforeEach.
// - vi.mock() factories run once (hoisted), so state mutations happen through
//   the shared `state` object — NOT through re-declaring mocks.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared state — mutated per test via beforeEach / within each test
// ---------------------------------------------------------------------------
const state = {
  messengerIntegration: null as Record<string, unknown> | null,
  zaloIntegration: null as Record<string, unknown> | null,
  // findMany returns this list once, then returns [] on subsequent calls
  // (unless a test overrides the spy directly).
  contactInboxRows: [] as Record<string, unknown>[],
  tagReturning: [{ id: "tag-1" }] as { id: string }[],
  tagChannelReturning: [{ id: "tc-1" }] as { id: string }[],
}

// Track insert table names in call order.
const insertCalls: string[] = []

// ---------------------------------------------------------------------------
// Chainable insert builder — shared instances, returning-result driven by state
// ---------------------------------------------------------------------------
type InsertBuilder = {
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  onConflictDoNothing: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
}

function makeBuilder(getResult: () => unknown[]): InsertBuilder {
  const b = {} as InsertBuilder
  b.values = vi.fn(() => b)
  b.onConflictDoUpdate = vi.fn(() => b)
  b.onConflictDoNothing = vi.fn(() => Promise.resolve([]))
  b.returning = vi.fn(() => Promise.resolve(getResult()))
  return b
}

const tagBuilder = makeBuilder(() => state.tagReturning)
const tagChannelBuilder = makeBuilder(() => state.tagChannelReturning)
const contactsToTagsBuilder = makeBuilder(() => [])
const contactToTagChannelBuilder = makeBuilder(() => [])

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/client
// ---------------------------------------------------------------------------
const findManySpy = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMessengerModel: {
        findFirst: vi.fn(async () => state.messengerIntegration),
      },
      integrationZaloModel: {
        findFirst: vi.fn(async () => state.zaloIntegration),
      },
      contactInboxModel: {
        findMany: findManySpy,
      },
    },
    insert: vi.fn((model: { tableName?: string }) => {
      const name = model.tableName ?? String(model)
      insertCalls.push(name)
      if (name === "Tag") {
        return tagBuilder
      }
      if (name === "TagChannel") {
        return tagChannelBuilder
      }
      if (name === "ContactToTag") {
        return contactsToTagsBuilder
      }
      if (name === "ContactToTagChannel") {
        return contactToTagChannelBuilder
      }
      return tagBuilder
    }),
  },
  sql: vi.fn((strings: TemplateStringsArray) => strings.raw.join("")),
  isNull: (...args: unknown[]) => args,
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/schema
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: { tableName: "Tag", workspaceId: "workspaceId", name: "name" },
  tagChannelModel: {
    tableName: "TagChannel",
    tagId: "tagId",
    channelType: "channelType",
    integrationId: "integrationId",
  },
  contactsToTagsModel: { tableName: "ContactToTag" },
  contactToTagChannelModel: { tableName: "ContactToTagChannel" },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/utils — chunkById
//
// Default behaviour: call queryBuilder(null) once, invoke callback with the
// result, then stop. This is equivalent to a single-chunk run.
// Pagination tests override `chunkByIdImpl` to simulate two-chunk runs.
// ---------------------------------------------------------------------------
let chunkByIdImpl: (
  queryBuilder: (lastId: string | null) => Promise<unknown[]>,
  options: { callback: (batch: unknown[]) => Promise<boolean | undefined> },
) => Promise<void>

// Single-chunk default — assigned before each test.
function singleChunkImpl(
  queryBuilder: (lastId: string | null) => Promise<unknown[]>,
  options: { callback: (batch: unknown[]) => Promise<boolean | undefined> },
): Promise<void> {
  return queryBuilder(null).then((batch) => {
    if (batch.length > 0) {
      return options.callback(batch)
    }
  })
}

vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: vi.fn(
    (
      queryBuilder: (lastId: string | null) => Promise<unknown[]>,
      options: { callback: (batch: unknown[]) => Promise<boolean | undefined> },
    ) => chunkByIdImpl(queryBuilder, options),
  ),
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/integration-messenger
// ---------------------------------------------------------------------------
const runChannelHandlerMock = vi.fn()
vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { runChannelHandler: runChannelHandlerMock },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/integration-zalo
// ---------------------------------------------------------------------------
const runActionMock = vi.fn()
vi.mock("@chatbotx.io/integration-zalo", () => ({
  integration: { runAction: runActionMock },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => ({ ctx: "mocked-context" })),
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/utils — partial, preserve zodBigintAsString etc.
// ---------------------------------------------------------------------------
let idCounter = 0
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => `gen-id-${++idCounter}`),
  }
})

// ---------------------------------------------------------------------------
// Import SUT — AFTER all vi.mock() calls
// ---------------------------------------------------------------------------
const { handleSyncChannelLabels } = await import(
  "../src/default/handlers/sync-channel-labels"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeMessengerIntegration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "integration-msn-1",
    inboxId: "inbox-1",
    auth: { accessToken: "tok-abc" },
    pageId: "page-123",
    workspaceId: "ws-1",
    ...overrides,
  }
}

function makeZaloIntegration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "integration-zalo-1",
    inboxId: "inbox-zalo-1",
    auth: { access_token: "zalo-tok" },
    oaId: "oa-999",
    workspaceId: "ws-2",
    ...overrides,
  }
}

function makeContactInbox(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "ci-1",
    contactId: "contact-1",
    inboxId: "inbox-1",
    sourceId: "psid-111",
    channel: "messenger",
    source: "messenger",
    ...overrides,
  }
}

function messengerJob(integrationId = "integration-msn-1") {
  return {
    workspaceId: "ws-1",
    channelType: "messenger" as const,
    integrationId,
  }
}

function zaloJob(integrationId = "integration-zalo-1") {
  return { workspaceId: "ws-2", channelType: "zalo" as const, integrationId }
}

// ---------------------------------------------------------------------------
// beforeEach — reset all shared state
// ---------------------------------------------------------------------------
beforeEach(() => {
  state.messengerIntegration = null
  state.zaloIntegration = null
  state.contactInboxRows = []
  state.tagReturning = [{ id: "tag-1" }]
  state.tagChannelReturning = [{ id: "tc-1" }]
  insertCalls.length = 0
  idCounter = 0
  chunkByIdImpl = singleChunkImpl

  // Default findMany: return rows on first call, [] on subsequent calls.
  findManySpy.mockImplementation(() => {
    const rows = state.contactInboxRows
    // After the first call resolves, swap to returning [] so pagination stops.
    // We use mockImplementationOnce to override just the first call; the
    // fallback is already the singleChunk behaviour but we keep it explicit.
    return Promise.resolve(rows)
  })
})

// ===========================================================================
// Tests
// ===========================================================================

describe("handleSyncChannelLabels — routing", () => {
  test("messenger integration not found → warns and returns without scanning", async () => {
    state.messengerIntegration = null

    await expect(
      handleSyncChannelLabels(messengerJob()),
    ).resolves.toBeUndefined()

    expect(runChannelHandlerMock).not.toHaveBeenCalled()
    expect(insertCalls).toHaveLength(0)
  })

  test("zalo integration not found → warns and returns without scanning", async () => {
    state.zaloIntegration = null

    await expect(handleSyncChannelLabels(zaloJob())).resolves.toBeUndefined()

    expect(runActionMock).not.toHaveBeenCalled()
    expect(insertCalls).toHaveLength(0)
  })

  test("messenger route queries integrationMessengerModel.findFirst with correct integrationId", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    const { db } = await import("@chatbotx.io/database/client")
    const spy = db.query.integrationMessengerModel.findFirst as ReturnType<
      typeof vi.fn
    >
    spy.mockClear()

    await handleSyncChannelLabels(messengerJob("integration-msn-1"))

    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith({ where: { id: "integration-msn-1" } })
  })

  test("zalo route queries integrationZaloModel.findFirst with correct integrationId", async () => {
    state.zaloIntegration = makeZaloIntegration()
    const { db } = await import("@chatbotx.io/database/client")
    const spy = db.query.integrationZaloModel.findFirst as ReturnType<
      typeof vi.fn
    >
    spy.mockClear()

    await handleSyncChannelLabels(zaloJob("integration-zalo-1"))

    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith({ where: { id: "integration-zalo-1" } })
  })
})

// ---------------------------------------------------------------------------
describe("runMessengerScan — listLabels happy path", () => {
  test("passes contactInbox.sourceId as data.sourceId to listLabels", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1", sourceId: "psid-111" }),
    ]
    runChannelHandlerMock.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    expect(runChannelHandlerMock).toHaveBeenCalledWith("bot", "listLabels", {
      ctx: expect.anything(),
      data: { sourceId: "psid-111" },
    })
  })

  test("listLabels returns [] → no insert calls", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    expect(insertCalls).toHaveLength(0)
  })

  test("listLabels returns N labels → N tag inserts + N tagChannel inserts + N association inserts each", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1", contactId: "contact-1" }),
    ]
    runChannelHandlerMock.mockResolvedValue([
      { id: "fb-label-42", name: "VIP" },
      { id: "fb-label-99", name: "Lead" },
    ])

    await handleSyncChannelLabels(messengerJob())

    expect(insertCalls.filter((n) => n === "Tag")).toHaveLength(2)
    expect(insertCalls.filter((n) => n === "TagChannel")).toHaveLength(2)
    expect(insertCalls.filter((n) => n === "ContactToTag")).toHaveLength(2)
    expect(insertCalls.filter((n) => n === "ContactToTagChannel")).toHaveLength(
      2,
    )
  })

  test("externalLabelId in tagChannel insert equals the FB label id", async () => {
    state.messengerIntegration = makeMessengerIntegration({
      id: "integration-msn-1",
    })
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1", contactId: "contact-1" }),
    ]
    runChannelHandlerMock.mockResolvedValue([
      { id: "fb-label-42", name: "VIP" },
    ])

    await handleSyncChannelLabels(messengerJob())

    expect(tagChannelBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        externalLabelId: "fb-label-42",
        channelType: "messenger",
        integrationId: "integration-msn-1",
        workspaceId: "ws-1",
        tagId: "tag-1",
      }),
    )
  })

  test("contactsToTags insert uses correct contactId and tagId", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox({ contactId: "contact-99" })]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-42", name: "Gold" }])

    await handleSyncChannelLabels(messengerJob())

    expect(contactsToTagsBuilder.values).toHaveBeenCalledWith({
      contactId: "contact-99",
      tagId: "tag-1",
    })
  })

  test("contactToTagChannel insert uses correct tagId, tagChannelId, contactInboxId", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox({ id: "ci-77" })]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-42", name: "Gold" }])

    await handleSyncChannelLabels(messengerJob())

    expect(contactToTagChannelBuilder.values).toHaveBeenCalledWith({
      tagId: "tag-1",
      tagChannelId: "tc-1",
      contactInboxId: "ci-77",
    })
  })

  test("multiple contacts → listLabels called once per contact with each sourceId", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1", sourceId: "psid-A" }),
      makeContactInbox({ id: "ci-2", sourceId: "psid-B" }),
      makeContactInbox({ id: "ci-3", sourceId: "psid-C" }),
    ]
    runChannelHandlerMock.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    expect(runChannelHandlerMock).toHaveBeenCalledTimes(3)
    const psids = runChannelHandlerMock.mock.calls.map(
      (c) => (c[2] as { data: { sourceId: string } }).data.sourceId,
    )
    expect(psids).toEqual(["psid-A", "psid-B", "psid-C"])
  })
})

// ---------------------------------------------------------------------------
describe("runMessengerScan — per-user error isolation", () => {
  test("one user throws → scan continues and processes remaining users", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1", sourceId: "psid-fail" }),
      makeContactInbox({ id: "ci-2", sourceId: "psid-ok" }),
    ]
    runChannelHandlerMock
      .mockRejectedValueOnce(new Error("FB API error"))
      .mockResolvedValueOnce([])

    await expect(
      handleSyncChannelLabels(messengerJob()),
    ).resolves.toBeUndefined()

    // Both users were attempted.
    expect(runChannelHandlerMock).toHaveBeenCalledTimes(2)
    const secondSourceId = (
      runChannelHandlerMock.mock.calls[1]?.[2] as { data: { sourceId: string } }
    ).data.sourceId
    expect(secondSourceId).toBe("psid-ok")
  })

  test("all users throw → handler resolves without propagating errors", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1" }),
      makeContactInbox({ id: "ci-2" }),
    ]
    runChannelHandlerMock.mockRejectedValue(new Error("always fails"))

    await expect(
      handleSyncChannelLabels(messengerJob()),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
describe("upsertLabelMapping — early-return branches", () => {
  test("tag insert returns [] → tagChannel NOT inserted (early return)", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    state.tagReturning = []
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels(messengerJob())

    expect(insertCalls).toEqual(["Tag"])
    expect(insertCalls.filter((n) => n === "TagChannel")).toHaveLength(0)
    expect(insertCalls.filter((n) => n === "ContactToTag")).toHaveLength(0)
    expect(insertCalls.filter((n) => n === "ContactToTagChannel")).toHaveLength(
      0,
    )
  })

  test("tagChannel insert returns [] → contactsToTags and contactToTagChannel NOT inserted", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    state.tagReturning = [{ id: "tag-1" }]
    state.tagChannelReturning = []
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels(messengerJob())

    expect(insertCalls).toEqual(["Tag", "TagChannel"])
    expect(insertCalls.filter((n) => n === "ContactToTag")).toHaveLength(0)
    expect(insertCalls.filter((n) => n === "ContactToTagChannel")).toHaveLength(
      0,
    )
  })

  test("happy path: inserts fire in order Tag → TagChannel → ContactToTag → ContactToTagChannel", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    state.tagReturning = [{ id: "tag-1" }]
    state.tagChannelReturning = [{ id: "tc-1" }]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "Gold" }])

    await handleSyncChannelLabels(messengerJob())

    expect(insertCalls).toEqual([
      "Tag",
      "TagChannel",
      "ContactToTag",
      "ContactToTagChannel",
    ])
  })

  test("contactsToTags uses onConflictDoNothing", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels(messengerJob())

    expect(contactsToTagsBuilder.onConflictDoNothing).toHaveBeenCalled()
  })

  test("contactToTagChannel uses onConflictDoNothing", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels(messengerJob())

    expect(contactToTagChannelBuilder.onConflictDoNothing).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe("workspace isolation", () => {
  test("workspaceId is threaded into tag insert values", async () => {
    state.messengerIntegration = makeMessengerIntegration({ id: "int-A" })
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels({
      workspaceId: "ws-isolated",
      channelType: "messenger",
      integrationId: "int-A",
    })

    expect(tagBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-isolated" }),
    )
  })

  test("workspaceId is threaded into tagChannel insert values", async () => {
    state.messengerIntegration = makeMessengerIntegration({ id: "int-A" })
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels({
      workspaceId: "ws-isolated",
      channelType: "messenger",
      integrationId: "int-A",
    })

    expect(tagChannelBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-isolated" }),
    )
  })
})

// ---------------------------------------------------------------------------
describe("chunkById pagination — cursor behaviour", () => {
  // Override chunkByIdImpl with the two-chunk variant for these tests.
  // The two-chunk impl: first query with null, then query with lastId of batch.

  async function twoChunkImpl(
    queryBuilder: (lastId: string | null) => Promise<unknown[]>,
    options: { callback: (batch: unknown[]) => Promise<boolean | undefined> },
  ): Promise<void> {
    const firstBatch = await queryBuilder(null)
    if (firstBatch.length === 0) {
      return
    }
    await options.callback(firstBatch)
    const lastId = (firstBatch.at(-1) as { id: string }).id
    const secondBatch = await queryBuilder(lastId)
    if (secondBatch.length > 0) {
      await options.callback(secondBatch)
    }
  }

  test("first findMany call uses no gt filter (lastId = null)", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration({
      inboxId: "inbox-1",
    })
    runChannelHandlerMock.mockResolvedValue([])

    findManySpy
      .mockResolvedValueOnce([makeContactInbox({ id: "ci-1" })])
      .mockResolvedValueOnce([])

    await handleSyncChannelLabels(messengerJob())

    const firstCallArgs = findManySpy.mock.calls[0]?.[0] as {
      where: { id?: { gt: string }; inboxId: string }
    }
    expect(firstCallArgs.where).not.toHaveProperty("id")
    expect(firstCallArgs.where.inboxId).toBe("inbox-1")
  })

  test("second findMany call carries gt: last id from first batch", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration({
      inboxId: "inbox-1",
    })
    runChannelHandlerMock.mockResolvedValue([])

    findManySpy
      .mockResolvedValueOnce([
        makeContactInbox({ id: "ci-10" }),
        makeContactInbox({ id: "ci-20" }),
      ])
      .mockResolvedValueOnce([])

    await handleSyncChannelLabels(messengerJob())

    const secondCallArgs = findManySpy.mock.calls[1]?.[0] as {
      where: { id?: { gt: string } }
    }
    expect(secondCallArgs.where.id).toEqual({ gt: "ci-20" })
  })

  test("findMany is always scoped to the integration's inboxId", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration({
      inboxId: "inbox-XYZ",
    })
    findManySpy.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    for (const call of findManySpy.mock.calls) {
      const args = call[0] as { where: { inboxId: string } }
      expect(args.where.inboxId).toBe("inbox-XYZ")
    }
  })

  test("contacts from both chunks are processed (two-chunk scenario)", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration()

    findManySpy
      .mockResolvedValueOnce([
        makeContactInbox({ id: "ci-A", sourceId: "psid-A" }),
      ])
      .mockResolvedValueOnce([
        makeContactInbox({ id: "ci-B", sourceId: "psid-B" }),
      ])
    runChannelHandlerMock.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    expect(runChannelHandlerMock).toHaveBeenCalledTimes(2)
    const psids = runChannelHandlerMock.mock.calls.map(
      (c) => (c[2] as { data: { sourceId: string } }).data.sourceId,
    )
    expect(psids).toContain("psid-A")
    expect(psids).toContain("psid-B")
  })
})

// ---------------------------------------------------------------------------
describe("runZaloScan — getUserDetail happy path", () => {
  test("passes contactInbox.sourceId as userId to getUserDetail", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [
      makeContactInbox({ sourceId: "zalo-uid-555", channel: "zalo" }),
    ]
    runActionMock.mockResolvedValue({ tags_and_notes_info: { tag_names: [] } })

    await handleSyncChannelLabels(zaloJob())

    expect(runActionMock).toHaveBeenCalledWith("getUserDetail", {
      ctx: expect.anything(),
      userId: "zalo-uid-555",
    })
  })

  test("null tags_and_notes_info → no upsert (nullish coalescing to [])", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({ tags_and_notes_info: null })

    await handleSyncChannelLabels(zaloJob())

    expect(insertCalls).toHaveLength(0)
  })

  test("tags_and_notes_info present but tag_names undefined → no upsert", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({ tags_and_notes_info: {} })

    await handleSyncChannelLabels(zaloJob())

    expect(insertCalls).toHaveLength(0)
  })

  test("tag_names array → one upsert mapping per tag name", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [
      makeContactInbox({
        id: "ci-z1",
        contactId: "contact-z1",
        channel: "zalo",
      }),
    ]
    runActionMock.mockResolvedValue({
      tags_and_notes_info: { tag_names: ["VIP", "Lead"] },
    })

    await handleSyncChannelLabels(zaloJob())

    expect(insertCalls.filter((n) => n === "Tag")).toHaveLength(2)
    expect(insertCalls.filter((n) => n === "TagChannel")).toHaveLength(2)
    expect(insertCalls.filter((n) => n === "ContactToTag")).toHaveLength(2)
    expect(insertCalls.filter((n) => n === "ContactToTagChannel")).toHaveLength(
      2,
    )
  })

  test("for zalo, externalLabelId in tagChannel equals the tag name string", async () => {
    state.zaloIntegration = makeZaloIntegration({ id: "integration-zalo-1" })
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({
      tags_and_notes_info: { tag_names: ["PremiumUser"] },
    })

    await handleSyncChannelLabels(zaloJob())

    expect(tagChannelBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        externalLabelId: "PremiumUser",
        channelType: "zalo",
        integrationId: "integration-zalo-1",
      }),
    )
  })

  test("for zalo, name in tag insert equals the tag name string", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({
      tags_and_notes_info: { tag_names: ["SpecialTag"] },
    })

    await handleSyncChannelLabels(zaloJob())

    expect(tagBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ name: "SpecialTag" }),
    )
  })
})

// ---------------------------------------------------------------------------
describe("runZaloScan — per-user error isolation", () => {
  test("one user throws → scan continues and processes remaining users", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-z1", sourceId: "uid-fail", channel: "zalo" }),
      makeContactInbox({ id: "ci-z2", sourceId: "uid-ok", channel: "zalo" }),
    ]
    runActionMock
      .mockRejectedValueOnce(new Error("Zalo API error"))
      .mockResolvedValueOnce({ tags_and_notes_info: { tag_names: [] } })

    await expect(handleSyncChannelLabels(zaloJob())).resolves.toBeUndefined()

    expect(runActionMock).toHaveBeenCalledTimes(2)
    const secondUserId = (
      runActionMock.mock.calls[1]?.[1] as { userId: string }
    ).userId
    expect(secondUserId).toBe("uid-ok")
  })

  test("all users throw → handler resolves without propagating", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-z1", channel: "zalo" }),
      makeContactInbox({ id: "ci-z2", channel: "zalo" }),
    ]
    runActionMock.mockRejectedValue(new Error("always fails"))

    await expect(handleSyncChannelLabels(zaloJob())).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
describe("buildContext — integration type forwarding", () => {
  test("messenger scan calls buildContext with integrationType: 'messenger'", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    const { buildContext } = await import("@chatbotx.io/business")

    await handleSyncChannelLabels(messengerJob())

    expect(buildContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        integrationType: "messenger",
      }),
    )
  })

  test("zalo scan calls buildContext with integrationType: 'zalo'", async () => {
    state.zaloIntegration = makeZaloIntegration()
    const { buildContext } = await import("@chatbotx.io/business")

    await handleSyncChannelLabels(zaloJob())

    expect(buildContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-2",
        integrationType: "zalo",
      }),
    )
  })
})

// ---------------------------------------------------------------------------
describe("createId — called for generated ids", () => {
  test("createId called twice per label (tag row + tagChannel row)", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([
      { id: "fb-1", name: "Alpha" },
      { id: "fb-2", name: "Beta" },
    ])

    const { createId } = await import("@chatbotx.io/utils")
    const spy = createId as ReturnType<typeof vi.fn>
    spy.mockClear()

    await handleSyncChannelLabels(messengerJob())

    // 2 labels × 2 createId calls = 4
    expect(spy).toHaveBeenCalledTimes(4)
  })

  test("generated ids are injected into tag and tagChannel insert values", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    const { createId } = await import("@chatbotx.io/utils")
    const spy = createId as ReturnType<typeof vi.fn>
    spy.mockClear()
    spy.mockReturnValueOnce("tag-gen-id").mockReturnValueOnce("tc-gen-id")

    await handleSyncChannelLabels(messengerJob())

    expect(tagBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tag-gen-id" }),
    )
    expect(tagChannelBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tc-gen-id" }),
    )
  })
})
