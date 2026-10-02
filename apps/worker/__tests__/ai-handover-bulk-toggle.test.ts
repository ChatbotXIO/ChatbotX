import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  finish: vi.fn(),
  recordProgress: vi.fn(),
  yieldForContinuation: vi.fn(),
  reopenReleased: vi.fn(),
  enqueueChunk: vi.fn(),
  findRunInbox: vi.fn(),
  reconcile: vi.fn(),
  listEligiblePage: vi.fn(),
  listStillEligible: vi.fn(),
  countEligible: vi.fn(),
  findStopReason: vi.fn(),
  recordDelivered: vi.fn(),
  recordEvent: vi.fn(),
  runner: vi.fn(),
  createRunner: vi.fn(),
  syncThreadOwner: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

class ThreadControlUnsupportedError extends Error {}

vi.mock("@chatbotx.io/business", () => ({
  AI_HANDOVER_BULK_CHUNK_BUDGET_MS: 45_000,
  AI_HANDOVER_BULK_MAX_PAUSE_MS: 6 * 60 * 60 * 1000,
  AI_HANDOVER_BULK_SETTLE_CONCURRENCY: 10,
  AI_HANDOVER_BULK_RUN_ERRORS: {
    automationStopped: "automationStopped",
    tokenInvalid: "tokenInvalid",
    channelUnsupported: "channelUnsupported",
    channelUnavailable: "channelUnavailable",
    pageDisconnected: "pageDisconnected",
    pageRefused: "pageRefused",
    integrationUnavailable: "integrationUnavailable",
    batchFailed: "batchFailed",
  },
  ThreadControlUnsupportedError,
  aiHandoverBulkRunService: {
    claim: mocks.claim,
    finish: mocks.finish,
    recordProgress: mocks.recordProgress,
    yieldForContinuation: mocks.yieldForContinuation,
    reopenReleased: mocks.reopenReleased,
    enqueueChunk: mocks.enqueueChunk,
    findRunInbox: mocks.findRunInbox,
    reconcile: mocks.reconcile,
    listEligiblePage: mocks.listEligiblePage,
    listStillEligible: mocks.listStillEligible,
    countEligible: mocks.countEligible,
  },
  aiHandoverSettingsService: { findStopReason: mocks.findStopReason },
  recordDeliveredDirectMessage: mocks.recordDelivered,
  threadControlService: { recordEvent: mocks.recordEvent },
}))
vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  createBulkThreadControl: mocks.createRunner,
  syncThreadOwner: mocks.syncThreadOwner,
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { runAiHandoverBulkToggle } = await import(
  "../src/integration/handlers/ai-handover-bulk-toggle"
)
const { accountBatch } = await import(
  "../src/integration/handlers/ai-handover-bulk-batch-accounting"
)

const NOW = new Date("2026-10-02T12:00:00.000Z")
const TOKEN = "token-1"
const DATA = { runId: "run-1", workspaceId: "ws-1" }

const run = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  channel: "messenger",
  action: "enable",
  status: "running",
  message: null,
  claimToken: TOKEN,
  attempts: 1,
  chunkSeq: 0,
  totalCount: 100,
  processedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  cursorContactInboxId: null,
  inFlightFromId: null,
  inFlightToId: null,
  requestedAt: NOW,
  ...overrides,
})

const inbox = (id: string) => ({
  id,
  channel: "messenger",
  threadControlSeenAt: null,
})
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  contactId: `contact-${id}`,
  conversationId: `conv-${id}`,
  sourceId: `psid-${id}`,
  lastIncomingMessageAt: NOW,
  threadOwnerAppId: null,
  ...overrides,
})
const rows = (count: number, prefix = "ci") =>
  Array.from({ length: count }, (_, index) =>
    row(`${prefix}-${String(index).padStart(3, "0")}`),
  )

const succeeded = (id: string, event: "passed" | "serviceSent" = "passed") => ({
  contactInboxId: id,
  status: "succeeded" as const,
  event,
  ownerRole: "ai_agent" as const,
  ownerAppId: "app-bot",
  messageSourceId: `m_${id}`,
})
const failedResult = (id: string, category = ChannelErrorCategory.UNKNOWN) => ({
  contactInboxId: id,
  status: "failed" as const,
  error: new ChannelError("nope", category),
})

/**
 * The channel runner the engine receives. A test's `mocks.runner` returns
 * either the per-contact results alone (the channel had quota to spare) or the
 * full `{ results, retryAfterMs }`.
 */
/** What the channel advertises for its bulk calls (a Graph-like transport). */
const LIMITS = {
  maxBatchSize: 50,
  batchGapMs: 0,
  rateLimitPauseMs: 60 * 60 * 1000,
}

const channelRunner = async (input: unknown) => {
  const out = await mocks.runner(input)
  return Array.isArray(out) ? { results: out, retryAfterMs: null } : out
}

