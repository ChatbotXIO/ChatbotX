import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockClaim,
  mockFinish,
  mockIncrementProgress,
  mockUpdateProgress,
  mockYieldForContinuation,
  mockReopenReleased,
  mockRetryOrFail,
  mockBulkImportChannelContacts,
  mockIncrementBy,
  mockFindWorkspace,
  mockLoadContext,
  mockListPage,
  mockClassifyError,
  mockReadBackoff,
  mockLogProviderError,
  mockLowQueueAddBulk,
  mockQueueAdd,
  mockEnqueueProfileSnapshots,
} = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockFinish: vi.fn(),
  mockIncrementProgress: vi.fn(),
  mockUpdateProgress: vi.fn(),
  mockYieldForContinuation: vi.fn(),
  mockReopenReleased: vi.fn(),
  mockRetryOrFail: vi.fn(),
  mockBulkImportChannelContacts: vi.fn(),
  mockIncrementBy: vi.fn(),
  mockFindWorkspace: vi.fn(),
  mockLoadContext: vi.fn(),
  mockListPage: vi.fn(),
  mockClassifyError: vi.fn(),
  mockReadBackoff: vi.fn(),
  mockLogProviderError: vi.fn(),
  mockLowQueueAddBulk: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockEnqueueProfileSnapshots: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  bulkImportChannelContacts: mockBulkImportChannelContacts,
  contactScanService: {
    claim: mockClaim,
    finish: mockFinish,
    incrementProgress: mockIncrementProgress,
    updateProgress: mockUpdateProgress,
    yieldForContinuation: mockYieldForContinuation,
    reopenReleased: mockReopenReleased,
    retryOrFail: mockRetryOrFail,
  },
  quotaEnforcementService: {
    incrementBy: mockIncrementBy,
  },
  workspaceService: {
    find: mockFindWorkspace,
  },
}))

vi.mock("@chatbotx.io/business/contact-scan", () => ({
  CONTACT_SCAN_ERRORS: {
    integrationUnavailable: "integrationUnavailable",
    tokenInvalid: "tokenInvalid",
    graphPermission: "graphPermission",
    providerRetryable: "providerRetryable",
    maxAttempts: "maxAttempts",
    pageFailed: "pageFailed",
    pageImportFailed: "pageImportFailed",
    channelUnsupported: "channelUnsupported",
    scanLimitReached: "scanLimitReached",
  },
  CONTACT_SCAN_MAX_PAGES: 5000,
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: mockLogProviderError,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  sanitizePublicText: (value: string) => value,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { contactScan: "contactScan" },
  buildContactScanPageJobId: ({
    runId,
    attempts,
    pageNumber,
    generation,
  }: {
    runId: string
    attempts: number
    pageNumber: number
    generation?: number
  }) =>
    `contact-scan-${runId}-${attempts}-page-${pageNumber}${
      generation === undefined ? "" : `-gen-${generation}`
    }`,
  integrationQueue: { add: mockQueueAdd },
  lowQueue: { addBulk: mockLowQueueAddBulk },
}))

vi.mock("../src/integration/handlers/contact-scan/adapter", () => ({
  contactScanAdapters: {
    messenger: {
      channel: "messenger",
      provider: "messenger",
      loadContext: mockLoadContext,
      listPage: mockListPage,
      classifyError: mockClassifyError,
      readBackoff: mockReadBackoff,
    },
    instagram: {
      channel: "instagram",
      provider: "instagram",
      loadContext: mockLoadContext,
      listPage: mockListPage,
      classifyError: mockClassifyError,
      readBackoff: mockReadBackoff,
    },
  },
}))

// A tiny page gap keeps the multi-page tests fast; the real 1s value is pinned
// in contact-scan-pacing.test.ts.
vi.mock(
  "../src/integration/handlers/contact-scan/pacing",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/integration/handlers/contact-scan/pacing")
      >()
    return {
      ...actual,
      CONTACT_SCAN_PACING: { ...actual.CONTACT_SCAN_PACING, pageGapMs: 20 },
    }
  },
)

vi.mock("../src/integration/handlers/profile-snapshot/queue", () => ({
  enqueueProfileSnapshotJobs: mockEnqueueProfileSnapshots,
}))

