import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockClaimRun,
  mockFindLiveRun,
  mockRunWrite,
  mockFindInboxById,
  mockSelect,
  mockUpdate,
  mockTransaction,
  mockAndFn,
  mockEqFn,
  mockIsNullFn,
  mockInArrayFn,
  mockOrderByFn,
  mockBulkImport,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockClaimRun: vi.fn(),
  mockFindLiveRun: vi.fn(),
  /** Records every run-level write and decides how many rows it affects. */
  mockRunWrite: vi.fn(),
  mockFindInboxById: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  // db.transaction executes the callback with a tx object that has its own
  // update mock — calls on tx.update do NOT appear in mockUpdate.mock.calls.
  mockTransaction: vi.fn(
    (
      fn: (tx: {
        update: ReturnType<typeof vi.fn>
        insert: ReturnType<typeof vi.fn>
      }) => Promise<unknown>,
    ) => {
      const txUpdate = vi.fn().mockImplementation(() => {
        const chain = { set: vi.fn(), where: vi.fn() }
        chain.set.mockReturnValue(chain)
        chain.where.mockResolvedValue(undefined)
        return chain
      })
      const txInsert = vi.fn().mockImplementation(() => {
        const chain = {
          values: vi.fn(),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          returning: vi.fn().mockResolvedValue([]),
        }
        chain.values.mockReturnValue(chain)
        return chain
      })
      return fn({ update: txUpdate, insert: txInsert })
    },
  ),
  mockAndFn: vi.fn((...args: unknown[]) => ({ __and: args })),
  mockEqFn: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  mockIsNullFn: vi.fn((col: unknown) => ({ __isNull: col })),
  mockInArrayFn: vi.fn((col: unknown, vals: unknown) => ({
    __inArray: [col, vals],
  })),
  mockOrderByFn: vi.fn((col: unknown) => ({ __orderBy: col })),
  mockBulkImport: vi.fn(),
  mockQueueAdd: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type RunWriteGuard = { status: string; claimToken?: string | null }

/**
 * The run writes go through `coexistService`, so the tests assert on the
 * service seam rather than on drizzle internals. `db` stays mocked for the
 * staging/integration repositories the handler still reads through.
 */
vi.mock("@chatbotx.io/business/coexist", () => {
  const write = (fields: Record<string, unknown>, guard?: RunWriteGuard) =>
    mockRunWrite(fields, guard)
  return {
    coexistService: {
      claimRun: mockClaimRun,
      findLiveRun: mockFindLiveRun,
      updateProgress: ({
        fields,
        expect: guard,
      }: {
        fields: Record<string, unknown>
        expect?: RunWriteGuard
      }) => write(fields, guard),
      markFailed: ({
        currentError,
        expect: guard,
      }: {
        currentError: string
        expect?: RunWriteGuard
      }) =>
        write(
          { status: "failed", currentError, finishedAt: new Date() },
          guard,
        ),
      markPartial: ({
        currentError,
        expect: guard,
      }: {
        currentError?: string
        expect?: RunWriteGuard
      }) =>
        write(
          { status: "partial", currentError, finishedAt: new Date() },
          guard,
        ),
      markSucceeded: ({ expect: guard }: { expect?: RunWriteGuard }) =>
        write({ status: "succeeded", finishedAt: new Date() }, guard),
      resetForRetry: ({
        currentError,
        fields,
        expect: guard,
      }: {
        currentError: string
        fields?: Record<string, unknown>
        expect?: RunWriteGuard
      }) =>
        write(
          {
            ...fields,
            status: "init",
            currentError,
            lastHeartbeatAt: new Date(),
          },
          guard,
        ),
    },
  }
})

