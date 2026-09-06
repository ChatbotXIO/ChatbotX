import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockFindByPhoneNumberId,
  mockFindOrFail,
  mockFindNewestLiveRunId,
  mockClaimRunForSync,
  mockFindFlushResumeState,
  mockUpdateProgress,
  mockMarkFailed,
  mockMarkHistoryDeclined,
  mockListUnprocessed,
  mockMarkProcessed,
  mockHasUnprocessed,
  mockListIdentityColumnsByInboxAndSourceIds,
  mockCreateMessageRepository,
  mockFindManyBySourceIds,
  mockBulkCreateAttachments,
  mockBulkPatchContentAttributes,
  mockGetSafeSinceTime,
  mockBulkImport,
  mockQueueAdd,
  mockQueueAddBulk,
} = vi.hoisted(() => ({
  mockFindByPhoneNumberId: vi.fn(),
  mockFindOrFail: vi.fn(),
  mockFindNewestLiveRunId: vi.fn(),
  mockClaimRunForSync: vi.fn(),
  mockFindFlushResumeState: vi.fn(),
  mockUpdateProgress: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkHistoryDeclined: vi.fn(),
  mockListUnprocessed: vi.fn(),
  mockMarkProcessed: vi.fn(),
  mockHasUnprocessed: vi.fn(),
  mockListIdentityColumnsByInboxAndSourceIds: vi.fn(),
  mockCreateMessageRepository: vi.fn(),
  mockFindManyBySourceIds: vi.fn(),
  mockBulkCreateAttachments: vi.fn(),
  mockBulkPatchContentAttributes: vi.fn(),
  mockGetSafeSinceTime: vi.fn(),
  mockBulkImport: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockQueueAddBulk: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `findOrFail` is still imported from `@chatbotx.io/database/client` directly
// for the Inbox lookup — keep this mock minimal (plain stub) per the hard
// rule against opening a real DB connection via importOriginal(schema).
// `db` is also imported (only to be forwarded, opaquely, into
// `createMessageRepository(db)` — itself mocked below — so a plain sentinel
// object is sufficient; it is never queried directly in this test).
vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: {
    findNewestLiveRunId: mockFindNewestLiveRunId,
    claimRunForSync: mockClaimRunForSync,
    findFlushResumeState: mockFindFlushResumeState,
    updateProgress: mockUpdateProgress,
    markFailed: mockMarkFailed,
  },
  integrationWhatsappService: {
    markHistoryDeclined: mockMarkHistoryDeclined,
  },
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByPhoneNumberId: mockFindByPhoneNumberId,
  },
  whatsappCoexistStagingRepository: {
    listUnprocessed: mockListUnprocessed,
    markProcessed: mockMarkProcessed,
    hasUnprocessed: mockHasUnprocessed,
  },
  contactInboxRepository: {
    listIdentityColumnsByInboxAndSourceIds:
      mockListIdentityColumnsByInboxAndSourceIds,
  },
  createMessageRepository: mockCreateMessageRepository,
  getSafeSinceTime: mockGetSafeSinceTime,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  // `logProviderError` short-circuits on this, as `defaultQueue` does.
  isNoRedisEnv: () => true,
  IntegrationJobAction: {
    coexistWhatsappBuffer: "coexistWhatsappBuffer",
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
    coexistAttachmentDownload: "coexistAttachmentDownload",
  },
  integrationQueue: { add: mockQueueAdd, addBulk: mockQueueAddBulk },
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportHistorical: mockBulkImport,
}))

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------

import { coexistWhatsappFlush } from "../src/integration/handlers/coexist/whatsapp-flush"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const runId = "run-1"
const phoneNumberId = "phone-456"

const fakeIntegration = {
  id: "int-1",
  workspaceId: "ws-1",
  phoneNumberId,
  coexistEnabled: true,
  coexistAiReadsSyncedHistory: false,
  inboxId: "inbox-1",
}

const fakeInbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "whatsapp",
}

const makeStagedRow = (id: string, waId = "601234567890") => ({
  id,
  phoneNumberId,
  processedAt: null,
  payload: {
    contacts: [{ wa_id: waId, profile: { name: "Alice" } }],
    history: [
      {
        threads: [
          {
            id: waId,
            messages: [
              {
                id: `msg-${id}`,
                from: waId,
                timestamp: "1700000000",
                type: "text",
                text: { body: "Hello" },
              },
            ],
          },
        ],
      },
    ],
  },
})

const defaultRunRow = () => ({
  workspaceId: "ws-1",
  currentPageNumber: 0,
  attempts: 0,
  importedContactCount: 0,
  importedMessageCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentScan: 0,
  currentError: null as string | null,
})

const emptyBulkResult = (overrides: Partial<Record<string, unknown>> = {}) => ({
  importedContacts: 0,
  importedMessages: 0,
  skippedContacts: 0,
  skippedMessages: 0,
  failedMessages: 0,
  contactInboxIds: new Map<string, string>(),
  insertedAttachmentIds: [] as string[],
  ...overrides,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wires the two service/repository calls that replace the old raw
 * `db.select()` chains:
 *  - `coexistService.findFlushResumeState` → the resume-row read (9 columns),
 *    done once right after the claim.
 *  - `whatsappCoexistStagingRepository.listUnprocessed` → the staged-row
 *    batch query. Returns `stagedRows` on the first call, `[]` on every
 *    subsequent call (terminates the batch loop deterministically) — mirrors
 *    the old `.limit(BATCH_SIZE)` pagination semantics.
 */
const wireSelect = (
  runRow: ReturnType<typeof defaultRunRow> | null,
  stagedRows: unknown[],
) => {
  mockFindFlushResumeState.mockResolvedValue(runRow ?? null)
  mockListUnprocessed.mockReset()
  mockListUnprocessed.mockResolvedValueOnce(stagedRows).mockResolvedValue([])
}

/**
 * Wires `coexistService.claimRunForSync` — the optimistic claim that replaces
 * the old raw `db.update().set().where().returning()` chain. Default claim
 * result is the run row (handler treats the run as successfully claimed);
 * pass `wireUpdateChain(null)` to simulate "already claimed".
 */
const wireUpdateChain = (
  claimResult: { id: string } | null = { id: runId },
) => {
  mockClaimRunForSync.mockResolvedValue(claimResult)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coexistWhatsappFlush", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wireUpdateChain()
    mockBulkImport.mockResolvedValue(emptyBulkResult())
    mockQueueAdd.mockResolvedValue(undefined)
    mockQueueAddBulk.mockResolvedValue(undefined)
    mockUpdateProgress.mockResolvedValue(undefined)
    mockMarkFailed.mockResolvedValue(undefined)
    mockMarkHistoryDeclined.mockResolvedValue(undefined)
    mockMarkProcessed.mockResolvedValue(undefined)
    mockHasUnprocessed.mockResolvedValue(false)
    mockListIdentityColumnsByInboxAndSourceIds.mockResolvedValue([])
    mockGetSafeSinceTime.mockReturnValue(undefined)
    mockCreateMessageRepository.mockResolvedValue({
      findManyBySourceIds: mockFindManyBySourceIds,
      bulkCreateAttachments: mockBulkCreateAttachments,
      bulkPatchContentAttributes: mockBulkPatchContentAttributes,
    })
    mockFindManyBySourceIds.mockResolvedValue([])
    mockBulkCreateAttachments.mockResolvedValue([])
    mockBulkPatchContentAttributes.mockResolvedValue(undefined)
  })

  it("is a no-op when integration is not found", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(null)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockFindFlushResumeState).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when coexistEnabled === false (billing gate)", async () => {
    mockFindByPhoneNumberId.mockResolvedValue({
      ...fakeIntegration,
      coexistEnabled: false,
    })

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockFindFlushResumeState).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when CoexistSyncRun row is gone", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(null, [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("sets status='running' on entry and status closes after exhaustion", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // "running" is set by claimRunForSync (asserted via the claim call
    // itself); the handler's own updateProgress calls close the run.
    expect(mockClaimRunForSync).toHaveBeenCalledWith({
      runId,
      touchUpdatedAt: false,
    })
    const setPayloads = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: Record<string, unknown> }).fields,
    )
    expect(setPayloads.some((p) => p.status === "succeeded")).toBe(true)
  })

  it("calls bulkImportHistorical with the coalesced batch when staged rows exist", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])
    mockBulkImport.mockResolvedValueOnce(
      emptyBulkResult({ importedMessages: 1 }),
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        inbox: typeof fakeInbox
        workspaceId: string
        runId: string
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{ sourceId: string }>
        }>
      },
    ]
    expect(bulkArgs.inbox).toBe(fakeInbox)
    expect(bulkArgs.workspaceId).toBe("ws-1")
    expect(bulkArgs.runId).toBe(runId)
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("601234567890")
    expect(bulkArgs.batch[0]?.messages[0]?.sourceId).toBe("msg-row-1")
  })

  it("passes aiReadsSyncedHistory=false through to bulkImportHistorical when coexistAiReadsSyncedHistory is off", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { aiReadsSyncedHistory: boolean },
    ]
    expect(bulkArgs.aiReadsSyncedHistory).toBe(false)
  })

  it("passes aiReadsSyncedHistory=true through to bulkImportHistorical when coexistAiReadsSyncedHistory is on", async () => {
    mockFindByPhoneNumberId.mockResolvedValue({
      ...fakeIntegration,
      coexistAiReadsSyncedHistory: true,
    })
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { aiReadsSyncedHistory: boolean },
    ]
    expect(bulkArgs.aiReadsSyncedHistory).toBe(true)
  })

  it("does not synthesize system time when a WhatsApp history message has no API timestamp", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [
      {
        id: "row-no-timestamp",
        phoneNumberId,
        processedAt: null,
        payload: {
          contacts: [{ wa_id: "601234567890", profile: { name: "Alice" } }],
          history: [
            {
              threads: [
                {
                  id: "601234567890",
                  messages: [
                    {
                      id: "msg-no-timestamp",
                      from: "601234567890",
                      type: "text",
                      text: { body: "Hello without timestamp" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          messages: Array<{ sourceId: string; createdAt?: Date }>
        }>
      },
    ]
    expect(bulkArgs.batch[0]?.messages[0]?.sourceId).toBe("msg-no-timestamp")
    expect(bulkArgs.batch[0]?.messages[0]?.createdAt).toBeUndefined()
  })

  it("imports state_sync contacts without creating message activity", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [
      {
        id: "row-state-sync",
        phoneNumberId,
        processedAt: null,
        payload: {
          metadata: {
            phone_number_id: phoneNumberId,
            display_phone_number: "84964484839",
          },
          messaging_product: "whatsapp",
          state_sync: [
            {
              type: "contact",
              action: "add",
              contact: {
                user_id: "VN.1535008561702153",
                full_name: "Thắng Rửa Xe",
                first_name: "Thắng Rửa Xe",
                phone_number: "84921378409",
              },
              metadata: { version: 1, timestamp: "1782225192581" },
            },
          ],
        },
      },
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: {
            sourceId: string
            phoneNumber?: string
            firstName?: string
          }
          messages: Array<{ sourceId: string; createdAt?: Date }>
        }>
      },
    ]
    expect(bulkArgs.batch).toHaveLength(1)
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("84921378409")
    expect(bulkArgs.batch[0]?.contact.phoneNumber).toBe("84921378409")
    expect(bulkArgs.batch[0]?.contact.firstName).toBe("Thắng Rửa Xe")
    expect(bulkArgs.batch[0]?.messages).toEqual([])
  })

  it("coalesces multiple staging rows that reference the same wa_id into ONE batch entry", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [
      makeStagedRow("row-a", "601234567890"),
      makeStagedRow("row-b", "601234567890"),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{ sourceId: string }>
        }>
      },
    ]
    expect(bulkArgs.batch).toHaveLength(1)
    expect(bulkArgs.batch[0]?.messages).toHaveLength(2)
  })

  it("marks ALL staging rows processed atomically after a successful bulk", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    const rows = [makeStagedRow("row-a"), makeStagedRow("row-b")]
    wireSelect(defaultRunRow(), rows)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // whatsappCoexistStagingRepository.markProcessed now owns the
    // "processedAt" UPDATE (isNull-guarded, batched by id) — assert the
    // handler passed the equivalent ids, same ordering as the staged rows.
    expect(mockMarkProcessed).toHaveBeenCalledWith({
      ids: ["row-a", "row-b"],
    })
  })

  it("does NOT mark staging rows processed when bulk import throws", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-x")])
    mockBulkImport.mockRejectedValueOnce(new Error("bulk failed"))

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // Staging rows stay unprocessed — the bulk-import throw skips markProcessed.
    expect(mockMarkProcessed).not.toHaveBeenCalled()
    // Final status must close as failed.
    const setPayloads = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: Record<string, unknown> }).fields,
    )
    expect(setPayloads.some((p) => p.status === "failed")).toBe(true)
  })

  it("respects isNull(processedAt) when selecting staging rows (no double-processing)", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // The isNull(processedAt) filter is now internal to
    // whatsappCoexistStagingRepository.listUnprocessed — assert the handler
    // called it with the equivalent phoneNumberId + batch size instead.
    expect(mockListUnprocessed).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId }),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // New payload shapes (May 21 2026 Meta docs)
  // ─────────────────────────────────────────────────────────────────────────

  const makeEchoRow = (id: string, waId = "601234567890") => ({
    id,
    phoneNumberId,
    processedAt: null,
    payload: {
      metadata: { phone_number_id: phoneNumberId },
      smb_message_echoes: [
        {
          id: `echo-${id}`,
          from: "business-self",
          to: waId,
          timestamp: "1700000123",
          type: "text",
          text: { body: "Hi from business" },
        },
      ],
    },
  })

  const makeDeclinedRow = (id: string) => ({
    id,
    phoneNumberId,
    processedAt: null,
    payload: {
      metadata: { phone_number_id: phoneNumberId },
      history: [
        {
          errors: [{ code: 2_593_109, title: "History sharing declined" }],
        },
      ],
    },
  })

  const makeMetadataRow = (id: string, waId = "601234567890") => ({
    id,
    phoneNumberId,
    processedAt: null,
    payload: {
      contacts: [{ wa_id: waId, profile: { name: "Alice" } }],
      history: [
        {
          metadata: { phase: 2, chunk_order: 5, progress: 100 },
          threads: [
            {
              id: waId,
              messages: [
                {
                  id: `msg-${id}`,
                  from: waId,
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hello" },
                },
              ],
            },
          ],
        },
      ],
    },
  })

  it("smb_message_echoes produces an outgoing message keyed on echo.to", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeEchoRow("row-echo")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{ sourceId: string; messageType: string }>
        }>
      },
    ]
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("601234567890")
    expect(bulkArgs.batch[0]?.messages[0]?.sourceId).toBe("echo-row-echo")
    expect(bulkArgs.batch[0]?.messages[0]?.messageType).toBe("outgoing")
  })

  it("current Meta message_echoes produces an outgoing message with the API timestamp", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [
      {
        id: "row-current-echo",
        phoneNumberId,
        processedAt: null,
        payload: {
          metadata: { phone_number_id: phoneNumberId },
          message_echoes: [
            {
              id: "echo-current",
              from: "business-self",
              to: "601234567890",
              timestamp: "1700000123",
              type: "text",
              text: { body: "Hi from current Meta shape" },
            },
          ],
        },
      },
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{
            sourceId: string
            messageType: string
            createdAt?: Date
          }>
        }>
      },
    ]
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("601234567890")
    expect(bulkArgs.batch[0]?.messages[0]?.sourceId).toBe("echo-current")
    expect(bulkArgs.batch[0]?.messages[0]?.messageType).toBe("outgoing")
    expect(bulkArgs.batch[0]?.messages[0]?.createdAt?.toISOString()).toBe(
      "2023-11-14T22:15:23.000Z",
    )
  })

  it("history-decline (error 2593109) closes run as succeeded with sentinel error and flips historyDeclined", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeDeclinedRow("row-declined")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // Flipping the integration's historyDeclined flag is now
    // integrationWhatsappService.markHistoryDeclined, not a raw db.update set.
    expect(mockMarkHistoryDeclined).toHaveBeenCalledWith({
      id: fakeIntegration.id,
    })

    const setPayloads = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: Record<string, unknown> }).fields,
    )
    const closePayload = setPayloads.find((p) => p && p.currentStep === "done")
    expect(closePayload?.status).toBe("succeeded")
    expect(closePayload?.currentError).toBe("history_declined")
  })

  it("history metadata persists phase/chunkOrder/syncProgress on the run row", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeMetadataRow("row-meta")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const setPayloads = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: Record<string, unknown> }).fields,
    )

    expect(
      setPayloads.some(
        (p) =>
          p.lastPhase === 2 && p.lastChunkOrder === 5 && p.syncProgress === 100,
      ),
    ).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // type="errors" thread filtering — Meta could not decode the message
  // (e.g. code 131051 "Message type unknown"). No contact should be created.
  // ─────────────────────────────────────────────────────────────────────────

  // Real staging payload captured on 2026-05-27 (phoneNumberId=1111111111111111,
  // display_phone_number=84123456789). Thread "84123456789" carries a single
  // type="errors" / code 131051 message (Meta could not decode). Thread
  // "84123456789" carries one outgoing + one incoming text. Buffer staged 3
  // rows total — this one (phase=0 with threads) + two phase markers below.
  const ERRORS_ONLY_WA_ID = "84123456789"
  const VALID_WA_ID = "22223456789"
  const BUSINESS_PN = "33333456789"
  const REAL_PHONE_NUMBER_ID = "1111111111111111"
  const ERRORS_WAMID =
    "wamid.HBgMNDQ3NzEwMTczNzM2FQIAEhgSNzA2QTU4MUUwNjdDMzMyREZGAA=="
  const OUTGOING_WAMID =
    "wamid.HBgLODQ5NjQ0ODQ4MzkVAgARGBQyQUNDMEJBQzhBNzRBMjA5QjY0QQA="
  const INCOMING_WAMID =
    "wamid.HBgLODQzNDk1NjY1NTAVAgASGBQzQUU4MEE5MjNDOTJBQ0Y2QTc2MwA="

  const realRowWithErrorsAndValid = {
    id: "11539619131146240",
    phoneNumberId: REAL_PHONE_NUMBER_ID,
    processedAt: null,
    payload: {
      messaging_product: "whatsapp",
      metadata: {
        phone_number_id: REAL_PHONE_NUMBER_ID,
        display_phone_number: BUSINESS_PN,
      },
      history: [
        {
          metadata: { phase: 0, progress: 100, chunk_order: 1 },
          threads: [
            {
              id: ERRORS_ONLY_WA_ID,
              context: {
                wa_id: ERRORS_ONLY_WA_ID,
                user_id: "GB.4452997605017458",
              },
              messages: [
                {
                  id: ERRORS_WAMID,
                  from: ERRORS_ONLY_WA_ID,
                  type: "errors",
                  errors: [
                    {
                      code: 131_051,
                      title: "Message type unknown",
                      message: "Message type unknown",
                      error_data: { details: "Unsupported message received" },
                    },
                  ],
                  timestamp: "1779915326",
                  from_user_id: "GB.4452997605017458",
                  history_context: { status: "pending" },
                },
              ],
            },
            {
              id: VALID_WA_ID,
              context: {
                wa_id: VALID_WA_ID,
                user_id: "VN.4416742385309647",
              },
              messages: [
                {
                  id: OUTGOING_WAMID,
                  from: BUSINESS_PN,
                  text: { body: "Ok fine" },
                  type: "text",
                  timestamp: "1779889338",
                  history_context: { status: "delivered", from_me: true },
                },
                {
                  id: INCOMING_WAMID,
                  from: VALID_WA_ID,
                  text: { body: "Alo" },
                  type: "text",
                  timestamp: "1779889324",
                  from_user_id: "VN.4416742385309647",
                  history_context: { status: "pending" },
                },
              ],
            },
          ],
        },
      ],
    },
  }

  // Real staging rows 2 & 3: phase-marker payloads (history entries with only
  // metadata, no threads). Meta sends these to signal phase rollover. Flush
  // must persist phase/progress/chunkOrder without creating any contact.
  const realRowPhase1Marker = {
    id: "11539619156115456",
    phoneNumberId: REAL_PHONE_NUMBER_ID,
    processedAt: null,
    payload: {
      messaging_product: "whatsapp",
      metadata: {
        phone_number_id: REAL_PHONE_NUMBER_ID,
        display_phone_number: BUSINESS_PN,
      },
      history: [{ metadata: { phase: 1, progress: 100, chunk_order: 1 } }],
    },
  }

  const realRowPhase2Marker = {
    id: "11539619181969408",
    phoneNumberId: REAL_PHONE_NUMBER_ID,
    processedAt: null,
    payload: {
      messaging_product: "whatsapp",
      metadata: {
        phone_number_id: REAL_PHONE_NUMBER_ID,
        display_phone_number: BUSINESS_PN,
      },
      history: [{ metadata: { phase: 2, progress: 100, chunk_order: 1 } }],
    },
  }

  it("skips contact creation for threads whose messages are all type='errors' (real payload)", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [realRowWithErrorsAndValid])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{
            sourceId: string
            messageType: string
            text?: string
          }>
        }>
      },
    ]
    const sourceIds = bulkArgs.batch.map((b) => b.contact.sourceId)
    expect(sourceIds).not.toContain(ERRORS_ONLY_WA_ID)
    expect(sourceIds).toContain(VALID_WA_ID)
    expect(bulkArgs.batch).toHaveLength(1)

    const messages = bulkArgs.batch[0]?.messages ?? []
    expect(messages).toHaveLength(2)
    const wamids = messages.map((m) => m.sourceId)
    expect(wamids).toContain(OUTGOING_WAMID)
    expect(wamids).toContain(INCOMING_WAMID)
    expect(wamids).not.toContain(ERRORS_WAMID)
  })

  it("keeps outgoing/incoming direction correct in the real payload thread", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [realRowWithErrorsAndValid])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          messages: Array<{
            sourceId: string
            messageType: string
            text?: string
          }>
        }>
      },
    ]
    const byWamid = new Map(
      (bulkArgs.batch[0]?.messages ?? []).map((m) => [m.sourceId, m]),
    )
    expect(byWamid.get(OUTGOING_WAMID)?.messageType).toBe("outgoing")
    expect(byWamid.get(INCOMING_WAMID)?.messageType).toBe("incoming")
  })

  it("phase-marker payloads (no threads) do not create contacts but still persist phase metadata", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [realRowPhase1Marker, realRowPhase2Marker])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // Either bulkImport is skipped entirely, or it is called with an empty
    // batch. Both shapes are acceptable; the invariant is "no contact rows".
    if (mockBulkImport.mock.calls.length > 0) {
      const [bulkArgs] = mockBulkImport.mock.calls[0] as [
        { batch: Array<{ contact: { sourceId: string } }> },
      ]
      expect(bulkArgs.batch).toHaveLength(0)
    }

    const setPayloads = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: Record<string, unknown> }).fields,
    )

    // Aggregator keeps the first marker when progress+chunkOrder tie across
    // rows (both real markers ship progress=100 chunk_order=1). Either phase
    // is acceptable — invariant is "phase metadata reached the run row".
    expect(
      setPayloads.some((p) => p.lastPhase === 1 || p.lastPhase === 2),
    ).toBe(true)
    expect(setPayloads.some((p) => p.syncProgress === 100)).toBe(true)
  })

  it("real 3-row staging set: only the errors+valid row produces a single VALID_WA_ID contact", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [
      realRowWithErrorsAndValid,
      realRowPhase1Marker,
      realRowPhase2Marker,
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).toHaveBeenCalledOnce()
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      {
        batch: Array<{
          contact: { sourceId: string }
          messages: Array<{ sourceId: string }>
        }>
      },
    ]
    expect(bulkArgs.batch).toHaveLength(1)
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe(VALID_WA_ID)
    expect(bulkArgs.batch[0]?.messages).toHaveLength(2)
  })

  it("counter inflation regression: failed contact's N messages do NOT inflate failedCount", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])
    // Bulk pipeline reports: 1 message imported, 0 failed.
    mockBulkImport.mockResolvedValueOnce(
      emptyBulkResult({ importedMessages: 1 }),
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closePayload = mockUpdateProgress.mock.calls
      .map((args) => (args[0] as { fields: Record<string, unknown> }).fields)
      .find((p) => p && p.currentStep === "done")

    expect(closePayload?.failedCount).toBe(0)
    expect(closePayload?.importedMessageCount).toBe(1)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // H3 — staging SELECT must include ORDER BY id (stable pagination)
  // ─────────────────────────────────────────────────────────────────────────

  it("H3: staging SELECT applies orderBy on the staging id column for stable pagination", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // The `.orderBy(whatsappCoexistStagingModel.id)` stable-pagination
    // invariant now lives inside
    // whatsappCoexistStagingRepository.listUnprocessed (see
    // packages/database/src/repositories/whatsapp-coexist-staging/repository.ts)
    // — the worker layer only owns the phoneNumberId + limit it passes in.
    expect(mockListUnprocessed).toHaveBeenCalledWith({
      phoneNumberId,
      limit: expect.any(Number),
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // H5 — edit/revoke UPDATE loop must be bounded (not N+K round trips)
  // ─────────────────────────────────────────────────────────────────────────

  it("H5: K edits + K revokes issue a bounded number of db.update calls (not 2K)", async () => {
    const K = 3
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    const contactWaIds = Array.from({ length: K }, (_, i) => `6012345670${i}`)

    const editsAndRevokes = Array.from({ length: K }, (_, i) => ({
      id: `row-patch-${i}`,
      phoneNumberId,
      processedAt: null,
      payload: {
        messages: [
          // edit: type="edit" with original_message_id
          {
            id: `edit-msg-${i}`,
            from: contactWaIds[i],
            type: "edit",
            edit: {
              original_message_id: `orig-${i}`,
              message: { type: "text", text: { body: `edited-${i}` } },
            },
          },
          // revoke: type="revoke" with original_message_id
          {
            id: `revoke-msg-${i}`,
            from: contactWaIds[i],
            type: "revoke",
            revoke: { original_message_id: `orig-revoke-${i}` },
          },
        ],
      },
    }))

    wireSelect(defaultRunRow(), editsAndRevokes)

    // resolveContactInboxIds → one row per contactWaId (the post-batch patch
    // resolution join, now contactInboxRepository.listIdentityColumnsByInboxAndSourceIds).
    mockListIdentityColumnsByInboxAndSourceIds.mockResolvedValue(
      contactWaIds.map((waId, i) => ({
        id: `ci-${i}`,
        sourceId: waId,
        lastIncomingMessageAt: null,
        createdAt: new Date(),
      })),
    )
    mockGetSafeSinceTime.mockReturnValue(new Date("2026-01-01T00:00:00Z"))
    // resolveMessageRows: return empty (no edit-with-media attachment inserts)
    mockFindManyBySourceIds.mockResolvedValue([])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // Before the fix: each edit fired one db.update(messageModel) and each
    // revoke fired one db.update(messageModel) → K + K = 6 round trips for
    // K=3. The batched UPDATE now lives inside
    // repo.bulkPatchContentAttributes (packages/database's message
    // repository) — the worker layer calls it exactly ONCE for the whole
    // batch of edits + revokes combined, not once per patch.
    expect(mockBulkPatchContentAttributes).toHaveBeenCalledOnce()
    const [patchArgs] = mockBulkPatchContentAttributes.mock.calls[0] as [
      { patches: unknown[] },
    ]
    expect(patchArgs.patches).toHaveLength(K * 2)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // M1 — reduceMetadata must not allow progress to regress
  // ─────────────────────────────────────────────────────────────────────────

  it("M1: reduceMetadata keeps higher progress even when a later chunk has lower progress", async () => {
    mockFindByPhoneNumberId.mockResolvedValue(fakeIntegration)
    mockFindOrFail.mockResolvedValue(fakeInbox)

    // Two staged rows: first has chunkOrder=5, progress=80;
    // second has chunkOrder=6, progress=10 (regressed).
    const highProgressRow = {
      id: "row-high",
      phoneNumberId,
      processedAt: null,
      payload: {
        history: [{ metadata: { phase: 1, chunk_order: 5, progress: 80 } }],
      },
    }
    const lowProgressRow = {
      id: "row-low",
      phoneNumberId,
      processedAt: null,
      payload: {
        history: [{ metadata: { phase: 1, chunk_order: 6, progress: 10 } }],
      },
    }
    wireSelect(defaultRunRow(), [highProgressRow, lowProgressRow])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const setPayloads = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: Record<string, unknown> }).fields,
    )

    // syncProgress must be 80 (from the earlier, higher-progress row),
    // NOT 10 (from the later chunk with regressed progress).
    const metaPayload = setPayloads.find((p) => p.syncProgress !== undefined)
    expect(metaPayload?.syncProgress).toBe(80)
    expect(metaPayload?.lastChunkOrder).toBe(5)
  })

  it("M2: keeps the run alive and enqueues a continuation when a row is staged after the drain", async () => {
    // Resume-row read, then the staged query returns a batch, then empty
    // (loop exits → exhausted), then a late row is discovered on the tail
    // re-check (`hasUnprocessed` → true). The run must NOT finalize; a
    // continuation must be enqueued.
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])
    mockHasUnprocessed.mockResolvedValue(true)

    mockBulkImport.mockResolvedValue(emptyBulkResult({ importedMessages: 1 }))

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // A continuation flush was enqueued (run kept alive to drain the late row).
    const enqueuedJobIds = mockQueueAdd.mock.calls.map(
      (args) => (args[2] as Record<string, unknown> | undefined)?.jobId,
    )
    expect(
      enqueuedJobIds.some(
        (id) =>
          typeof id === "string" && id.startsWith(`coexist-run-${runId}-`),
      ),
    ).toBe(true)

    // The run was NOT finalized as succeeded (no terminal status write).
    const finalizeStatuses = mockUpdateProgress.mock.calls.map(
      (args) => (args[0] as { fields: { status?: string } }).fields.status,
    )
    expect(finalizeStatuses).not.toContain("succeeded")
  })
})