const progressCalls = () =>
  mocks.recordProgress.mock.calls.map((call) => call[0].progress)

/** Every contact of the batch succeeds. */
const runnerSucceeds = () =>
  mocks.runner.mockImplementation(
    async ({
      action,
      contacts,
    }: {
      action: string
      contacts: { id: string }[]
    }) =>
      contacts.map((contact) =>
        succeeded(
          contact.id,
          action === "takeFromAi" ? "serviceSent" : "passed",
        ),
      ),
  )

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
  mocks.claim.mockResolvedValue(run())
  mocks.finish.mockResolvedValue(1)
  mocks.recordProgress.mockResolvedValue("running")
  mocks.yieldForContinuation.mockResolvedValue(1)
  mocks.enqueueChunk.mockResolvedValue(undefined)
  mocks.findRunInbox.mockResolvedValue(inbox("inbox-1"))
  mocks.findStopReason.mockResolvedValue(null)
  mocks.reconcile.mockResolvedValue(undefined)
  mocks.listEligiblePage.mockResolvedValue([])
  mocks.listStillEligible.mockImplementation(
    async ({ ids }: { ids: string[] }) => ids,
  )
  mocks.countEligible.mockResolvedValue(0)
  mocks.createRunner.mockResolvedValue({ run: channelRunner, limits: LIMITS })
  mocks.recordEvent.mockResolvedValue({ eventApplied: true })
  mocks.recordDelivered.mockResolvedValue({ id: "msg" })
  mocks.syncThreadOwner.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("claiming", () => {
  test("a run this worker did not win (terminal, or held by another) does nothing", async () => {
    mocks.claim.mockResolvedValue(null)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.findRunInbox).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("the claim is scoped to the job's workspace, so a stray job cannot take the lease", async () => {
    mocks.claim.mockResolvedValue(null)

    await runAiHandoverBulkToggle({ runId: "run-1", workspaceId: "ws-other" })

    expect(mocks.claim).toHaveBeenCalledWith({
      runId: "run-1",
      workspaceId: "ws-other",
    })
    expect(mocks.findRunInbox).not.toHaveBeenCalled()
  })

  test("a run cancelled before this chunk started is wound down, not walked", async () => {
    mocks.claim.mockResolvedValue(run({ status: "cancelling" }))

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        expect: { claimToken: TOKEN },
        outcome: expect.objectContaining({ status: "cancelled" }),
      }),
    )
    expect(mocks.listEligiblePage).not.toHaveBeenCalled()
  })
})

describe("preconditions", () => {
  test.each([
    ["automationStopped", "the automation is no longer running"],
    ["pageDisconnected", "the Page was disconnected"],
  ])("a run stops (cancelled, with the reason) when %s, before any batch", async (reason) => {
    mocks.findStopReason.mockResolvedValue(reason)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "cancelled",
      currentError: reason,
    })
    expect(mocks.runner).not.toHaveBeenCalled()
    expect(mocks.listEligiblePage).not.toHaveBeenCalled()
  })

  test.each([
    ["enable", true],
    ["disable", false],
  ] as const)("a %s %s need the automation to keep running behind it", async (action, requiresAutomation) => {
    mocks.claim.mockResolvedValue(run({ action, message: "hi" }))

    await runAiHandoverBulkToggle(DATA)

    // Only a hand-over is undone by the take-back of a stopped automation.
    expect(mocks.findStopReason).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      requiresAutomation,
    })
    expect(mocks.finish.mock.calls[0][0].outcome.status).toBe("completed")
  })

  test("a Page that no longer exists ends the run (cancelled) with nothing to walk", async () => {
    mocks.findRunInbox.mockResolvedValue(null)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "cancelled",
      currentError: "pageDisconnected",
    })
    expect(mocks.listEligiblePage).not.toHaveBeenCalled()
  })

  test("a Page with nothing eligible completes an empty run", async () => {
    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "completed",
      totalCount: 0,
    })
  })

  test("the total is counted once, only while it is unknown", async () => {
    mocks.claim.mockResolvedValue(run({ totalCount: null }))
    mocks.countEligible.mockResolvedValue(42)

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls()).toContainEqual({ totalCount: 42 })

    vi.clearAllMocks()
    mocks.claim.mockResolvedValue(run({ totalCount: 42 }))
    mocks.findRunInbox.mockResolvedValue(inbox("inbox-1"))
    mocks.findStopReason.mockResolvedValue(null)
    mocks.recordProgress.mockResolvedValue("running")
    mocks.listEligiblePage.mockResolvedValue([])
    mocks.finish.mockResolvedValue(1)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.countEligible).not.toHaveBeenCalled()
  })
})