const { runContactScan } = await import(
  "../src/integration/handlers/contact-scan/engine"
)

const SAME_PAGE_RETRY_JOB_ID = /^contact-scan-run-1-3-page-4-gen-\d+$/
const RUN_ID = "run-1"
const WORKSPACE_ID = "ws-1"
const INTEGRATION_ID = "int-1"
const CLAIM_TOKEN = "token-abc"
const EXPECT_GUARD = { status: "running" as const, claimToken: CLAIM_TOKEN }

const CEILING = new Date("2026-01-01T00:00:00Z")
const FRONTIER = new Date("2026-03-01T00:00:00Z")

const baseRun = (overrides: Record<string, unknown> = {}) => ({
  id: RUN_ID,
  workspaceId: WORKSPACE_ID,
  integrationId: INTEGRATION_ID,
  channel: "messenger" as const,
  claimToken: CLAIM_TOKEN,
  attempts: 2,
  scanFromAt: CEILING,
  lastSyncedAt: FRONTIER,
  resumeCursor: null,
  currentPageNumber: 0,
  importedContactCount: 0,
  skippedCount: 0,
  failedCount: 0,
  ...overrides,
})

const context = {
  inbox: { id: "inbox-1", workspaceId: WORKSPACE_ID, channel: "messenger" },
}

const emptyImportResult = {
  importedContacts: 0,
  skippedContacts: 0,
  contactInboxIds: new Map(),
  newContactInboxIds: new Map(),
}

const entry = (sourceId: string, updatedAt: Date | null) => ({
  contact: { sourceId },
  updatedAt,
})

