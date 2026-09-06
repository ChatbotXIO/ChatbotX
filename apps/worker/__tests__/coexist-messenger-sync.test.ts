import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockFindByIdMessenger,
  mockFindByIdWorkspace,
  mockFindWorkspace,
  mockFindLastSyncedAt,
  mockFindInitState,
  mockFindResumeCeiling,
  mockClaimRunForSync,
  mockUpdateProgress,
  mockIncrementProgress,
  mockFindTerminalCounters,
  mockMarkFailed,
  mockListContactLinksBySourceIds,
  mockFindOrFail,
  mockListConversations,
  mockListMessages,
  mockBulkImportHistorical,
  mockBulkImportMessages,
  mockBulkImportContacts,
  mockCreateIdFactory,
  mockQueueAdd,
  mockConcurrencyForUsage,
  mockApplyCoexistActivityUpdates,
} = vi.hoisted(() => ({
  mockFindByIdMessenger: vi.fn(),
  mockFindByIdWorkspace: vi.fn(),
  mockFindWorkspace: vi.fn(),
  mockFindLastSyncedAt: vi.fn(),
  mockFindInitState: vi.fn(),
  mockFindResumeCeiling: vi.fn(),
  mockClaimRunForSync: vi.fn(),
  mockUpdateProgress: vi.fn(),
  mockIncrementProgress: vi.fn(),
  mockFindTerminalCounters: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockListContactLinksBySourceIds: vi.fn(),
  mockFindOrFail: vi.fn(),
  mockListConversations: vi.fn(),
  mockListMessages: vi.fn(),
  mockBulkImportHistorical: vi.fn(),
  mockBulkImportMessages: vi.fn(),
  mockBulkImportContacts: vi.fn(),
  mockCreateIdFactory: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockConcurrencyForUsage: vi.fn(() => 5),
  mockApplyCoexistActivityUpdates: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `findOrFail` is still imported from `@chatbotx.io/database/client` directly
// by messenger-sync.ts for the Inbox lookup — keep this mock minimal (plain
// stub, no schema importOriginal) per the hard rule against opening a real DB
// connection.
vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/business", () => ({
  extractContactInfo: vi.fn(() => ({})),
  messengerIntegrationService: {
    findById: mockFindByIdMessenger,
  },
  workspaceService: {
    findById: mockFindByIdWorkspace,
    find: mockFindWorkspace,
  },
  coexistService: {
    findLastSyncedAt: mockFindLastSyncedAt,
    findInitState: mockFindInitState,
    findResumeCeiling: mockFindResumeCeiling,
    claimRunForSync: mockClaimRunForSync,
    updateProgress: mockUpdateProgress,
    incrementProgress: mockIncrementProgress,
    findTerminalCounters: mockFindTerminalCounters,
    markFailed: mockMarkFailed,
  },
  coexistImportService: {
    listContactLinksBySourceIds: mockListContactLinksBySourceIds,
  },
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    coexistWhatsappBuffer: "coexistWhatsappBuffer",
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
    updateContactAvatar: "updateContactAvatar",
    coexistAttachmentDownload: "coexistAttachmentDownload",
  },
  integrationQueue: {
    add: mockQueueAdd,
    addBulk: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
}))

vi.mock("@chatbotx.io/integration-messenger/apis/sync", () => ({
  listConversations: mockListConversations,
  listMessages: mockListMessages,
}))

vi.mock("@chatbotx.io/integration-messenger/apis/usage", () => ({
  concurrencyForUsage: mockConcurrencyForUsage,
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportHistorical: mockBulkImportHistorical,
  bulkImportMessages: mockBulkImportMessages,
  bulkImportContacts: mockBulkImportContacts,
  createHistoricalIdFactory: mockCreateIdFactory,
  applyCoexistActivityUpdates: mockApplyCoexistActivityUpdates,
  // Real pure implementation (mirrors bulk-historical-import.ts) — the
  // messenger-sync source under test imports this as a named export from
  // this module to fold per-page `newestMessageId`s into a per-conversation
  // `aiMarkerMessageId`, so it must behave exactly like production, not be
  // a bare vi.fn().
  maxNumericId: (a: string | null, b: string | null): string | null => {
    if (a === null) {
      return b
    }
    if (b === null) {
      return a
    }
    return BigInt(a) < BigInt(b) ? b : a
  },
}))

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------