describe("enable", () => {
  test("hands a page to the AI, records each pass, then clears the in-flight markers and advances the cursor", async () => {
    const page = rows(3)
    mocks.listEligiblePage.mockResolvedValueOnce(page)
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner).toHaveBeenCalledExactlyOnceWith({
      action: "handToAi",
      contacts: page.map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        lastIncomingMessageAt: r.lastIncomingMessageAt,
      })),
      text: undefined,
    })
    expect(mocks.recordEvent).toHaveBeenCalledTimes(3)
    expect(mocks.recordEvent.mock.calls[0][0]).toMatchObject({
      workspaceId: "ws-1",
      conversationId: "conv-ci-000",
      event: "passed",
      ownerRole: "ai_agent",
      ownerAppId: "app-bot",
      occurredAt: new Date("2026-10-02T12:00:00.000Z"),
    })
    expect(mocks.recordDelivered).not.toHaveBeenCalled()
    // Markers are written before the call and cleared by the settle write.
    expect(progressCalls()).toEqual([
      { inFlightFromId: "ci-000", inFlightToId: "ci-002" },
      {
        addProcessed: 3,
        addSkipped: 0,
        addFailed: 0,
        cursorContactInboxId: "ci-002",
        inFlightFromId: null,
        inFlightToId: null,
      },
    ])
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "completed",
      totalCount: 3,
    })
  })

  test("probes a Page with one thread, then pages by 50 until a short page", async () => {
    mocks.listEligiblePage
      .mockResolvedValueOnce(rows(1, "probe"))
      .mockResolvedValueOnce(rows(50))
      .mockResolvedValueOnce(rows(7, "next"))
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    expect(
      mocks.listEligiblePage.mock.calls.map((call) => [
        call[0].limit,
        call[0].afterId,
      ]),
    ).toEqual([
      [1, null],
      // Each page resumes after the previous page's last contact.
      [50, "probe-000"],
      [50, "ci-049"],
    ])
    expect(mocks.finish.mock.calls[0][0].outcome.totalCount).toBe(58)
  })

  test("a thread a human took over since the page was read is skipped, never handed over", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(3))
    mocks.listStillEligible.mockResolvedValue(["ci-000", "ci-002"])
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    expect(
      mocks.runner.mock.calls[0][0].contacts.map((c: { id: string }) => c.id),
    ).toEqual(["ci-000", "ci-002"])
    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 2,
      addSkipped: 1,
      cursorContactInboxId: "ci-002",
    })
  })

  test("a page with nothing left after the re-check makes no channel call", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    mocks.listStillEligible.mockResolvedValue([])

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner).not.toHaveBeenCalled()
    expect(progressCalls()[0]).toMatchObject({
      addSkipped: 2,
      cursorContactInboxId: "ci-001",
    })
  })
})

describe("disable", () => {
  beforeEach(() => {
    mocks.claim.mockResolvedValue(
      run({ action: "disable", message: "A person is here" }),
    )
  })

  test("sends the tagged text, shows it in the inbox with the sent message id, and records an implicit takeover", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce([
      row("ci-1", { threadOwnerAppId: "app-bot" }),
    ])
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner.mock.calls[0][0]).toMatchObject({
      action: "takeFromAi",
      text: "A person is here",
    })
    expect(mocks.recordDelivered).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-ci-1",
        text: "A person is here",
        sourceId: "m_ci-1",
      }),
    )
    expect(mocks.recordEvent.mock.calls[0][0]).toMatchObject({
      event: "serviceSent",
      ownerAppId: null,
      // Who held the thread is kept: it is the AI hand-over "return" target.
      previousOwnerAppId: "app-bot",
    })
  })
})

