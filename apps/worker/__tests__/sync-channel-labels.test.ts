import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Design notes:
//
// The handler no longer touches `db.*` directly — it calls
// `contactInboxRepository.listByInboxPage`, `integrationMessengerRepository
// .findById`, `zaloIntegrationService.findByIdUnscoped`, and
// `tagChannelRepository.upsertLabelMapping`. The SQL-shape assertions for
// `upsertLabelMapping` itself (insert order, onConflict targets, early
// returns) already live in
// `packages/database/__tests__/tag-channel-repository.test.ts` — this file
// only asserts the handler calls that repository method with the right
// arguments, and preserves every handler-level behavior (routing, scan
// pagination, per-user error isolation, error-log collapsing).
//
// - chunkById is mocked to call queryBuilder(null) then stop (single chunk).
//   Dedicated pagination tests override this mock per-test with a two-call
//   sequence so we can assert cursor-pagination args against
//   contactInboxRepository.listByInboxPage.
// - upsertLabelMappingCalls[] tracks call arguments in order per test and is
//   reset in beforeEach.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared state — mutated per test via beforeEach / within each test
// ---------------------------------------------------------------------------
const state = {
  messengerIntegration: null as Record<string, unknown> | null,
  zaloIntegration: null as Record<string, unknown> | null,
  // listByInboxPage returns this list once, then returns [] on subsequent
  // calls (unless a test overrides the spy directly).
  contactInboxRows: [] as Record<string, unknown>[],
}

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/repositories
// ---------------------------------------------------------------------------
const listByInboxPageSpy = vi.fn()
const upsertLabelMappingSpy = vi.fn(async () => undefined)
const findMessengerByIdSpy = vi.fn(async () => state.messengerIntegration)

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    listByInboxPage: (...args: unknown[]) => listByInboxPageSpy(...args),
  },
  integrationMessengerRepository: {
    findById: (...args: unknown[]) => findMessengerByIdSpy(...args),
  },
  tagChannelRepository: {
    upsertLabelMapping: (...args: unknown[]) => upsertLabelMappingSpy(...args),
  },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business — buildContext + zaloIntegrationService
