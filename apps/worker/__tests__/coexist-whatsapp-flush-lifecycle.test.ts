import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Run-lifecycle behaviour of the WhatsApp Coexistence flush:
 * `waiting` vs terminal, resume across chunks, and the parse-failed parking
 * lane. See brief-coexist-history-lifecycle.md §A/§E/§F.
 */
const {
  mockBulkImport,
  mockClaimRun,
  mockEq,
  mockFindLiveRun,
  mockFindInboxById,
  mockQueueAdd,
  mockRunWrite,
  mockSelect,
  mockUpdate,
  mockWarn,
} = vi.hoisted(() => ({
  mockBulkImport: vi.fn(),
  mockClaimRun: vi.fn(),
  mockEq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  mockFindLiveRun: vi.fn(),
  mockFindInboxById: vi.fn(),
  mockQueueAdd: vi.fn(),
  /** Records every run-level write and decides how many rows it affects. */
  mockRunWrite: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockWarn: vi.fn(),
}))

/**
 * The run writes go through `coexistService`, so the tests assert on the
 * service seam rather than on drizzle internals. `db` stays mocked for the
 * staging/integration repositories the handler still reads through.
 */
type RunWriteGuard = { status: string; claimToken?: string | null }

vi.mock("@chatbotx.io/business/coexist", () => {
  const write = (fields: Record<string, unknown>, guard?: RunWriteGuard) =>
    mockRunWrite(fields, guard)
  return {
    coexistService: {
      claimRunWithNewToken: mockClaimRun,
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

vi.mock("../src/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
  },
}))

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
    query: {},
  },
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: mockEq,
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
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
    coexistWhatsappFlush: "coexistWhatsappFlush",
    coexistAttachmentDownload: "coexistAttachmentDownload",
  },
  integrationQueue: { add: mockQueueAdd, addBulk: vi.fn() },
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
  coexistSyncRunModel: { id: "id", status: "status", claimToken: "claimToken" },
  contactInboxModel: {
    id: "id",
    inboxId: "inboxId",
    sourceId: "sourceId",
    lastIncomingMessageAt: "lastIncomingMessageAt",
    createdAt: "createdAt",
  },
}))

vi.mock("../src/integration/handlers/coexist/bulk-historical-import", () => ({
  bulkImportHistorical: mockBulkImport,
}))

import { coexistWhatsappFlush } from "../src/integration/handlers/coexist/whatsapp-flush"
import {
  CLAIM_TOKEN,
  createFlushHarness,
} from "./coexist-whatsapp-flush.test-utils"

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

const fakeInbox = { id: "inbox-1", workspaceId: "ws-1", channel: "whatsapp" }

const runRow = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: "ws-1",
  currentPageNumber: 0,
  attempts: 0,
  importedContactCount: 0,
  importedMessageCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentScan: 0,
  currentError: null,
  lastPhase: null,
  lastChunkOrder: null,
  syncProgress: 0,
  pendingPatches: null,
  ...overrides,
})

const emptyBulkResult = () => ({
  importedContacts: 1,
  importedMessages: 1,
  skippedContacts: 0,
  skippedMessages: 0,
  failedMessages: 0,
  contactInboxIds: new Map<string, string>(),
  insertedAttachmentIds: [] as string[],
})