describe("failures", () => {
  test("a refused or unconfirmed thread is counted failed and never recorded", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(3))
    mocks.runner.mockResolvedValue([
      succeeded("ci-000"),
      failedResult("ci-001"),
      {
        contactInboxId: "ci-002",
        status: "unknown",
        error: new ChannelError(
          "timed out",
          ChannelErrorCategory.NETWORK_ERROR,
        ),
      },
    ])

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 1,
      addFailed: 2,
    })
  })

  test("a contact the channel did not answer for counts failed instead of vanishing", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    mocks.runner.mockResolvedValue([succeeded("ci-000")])

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 1,
      addFailed: 1,
    })
  })

  test("a bookkeeping failure after a delivered change is logged and the thread still counts processed", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    runnerSucceeds()
    mocks.recordEvent
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ eventApplied: true })

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    )
    expect(progressCalls().at(-1)).toMatchObject({ addProcessed: 2 })
  })

  test("a stale record (a newer event won) re-syncs the owner from the channel", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(1))
    runnerSucceeds()
    mocks.recordEvent.mockResolvedValue({ eventApplied: false })

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.syncThreadOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "conv-ci-000",
      }),
    )
  })

  test("a Page that refuses its probe for permission fails the run with the reason and counts only the rest ahead of the cursor as skipped", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(1))
    mocks.runner.mockResolvedValueOnce([
      failedResult("ci-000", ChannelErrorCategory.PERMISSION_DENIED),
    ])
    // 39 threads are still ahead of the probe's cursor.
    mocks.countEligible.mockResolvedValue(39)

    await runAiHandoverBulkToggle(DATA)

    // Only the one-contact probe was sent, never a 50-batch.
    expect(mocks.runner.mock.calls[0][0].contacts).toHaveLength(1)
    expect(mocks.listEligiblePage).toHaveBeenCalledTimes(1)
    expect(mocks.countEligible.mock.calls.at(-1)?.[0]).toMatchObject({
      afterId: "ci-000",
    })
    expect(progressCalls().at(-1)).toEqual({ addSkipped: 39 })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "pageRefused",
      // 1 failed probe + 39 skipped.
      totalCount: 40,
    })
  })

  test("a Page whose integration cannot be loaded fails the run and counts its threads skipped", async () => {
    mocks.createRunner.mockRejectedValue(new Error("auth missing"))
    mocks.countEligible.mockResolvedValue(7)

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls()).toContainEqual({ addSkipped: 7 })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "integrationUnavailable",
      totalCount: 7,
    })
    expect(mocks.listEligiblePage).not.toHaveBeenCalled()
  })

  test("a channel with no bulk handler fails the run", async () => {
    mocks.createRunner.mockRejectedValue(new ThreadControlUnsupportedError())

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "channelUnsupported",
    })
  })

  test("a revoked Page token fails the run with the token error", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    mocks.runner.mockRejectedValue(
      new ChannelError("expired", ChannelErrorCategory.AUTH_FAILED),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "tokenInvalid",
    })
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a transient whole-call failure of an enable releases the lease for the sweeper (a pass is repeated)", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    mocks.runner.mockRejectedValue(
      new ChannelError("busy", ChannelErrorCategory.NETWORK_ERROR),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.yieldForContinuation).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueChunk).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
    // Only the "marked in flight" write happened; nothing cleared it.
    expect(progressCalls()).toEqual([
      { inFlightFromId: "ci-000", inFlightToId: "ci-001" },
    ])
  })
})

describe("ownership and cancellation", () => {
  test("a lost claim on a progress write abandons the run without finishing it", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    mocks.recordProgress.mockResolvedValue(null)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("a cancel noticed on the in-flight write stops before any message leaves", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(2))
    mocks.recordProgress.mockResolvedValue("cancelling")

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner).not.toHaveBeenCalled()
    expect(mocks.finish.mock.calls[0][0].outcome.status).toBe("cancelled")
  })

  test("a cancel noticed after a batch ends the run cancelled and fetches no further page", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(50))
    runnerSucceeds()
    mocks.recordProgress
      .mockResolvedValueOnce("running")
      .mockResolvedValueOnce("cancelling")

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.listEligiblePage).toHaveBeenCalledTimes(1)
    expect(mocks.finish.mock.calls[0][0].outcome.status).toBe("cancelled")
  })

  test("every write carries the claim token of this chunk", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(1))
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    for (const [call] of mocks.recordProgress.mock.calls) {
      expect(call.expect).toEqual({ claimToken: TOKEN })
    }
    expect(mocks.finish.mock.calls[0][0].expect).toEqual({ claimToken: TOKEN })
  })
})

describe("chunk budget and continuation", () => {
  const exhaustBudgetAfterFirstPage = () => {
    mocks.listEligiblePage.mockImplementation(() => {
      const page = rows(50)
      vi.setSystemTime(new Date(NOW.getTime() + 46_000))
      return Promise.resolve(page)
    })
  }

  test("an exhausted budget releases the lease and queues the next chunk with the new revision", async () => {
    exhaustBudgetAfterFirstPage()
    runnerSucceeds()
    mocks.yieldForContinuation.mockResolvedValue(4)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.listEligiblePage).toHaveBeenCalledTimes(1)
    expect(mocks.finish).not.toHaveBeenCalled()
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1", chunkSeq: 4 }),
    )
  })

  test("a continuation that cannot be queued reopens the run for the sweeper", async () => {
    exhaustBudgetAfterFirstPage()
    runnerSucceeds()
    mocks.enqueueChunk.mockRejectedValue(new Error("redis down"))

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.reopenReleased).toHaveBeenCalledWith("run-1")
  })

  test("a yield that loses the claim queues nothing", async () => {
    exhaustBudgetAfterFirstPage()
    runnerSucceeds()
    mocks.yieldForContinuation.mockResolvedValue(null)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.enqueueChunk).not.toHaveBeenCalled()
    expect(mocks.reopenReleased).not.toHaveBeenCalled()
  })
})