// The real barrel, with only the inbox lookup stubbed: the staging and
// integration repositories are exercised for real here, against the mocked
// `db` below, and the assertions read the where-clauses they emit. Loading it
// drags in `contactRepository`'s contact-filter graph, which is why the schema
// mock further down inherits the real module instead of stubbing a few tables.
vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/database/repositories")
  >()),
  inboxRepository: { findById: mockFindInboxById },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockUpdate,
    select: mockSelect,
    transaction: mockTransaction,
    query: {},
  },
  and: mockAndFn,
  eq: mockEqFn,
  isNull: mockIsNullFn,
  inArray: mockInArrayFn,
  orderBy: mockOrderByFn,
  lt: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    { raw: (s: string) => s },
  ),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  // `logProviderError` short-circuits on this, as `defaultQueue` does.
  isNoRedisEnv: () => true,
  buildCoexistPageJobId: ({
    runId: id,
    attempts,
    pageNumber,
  }: {
    runId: string
    attempts: number
    pageNumber: number
  }) => `coexist-run-${id}-${attempts}-page-${pageNumber}`,
  IntegrationJobAction: {
    coexistWhatsappBuffer: "coexistWhatsappBuffer",
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistMessengerSync: "coexistMessengerSync",
  },
  integrationQueue: { add: mockQueueAdd },
}))

// Carries the real schema forward and overrides only the models these tests
// inspect: the repositories barrel now reaches `queries/contact-filter`,
// which imports tables no stub here would list.
vi.mock("@chatbotx.io/database/schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/database/schema")>()),
  whatsappCoexistStagingModel: {
    id: "id",
    phoneNumberId: "phoneNumberId",
    processedAt: "processedAt",
    parseFailedAt: "parseFailedAt",
  },
  integrationWhatsappModel: { id: "id", phoneNumberId: "phoneNumberId" },
  inboxModel: {},
  coexistSyncRunModel: {
    id: "id",
    status: "status",
    claimToken: "claimToken",
    currentPageNumber: "currentPageNumber",
    attempts: "attempts",
    importedContactCount: "importedContactCount",
    importedMessageCount: "importedMessageCount",
    skippedCount: "skippedCount",
    failedCount: "failedCount",
    currentScan: "currentScan",
  },
  contactInboxModel: {
    id: "id",
    inboxId: "inboxId",
    sourceId: "sourceId",
    lastIncomingMessageAt: "lastIncomingMessageAt",
    createdAt: "createdAt",
  },
  messageModel: {
    contactInboxId: "contactInboxId",
    sourceId: "sourceId",
    contentAttributes: "contentAttributes",
  },
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportHistorical: mockBulkImport,
}))

// ---------------------------------------------------------------------------
// Import handler after mocks
// ---------------------------------------------------------------------------

import { coexistWhatsappFlush } from "../src/integration/handlers/coexist/whatsapp-flush"
import {
  CLAIM_TOKEN,
  createFlushHarness,
  defaultRunRow,
  emptyBulkResult,
  fakeInbox,
  fakeIntegration,
  makeDeclinedRow,
  makeEchoRow,
  makeMetadataRow,
  makeStagedRow,
  phoneNumberId,
  runId,
} from "./coexist-whatsapp-flush.test-utils"

const harness = createFlushHarness({
  mockClaimRun,
  mockRunWrite,
  mockSelect,
  mockUpdate,
})
const {
  allRunWriteGuards,
  allSetPayloads,
  setIntegration,
  wireSelect,
  wireUpdateChain,
} = harness