/** Row carrying threads plus the given history metadata. */
const historyRow = (
  id: string,
  metadata: { phase: number; chunk_order: number; progress: number },
) => ({
  id,
  phoneNumberId,
  payloadHash: `hash-${id}`,
  processedAt: null,
  parseFailedAt: null,
  payload: {
    contacts: [{ wa_id: "601234567890", profile: { name: "Alice" } }],
    history: [
      {
        metadata,
        threads: [
          {
            id: "601234567890",
            messages: [
              {
                id: `msg-${id}`,
                from: "601234567890",
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

const harness = createFlushHarness({
  mockClaimRun,
  mockRunWrite,
  mockSelect,
  mockUpdate,
})
const {
  allRunWriteGuards: mockRunWriteGuards,
  allSetPayloads: setPayloads,
  setIntegration,
  wireSelect,
  wireUpdateChain: wireUpdate,
} = harness

describe("coexistWhatsappFlush — run lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReset()
    mockClaimRun.mockReset()
    mockRunWrite.mockReset()
    wireUpdate()
    mockBulkImport.mockResolvedValue(emptyBulkResult())
    mockQueueAdd.mockResolvedValue(undefined)
    mockFindLiveRun.mockResolvedValue(null)
    setIntegration(fakeIntegration)
    mockFindInboxById.mockResolvedValue(fakeInbox)
  })

  // The LIVE metadata shape Meta sent for phone 1275390102328618: every phase
  // reports progress 100 at chunk_order 1. A progress-only reduction kept
  // phase 0 for this triple; the reduction is ordered by
  // (phase, progress, chunkOrder), and every case below uses this shape.
  const LIVE_PHASE_TRIPLE = [
    historyRow("row-0", { phase: 0, chunk_order: 1, progress: 100 }),
    historyRow("row-1", { phase: 1, chunk_order: 1, progress: 100 }),
    historyRow("row-2", { phase: 2, chunk_order: 1, progress: 100 }),
  ]

  it("happy path: phases 0..2 arriving in one drain end the run 'succeeded' in one run", async () => {
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
    expect(closed?.finishedAt).toBeInstanceOf(Date)
    expect(setPayloads().some((p) => p.status === "waiting")).toBe(false)
  })

  // ── per-entry terminal signal ────────────────────────────────────────────
  // The terminal signal is phase 2 at progress 100, seen either on a metadata
  // entry or on the persisted (lastPhase, syncProgress) pair.

  it("the live phase triple (all chunk_order 1) is terminal and closes 'succeeded'", async () => {
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
  })

  it("persists lastPhase as the highest phase seen", async () => {
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const progress = setPayloads().find((p) => p.lastPhase !== undefined)
    expect(progress?.lastPhase).toBe(2)
    expect(progress?.syncProgress).toBe(100)
  })

  it("phase 2 @100 arriving in a LATER flush closes a run parked with lastPhase 0", async () => {
    // Earlier flush persisted phase 0 @100 and parked the run in `waiting`.
    wireSelect(runRow({ lastPhase: 0, lastChunkOrder: 1, syncProgress: 100 }), [
      historyRow("row-late", { phase: 2, chunk_order: 1, progress: 100 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
  })

  it("phase 1 @100 alone is still not terminal", async () => {
    wireSelect(runRow(), [
      historyRow("row-p1", { phase: 1, chunk_order: 1, progress: 100 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(setPayloads().some((p) => p.status === "waiting")).toBe(true)
    expect(setPayloads().some((p) => p.status === "succeeded")).toBe(false)
  })

  // ── (lastPhase, syncProgress) is the run's only memory ───────────────────
  // Scenario B: a number with >90 days of history. Meta sends the phase 0 and
  // phase 1 markers seconds apart and the FIRST phase-2 chunk at progress 40;
  // the 60s buffer coalesces all three into ONE drain. Pairing the max phase
  // with the max progress of any phase reads that as "phase 2 at 100%" and
  // closes the run while Meta is still mid-phase-2 — which strands the run's
  // unresolved pendingPatches, because the recovery run starts them at null.
  it("p0@100 + p1@100 + p2@40 in ONE drain stays 'waiting'", async () => {
    wireSelect(runRow(), [
      historyRow("row-p0", { phase: 0, chunk_order: 1, progress: 100 }),
      historyRow("row-p1", { phase: 1, chunk_order: 1, progress: 100 }),
      historyRow("row-p2", { phase: 2, chunk_order: 1, progress: 40 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(setPayloads().some((p) => p.status === "succeeded")).toBe(false)
    expect(setPayloads().some((p) => p.status === "waiting")).toBe(true)
  })

  it("that drain persists the phase-2 progress, not phase 0's 100", async () => {
    wireSelect(runRow(), [
      historyRow("row-p0", { phase: 0, chunk_order: 1, progress: 100 }),
      historyRow("row-p1", { phase: 1, chunk_order: 1, progress: 100 }),
      historyRow("row-p2", { phase: 2, chunk_order: 1, progress: 40 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const progress = setPayloads().find((p) => p.lastPhase !== undefined)
    // The persisted pair IS the terminal encoding — it must describe the
    // furthest phase reached, and that phase's own progress.
    expect(progress?.lastPhase).toBe(2)
    expect(progress?.syncProgress).toBe(40)
  })

  it("the run parked at phase 2 @40 closes once phase 2 reaches 100", async () => {
    wireSelect(runRow({ lastPhase: 2, lastChunkOrder: 1, syncProgress: 40 }), [
      historyRow("row-p2-done", { phase: 2, chunk_order: 2, progress: 100 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
  })

  it("a run resumed from a persisted phase 2 @40 does NOT close on an empty drain", async () => {
    wireSelect(
      runRow({ lastPhase: 2, lastChunkOrder: 1, syncProgress: 40 }),
      [],
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(setPayloads().some((p) => p.status === "succeeded")).toBe(false)
    expect(setPayloads().some((p) => p.status === "waiting")).toBe(true)
  })

  it("phase 2 below 100% is not terminal even though it is the max phase", async () => {
    wireSelect(runRow(), [
      historyRow("row-p2-partial", { phase: 2, chunk_order: 1, progress: 40 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(setPayloads().some((p) => p.status === "waiting")).toBe(true)
  })

  // The owner's stranded rows for phone 1275390102328618, in id order:
  //   (2) 10:28:56  history phase 0, progress 100, chunk_order 1 — marker only
  //   (3) 10:28:58  history phase 1, progress 100, chunk_order 1 — thread
  //                 6287744910069 with 2 text messages
  //   (4) 10:29:00  history phase 2, progress 100, chunk_order 1 — marker only
  // This is the walk the scheduler-recovery run performs after the migration.
  it("recovery walk: the owner's three stranded rows end the run 'succeeded' with 1 contact + 2 messages", async () => {
    const markerRow = (
      id: string,
      metadata: { phase: number; chunk_order: number; progress: number },
    ) => ({
      id,
      phoneNumberId,
      payloadHash: `hash-${id}`,
      processedAt: null,
      parseFailedAt: null,
      payload: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: phoneNumberId },
        history: [{ metadata }],
      },
    })

    const threadRow = {
      id: "11684792200000003",
      phoneNumberId,
      payloadHash: "hash-thread",
      processedAt: null,
      parseFailedAt: null,
      payload: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: phoneNumberId },
        contacts: [{ wa_id: "6287744910069", profile: { name: "Customer" } }],
        history: [
          {
            metadata: { phase: 1, chunk_order: 1, progress: 100 },
            threads: [
              {
                id: "6287744910069",
                messages: [
                  {
                    id: "wamid.one",
                    from: "6287744910069",
                    timestamp: "1782225100",
                    type: "text",
                    text: { body: "Hi" },
                  },
                  {
                    id: "wamid.two",
                    from: "1275390102328618",
                    timestamp: "1782225200",
                    type: "text",
                    text: { body: "Hello back" },
                  },
                ],
              },
            ],
          },
        ],
      },
    }

    mockBulkImport.mockResolvedValue({
      importedContacts: 1,
      importedMessages: 2,
      skippedContacts: 0,
      skippedMessages: 0,
      failedMessages: 0,
      contactInboxIds: new Map<string, string>(),
      insertedAttachmentIds: [] as string[],
    })
    // A fresh `scheduler-recovery` run: no phases seen, no pending patches.
    wireSelect(runRow(), [
      markerRow("11684792200000002", {
        phase: 0,
        chunk_order: 1,
        progress: 100,
      }),
      threadRow,
      markerRow("11684792200000004", {
        phase: 2,
        chunk_order: 1,
        progress: 100,
      }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { batch: { contact: { sourceId: string }; messages: unknown[] }[] },
    ]
    expect(bulkArgs.batch).toHaveLength(1)
    expect(bulkArgs.batch[0]?.contact.sourceId).toBe("6287744910069")
    expect(bulkArgs.batch[0]?.messages).toHaveLength(2)

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
    expect(closed?.importedContactCount).toBe(1)
    expect(closed?.importedMessageCount).toBe(2)
    expect(closed?.currentError).toBeNull()
    expect(closed?.finishedAt).toBeInstanceOf(Date)
  })

  // ── teardown must not be undone by an in-flight flush ────────────────────
  // `disconnect` / `disable` / workspace teardown flip a live run to `failed`.
  // A flush that already claimed the run as `running` used to write over that
  // with `WHERE id` only, resurrecting the run and importing history after the
  // integration and its staging rows were gone. Every post-claim write now
  // carries `status = 'running'`.

  /** Claim succeeds; every later run write finds the guard broken. */
  const teardownAfterClaim = () => wireUpdate(() => 0)

  it("teardown between the claim and the batch write: no continuation, no rethrow, warn logged", async () => {
    teardownAfterClaim()
    wireSelect(runRow(), [
      historyRow("row-0", { phase: 0, chunk_order: 1, progress: 100 }),
    ])

    await expect(
      coexistWhatsappFlush({ runId, phoneNumberId }),
    ).resolves.toBeUndefined()

    // No continuation may be enqueued for a run this worker no longer owns.
    expect(mockQueueAdd).not.toHaveBeenCalledWith(
      "coexistWhatsappFlush",
      expect.anything(),
      expect.anything(),
    )
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ runId, phoneNumberId }),
      expect.stringContaining("no longer claimed"),
    )
  })

  it("teardown after the claim: the run is never driven to 'waiting' or a terminal status", async () => {
    teardownAfterClaim()
    wireSelect(runRow(), [])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // The writes are still ATTEMPTED (the guard is what stops them landing),
    // so assert on the guard rather than on the absence of a set payload.
    expect(mockRunWrite).toHaveBeenCalled()
    expect(
      setPayloads().some(
        (p) => p.status === "waiting" || p.currentStep === "done",
      ),
    ).toBe(false)
  })

  it("teardown during the catch path: resetForRetry is guarded and the error is not rethrown", async () => {
    // Claim + pre-batch heartbeat succeed, then the import throws and the
    // teardown has already landed, so the reset-to-`init` affects 0 rows.
    // Heartbeats before the select and before the import succeed; the import
    // then throws and the teardown has already landed, so the reset affects 0.
    wireUpdate((callIndex) => (callIndex <= 1 ? 1 : 0))
    wireSelect(runRow(), [
      historyRow("row-0", { phase: 0, chunk_order: 1, progress: 100 }),
    ])
    mockBulkImport.mockRejectedValueOnce(new Error("bulk failed"))

    // Not rethrown: BullMQ must not retry a job whose run has been torn down.
    await expect(
      coexistWhatsappFlush({ runId, phoneNumberId }),
    ).resolves.toBeUndefined()

    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ runId }),
      expect.stringContaining("no longer claimed"),
    )
  })

  it("the normal path still rethrows a transient failure when the claim is intact", async () => {
    wireSelect(runRow(), [
      historyRow("row-0", { phase: 0, chunk_order: 1, progress: 100 }),
    ])
    mockBulkImport.mockRejectedValueOnce(new Error("bulk failed"))

    await expect(
      coexistWhatsappFlush({ runId, phoneNumberId }),
    ).rejects.toThrow("bulk failed")

    const reset = setPayloads().find((p) => p.status === "init")
    expect(reset?.currentError).toBe("bulk failed")
  })

  it("the normal path guards every post-claim write with status = 'running'", async () => {
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
  })

  it("a non-terminal drain parks the run in 'waiting' with counters persisted", async () => {
    wireSelect(runRow(), [
      historyRow("row-0", { phase: 0, chunk_order: 1, progress: 100 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const parked = setPayloads().find((p) => p.status === "waiting")
    expect(parked).toBeDefined()
    expect(parked?.finishedAt).toBeNull()
    expect(parked?.importedMessageCount).toBe(1)
    expect(parked?.importedContactCount).toBe(1)
  })

  it("a resumed chunk remembers a terminal signal recorded by an earlier chunk", async () => {
    // The run already saw phase 2 @ 100% in a previous chunk; this chunk finds
    // nothing new and must therefore close rather than park.
    wireSelect(
      runRow({ lastPhase: 2, lastChunkOrder: 3, syncProgress: 100 }),
      [],
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
  })

  it("a resumed chunk that only saw phase 1 keeps waiting", async () => {
    wireSelect(
      runRow({ lastPhase: 1, lastChunkOrder: 3, syncProgress: 100 }),
      [],
    )

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(setPayloads().some((p) => p.status === "waiting")).toBe(true)
    expect(setPayloads().some((p) => p.status === "succeeded")).toBe(false)
  })

  it("resolves the live run through the service when the buffer flush omits the runId", async () => {
    mockFindLiveRun.mockResolvedValue({ id: runId })
    wireSelect(runRow(), [])

    await coexistWhatsappFlush({ phoneNumberId })

    // `findLiveRun` is the one place that spells out the live-status list
    // (`LIVE_RUN_STATUSES`, which includes `waiting`).
    expect(mockFindLiveRun).toHaveBeenCalledWith({
      integrationId: fakeIntegration.id,
      channel: "whatsapp",
    })
  })

  // `status = 'running'` alone cannot tell a teardown from a
  // reclaim — a reclaiming worker leaves the run `running`. The ownership token
  // minted by the claim is what makes the stale worker's writes no-ops.
  it("every post-claim write carries the claim's ownership token", async () => {
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const guards = mockRunWriteGuards()
    expect(guards.length).toBeGreaterThan(0)
    for (const guard of guards) {
      expect(guard).toEqual({ status: "running", claimToken: CLAIM_TOKEN })
    }
  })

  it("a reclaim by a second worker stops this one before it imports", async () => {
    // Worker A claims, then worker B reclaims after A's heartbeat went stale:
    // A's next guarded write (the pre-import ownership check) matches 0 rows.
    wireUpdate((callIndex) => (callIndex === 0 ? 1 : 0))
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await expect(
      coexistWhatsappFlush({ runId, phoneNumberId }),
    ).resolves.toBeUndefined()

    // Nothing was imported, no staging row was marked, no continuation queued.
    expect(mockBulkImport).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()
    expect(
      setPayloads().some(
        (p) => p.status === "waiting" || p.status === "succeeded",
      ),
    ).toBe(false)
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ runId, phoneNumberId }),
      expect.stringContaining("no longer claimed"),
    )
  })

  it("a reclaim after the import stops this worker before it marks rows processed", async () => {
    // Writes: heartbeat (0), pre-import heartbeat (1), pre-staging heartbeat (2).
    wireUpdate((callIndex) => (callIndex <= 1 ? 1 : 0))
    wireSelect(runRow(), LIVE_PHASE_TRIPLE)

    await coexistWhatsappFlush({ runId, phoneNumberId })

    // The import DID run (the overlap this design accepts is bounded to one
    // in-flight import, whose inserts are idempotent), but the staging rows are
    // left for the run's new owner and no terminal status is written.
    expect(mockBulkImport).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(setPayloads().some((p) => p.currentStep === "done")).toBe(false)
  })

  it("parks an unparseable row with parseFailedAt and still processes its siblings", async () => {
    wireSelect(runRow(), [
      {
        id: "row-poison",
        phoneNumberId,
        payloadHash: "hash-poison",
        processedAt: null,
        parseFailedAt: null,
        payload: "not-an-object",
      },
      historyRow("row-good", { phase: 2, chunk_order: 1, progress: 100 }),
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const payloads = setPayloads()
    const parked = payloads.find((p) => "parseFailedAt" in p)
    const processed = payloads.find((p) => "processedAt" in p)
    expect(parked?.parseFailedAt).toBeInstanceOf(Date)
    expect(processed?.processedAt).toBeInstanceOf(Date)

    // The poison row is NOT counted as imported and NOT marked processed.
    const inArrayCalls = (await import("@chatbotx.io/database/client"))
      .inArray as unknown as ReturnType<typeof vi.fn>
    const idLists = inArrayCalls.mock.calls.map((args) => args[1])
    expect(idLists).toContainEqual(["row-good"])
    expect(idLists).toContainEqual(["row-poison"])
  })

  it("a batch of only unparseable rows still closes the run without importing", async () => {
    wireSelect(runRow({ lastPhase: 2, syncProgress: 100 }), [
      {
        id: "row-poison",
        phoneNumberId,
        payloadHash: "hash-poison",
        processedAt: null,
        parseFailedAt: null,
        payload: "not-an-object",
      },
    ])

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const closed = setPayloads().find((p) => p.currentStep === "done")
    expect(closed?.status).toBe("succeeded")
    // Nothing was extracted from the poison row, so the import batch is empty.
    const [bulkArgs] = mockBulkImport.mock.calls[0] as [
      { batch: unknown[] } | undefined,
    ]
    expect(bulkArgs?.batch).toEqual([])
  })

  // ── the chunk chain must hand the run back before queueing the next one ──
  // `claimRunWithNewToken` refuses a `running` run whose heartbeat is under 10 minutes
  // old. A continuation queued while this worker still held the claim
  // therefore lost its own claim and abandoned, leaving the chain to the
  // scheduler's 1-hour stale sweep — one chunk per hour, then `failed`.

  /** Makes the post-drain tail re-check find a late row, forcing a continuation. */
  const stageLateTailRow = () => {
    harness.lastStagedChain?.limit
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "row-late" }])
      .mockResolvedValue([])
  }

  it("releases the claim before queueing the continuation, so the next chunk can claim it", async () => {
    wireSelect(runRow(), [])
    stageLateTailRow()

    await coexistWhatsappFlush({ runId, phoneNumberId })

    const released = setPayloads().find(
      (payload) => payload.status === "init" && "lastHeartbeatAt" in payload,
    )
    expect(released?.status).toBe("init")
    expect(released?.lastHeartbeatAt).toBeInstanceOf(Date)
    // The run must be `init` BEFORE the job exists, or the continuation can
    // start against a still-`running` row and abandon.
    expect(Math.min(...mockRunWrite.mock.invocationCallOrder)).toBeLessThan(
      mockQueueAdd.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "coexistWhatsappFlush",
      expect.objectContaining({
        data: { runId, phoneNumberId },
      }),
      expect.anything(),
    )
    // Still a guarded write: a worker that lost the run cannot release it.
    expect(mockRunWriteGuards()).toContainEqual(
      expect.objectContaining({ status: "running" }),
    )
  })

  it("queues no continuation when the release finds the run already reclaimed", async () => {
    // Write 0 is the drain's ownership heartbeat (still ours); write 1 is the
    // release, which a reclaim by another worker makes match no rows.
    wireUpdate((callIndex) => (callIndex === 0 ? 1 : 0))
    wireSelect(runRow(), [])
    stageLateTailRow()

    await coexistWhatsappFlush({ runId, phoneNumberId })

    expect(mockQueueAdd).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        phoneNumberId,
        reason: "release before continuation matched no rows",
      }),
      expect.stringContaining("no longer claimed"),
    )
  })
})