describe("resuming", () => {
  test("continues after the stored contact cursor and keeps the totals of the earlier chunks", async () => {
    mocks.claim.mockResolvedValue(
      run({ cursorContactInboxId: "ci-120", processedCount: 120 }),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.listEligiblePage.mock.calls[0][0]).toMatchObject({
      afterId: "ci-120",
    })
    expect(mocks.finish.mock.calls[0][0].outcome.totalCount).toBe(120)
  })

  test("a disable that crashed with a batch in flight skips past it (never re-sends)", async () => {
    mocks.claim.mockResolvedValue(
      run({
        action: "disable",
        message: "hi",
        inFlightFromId: "ci-010",
        inFlightToId: "ci-059",
      }),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls()[0]).toEqual({
      cursorContactInboxId: "ci-059",
      // The skipped messages cannot be counted: the run is flagged instead.
      currentError: "batchFailed",
      inFlightFromId: null,
      inFlightToId: null,
    })
  })

  test("an enable that crashed with a batch in flight repeats it (a pass is idempotent)", async () => {
    mocks.claim.mockResolvedValue(
      run({ inFlightFromId: "ci-010", inFlightToId: "ci-059" }),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls()[0]).toEqual({
      inFlightFromId: null,
      inFlightToId: null,
    })
    expect("cursorContactInboxId" in progressCalls()[0]).toBe(false)
  })
})

describe("cursor handling (a stale snapshot must never cause a resend)", () => {
  test("a run that already reached the channel resumes with full batches after its cursor", async () => {
    mocks.claim.mockResolvedValue(
      run({ cursorContactInboxId: "ci-050", processedCount: 50 }),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.listEligiblePage.mock.calls[0][0]).toMatchObject({
      afterId: "ci-050",
      limit: 50,
    })
  })

  test("a resumed run whose cursor moved but never reached the channel is still probing with one thread", async () => {
    mocks.claim.mockResolvedValue(
      run({
        cursorContactInboxId: "ci-050",
        processedCount: 0,
        failedCount: 0,
        skippedCount: 50,
      }),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.listEligiblePage.mock.calls[0][0]).toMatchObject({
      afterId: "ci-050",
      limit: 1,
    })
  })

  test("a disable that recovers an in-flight batch lists the NEXT page after the recovered cursor", async () => {
    mocks.claim.mockResolvedValue(
      run({
        action: "disable",
        message: "hi",
        cursorContactInboxId: "ci-009",
        inFlightFromId: "ci-010",
        inFlightToId: "ci-059",
      }),
    )

    await runAiHandoverBulkToggle(DATA)

    // Not the claimed row's stale "ci-009": that would send the batch again.
    expect(mocks.listEligiblePage.mock.calls[0][0].afterId).toBe("ci-059")
    expect(progressCalls()[0]).toMatchObject({
      cursorContactInboxId: "ci-059",
      currentError: "batchFailed",
    })
  })
})

describe("accounting for skipped Pages and unreachable batches", () => {
  test("a Page refused for permission records its counters, clears the markers, then ends the run", async () => {
    mocks.listEligiblePage.mockResolvedValueOnce(rows(1))
    mocks.runner.mockResolvedValue([
      failedResult("ci-000", ChannelErrorCategory.PERMISSION_DENIED),
    ])
    mocks.countEligible.mockResolvedValue(11)

    await runAiHandoverBulkToggle(DATA)

    const writes = progressCalls()
    expect(writes.at(-2)).toMatchObject({
      addFailed: 1,
      cursorContactInboxId: "ci-000",
      inFlightFromId: null,
      inFlightToId: null,
    })
    // The rest of the Page is counted skipped, so the history adds up.
    expect(writes.at(-1)).toEqual({ addSkipped: 11 })
  })

  test("a disable batch the channel could not be reached for is counted failed and never repeated", async () => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage
      .mockResolvedValueOnce(rows(50))
      .mockResolvedValueOnce(rows(2, "next"))
    mocks.runner
      .mockRejectedValueOnce(
        new ChannelError("busy", ChannelErrorCategory.NETWORK_ERROR),
      )
      .mockResolvedValueOnce([succeeded("next-000"), succeeded("next-001")])

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner).toHaveBeenCalledTimes(2)
    expect(progressCalls()).toContainEqual(
      expect.objectContaining({
        addFailed: 50,
        cursorContactInboxId: "ci-049",
        inFlightToId: null,
        currentError: "batchFailed",
      }),
    )
    expect(mocks.yieldForContinuation).not.toHaveBeenCalled()
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "completed",
      totalCount: 52,
    })
  })

  test("a disable gives up after three unreachable batches in a row", async () => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage.mockResolvedValue(rows(50))
    mocks.runner.mockRejectedValue(
      new ChannelError("down", ChannelErrorCategory.NETWORK_ERROR),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.runner).toHaveBeenCalledTimes(3)
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "channelUnavailable",
    })
  })

  test("a successful batch resets the unreachable streak", async () => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage
      .mockResolvedValueOnce(rows(50, "a"))
      .mockResolvedValueOnce(rows(50, "b"))
      .mockResolvedValueOnce(rows(50, "c"))
      .mockResolvedValueOnce(rows(50, "d"))
      .mockResolvedValueOnce([])
    const down = new ChannelError("down", ChannelErrorCategory.NETWORK_ERROR)
    mocks.runner
      .mockRejectedValueOnce(down)
      .mockRejectedValueOnce(down)
      .mockImplementationOnce(({ contacts }: { contacts: { id: string }[] }) =>
        Promise.resolve(contacts.map((contact) => succeeded(contact.id))),
      )
      .mockRejectedValueOnce(down)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome.status).toBe("completed")
  })
})