describe("coexistWhatsappFlush", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // vitest 4: clearAllMocks does NOT drain the mockReturnValueOnce queue, so
    // a prior test's wireSelect() returns would leak into this one. Reset the
    // select mock explicitly; every select-using test re-wires via wireSelect().
    mockSelect.mockReset()
    mockClaimRun.mockReset()
    mockRunWrite.mockReset()
    mockFindLiveRun.mockResolvedValue(null)
    setIntegration(fakeIntegration)
    wireUpdateChain()
    mockBulkImport.mockResolvedValue(emptyBulkResult())
    mockQueueAdd.mockResolvedValue(undefined)
  })

  it("is a no-op when integration is not found", async () => {
    wireSelect(defaultRunRow(), [])
    setIntegration(null)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockClaimRun).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when coexistEnabled === false (billing gate)", async () => {
    wireSelect(defaultRunRow(), [])
    setIntegration({ ...fakeIntegration, coexistEnabled: false })

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockClaimRun).not.toHaveBeenCalled()
    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  it("is a no-op when the run cannot be claimed (gone, or held by another worker)", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(null, [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockBulkImport).not.toHaveBeenCalled()
  })

  // Updated for brief-coexist-history-lifecycle.md §A: a drain that has NOT
  // seen Meta's terminal chunk must park the run in `waiting`, not close it
  // `succeeded` — the old assertion encoded the bug that stranded every later
  // history payload.
  it("sets status='running' on entry and parks in 'waiting' when Meta has not finished", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const setPayloads = allSetPayloads()

    // The claim is what sets `running` — and it carries the ownership token
    // every later write is checked against.
    expect(mockClaimRun).toHaveBeenCalledWith({
      runId,
      fromStatuses: ["init", "running", "waiting"],
    })
    for (const guard of allRunWriteGuards()) {
      expect(guard).toEqual({ status: "running", claimToken: CLAIM_TOKEN })
    }
    expect(setPayloads.some((p) => p.status === "succeeded")).toBe(false)
    const parked = setPayloads.find((p) => p.status === "waiting")
    expect(parked).toBeDefined()
    // A waiting run is not finished — the scheduler must be able to revive it.
    expect(parked?.finishedAt).toBeNull()
  })

  it("calls bulkImportHistorical with the coalesced batch when staged rows exist", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { aiReadsSyncedHistory: boolean },
    ]
    expect(bulkArgs.aiReadsSyncedHistory).toBe(false)
  })

  it("passes aiReadsSyncedHistory=true through to bulkImportHistorical when coexistAiReadsSyncedHistory is on", async () => {
    setIntegration({
      ...fakeIntegration,
      coexistAiReadsSyncedHistory: true,
    })
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-1")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { aiReadsSyncedHistory: boolean },
    ]
    expect(bulkArgs.aiReadsSyncedHistory).toBe(true)
  })

  it("does not synthesize system time when a WhatsApp history message has no API timestamp", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    const rows = [makeStagedRow("row-a"), makeStagedRow("row-b")]
    wireSelect(defaultRunRow(), rows)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockInArrayFn).toHaveBeenCalledWith(expect.anything(), [
      "row-a",
      "row-b",
    ])
    const setPayloads = allSetPayloads()
    expect(setPayloads.some((p) => "processedAt" in p)).toBe(true)
  })

  // Updated for brief-coexist-history-lifecycle.md §A.6: a thrown error is
  // transient, so the run resets to `init` and the error is rethrown for
  // BullMQ/scheduler retry bounding. The old assertion (status === "failed")
  // encoded the bug that terminalized a run on one hiccup, after which no
  // later payload could ever be imported.
  it("does NOT mark staging rows processed when bulk import throws, and resets the run for retry", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeStagedRow("row-x")])
    mockBulkImport.mockRejectedValueOnce(new Error("bulk failed"))

    await expect(
      coexistWhatsappFlush({ runId, phoneNumberId }),
    ).rejects.toThrow("bulk failed")

    // No update set call carries processedAt — staging rows stay unprocessed.
    const setPayloads = allSetPayloads()
    expect(setPayloads.some((p) => "processedAt" in p)).toBe(false)
    // The run must NOT be terminalized by a transient failure.
    expect(setPayloads.some((p) => p.status === "failed")).toBe(false)
    const reset = setPayloads.find((p) => p.status === "init")
    expect(reset).toBeDefined()
    expect(reset?.currentError).toBe("bulk failed")
  })

  it("respects isNull(processedAt) when selecting staging rows (no double-processing)", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockIsNullFn).toHaveBeenCalled()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // New payload shapes (May 21 2026 Meta docs)
  // ─────────────────────────────────────────────────────────────────────────

  it("smb_message_echoes produces an outgoing message keyed on echo.to", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeDeclinedRow("row-declined")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const setPayloads = allSetPayloads()

    expect(setPayloads.some((p) => p.historyDeclined === true)).toBe(true)
    const closePayload = setPayloads.find((p) => p && p.currentStep === "done")
    expect(closePayload?.status).toBe("succeeded")
    expect(closePayload?.currentError).toBe("history_declined")
  })

  it("history metadata persists phase/chunkOrder/syncProgress on the run row", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [makeMetadataRow("row-meta")])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const setPayloads = allSetPayloads()

    expect(
      setPayloads.some(
        (p) =>
          p.lastPhase === 2 && p.lastChunkOrder === 5 && p.syncProgress === 100,
      ),
    ).toBe(true)
  })
})