import { coexistMessengerSync } from "../src/integration/handlers/coexist/messenger-sync"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_ID = "page-111"
const runId = "run-1"
const integrationId = "int-messenger-1"
const workspaceId = "ws-messenger-1"

const fakeIntegration = {
  id: integrationId,
  workspaceId,
  pageId: PAGE_ID,
  coexistEnabled: true,
  coexistAiReadsSyncedHistory: false,
  inboxId: "inbox-messenger-1",
  auth: {
    tokens: { accessToken: "access-token-abc" },
    metadata: { version: "v20.0" },
  },
}

const fakeInbox = {
  id: "inbox-messenger-1",
  workspaceId,
  channel: "messenger",
}

const customerParticipant = (id = "user-999") => ({
  id,
  name: "Bob Customer",
  email: "bob@example.com",
})

const makeConversation = (id: string, userId = "user-999") => ({
  id,
  updated_time: RECENT_TS,
  participants: {
    data: [{ id: PAGE_ID, name: "My Page" }, customerParticipant(userId)],
  },
})

const RECENT_TS = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const makeMessage = (
  id: string,
  fromId = "user-999",
  createdTime = RECENT_TS,
) => ({
  id,
  message: "Hey there!",
  from: { id: fromId, name: "Bob Customer" },
  created_time: createdTime,
})

const defaultRunRow = () => ({
  lastSyncedAt: null as Date | null,
  attempts: 0,
  importedContactCount: 0,
  importedMessageCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentScan: 0,
  currentError: null as string | null,
  messengerSyncPhase: "messages" as string | null,
})

const emptyBulkMessagesResult = () => ({
  importedMessages: 0,
  skippedMessages: 0,
  insertedAttachmentIds: [],
  newestMessageAt: null as Date | null,
  oldestMessageAt: null as Date | null,
  newestIncomingMessageAt: null as Date | null,
  newestMessageId: null as string | null,
})

const emptyBulkContactsResult = () => ({
  importedContacts: 0,
  skippedContacts: 0,
  contactInboxIds: new Map<
    string,
    { contactInboxId: string; contactId: string; conversationId: string }
  >(),
})