describe("accountBatch (where a batch leaves the cursor and what it counts)", () => {
  const ids = ["ci-1", "ci-2", "ci-3", "ci-4"]
  const pageRows = ids.map((id) => row(id))
  const deferredResult = (id: string) => ({
    contactInboxId: id,
    status: "deferred" as const,
    error: new ChannelError("quota", ChannelErrorCategory.RATE_LIMITED),
  })
  const unknownResult = (id: string) => ({
    contactInboxId: id,
    status: "unknown" as const,
    error: new ChannelError("timeout", ChannelErrorCategory.NETWORK_ERROR),
  })

  test("without a deferral the page is closed and every outcome counted", () => {
    expect(
      accountBatch({
        rows: pageRows,
        eligibleIds: new Set(["ci-1", "ci-2", "ci-4"]),
        results: [
          succeeded("ci-1"),
          failedResult("ci-2"),
          unknownResult("ci-4"),
        ],
        afterId: "ci-0",
      }),
    ).toEqual({
      skipped: 1,
      failed: 2,
      cursorContactInboxId: "ci-4",
      isUnderSent: false,
    })
  })

  test("a deferral stops the cursor before the first deferred row, and leaves what follows uncounted", () => {
    expect(
      accountBatch({
        rows: pageRows,
        eligibleIds: new Set(ids),
        results: [
          succeeded("ci-1"),
          deferredResult("ci-2"),
          failedResult("ci-3"),
          deferredResult("ci-4"),
        ],
        afterId: "ci-0",
      }),
    ).toEqual({
      skipped: 0,
      failed: 0,
      cursorContactInboxId: "ci-1",
      isUnderSent: false,
    })
  })

  test("a deferred first row keeps the cursor where the page started", () => {
    expect(
      accountBatch({
        rows: pageRows,
        eligibleIds: new Set(ids),
        results: ids.map(deferredResult),
        afterId: "ci-0",
      }).cursorContactInboxId,
    ).toBe("ci-0")
  })

  test("an unknown send after the deferral closes the page instead (never send it twice)", () => {
    expect(
      accountBatch({
        rows: pageRows,
        eligibleIds: new Set(ids),
        results: [
          succeeded("ci-1"),
          deferredResult("ci-2"),
          unknownResult("ci-3"),
          deferredResult("ci-4"),
        ],
        afterId: "ci-0",
      }),
    ).toEqual({
      skipped: 0,
      failed: 3,
      cursorContactInboxId: "ci-4",
      isUnderSent: true,
    })
  })
})