// ---------------------------------------------------------------------------
const findZaloUnscopedSpy = vi.fn(async () => state.zaloIntegration)
vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => ({ ctx: "mocked-context" })),
  zaloIntegrationService: {
    findByIdUnscoped: (...args: unknown[]) => findZaloUnscopedSpy(...args),
  },
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
// Mock: @chatbotx.io/business/error-log
// ---------------------------------------------------------------------------
const logProviderError = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: (...args: unknown[]) => logProviderError(...args),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

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
  chunkByIdImpl = singleChunkImpl

  listByInboxPageSpy.mockReset()
  upsertLabelMappingSpy.mockReset()
  findMessengerByIdSpy.mockReset()
  findZaloUnscopedSpy.mockReset()
  runChannelHandlerMock.mockReset()
  runActionMock.mockReset()
  logProviderError.mockReset()

  upsertLabelMappingSpy.mockResolvedValue(undefined)
  findMessengerByIdSpy.mockImplementation(
    async () => state.messengerIntegration,
  )
  findZaloUnscopedSpy.mockImplementation(async () => state.zaloIntegration)

  // Default listByInboxPage: return rows on first call, [] on subsequent
  // calls (unless a test overrides the spy directly).
  listByInboxPageSpy.mockImplementation(() => {
    const rows = state.contactInboxRows
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
    expect(upsertLabelMappingSpy).not.toHaveBeenCalled()
  })

  test("zalo integration not found → warns and returns without scanning", async () => {
    state.zaloIntegration = null

    await expect(handleSyncChannelLabels(zaloJob())).resolves.toBeUndefined()

    expect(runActionMock).not.toHaveBeenCalled()
    expect(upsertLabelMappingSpy).not.toHaveBeenCalled()
  })

  test("messenger route queries integrationMessengerRepository.findById with correct integrationId", async () => {
    state.messengerIntegration = makeMessengerIntegration()

    await handleSyncChannelLabels(messengerJob("integration-msn-1"))

    expect(findMessengerByIdSpy).toHaveBeenCalledOnce()
    expect(findMessengerByIdSpy).toHaveBeenCalledWith({
      id: "integration-msn-1",
    })
  })

  test("zalo route queries zaloIntegrationService.findByIdUnscoped with correct integrationId", async () => {
    state.zaloIntegration = makeZaloIntegration()

    await handleSyncChannelLabels(zaloJob("integration-zalo-1"))

    expect(findZaloUnscopedSpy).toHaveBeenCalledOnce()
    expect(findZaloUnscopedSpy).toHaveBeenCalledWith({
      id: "integration-zalo-1",
    })
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

  test("listLabels returns [] → no upsertLabelMapping calls", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    expect(upsertLabelMappingSpy).not.toHaveBeenCalled()
  })

  test("listLabels returns N labels → N upsertLabelMapping calls", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1", contactId: "contact-1" }),
    ]
    runChannelHandlerMock.mockResolvedValue([
      { id: "fb-label-42", name: "VIP" },
      { id: "fb-label-99", name: "Lead" },
    ])

    await handleSyncChannelLabels(messengerJob())

    expect(upsertLabelMappingSpy).toHaveBeenCalledTimes(2)
  })

  test("upsertLabelMapping called with FB label id as externalLabelId", async () => {
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

    expect(upsertLabelMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channelType: "messenger",
        integrationId: "integration-msn-1",
        label: { externalLabelId: "fb-label-42", name: "VIP" },
        contactInbox: { id: "ci-1", contactId: "contact-1" },
      }),
    )
  })

  test("upsertLabelMapping uses correct contactId and contactInboxId", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-77", contactId: "contact-99" }),
    ]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-42", name: "Gold" }])

    await handleSyncChannelLabels(messengerJob())

    expect(upsertLabelMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        contactInbox: { id: "ci-77", contactId: "contact-99" },
      }),
    )
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

  // The failure here is per-*integration* (an expired page token fails every
  // contact), so the scan writes one row for the run rather than one per
  // `ContactInbox` — six figures of identical rows on a large workspace.
  test("every user throws → exactly one error log for the whole scan", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [
      makeContactInbox({ id: "ci-1" }),
      makeContactInbox({ id: "ci-2" }),
      makeContactInbox({ id: "ci-3" }),
    ]
    runChannelHandlerMock.mockRejectedValue(new Error("token expired"))

    await handleSyncChannelLabels(messengerJob())

    expect(logProviderError).toHaveBeenCalledTimes(1)
    expect(logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "messenger",
        workspaceId: "ws-1",
        // No contact attribution: the row stands for the run, not for whichever
        // contact happened to fail first.
        error: expect.any(Error),
      }),
    )
    expect(logProviderError.mock.calls[0]?.[0]).not.toHaveProperty("contactId")
  })

  test("no user throws → no error log at all", async () => {
    state.messengerIntegration = makeMessengerIntegration()
    state.contactInboxRows = [makeContactInbox({ id: "ci-1" })]
    runChannelHandlerMock.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    expect(logProviderError).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe("workspace isolation", () => {
  test("workspaceId is threaded into upsertLabelMapping", async () => {
    state.messengerIntegration = makeMessengerIntegration({ id: "int-A" })
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels({
      workspaceId: "ws-isolated",
      channelType: "messenger",
      integrationId: "int-A",
    })

    expect(upsertLabelMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-isolated" }),
    )
  })

  test("integrationId is threaded into upsertLabelMapping", async () => {
    state.messengerIntegration = makeMessengerIntegration({ id: "int-A" })
    state.contactInboxRows = [makeContactInbox()]
    runChannelHandlerMock.mockResolvedValue([{ id: "fb-1", name: "VIP" }])

    await handleSyncChannelLabels({
      workspaceId: "ws-isolated",
      channelType: "messenger",
      integrationId: "int-A",
    })

    expect(upsertLabelMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({ integrationId: "int-A" }),
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

  test("first listByInboxPage call uses no afterId (lastId = null)", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration({
      inboxId: "inbox-1",
    })
    runChannelHandlerMock.mockResolvedValue([])

    listByInboxPageSpy
      .mockResolvedValueOnce([makeContactInbox({ id: "ci-1" })])
      .mockResolvedValueOnce([])

    await handleSyncChannelLabels(messengerJob())

    const firstCallArgs = listByInboxPageSpy.mock.calls[0]?.[0] as {
      inboxId: string
      afterId?: string
    }
    expect(firstCallArgs.afterId).toBeUndefined()
    expect(firstCallArgs.inboxId).toBe("inbox-1")
  })

  test("second listByInboxPage call carries afterId: last id from first batch", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration({
      inboxId: "inbox-1",
    })
    runChannelHandlerMock.mockResolvedValue([])

    listByInboxPageSpy
      .mockResolvedValueOnce([
        makeContactInbox({ id: "ci-10" }),
        makeContactInbox({ id: "ci-20" }),
      ])
      .mockResolvedValueOnce([])

    await handleSyncChannelLabels(messengerJob())

    const secondCallArgs = listByInboxPageSpy.mock.calls[1]?.[0] as {
      afterId?: string
    }
    expect(secondCallArgs.afterId).toBe("ci-20")
  })

  test("listByInboxPage is always scoped to the integration's inboxId", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration({
      inboxId: "inbox-XYZ",
    })
    listByInboxPageSpy.mockResolvedValue([])

    await handleSyncChannelLabels(messengerJob())

    for (const call of listByInboxPageSpy.mock.calls) {
      const args = call[0] as { inboxId: string }
      expect(args.inboxId).toBe("inbox-XYZ")
    }
  })

  test("contacts from both chunks are processed (two-chunk scenario)", async () => {
    chunkByIdImpl = twoChunkImpl
    state.messengerIntegration = makeMessengerIntegration()

    listByInboxPageSpy
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

    expect(upsertLabelMappingSpy).not.toHaveBeenCalled()
  })

  test("tags_and_notes_info present but tag_names undefined → no upsert", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({ tags_and_notes_info: {} })

    await handleSyncChannelLabels(zaloJob())

    expect(upsertLabelMappingSpy).not.toHaveBeenCalled()
  })

  test("tag_names array → one upsertLabelMapping call per tag name", async () => {
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

    expect(upsertLabelMappingSpy).toHaveBeenCalledTimes(2)
  })

  test("for zalo, externalLabelId in upsertLabelMapping equals the tag name string", async () => {
    state.zaloIntegration = makeZaloIntegration({ id: "integration-zalo-1" })
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({
      tags_and_notes_info: { tag_names: ["PremiumUser"] },
    })

    await handleSyncChannelLabels(zaloJob())

    expect(upsertLabelMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "zalo",
        integrationId: "integration-zalo-1",
        label: { externalLabelId: "PremiumUser", name: "PremiumUser" },
      }),
    )
  })

  test("for zalo, name in upsertLabelMapping equals the tag name string", async () => {
    state.zaloIntegration = makeZaloIntegration()
    state.contactInboxRows = [makeContactInbox({ channel: "zalo" })]
    runActionMock.mockResolvedValue({
      tags_and_notes_info: { tag_names: ["SpecialTag"] },
    })

    await handleSyncChannelLabels(zaloJob())

    expect(upsertLabelMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        label: expect.objectContaining({ name: "SpecialTag" }),
      }),
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