// Default contact link returned by the mocked JOIN query when tests provide a
// conversation with "user-999" participant.
const defaultContactLink = {
  sourceId: "user-999",
  contactInboxId: "ci-1",
  contactId: "contact-1",
  conversationId: "conv-inbox-1",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wires the two service calls the source uses in place of the old raw
 * `db.select()` JOIN/limit chain:
 *  - `coexistService.findLastSyncedAt` → the run-row-existence + watermark
 *    check that each phase does at its start (`{ lastSyncedAt } | null`).
 *  - `coexistImportService.listContactLinksBySourceIds` → the
 *    ContactInbox+Conversation JOIN, keyed by sourceId.
 */
const wireSelectChain = (
  runRow: ReturnType<typeof defaultRunRow> | null,
  contactLinks: Array<{
    sourceId: string
    contactInboxId: string
    contactId: string
    conversationId: string
  }> = [],
) => {
  mockFindLastSyncedAt.mockResolvedValue(
    runRow ? { lastSyncedAt: runRow.lastSyncedAt } : null,
  )
  mockListContactLinksBySourceIds.mockResolvedValue(contactLinks)
}

/**
 * Wires `coexistService.claimRunForSync` — the optimistic claim that replaces
 * the old raw `db.update().set().where().returning()` chain. Default claim
 * result is the run row (handler treats the run as successfully claimed);
 * tests that need "already claimed" pass `wireUpdateChain(null)`.
 */
const wireUpdateChain = (
  claimResult: { id: string } | null = { id: runId },
) => {
  mockClaimRunForSync.mockResolvedValue(claimResult)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coexistMessengerSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // vitest 4: clearAllMocks does NOT drain mockResolvedValueOnce queues, so a
    // prior test's queued Graph responses would leak into this one (shifting
    // listMessages/listConversations call counts). Reset them explicitly; each
    // test re-wires its own Once responses in its body.
    mockListConversations.mockReset()
    mockListMessages.mockReset()
    mockBulkImportMessages.mockReset()
    mockConcurrencyForUsage.mockReturnValue(5)
    wireSelectChain(defaultRunRow(), [defaultContactLink])
    wireUpdateChain()
    mockBulkImportMessages.mockResolvedValue(emptyBulkMessagesResult())
    mockBulkImportContacts.mockResolvedValue(emptyBulkContactsResult())
    mockCreateIdFactory.mockReturnValue(() => "id-factory-result")
    mockQueueAdd.mockResolvedValue(undefined)
    mockFindWorkspace.mockResolvedValue({ targetCountry: "VN" })
    mockFindInitState.mockResolvedValue({
      attempts: 0,
      currentError: null,
      messengerSyncPhase: "messages",
    })
    mockUpdateProgress.mockResolvedValue(undefined)
    mockIncrementProgress.mockResolvedValue(undefined)
    mockMarkFailed.mockResolvedValue(undefined)
    mockFindTerminalCounters.mockResolvedValue({
      importedMessageCount: 0,
      skippedCount: 0,
      failedCount: 0,
    })
    // Default: no ceiling — first run for this integration (no prior
    // succeeded/partial CoexistSyncRun).
    mockFindResumeCeiling.mockResolvedValue(null)
  })

  it("is a no-op when integration is not found", async () => {
    mockFindByIdMessenger.mockResolvedValue(null)

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImportMessages).not.toHaveBeenCalled()
  })

  it("is a no-op when workspaceId mismatches the row", async () => {
    mockFindByIdMessenger.mockResolvedValue({
      ...fakeIntegration,
      workspaceId: "other-ws",
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImportMessages).not.toHaveBeenCalled()
  })

  it("is a no-op when coexistEnabled === false", async () => {
    mockFindByIdMessenger.mockResolvedValue({
      ...fakeIntegration,
      coexistEnabled: false,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImportMessages).not.toHaveBeenCalled()
  })

  it("is a no-op when access token is missing", async () => {
    mockFindByIdMessenger.mockResolvedValue({
      ...fakeIntegration,
      auth: { tokens: {}, metadata: {} },
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
  })

  it("is a no-op when CoexistSyncRun row is gone", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelectChain(null)

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImportMessages).not.toHaveBeenCalled()
  })

  it("fetches one page of conversations and invokes bulkImportMessages with assembled messages", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-abc", "user-999")],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-xyz", "user-999")],
      after: undefined,
    })
    mockBulkImportMessages.mockResolvedValueOnce({
      importedMessages: 1,
      skippedMessages: 0,
      insertedAttachmentIds: [],
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).toHaveBeenCalledOnce()
    expect(mockListMessages).toHaveBeenCalledOnce()
    expect(mockBulkImportMessages).toHaveBeenCalledOnce()

    const [bulkArgs] = mockBulkImportMessages.mock.calls[0] as [
      {
        workspaceId: string
        runId: string
        contactInboxId: string
        contactId: string
        conversationId: string
        messages: Array<{ sourceId: string }>
      },
    ]
    expect(bulkArgs.workspaceId).toBe(workspaceId)
    expect(bulkArgs.runId).toBe(runId)
    expect(bulkArgs.contactInboxId).toBe("ci-1")
    expect(bulkArgs.messages).toHaveLength(1)
    expect(bulkArgs.messages[0]?.sourceId).toBe("msg-xyz")
  })

  it("advances the AI marker by default (coexistAiReadsSyncedHistory off), carrying the newest message id", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-abc", "user-999")],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-xyz", "user-999")],
      after: undefined,
    })
    mockBulkImportMessages.mockResolvedValueOnce({
      importedMessages: 1,
      skippedMessages: 0,
      insertedAttachmentIds: [],
      newestMessageAt: new Date(RECENT_TS),
      oldestMessageAt: new Date(RECENT_TS),
      newestIncomingMessageAt: new Date(RECENT_TS),
      newestMessageId: "100000000000001",
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockApplyCoexistActivityUpdates).toHaveBeenCalledWith(
      expect.any(Array),
      { workspaceId: "ws-messenger-1" },
    )
    const [updates] = mockApplyCoexistActivityUpdates.mock.calls[0] as [
      Array<{ aiMarkerMessageId: string | null }>,
    ]
    expect(updates[0]?.aiMarkerMessageId).toBe("100000000000001")
  })

  it("passes a null aiMarkerMessageId when coexistAiReadsSyncedHistory is on (AI reads synced history)", async () => {
    mockFindByIdMessenger.mockResolvedValue({
      ...fakeIntegration,
      coexistAiReadsSyncedHistory: true,
    })
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-abc", "user-999")],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-xyz", "user-999")],
      after: undefined,
    })
    mockBulkImportMessages.mockResolvedValueOnce({
      importedMessages: 1,
      skippedMessages: 0,
      insertedAttachmentIds: [],
      newestMessageAt: new Date(RECENT_TS),
      oldestMessageAt: new Date(RECENT_TS),
      newestIncomingMessageAt: new Date(RECENT_TS),
      newestMessageId: "100000000000001",
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockApplyCoexistActivityUpdates).toHaveBeenCalledWith(
      expect.any(Array),
      { workspaceId: "ws-messenger-1" },
    )
    const [updates] = mockApplyCoexistActivityUpdates.mock.calls[0] as [
      Array<{ aiMarkerMessageId: string | null }>,
    ]
    expect(updates[0]?.aiMarkerMessageId).toBeNull()
  })

  it("paginates messages within a conversation — flushes bulkImportMessages per message page", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-1", "user-1")],
      after: undefined,
    })
    // Provide the contact link for user-1
    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: "user-1" },
    ])

    mockListMessages
      .mockResolvedValueOnce({
        data: [makeMessage("msg-a", "user-1")],
        after: "msg-cursor-2",
      })
      .mockResolvedValueOnce({
        data: [makeMessage("msg-b", "user-1")],
        after: undefined,
      })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListMessages).toHaveBeenCalledTimes(2)
    expect(mockListMessages).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ after: "msg-cursor-2" }),
    )
    // After M3 fix: bulkImportMessages is called once per message page
    expect(mockBulkImportMessages).toHaveBeenCalledTimes(2)
    const calls = mockBulkImportMessages.mock.calls as [
      { messages: unknown[] },
    ][]
    expect(calls[0]?.[0]?.messages).toHaveLength(1)
    expect(calls[1]?.[0]?.messages).toHaveLength(1)
  })

  it("skips conversations that contain only the Page PSID", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    // No contact links since there are no valid participants
    wireSelectChain(defaultRunRow(), [])

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          id: "conv-page-only",
          participants: { data: [{ id: PAGE_ID, name: "My Page" }] },
        },
      ],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListMessages).not.toHaveBeenCalled()
    // No contact → bulkImportMessages never called for this conversation.
    expect(mockBulkImportMessages).not.toHaveBeenCalled()
  })

  it("never uses the Page PSID as a contact sourceId", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const customerId = "user-customer-789"
    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: customerId },
    ])

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-2", customerId)],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-m", customerId)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockBulkImportMessages).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImportMessages.mock.calls[0] as [
      { contactInboxId: string },
    ]
    // The contactInboxId should be for the non-Page participant.
    expect(bulkArgs.contactInboxId).toBe("ci-1")
  })

  it("skips messages without a text body", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-3", "user-3")],
      after: undefined,
    })
    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: "user-3" },
    ])
    mockListMessages.mockResolvedValueOnce({
      data: [
        {
          id: "msg-notext",
          from: { id: "user-3" },
          created_time: "2024-01-01T10:00:00Z",
        },
      ],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // bulkImportMessages is called but with no messages (empty body filtered).
    expect(mockBulkImportMessages).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImportMessages.mock.calls[0] as [
      { messages: unknown[] },
    ]
    expect(bulkArgs.messages).toHaveLength(0)
  })

  it("does not synthesize system time when a Messenger message has no API created_time", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-3b", "user-3b")],
      after: undefined,
    })
    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: "user-3b" },
    ])
    mockListMessages.mockResolvedValueOnce({
      data: [
        {
          id: "msg-no-created-time",
          from: { id: "user-3b" },
          message: "missing created_time",
        },
      ],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockBulkImportMessages).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImportMessages.mock.calls[0] as [
      { messages: Array<{ sourceId: string; createdAt?: Date }> },
    ]
    expect(bulkArgs.messages[0]?.sourceId).toBe("msg-no-created-time")
    expect(bulkArgs.messages[0]?.createdAt).toBeUndefined()
  })

  it("persists lastSyncedAt watermark (oldest CONVERSATION.updated_time processed) after the page", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    // Two convs with distinct updated_time. Watermark must track the oldest
    // CONV updated_time (not message.created_time) so resume on the next chunk
    // correctly compares against conv.updated_time which Graph DESC-sorts on.
    const newerConvTs = new Date(
      Date.now() - 1 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const olderConvTs = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString()

    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: "user-1" },
      {
        sourceId: "user-2",
        contactInboxId: "ci-2",
        contactId: "contact-2",
        conversationId: "conv-inbox-2",
      },
    ])

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-newer", "user-1"),
          updated_time: newerConvTs,
        },
        {
          ...makeConversation("conv-older", "user-2"),
          updated_time: olderConvTs,
        },
      ],
      after: undefined,
    })
    mockListMessages.mockResolvedValue({
      data: [makeMessage("msg-x", "user-1", RECENT_TS)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // The per-page update carries the watermark via
    // `coexistService.incrementProgress({ fields: { lastSyncedAt, ... } })`.
    const watermarkCall = mockIncrementProgress.mock.calls
      .map((args) => args[0] as { fields?: Record<string, unknown> })
      .find(
        (payload) =>
          payload.fields &&
          "lastSyncedAt" in payload.fields &&
          payload.fields.lastSyncedAt instanceof Date,
      )
    expect(watermarkCall).toBeDefined()
    expect((watermarkCall?.fields?.lastSyncedAt as Date).toISOString()).toBe(
      olderConvTs,
    )
  })

  it("aborts when optimistic claim returns empty (run already owned by another worker)", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    // Override the default wire-up so the claim returns null — handler
    // must log + return without calling listConversations.
    wireUpdateChain(null)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-never-fetched", "user-1")],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListConversations).not.toHaveBeenCalled()
    expect(mockBulkImportMessages).not.toHaveBeenCalled()
  })

  it("skips conversations whose updated_time is newer than the within-run frontier", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    // Frontier: anything strictly newer than this was processed in a prior
    // chunk of THIS run and must be skipped.
    const frontier = new Date(Date.now() - 24 * 60 * 60 * 1000)
    wireSelectChain({ ...defaultRunRow(), lastSyncedAt: frontier }, [
      {
        sourceId: "user-2",
        contactInboxId: "ci-2",
        contactId: "contact-2",
        conversationId: "conv-inbox-2",
      },
    ])

    const newerConvTs = new Date(frontier.getTime() + 60 * 1000).toISOString()
    const olderConvTs = new Date(frontier.getTime() - 60 * 1000).toISOString()

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-newer", "user-1"),
          updated_time: newerConvTs,
        },
        {
          ...makeConversation("conv-older", "user-2"),
          updated_time: olderConvTs,
        },
      ],
      after: undefined,
    })
    mockListMessages.mockResolvedValue({
      data: [makeMessage("msg-1", "user-2", olderConvTs)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Only the older conv passed the frontier filter.
    expect(mockListMessages).toHaveBeenCalledOnce()
  })

  it("stops the walk when prior run succeeded — ceiling = priorRun.startedAt", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const priorStartedAt = new Date(Date.now() - 12 * 60 * 60 * 1000)
    // coexistService.findResumeCeiling already derives the ceiling from the
    // prior run's status (succeeded → startedAt) — the handler just consumes
    // the resolved Date.
    mockFindResumeCeiling.mockResolvedValue(priorStartedAt)

    const belowCeilingTs = new Date(
      priorStartedAt.getTime() - 60 * 1000,
    ).toISOString()
    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-below-ceiling", "user-1"),
          updated_time: belowCeilingTs,
        },
      ],
      after: "should-not-be-followed",
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Conv at-or-below ceiling → walk stops, no messages fetched, no
    // follow-up page request.
    expect(mockListMessages).not.toHaveBeenCalled()
    expect(mockListConversations).toHaveBeenCalledOnce()
  })

  it("after prior partial — ceiling = priorRun.lastSyncedAt (boundary the prior attempt reached)", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const priorLastSyncedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // coexistService.findResumeCeiling already derives the ceiling from the
    // prior run's status (partial → lastSyncedAt) — the handler just consumes
    // the resolved Date.
    mockFindResumeCeiling.mockResolvedValue(priorLastSyncedAt)

    const aboveCeilingTs = new Date(
      priorLastSyncedAt.getTime() + 60 * 1000,
    ).toISOString()
    const belowCeilingTs = new Date(
      priorLastSyncedAt.getTime() - 60 * 1000,
    ).toISOString()

    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: "user-1" },
    ])

    mockListConversations.mockResolvedValueOnce({
      data: [
        {
          ...makeConversation("conv-above", "user-1"),
          updated_time: aboveCeilingTs,
        },
        {
          ...makeConversation("conv-below", "user-2"),
          updated_time: belowCeilingTs,
        },
      ],
      after: undefined,
    })
    mockListMessages.mockResolvedValueOnce({
      data: [makeMessage("msg-a", "user-1", aboveCeilingTs)],
      after: undefined,
    })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // Only the conv above the ceiling triggers a message fetch.
    expect(mockListMessages).toHaveBeenCalledOnce()
  })

  it("conversation fetch failure counts as one failed contact (no N-message inflation)", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    // Provide a link so the conv is processed (not skipped for missing link).
    wireSelectChain(defaultRunRow(), [
      { ...defaultContactLink, sourceId: "user-broken" },
    ])

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-broken", "user-broken")],
      after: undefined,
    })
    // Single page with messages that would have been ~100 — but the fetch
    // throws so the sentinel path runs and counts ONE failure for this conv.
    mockListMessages.mockRejectedValueOnce(new Error("Graph 500"))

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    // bulkImportMessages was not called since the conv failed before reaching it.
    expect(mockBulkImportMessages).not.toHaveBeenCalled()

    // failedCount in the per-page increment call should be 1 — not 100. The
    // atomic `sql\`col + N\`` composition now lives inside
    // coexistSyncRunRepository.incrementProgress (unit-tested at that layer);
    // here we assert the handler passed the equivalent increment value.
    const pageIncrementWithFailure = mockIncrementProgress.mock.calls
      .map(
        (args) =>
          args[0] as {
            increments?: Record<string, number>
            fields?: Record<string, unknown>
          },
      )
      .find(
        (payload) =>
          typeof payload.fields?.currentStep === "string" &&
          (payload.fields.currentStep as string).includes("phase=messages") &&
          (payload.fields.currentStep as string).includes("processed"),
      )
    expect(pageIncrementWithFailure).toBeDefined()
    expect(pageIncrementWithFailure?.increments?.failedCount).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // H1 — respectPause BUC sleep cap
  // ---------------------------------------------------------------------------

  it("H1 — caps BUC pause at 300 s even when estimatedTimeToRegainAccess = 3600", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    // The first call to concurrencyForUsage returns 0 (budget exhausted), then
    // subsequent calls return 5 so the handler continues normally.
    mockConcurrencyForUsage.mockReturnValueOnce(0).mockReturnValue(5)

    // listConversations returns a bucUsage with an absurdly large regain time
    // and an empty data set so the walk finishes immediately after the pause.
    mockListConversations.mockResolvedValueOnce({
      data: [],
      after: undefined,
      bucUsage: { estimatedTimeToRegainAccess: 3600 },
    })

    // Spy on global.setTimeout to capture the sleep delay without actually
    // blocking the test.
    const delays: number[] = []
    const origSetTimeout = global.setTimeout
    vi.spyOn(global, "setTimeout").mockImplementation(
      (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay !== undefined) {
          delays.push(delay)
        }
        if (typeof fn === "function") {
          fn(...(args as []))
        }
        return origSetTimeout(fn, 0, ...args)
      },
    )

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    vi.restoreAllMocks()

    // The pause triggered by applyBucThrottle must be capped at 300 000 ms.
    const pauseDelay = delays.find((d) => d > 0)
    expect(pauseDelay).toBeDefined()
    expect(pauseDelay).toBeLessThanOrEqual(300_000)
  })

  // ---------------------------------------------------------------------------
  // M3 — per-page message flushing
  // ---------------------------------------------------------------------------

  it("M3 — bulkImportMessages is called once per message page, not once after all pages", async () => {
    mockFindByIdMessenger.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    mockListConversations.mockResolvedValueOnce({
      data: [makeConversation("conv-paginated", "user-999")],
      after: undefined,
    })

    // Three pages of messages for the single conversation.
    mockListMessages
      .mockResolvedValueOnce({
        data: [makeMessage("msg-1", "user-999")],
        after: "cursor-page-2",
      })
      .mockResolvedValueOnce({
        data: [makeMessage("msg-2", "user-999")],
        after: "cursor-page-3",
      })
      .mockResolvedValueOnce({
        data: [makeMessage("msg-3", "user-999")],
        after: undefined,
      })

    await coexistMessengerSync({ runId, integrationId, workspaceId })

    expect(mockListMessages).toHaveBeenCalledTimes(3)
    // Each page must trigger a separate bulkImportMessages flush.
    expect(mockBulkImportMessages).toHaveBeenCalledTimes(3)
    const calls = mockBulkImportMessages.mock.calls as [
      { messages: Array<{ sourceId: string }> },
    ][]
    expect(calls[0]?.[0]?.messages[0]?.sourceId).toBe("msg-1")
    expect(calls[1]?.[0]?.messages[0]?.sourceId).toBe("msg-2")
    expect(calls[2]?.[0]?.messages[0]?.sourceId).toBe("msg-3")
  })
})