describe("waiting out Meta's quota", () => {
  test("a channel asking to wait parks the run and queues the next chunk delayed by that long", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(3))
    mocks.runner.mockResolvedValue({
      results: [
        succeeded("ci-000"),
        {
          contactInboxId: "ci-001",
          status: "deferred",
          error: new ChannelError("quota", ChannelErrorCategory.RATE_LIMITED),
        },
        {
          contactInboxId: "ci-002",
          status: "deferred",
          error: new ChannelError("quota", ChannelErrorCategory.RATE_LIMITED),
        },
      ],
      retryAfterMs: 120_000,
    })
    mocks.yieldForContinuation.mockResolvedValue(7)

    await runAiHandoverBulkToggle(DATA)

    // The deferred contacts are walked again after the pause.
    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 1,
      addFailed: 0,
      cursorContactInboxId: "ci-000",
      inFlightFromId: null,
    })
    expect(mocks.yieldForContinuation).toHaveBeenCalledWith({
      runId: "run-1",
      expect: { claimToken: TOKEN },
      pausedUntil: new Date(NOW.getTime() + 120_000),
    })
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1", chunkSeq: 7 }),
      { delayMs: 121_000 },
    )
    expect(mocks.listEligiblePage).toHaveBeenCalledTimes(1)
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("a delivered takeover whose bookkeeping failed is never walked again after a deferral", async () => {
    mocks.claim.mockResolvedValue(
      run({ action: "disable", message: "A person is here" }),
    )
    mocks.listEligiblePage.mockResolvedValue(rows(3))
    mocks.runner.mockResolvedValue({
      results: [
        {
          contactInboxId: "ci-000",
          status: "deferred",
          error: new ChannelError("quota", ChannelErrorCategory.RATE_LIMITED),
        },
        succeeded("ci-001"),
        {
          contactInboxId: "ci-002",
          status: "deferred",
          error: new ChannelError("quota", ChannelErrorCategory.RATE_LIMITED),
        },
      ],
      retryAfterMs: 120_000,
    })
    // ci-001's message left, but its thread row could not be updated: it would
    // still read as eligible and be messaged twice if the page were re-walked.
    mocks.recordEvent.mockRejectedValue(new Error("db down"))
    mocks.yieldForContinuation.mockResolvedValue(7)

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 0,
      addFailed: 3,
      cursorContactInboxId: "ci-002",
    })
    expect(mocks.yieldForContinuation).toHaveBeenCalled()
  })

  test("a quota running low pauses the run even when every contact was handled", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(2))
    mocks.runner.mockResolvedValue({
      results: [succeeded("ci-000"), succeeded("ci-001")],
      retryAfterMs: 60_000,
    })

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 2,
      cursorContactInboxId: "ci-001",
    })
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(expect.anything(), {
      delayMs: 61_000,
    })
    expect(mocks.finish).not.toHaveBeenCalled()
  })

  test("Meta's estimate is capped so a run is never parked for days", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(1))
    mocks.runner.mockResolvedValue({
      results: [succeeded("ci-000")],
      retryAfterMs: 48 * 60 * 60 * 1000,
    })

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.enqueueChunk).toHaveBeenCalledWith(expect.anything(), {
      delayMs: 6 * 60 * 60 * 1000 + 1000,
    })
  })

  test("a delayed continuation that cannot be queued reopens the run for the sweeper", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(1))
    mocks.runner.mockResolvedValue({
      results: [succeeded("ci-000")],
      retryAfterMs: 60_000,
    })
    mocks.enqueueChunk.mockRejectedValue(new Error("redis down"))

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.reopenReleased).toHaveBeenCalledWith("run-1")
  })

  test("a pause that lost the claim queues nothing", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(1))
    mocks.runner.mockResolvedValue({
      results: [succeeded("ci-000")],
      retryAfterMs: 60_000,
    })
    mocks.yieldForContinuation.mockResolvedValue(null)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.enqueueChunk).not.toHaveBeenCalled()
  })

  test.each([
    "enable",
    "disable",
  ] as const)("a whole %s call refused for rate limit waits it out: nothing counted failed, the batch is not skipped", async (action) => {
    mocks.claim.mockResolvedValue(run({ action, message: "hi" }))
    mocks.listEligiblePage.mockResolvedValue(rows(2))
    mocks.runner.mockRejectedValue(
      new ChannelError("limit", ChannelErrorCategory.RATE_LIMITED),
    )

    await runAiHandoverBulkToggle(DATA)

    // Markers cleared, so a disable does not skip the batch on resume.
    expect(progressCalls().at(-1)).toEqual({
      inFlightFromId: null,
      inFlightToId: null,
    })
    expect(progressCalls().some((p) => (p.addFailed ?? 0) > 0)).toBe(false)
    expect(mocks.enqueueChunk).toHaveBeenCalledWith(expect.anything(), {
      delayMs: 60 * 60 * 1000 + 1000,
    })
    expect(mocks.finish).not.toHaveBeenCalled()
  })
})

describe("a Page token that dies mid-batch", () => {
  test("records what Meta already applied, then fails the run", async () => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage.mockResolvedValue(rows(2))
    mocks.runner.mockResolvedValue([
      succeeded("ci-000"),
      failedResult("ci-001", ChannelErrorCategory.AUTH_FAILED),
    ])

    await runAiHandoverBulkToggle(DATA)

    // The delivered takeover is in the inbox and recorded.
    expect(mocks.recordDelivered).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(progressCalls().at(-1)).toMatchObject({
      addProcessed: 1,
      addFailed: 1,
    })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "tokenInvalid",
    })
  })
})

describe("a takeover message the inbox could not store", () => {
  test("is logged for repair and the thread is still settled (it cannot be sent again)", async () => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage.mockResolvedValueOnce(rows(1))
    runnerSucceeds()
    mocks.recordDelivered.mockResolvedValue(null)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-000" }),
      "[ai-handover-bulk] delivered takeover message missing from the inbox",
    )
    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
  })
})

describe("stopping when the Page or the automation goes away mid-run", () => {
  test("the stop check runs before EVERY batch, so a disconnect between two batches stops the run before the second", async () => {
    mocks.listEligiblePage
      .mockResolvedValueOnce(rows(1, "probe"))
      .mockResolvedValueOnce(rows(50))
    runnerSucceeds()
    mocks.findStopReason
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("pageDisconnected")

    await runAiHandoverBulkToggle(DATA)

    // prepare + batch 1 passed; the check before batch 2 stopped it.
    expect(mocks.findStopReason).toHaveBeenCalledTimes(3)
    expect(mocks.runner).toHaveBeenCalledTimes(1)
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "cancelled",
      currentError: "pageDisconnected",
      // What the first batch did stays counted.
      totalCount: 1,
    })
  })

  test("an automation switched off between batches stops an enable the same way", async () => {
    mocks.listEligiblePage.mockResolvedValue(rows(1, "probe"))
    runnerSucceeds()
    mocks.findStopReason
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("automationStopped")

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "cancelled",
      currentError: "automationStopped",
    })
  })
})