describe("runContactScan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    context.inbox.channel = "messenger"
    mockFindWorkspace.mockResolvedValue({
      id: WORKSPACE_ID,
      ownerId: "owner-1",
    })
    mockLoadContext.mockResolvedValue(context)
    mockIncrementProgress.mockResolvedValue(1)
    mockUpdateProgress.mockResolvedValue(1)
    mockYieldForContinuation.mockResolvedValue(1)
    mockFinish.mockResolvedValue(1)
    mockRetryOrFail.mockResolvedValue("retry")
    mockReadBackoff.mockReturnValue(null)
    mockReopenReleased.mockResolvedValue(1)
    mockBulkImportChannelContacts.mockResolvedValue(emptyImportResult)
    mockQueueAdd.mockResolvedValue(undefined)
    mockEnqueueProfileSnapshots.mockResolvedValue(undefined)
    // Both are best-effort (`.catch(...)`-chained by the engine, FIX 1) —
    // default them to resolving Promises like the real services so a test
    // that doesn't care about them doesn't crash on `.catch` of a bare
    // `undefined` return.
    mockIncrementBy.mockResolvedValue(undefined)
    mockLowQueueAddBulk.mockResolvedValue(undefined)
  })

  it("claim lost → no-op, no provider call", async () => {
    mockClaim.mockResolvedValue(null)

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockLoadContext).not.toHaveBeenCalled()
    expect(mockListPage).not.toHaveBeenCalled()
    expect(mockFinish).not.toHaveBeenCalled()
  })

  it("payload workspaceId mismatching the claimed row's workspaceId → no-op, no provider call", async () => {
    mockClaim.mockResolvedValue(baseRun({ workspaceId: "ws-other" }))

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockLoadContext).not.toHaveBeenCalled()
    expect(mockFinish).not.toHaveBeenCalled()
  })

  it("a claimed row whose channel is not a contact-scan channel finishes failed with channelUnsupported", async () => {
    mockClaim.mockResolvedValue(baseRun({ channel: "whatsapp" }))

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockFinish).toHaveBeenCalledWith({
      runId: RUN_ID,
      status: "failed",
      currentError: "channelUnsupported",
      expect: EXPECT_GUARD,
    })
    expect(mockLoadContext).not.toHaveBeenCalled()
  })

  it("adapter is chosen from the claimed row's channel", async () => {
    mockClaim.mockResolvedValue(baseRun())
    mockListPage.mockResolvedValue({ entries: [], after: undefined })

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockLoadContext).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      integrationId: INTEGRATION_ID,
    })
  })

  it("loadContext returning null finishes failed with integrationUnavailable", async () => {
    mockClaim.mockResolvedValue(baseRun())
    mockLoadContext.mockResolvedValue(null)

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockFinish).toHaveBeenCalledWith({
      runId: RUN_ID,
      status: "failed",
      currentError: "integrationUnavailable",
      expect: EXPECT_GUARD,
    })
    expect(mockListPage).not.toHaveBeenCalled()
  })

  describe("setup throws (hands back via retryOrFail, never a stuck `running` row)", () => {
    it("adapter.loadContext throwing hands the run back via retryOrFail, never finishes, and never starts the walk", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockLoadContext.mockRejectedValue(new Error("db down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockRetryOrFail).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
      })
      expect(mockFinish).not.toHaveBeenCalled()
      expect(mockListPage).not.toHaveBeenCalled()
    })

    it("workspaceService.find throwing hands the run back via retryOrFail, never finishes, and never starts the walk", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockFindWorkspace.mockRejectedValue(new Error("db down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockRetryOrFail).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
      })
      expect(mockFinish).not.toHaveBeenCalled()
      expect(mockListPage).not.toHaveBeenCalled()
    })
  })

  describe("window filtering", () => {
    it("stops the walk at the scanFromAt ceiling and skips entries above the frontier", async () => {
      mockClaim.mockResolvedValue(baseRun())
      const aboveFrontier = new Date("2026-04-01T00:00:00Z") // > FRONTIER
      const inWindow = new Date("2026-02-01T00:00:00Z") // between ceiling/frontier
      const atCeiling = new Date("2026-01-01T00:00:00Z") // === CEILING, stop

      mockListPage.mockResolvedValue({
        entries: [
          entry("skip-above-frontier", aboveFrontier),
          entry("in-window", inWindow),
          entry("at-ceiling", atCeiling),
          entry("never-reached", new Date("2025-12-01T00:00:00Z")),
        ],
        after: "would-be-next-page",
      })
      mockBulkImportChannelContacts.mockResolvedValue({
        importedContacts: 1,
        skippedContacts: 0,
        contactInboxIds: new Map([["in-window", { contactInboxId: "ci-1" }]]),
        newContactInboxIds: new Map([
          ["in-window", { contactInboxId: "ci-1" }],
        ]),
      })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockBulkImportChannelContacts).toHaveBeenCalledWith({
        captureProfileSnapshot: false,
        inbox: context.inbox,
        workspaceId: WORKSPACE_ID,
        contacts: [{ sourceId: "in-window" }],
      })
      // Only one listPage call — the ceiling hit inside the SAME page stops
      // the walk, so no second page is fetched.
      expect(mockListPage).toHaveBeenCalledTimes(1)
    })

    it("persists lastSyncedAt as the oldest in-window entry processed", async () => {
      mockClaim.mockResolvedValue(baseRun())
      const oldest = new Date("2026-01-15T00:00:00Z")
      mockListPage.mockResolvedValue({
        entries: [
          entry("a", new Date("2026-02-01T00:00:00Z")),
          entry("b", oldest),
        ],
        after: undefined,
      })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockIncrementProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.objectContaining({ lastSyncedAt: oldest }),
        }),
      )
    })
  })

  describe("multi-chunk resume cursor", () => {
    it("starts the walk from the run's persisted resumeCursor", async () => {
      mockClaim.mockResolvedValue(baseRun({ resumeCursor: "persisted-cursor" }))
      mockListPage.mockResolvedValue({ entries: [], after: undefined })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).toHaveBeenCalledWith({
        context,
        cursor: "persisted-cursor",
      })
    })

    it("a rejected resume cursor is cleared once and the walk restarts from page 1", async () => {
      mockClaim.mockResolvedValue(baseRun({ resumeCursor: "stale-cursor" }))
      mockClassifyError.mockReturnValue("unknown")
      mockListPage
        .mockRejectedValueOnce(new Error("invalid paging cursor"))
        .mockResolvedValueOnce({ entries: [], after: undefined })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).toHaveBeenNthCalledWith(1, {
        context,
        cursor: "stale-cursor",
      })
      expect(mockListPage).toHaveBeenNthCalledWith(2, {
        context,
        cursor: undefined,
      })
      expect(mockUpdateProgress).toHaveBeenCalledWith({
        runId: RUN_ID,
        fields: { resumeCursor: null },
        expect: EXPECT_GUARD,
      })
      // The run still completed normally after the recovered restart.
      expect(mockFinish).toHaveBeenCalledWith(
        expect.objectContaining({ runId: RUN_ID, expect: EXPECT_GUARD }),
      )
    })

    it("a RETRYABLE first-page failure does not clear the cursor — it goes straight to error classification", async () => {
      mockClaim.mockResolvedValue(baseRun({ resumeCursor: "stale-cursor" }))
      mockClassifyError.mockReturnValue("retryable")
      mockListPage.mockRejectedValue(new Error("429"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockUpdateProgress).not.toHaveBeenCalled()
      expect(mockRetryOrFail).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
      })
    })
  })

  describe("bulk-import page failure (FIX 1 — retryable, never advances the cursor)", () => {
    it("a page whose bulkImportChannelContacts throws resets for retry without advancing the cursor or persisting resumeCursor/currentPageNumber", async () => {
      mockClaim.mockResolvedValue(baseRun({ resumeCursor: "good-cursor" }))
      mockListPage.mockResolvedValueOnce({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: "cursor-2",
      })
      mockBulkImportChannelContacts.mockRejectedValueOnce(new Error("db down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockRetryOrFail).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
        retryError: "pageImportFailed",
      })
      // Nothing persists an advanced watermark — resumeCursor stays at
      // "good-cursor" and currentPageNumber is untouched.
      expect(mockIncrementProgress).not.toHaveBeenCalled()
      expect(mockUpdateProgress).not.toHaveBeenCalled()
      // Only one listPage call — the walk stops immediately instead of
      // continuing past the lost page.
      expect(mockListPage).toHaveBeenCalledTimes(1)
      expect(mockFinish).not.toHaveBeenCalled()
      expect(mockLowQueueAddBulk).not.toHaveBeenCalled()
      expect(mockIncrementBy).not.toHaveBeenCalled()
    })

    it("a quota increment failure alone does not fail or retry the page", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: undefined,
      })
      mockBulkImportChannelContacts.mockResolvedValue({
        importedContacts: 1,
        skippedContacts: 0,
        contactInboxIds: new Map([["a", { contactInboxId: "ci-1" }]]),
        newContactInboxIds: new Map([["a", { contactInboxId: "ci-1" }]]),
      })
      mockIncrementBy.mockRejectedValueOnce(new Error("quota service down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockRetryOrFail).not.toHaveBeenCalled()
      expect(mockIncrementProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          increments: expect.objectContaining({ importedContactCount: 1 }),
          fields: expect.objectContaining({ currentError: null }),
        }),
      )
      expect(mockFinish).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded" }),
      )
    })

    it("does not eagerly enqueue avatars for newly imported contacts", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: undefined,
      })
      mockBulkImportChannelContacts.mockResolvedValue({
        importedContacts: 1,
        skippedContacts: 0,
        contactInboxIds: new Map([["a", { contactInboxId: "ci-1" }]]),
        newContactInboxIds: new Map([["a", { contactInboxId: "ci-1" }]]),
      })
      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockLowQueueAddBulk).not.toHaveBeenCalled()
      expect(mockRetryOrFail).not.toHaveBeenCalled()
      expect(mockFinish).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded" }),
      )
    })

    it("enqueues durable snapshot work only for newly imported Instagram contacts", async () => {
      mockClaim.mockResolvedValue(baseRun({ channel: "instagram" }))
      context.inbox.channel = "instagram"
      mockListPage.mockResolvedValue({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: undefined,
      })
      mockBulkImportChannelContacts.mockResolvedValue({
        importedContacts: 1,
        skippedContacts: 0,
        contactInboxIds: new Map([["a", { contactInboxId: "ci-1" }]]),
        newContactInboxIds: new Map([["a", { contactInboxId: "ci-1" }]]),
      })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockBulkImportChannelContacts).toHaveBeenCalledWith(
        expect.objectContaining({ captureProfileSnapshot: true }),
      )
      expect(mockEnqueueProfileSnapshots).toHaveBeenCalledWith({
        contactInboxIds: ["ci-1"],
        inboxId: "inbox-1",
        workspaceId: WORKSPACE_ID,
      })
    })
  })

  describe("quota increment", () => {
    it("increments the owner's contacts quota by the truly-new count", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: undefined,
      })
      mockBulkImportChannelContacts.mockResolvedValue({
        importedContacts: 3,
        skippedContacts: 0,
        contactInboxIds: new Map(),
        newContactInboxIds: new Map(),
      })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockIncrementBy).toHaveBeenCalledWith({
        userId: "owner-1",
        metric: "contacts",
        count: 3,
      })
    })

    it("does not call incrementBy when zero contacts were truly new (re-processed page)", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: undefined,
      })
      mockBulkImportChannelContacts.mockResolvedValue(emptyImportResult)

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockIncrementBy).not.toHaveBeenCalled()
    })
  })

  describe("chunk budget → continuation", () => {
    it("yields for continuation (fenced) before enqueuing, and the enqueue carries the discriminated envelope", async () => {
      mockClaim.mockResolvedValue(baseRun({ attempts: 4 }))
      const startedAt = Date.now()
      const budgetOrder: string[] = []
      mockListPage.mockImplementationOnce(() => {
        budgetOrder.push("listPage")
        // Push the wall clock past the 4-minute chunk budget so the NEXT
        // loop iteration's budget check trips before a second listPage call.
        vi.spyOn(Date, "now").mockReturnValue(startedAt + 5 * 60 * 1000)
        return Promise.resolve({ entries: [], after: "cursor-2" })
      })
      mockYieldForContinuation.mockImplementationOnce(() => {
        budgetOrder.push("yield")
        return Promise.resolve(1)
      })
      mockQueueAdd.mockImplementationOnce(() => {
        budgetOrder.push("enqueue")
        return Promise.resolve()
      })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(budgetOrder).toEqual(["listPage", "yield", "enqueue"])
      expect(mockYieldForContinuation).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
      })
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "contactScan",
        {
          type: "contactScan",
          data: { runId: RUN_ID, workspaceId: WORKSPACE_ID },
        },
        expect.objectContaining({
          jobId: "contact-scan-run-1-4-page-2",
          delay: 5000,
          attempts: 1,
          removeOnComplete: true,
        }),
      )
      expect(mockFinish).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    })

    it("a yield that loses the claim (0 rows) abandons without enqueueing a continuation", async () => {
      mockClaim.mockResolvedValue(baseRun())
      const startedAt = Date.now()
      mockListPage.mockImplementationOnce(() => {
        vi.spyOn(Date, "now").mockReturnValue(startedAt + 5 * 60 * 1000)
        return Promise.resolve({ entries: [], after: "cursor-2" })
      })
      mockYieldForContinuation.mockResolvedValue(0)

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockQueueAdd).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    })

    it("reopens the run for the sweeper when the continuation enqueue fails", async () => {
      mockClaim.mockResolvedValue(baseRun())
      const startedAt = Date.now()
      mockListPage.mockImplementationOnce(() => {
        vi.spyOn(Date, "now").mockReturnValue(startedAt + 5 * 60 * 1000)
        return Promise.resolve({ entries: [], after: "cursor-2" })
      })
      mockQueueAdd.mockRejectedValueOnce(new Error("redis down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockReopenReleased).toHaveBeenCalledWith({ runId: RUN_ID })
      vi.restoreAllMocks()
    })
  })

  describe("pacing", () => {
    const emptyPage = (after: string | undefined) => ({
      entries: [],
      after,
    })

    it("ends a chunk after 5 pages and continues 5s later", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockImplementation(() => Promise.resolve(emptyPage("next")))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).toHaveBeenCalledTimes(5)
      expect(mockYieldForContinuation).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "contactScan",
        expect.anything(),
        expect.objectContaining({
          delay: 5000,
          jobId: "contact-scan-run-1-2-page-6",
        }),
      )
      expect(mockFinish).not.toHaveBeenCalled()
    })

    it("pauses between two pages of the same chunk", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage
        .mockResolvedValueOnce(emptyPage("c2"))
        .mockResolvedValueOnce(emptyPage("c3"))
        .mockResolvedValueOnce(emptyPage(undefined))
      const startedAt = Date.now()

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      // Two gaps of the (mocked) 20ms page gap sit between three pages.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(35)
      expect(mockListPage).toHaveBeenCalledTimes(3)
    })

    it.each([
      ["usage 85% waits 2 minutes", { usagePercent: 85 }, 120_000],
      ["usage 95% waits 10 minutes", { usagePercent: 95 }, 600_000],
      [
        "Meta's wait wins",
        { usagePercent: 99, retryAfterMs: 300_000 },
        300_000,
      ],
      [
        "Meta's wait is capped at 30 minutes",
        { retryAfterMs: 90 * 60_000 },
        1_800_000,
      ],
    ])("%s, as a delayed job and not a sleep", async (_name, signal, delay) => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({
        entries: [],
        after: "next",
        usageSignal: signal,
      })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      // The page is persisted first, then the chunk ends: one page, one wait.
      expect(mockListPage).toHaveBeenCalledTimes(1)
      expect(mockIncrementProgress).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "contactScan",
        expect.anything(),
        expect.objectContaining({ delay }),
      )
    })

    it("usage below 85% keeps walking", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage
        .mockResolvedValueOnce({
          entries: [],
          after: "c2",
          usageSignal: { usagePercent: 84 },
        })
        .mockResolvedValueOnce(emptyPage(undefined))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).toHaveBeenCalledTimes(2)
      expect(mockQueueAdd).not.toHaveBeenCalled()
    })

    it("a finished page resets attempts to the running claim (1) and refreshes the heartbeat in the same write", async () => {
      mockClaim.mockResolvedValue(baseRun({ attempts: 4 }))
      mockListPage.mockResolvedValue(emptyPage(undefined))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockIncrementProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.objectContaining({
            attempts: 1,
            lastHeartbeatAt: expect.any(Date),
          }),
        }),
      )
    })
  })

  describe("rate limit", () => {
    it("waits through the queue with the provider's backoff, retries the SAME page, and resets attempts so the sweeper cannot fail the released run", async () => {
      mockClaim.mockResolvedValue(
        baseRun({ attempts: 3, currentPageNumber: 2 }),
      )
      mockListPage.mockRejectedValue(new Error("(#80006) rate limited"))
      mockClassifyError.mockReturnValue("rateLimited")
      mockReadBackoff.mockReturnValue({ retryAfterMs: 180_000 })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockYieldForContinuation).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
        attempts: 1,
      })
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "contactScan",
        expect.anything(),
        expect.objectContaining({
          delay: 180_000,
          jobId: expect.stringMatching(SAME_PAGE_RETRY_JOB_ID),
        }),
      )
      // Not a failure: no retry accounting, no terminal write, no cursor change.
      expect(mockRetryOrFail).not.toHaveBeenCalled()
      expect(mockFinish).not.toHaveBeenCalled()
      expect(mockIncrementProgress).not.toHaveBeenCalled()
      expect(mockUpdateProgress).not.toHaveBeenCalled()
    })

    it("with no usage header it backs off 10 minutes", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("rate limited"))
      mockClassifyError.mockReturnValue("rateLimited")
      mockReadBackoff.mockReturnValue(null)

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "contactScan",
        expect.anything(),
        expect.objectContaining({ delay: 600_000 }),
      )
    })

    it("a rate-limited first page does not clear a resume cursor", async () => {
      mockClaim.mockResolvedValue(baseRun({ resumeCursor: "good-cursor" }))
      mockListPage.mockRejectedValue(new Error("rate limited"))
      mockClassifyError.mockReturnValue("rateLimited")

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockUpdateProgress).not.toHaveBeenCalled()
      expect(mockListPage).toHaveBeenCalledTimes(1)
    })

    it("a repeatedly rate-limited page keeps waiting and never hot-loops", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("rate limited"))
      mockClassifyError.mockReturnValue("rateLimited")

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })
      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      // One provider call per job, and every job schedules a delayed next one.
      expect(mockListPage).toHaveBeenCalledTimes(2)
      const delays = mockQueueAdd.mock.calls.map(
        (call) => (call[2] as { delay: number }).delay,
      )
      expect(delays).toEqual([600_000, 600_000])
    })

    it("a lost claim at the park step abandons without queueing a job", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("rate limited"))
      mockClassifyError.mockReturnValue("rateLimited")
      mockYieldForContinuation.mockResolvedValue(0)

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockQueueAdd).not.toHaveBeenCalled()
    })

    it("a queue failure while parking reopens the run for the sweeper", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("rate limited"))
      mockClassifyError.mockReturnValue("rateLimited")
      mockQueueAdd.mockRejectedValueOnce(new Error("redis down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockReopenReleased).toHaveBeenCalledWith({ runId: RUN_ID })
    })
  })

  describe("cancel", () => {
    it("a cancel that lands during a page fences the next write: no further page, no continuation, no finish", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({
        entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
        after: "next",
      })
      // The cancel cleared the claim, so the page's progress write matches 0 rows.
      mockIncrementProgress.mockResolvedValue(0)

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd).not.toHaveBeenCalled()
      expect(mockYieldForContinuation).not.toHaveBeenCalled()
      expect(mockFinish).not.toHaveBeenCalled()
    })
  })

  describe("CONTACT_SCAN_MAX_PAGES runaway guard (FIX 3)", () => {
    it("stops with partial + scanLimitReached before fetching another page once currentPageNumber is at the cap", async () => {
      mockClaim.mockResolvedValue(baseRun({ currentPageNumber: 5000 }))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).not.toHaveBeenCalled()
      expect(mockFinish).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: "partial",
        currentError: "scanLimitReached",
        expect: EXPECT_GUARD,
      })
    })

    it("does not trip the guard while under the cap", async () => {
      mockClaim.mockResolvedValue(baseRun({ currentPageNumber: 4999 }))
      mockListPage.mockResolvedValue({ entries: [], after: undefined })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockListPage).toHaveBeenCalledTimes(1)
      expect(mockFinish).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded" }),
      )
    })
  })

  it("claim takeover mid-chunk (incrementProgress returns 0) stops the walk with no further writes", async () => {
    mockClaim.mockResolvedValue(baseRun())
    // Only ONE listPage call is expected — the 0-row write aborts the walk
    // before a second page is ever fetched.
    mockListPage.mockResolvedValueOnce({
      entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
      after: "cursor-2",
    })
    mockIncrementProgress.mockResolvedValueOnce(0)

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockListPage).toHaveBeenCalledTimes(1)
    expect(mockFinish).not.toHaveBeenCalled()
    expect(mockYieldForContinuation).not.toHaveBeenCalled()
  })

  describe("error classification table", () => {
    it("retryable → retryOrFail (sweeper retry, or failed on the last attempt)", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("rate limited"))
      mockClassifyError.mockReturnValue("retryable")

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockLogProviderError).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "messenger",
          workspaceId: WORKSPACE_ID,
        }),
      )
      expect(mockRetryOrFail).toHaveBeenCalledWith({
        runId: RUN_ID,
        expect: EXPECT_GUARD,
      })
      expect(mockFinish).not.toHaveBeenCalled()
    })

    it("tokenInvalid → finish failed with the tokenInvalid sentinel", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("expired token"))
      mockClassifyError.mockReturnValue("tokenInvalid")

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockFinish).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: "failed",
        currentError: "tokenInvalid",
        expect: EXPECT_GUARD,
      })
    })

    it("graphPermission → finish failed with the graphPermission sentinel", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("missing scope"))
      mockClassifyError.mockReturnValue("graphPermission")

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockFinish).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: "failed",
        currentError: "graphPermission",
        expect: EXPECT_GUARD,
      })
    })

    it("unknown → finish failed with the sanitized error message", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockRejectedValue(new Error("something weird"))
      mockClassifyError.mockReturnValue("unknown")

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockFinish).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: "failed",
        currentError: "something weird",
        expect: EXPECT_GUARD,
      })
    })
  })

  describe("terminal status at walk completion (FIX 2 — always succeeded)", () => {
    it("a normally completed walk (cursor exhausted) finishes succeeded, with no counter re-read", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockListPage.mockResolvedValue({ entries: [], after: undefined })

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockFinish).toHaveBeenCalledWith({
        runId: RUN_ID,
        status: "succeeded",
        expect: EXPECT_GUARD,
      })
    })
  })
})
