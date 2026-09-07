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
const { allSetPayloads, setIntegration, wireSelect, wireUpdateChain } = harness

describe("coexistWhatsappFlush — Meta payload shapes", () => {
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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

    const setPayloads = allSetPayloads()

    // Aggregator keeps the first marker when progress+chunkOrder tie across
    // rows (both real markers ship progress=100 chunk_order=1). Either phase
    // is acceptable — invariant is "phase metadata reached the run row".
    expect(
      setPayloads.some((p) => p.lastPhase === 1 || p.lastPhase === 2),
    ).toBe(true)
    expect(setPayloads.some((p) => p.syncProgress === 100)).toBe(true)
  })

  it("real 3-row staging set: only the errors+valid row produces a single VALID_WA_ID contact", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
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
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    // Terminal row (phase 2 @ 100%) so the run actually closes and writes the
    // `currentStep: "done"` payload this assertion reads — see
    // brief-coexist-history-lifecycle.md §A.3.
    wireSelect(defaultRunRow(), [makeMetadataRow("row-1")])
    // Bulk pipeline reports: 1 message imported, 0 failed.
    mockBulkImport.mockResolvedValueOnce(
      emptyBulkResult({ importedMessages: 1 }),
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closePayload = allSetPayloads().find(
      (p) => p && p.currentStep === "done",
    )

    expect(closePayload?.failedCount).toBe(0)
    expect(closePayload?.importedMessageCount).toBe(1)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // H3 — staging SELECT must include ORDER BY id (stable pagination)
  // ─────────────────────────────────────────────────────────────────────────

  it("staging SELECT applies orderBy on the staging id column for stable pagination", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
    wireSelect(defaultRunRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // The stagedChain.orderBy spy must have been called at least once.
    const stagedChain = harness.lastStagedChain
    expect(stagedChain?.orderBy).toHaveBeenCalled()
    // The argument must be the staging model id column sentinel "id"
    // (the schema mock exposes whatsappCoexistStagingModel.id === "id").
    expect(stagedChain?.orderBy).toHaveBeenCalledWith("id")
  })

  // ─────────────────────────────────────────────────────────────────────────
  // H5 — edit/revoke UPDATE loop must be bounded (not N+K round trips)
  // ─────────────────────────────────────────────────────────────────────────

  it("K edits + K revokes issue a bounded number of db.update calls (not 2K)", async () => {
    const K = 3
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)

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

    // Wire selects in order:
    //   1. runRow select (first call, select({...}))
    //   2. stagedRows select (second call, returns editsAndRevokes then [])
    //   3. resolveContactInboxIds select — returns K contact inbox rows
    //   4. resolveMessageRows select — returns empty (no attachment patches)
    const runRowChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    runRowChain.from.mockReturnValue(runRowChain)
    runRowChain.where.mockReturnValue(runRowChain)
    runRowChain.orderBy.mockReturnValue(runRowChain)
    runRowChain.limit.mockResolvedValue([defaultRunRow()])

    const stagedChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    stagedChain.from.mockReturnValue(stagedChain)
    stagedChain.where.mockReturnValue(stagedChain)
    stagedChain.orderBy.mockReturnValue(stagedChain)
    stagedChain.limit
      .mockResolvedValueOnce(editsAndRevokes)
      .mockResolvedValue([])

    // contactInboxRows: one row per contactWaId. No `createdAt`/
    // `lastIncomingMessageAt`, so `getSafeSinceTime` yields nothing and
    // applyPostBatchPatches short-circuits before the (sharded) message
    // lookup — which is what keeps this test free of the shard registry.
    const contactInboxRows = contactWaIds.map((waId, i) => ({
      id: `ci-${i}`,
      sourceId: waId,
    }))
    const contactInboxChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
    }
    contactInboxChain.from.mockReturnValue(contactInboxChain)
    contactInboxChain.where.mockResolvedValue(contactInboxRows)
    contactInboxChain.orderBy.mockReturnValue(contactInboxChain)

    mockSelect
      .mockReturnValueOnce(runRowChain) // 1. run row
      .mockReturnValueOnce(stagedChain) // 2. staged rows
      .mockReturnValueOnce(contactInboxChain) // 3. resolveContactInboxIds
      .mockReturnValue(stagedChain) // 4+ tail re-check / empty batches

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // Count db.update calls that target the message model (edits + revokes).
    // The messageModel mock object is identifiable by its keys.
    // Before the fix: each edit fires one db.update(messageModel) and each
    // revoke fires one db.update(messageModel) → K + K = 6 calls for K=3.
    // After the fix (batched): ≤ 2 calls for all edits + all revokes combined.
    const messageModelUpdates = mockUpdate.mock.calls.filter(
      (args) =>
        args[0] !== null &&
        typeof args[0] === "object" &&
        "contactInboxId" in (args[0] as Record<string, unknown>),
    )
    expect(messageModelUpdates.length).toBeLessThanOrEqual(2)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // M1 — reduceMetadata must not allow progress to regress
  // ─────────────────────────────────────────────────────────────────────────

  it("reduceMetadata keeps higher progress even when a later chunk has lower progress", async () => {
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)

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

    const setPayloads = allSetPayloads()

    // syncProgress must be 80 (from the earlier, higher-progress row),
    // NOT 10 (from the later chunk with regressed progress).
    const metaPayload = setPayloads.find((p) => p.syncProgress !== undefined)
    expect(metaPayload?.syncProgress).toBe(80)
    expect(metaPayload?.lastChunkOrder).toBe(5)
  })

  it("keeps the run alive and enqueues a continuation when a row is staged after the drain", async () => {
    // Wire selects manually: the integration read, then the staged query
    // returns a batch, then empty (loop exits → exhausted), then a late row on
    // the tail re-check. The run must NOT finalize; a continuation is enqueued.
    mockClaimRun.mockResolvedValue({
      id: runId,
      claimToken: CLAIM_TOKEN,
      ...defaultRunRow(),
    })
    const integrationChain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    }
    integrationChain.from.mockReturnValue(integrationChain)
    integrationChain.where.mockReturnValue(integrationChain)
    integrationChain.limit.mockResolvedValue([fakeIntegration])

    // Batch 1 returns a short page (→ exhausted), then the tail re-check finds
    // a row staged after the drain. Both go through `listPending`.
    const stagedChain = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    }
    stagedChain.from.mockReturnValue(stagedChain)
    stagedChain.where.mockReturnValue(stagedChain)
    stagedChain.orderBy.mockReturnValue(stagedChain)
    stagedChain.limit
      .mockResolvedValueOnce([makeStagedRow("row-1")]) // batch 1 → exhausted
      .mockResolvedValue([{ id: "late-row" }]) // tail re-check
    mockSelect
      .mockReturnValueOnce(integrationChain)
      .mockReturnValue(stagedChain)

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
    expect(allSetPayloads().map((p) => p.status)).not.toContain("succeeded")
  })
})