describe("reconciling after a run ends", () => {
  const ended = (outcome: Record<string, unknown> = {}) =>
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject(outcome)

  test("a completed run asks for the Page's next due run", async () => {
    await runAiHandoverBulkToggle(DATA)

    ended({ status: "completed" })
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
    })
  })

  test("a cancelled run does too: the newer revision that cancelled it is waiting", async () => {
    mocks.claim.mockResolvedValue(run({ status: "cancelling" }))

    await runAiHandoverBulkToggle(DATA)

    ended({ status: "cancelled" })
    expect(mocks.reconcile).toHaveBeenCalledTimes(1)
  })

  test("a failed run does too (reconcile itself leaves a failed revision final)", async () => {
    mocks.createRunner.mockRejectedValue(new ThreadControlUnsupportedError())

    await runAiHandoverBulkToggle(DATA)

    ended({ status: "failed" })
    expect(mocks.reconcile).toHaveBeenCalledTimes(1)
  })

  test("a finish that lost the claim does not reconcile: another worker owns the run", async () => {
    mocks.finish.mockResolvedValue(0)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  test("a run that only yields or pauses does not reconcile: it is still live", async () => {
    mocks.listEligiblePage.mockImplementation(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 46_000))
      return Promise.resolve(rows(50))
    })
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.yieldForContinuation).toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  test("a reconcile failure is logged and never fails the finished run's job", async () => {
    mocks.reconcile.mockRejectedValue(new Error("db down"))

    await expect(runAiHandoverBulkToggle(DATA)).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), runId: "run-1" }),
      expect.any(String),
    )
  })
})

describe("accounting that must add up", () => {
  test("a resumed run that hits an unusable Page counts only what is ahead of its cursor", async () => {
    mocks.claim.mockResolvedValue(
      run({
        cursorContactInboxId: "ci-120",
        processedCount: 100,
        failedCount: 20,
      }),
    )
    mocks.createRunner.mockRejectedValue(new Error("auth missing"))
    mocks.countEligible.mockResolvedValue(30)

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.countEligible.mock.calls.at(-1)?.[0]).toMatchObject({
      afterId: "ci-120",
    })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "integrationUnavailable",
      // 120 already walked + 30 ahead: never the Page's whole count again.
      totalCount: 150,
    })
  })

  test("a probe row that is no longer eligible sends nothing, so the NEXT batch is still the one-thread probe, and only after a batch really reached the channel does a full one follow", async () => {
    mocks.listEligiblePage
      .mockResolvedValueOnce(rows(1, "gone"))
      .mockResolvedValueOnce(rows(1, "next"))
    mocks.listStillEligible
      .mockResolvedValueOnce([])
      .mockImplementation(({ ids }: { ids: string[] }) => Promise.resolve(ids))
    runnerSucceeds()

    await runAiHandoverBulkToggle(DATA)

    expect(
      mocks.listEligiblePage.mock.calls.map((call) => call[0].limit),
    ).toEqual([1, 1, 50])
    expect(mocks.runner).toHaveBeenCalledTimes(1)
  })

  test.each([
    [
      "a token Meta rejected",
      () => new ChannelError("x", ChannelErrorCategory.AUTH_FAILED),
      "tokenInvalid",
    ],
  ])("the batch that ends the run on %s is counted failed first", async (_label, error, reason) => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage.mockResolvedValueOnce(rows(3))
    mocks.runner.mockRejectedValue(error())

    await runAiHandoverBulkToggle(DATA)

    expect(progressCalls().at(-1)).toMatchObject({
      addFailed: 3,
      cursorContactInboxId: "ci-002",
      inFlightFromId: null,
    })
    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: reason,
      totalCount: 3,
    })
  })

  test("the third unreachable disable batch in a row is counted failed before the run gives up", async () => {
    mocks.claim.mockResolvedValue(run({ action: "disable", message: "hi" }))
    mocks.listEligiblePage.mockResolvedValue(rows(50))
    mocks.runner.mockRejectedValue(
      new ChannelError("down", ChannelErrorCategory.NETWORK_ERROR),
    )

    await runAiHandoverBulkToggle(DATA)

    expect(mocks.finish.mock.calls[0][0].outcome).toMatchObject({
      status: "failed",
      currentError: "channelUnavailable",
      // All three batches of 50 are in the history, the last one included.
      totalCount: 150,
    })
  })
})
