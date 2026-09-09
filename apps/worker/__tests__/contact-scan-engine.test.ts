import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockClaim,
  mockFinish,
  mockIncrementProgress,
  mockUpdateProgress,
  mockYieldForContinuation,
  mockReopenReleased,
  mockResetForRetry,
  mockBulkImportChannelContacts,
  mockIncrementBy,
  mockFindWorkspace,
  mockLoadContext,
  mockListPage,
  mockClassifyError,
  mockEnqueueContactAvatarJobs,
  mockLogProviderError,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockFinish: vi.fn(),
  mockIncrementProgress: vi.fn(),
  mockUpdateProgress: vi.fn(),
  mockYieldForContinuation: vi.fn(),
  mockReopenReleased: vi.fn(),
  mockResetForRetry: vi.fn(),
  mockBulkImportChannelContacts: vi.fn(),
  mockIncrementBy: vi.fn(),
  mockFindWorkspace: vi.fn(),
  mockLoadContext: vi.fn(),
  mockListPage: vi.fn(),
  mockClassifyError: vi.fn(),
  mockEnqueueContactAvatarJobs: vi.fn(),
  mockLogProviderError: vi.fn(),
  mockQueueAdd: vi.fn(),
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
    resetForRetry: mockResetForRetry,
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
  }: {
    runId: string
    attempts: number
    pageNumber: number
  }) => `contact-scan-${runId}-${attempts}-page-${pageNumber}`,
  integrationQueue: { add: mockQueueAdd },
}))

vi.mock("../src/integration/handlers/contact/enqueue-avatar-jobs", () => ({
  enqueueContactAvatarJobs: mockEnqueueContactAvatarJobs,
}))

vi.mock("../src/integration/handlers/contact-scan/adapter", () => ({
  contactScanAdapters: {
    messenger: {
      channel: "messenger",
      provider: "messenger",
      loadContext: mockLoadContext,
      listPage: mockListPage,
      classifyError: mockClassifyError,
    },
  },
}))

const { runContactScan } = await import(
  "../src/integration/handlers/contact-scan/engine"
)

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

const context = { inbox: { id: "inbox-1", workspaceId: WORKSPACE_ID } }

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
    mockFindWorkspace.mockResolvedValue({
      id: WORKSPACE_ID,
      ownerId: "owner-1",
    })
    mockLoadContext.mockResolvedValue(context)
    mockIncrementProgress.mockResolvedValue(1)
    mockUpdateProgress.mockResolvedValue(1)
    mockYieldForContinuation.mockResolvedValue(1)
    mockFinish.mockResolvedValue(1)
    mockResetForRetry.mockResolvedValue(1)
    mockReopenReleased.mockResolvedValue(1)
    mockBulkImportChannelContacts.mockResolvedValue(emptyImportResult)
    mockQueueAdd.mockResolvedValue(undefined)
    // Both are best-effort (`.catch(...)`-chained by the engine, FIX 1) —
    // default them to resolving Promises like the real services so a test
    // that doesn't care about them doesn't crash on `.catch` of a bare
    // `undefined` return.
    mockIncrementBy.mockResolvedValue(undefined)
    mockEnqueueContactAvatarJobs.mockResolvedValue(undefined)
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

  describe("setup throws (FIX 1 — resets for retry, never a stuck `running` row)", () => {
    it("adapter.loadContext throwing resets for retry with the providerRetryable sentinel, never finishes, and never starts the walk", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockLoadContext.mockRejectedValue(new Error("db down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockResetForRetry).toHaveBeenCalledWith({
        runId: RUN_ID,
        currentError: "providerRetryable",
        expect: EXPECT_GUARD,
      })
      expect(mockFinish).not.toHaveBeenCalled()
      expect(mockListPage).not.toHaveBeenCalled()
    })

    it("workspaceService.find throwing resets for retry with the providerRetryable sentinel, never finishes, and never starts the walk", async () => {
      mockClaim.mockResolvedValue(baseRun())
      mockFindWorkspace.mockRejectedValue(new Error("db down"))

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockResetForRetry).toHaveBeenCalledWith({
        runId: RUN_ID,
        currentError: "providerRetryable",
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
      expect(mockResetForRetry).toHaveBeenCalledWith({
        runId: RUN_ID,
        currentError: "providerRetryable",
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

      expect(mockResetForRetry).toHaveBeenCalledWith({
        runId: RUN_ID,
        currentError: "pageImportFailed",
        expect: EXPECT_GUARD,
      })
      // Nothing persists an advanced watermark — resumeCursor stays at
      // "good-cursor" and currentPageNumber is untouched.
      expect(mockIncrementProgress).not.toHaveBeenCalled()
      expect(mockUpdateProgress).not.toHaveBeenCalled()
      // Only one listPage call — the walk stops immediately instead of
      // continuing past the lost page.
      expect(mockListPage).toHaveBeenCalledTimes(1)
      expect(mockFinish).not.toHaveBeenCalled()
      expect(mockEnqueueContactAvatarJobs).not.toHaveBeenCalled()
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

      expect(mockResetForRetry).not.toHaveBeenCalled()
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

    it("an avatar-enqueue failure alone does not fail or retry the page", async () => {
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
      mockEnqueueContactAvatarJobs.mockRejectedValueOnce(
        new Error("queue down"),
      )

      await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

      expect(mockResetForRetry).not.toHaveBeenCalled()
      expect(mockFinish).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded" }),
      )
    })
  })

  it("enqueues avatar jobs only for newly-created contacts (FIX 2 — not the full resolved map)", async () => {
    mockClaim.mockResolvedValue(baseRun())
    mockListPage.mockResolvedValue({
      entries: [entry("a", new Date("2026-02-01T00:00:00Z"))],
      after: undefined,
    })
    const contactInboxIds = new Map([
      ["a", { contactInboxId: "ci-1" }],
      ["b-existing", { contactInboxId: "ci-existing" }],
    ])
    const newContactInboxIds = new Map([["a", { contactInboxId: "ci-1" }]])
    mockBulkImportChannelContacts.mockResolvedValue({
      importedContacts: 1,
      skippedContacts: 0,
      contactInboxIds,
      newContactInboxIds,
    })

    await runContactScan({ runId: RUN_ID, workspaceId: WORKSPACE_ID })

    expect(mockEnqueueContactAvatarJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        contactInboxIds: newContactInboxIds,
      }),
    )
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
    it("retryable → resetForRetry with the providerRetryable sentinel", async () => {
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
      expect(mockResetForRetry).toHaveBeenCalledWith({
        runId: RUN_ID,
        currentError: "providerRetryable",
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
