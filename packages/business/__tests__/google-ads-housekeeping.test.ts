import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listDueForProcessingCheck: vi.fn(),
  applyProcessingResult: vi.fn(),
  redrive: vi.fn(),
  releaseClaim: vi.fn(),
  claimForSending: vi.fn(),
  touchStranded: vi.fn(),
  finishSending: vi.fn(),
  listStranded: vi.fn(),
  getSetup: vi.fn(),
  buildActionContext: vi.fn(),
  runAction: vi.fn(),
  logProviderError: vi.fn(),
  enqueueSend: vi.fn(),
  isSendJobLive: vi.fn(),
  warn: vi.fn(),
  guard: vi.fn(),
  listSyncTargets: vi.fn(),
  refreshSetup: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsConversionEventRepository: {
    listDueForProcessingCheck: mocks.listDueForProcessingCheck,
    applyProcessingResult: mocks.applyProcessingResult,
    redrive: mocks.redrive,
    releaseClaim: mocks.releaseClaim,
    claimForSending: mocks.claimForSending,
    touchStranded: mocks.touchStranded,
    finishSending: mocks.finishSending,
    listStranded: mocks.listStranded,
  },
  integrationGoogleAdsRepository: {
    listSyncTargets: mocks.listSyncTargets,
  },
}))
vi.mock("../src/workspace-lifecycle/with-blocked-owner-guard", () => ({
  withBlockedOwnerGuard: (workspaceId: string, fn: () => Promise<unknown>) =>
    mocks.guard(workspaceId, fn),
}))
vi.mock("@chatbotx.io/integration-google-ads", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/integration-google-ads")>()
  return { ...actual, integration: { runAction: mocks.runAction } }
})
vi.mock("../src/error-log/service", () => ({
  logProviderError: mocks.logProviderError,
}))
vi.mock("../src/integration-google-ads/service", () => ({
  integrationGoogleAdsService: {
    getSetup: mocks.getSetup,
    buildActionContext: mocks.buildActionContext,
    refreshSetup: mocks.refreshSetup,
  },
}))
vi.mock("../src/google-ads/send-queue", () => ({
  enqueueSend: mocks.enqueueSend,
  isSendJobLive: mocks.isSendJobLive,
}))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const {
  pollGoogleAdsProcessingStatus,
  sweepStrandedGoogleAdsEvents,
  syncGoogleAdsSetups,
} = await import("../src/google-ads/housekeeping")

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = new Date("2026-10-05T12:00:00Z")
const CLICK_ID = "GCLID-SECRET-123"

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  workspaceId: "ws-1",
  customerId: "cust-1",
  status: "sent",
  attempt: 0,
  claimToken: "claim-1",
  requestId: "req-1",
  clickId: CLICK_ID,
  sentAt: new Date(NOW.getTime() - 4 * HOUR),
  processingAttempts: 0,
  googleClickReceivedAt: new Date(NOW.getTime() - 3 * DAY),
  ...overrides,
})

const reqStatus = (requestStatus: string, reasons: string[] = []) => ({
  requestStatus,
  recordCount: 1,
  errorCounts: reasons.map((reason) => ({ reason, recordCount: 1 })),
  warningCounts: [],
})

const poll = () => pollGoogleAdsProcessingStatus(NOW)

const passThroughGuard = () =>
  mocks.guard.mockImplementation(
    (_workspaceId: string, fn: () => Promise<unknown>) => fn(),
  )

describe("pollGoogleAdsProcessingStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    passThroughGuard()
    mocks.listDueForProcessingCheck.mockResolvedValue([makeEvent()])
    mocks.getSetup.mockResolvedValue({
      readiness: "ready",
      connection: { status: "connected" },
      integration: { id: "int", customerId: "cust-1" },
    })
    mocks.buildActionContext.mockResolvedValue({ ctx: true })
    mocks.applyProcessingResult.mockResolvedValue({ id: "evt-1" })
  })

  test("a duplicate-only failure finishes processed with duplicateRecovery, fenced by the poll", async () => {
    mocks.runAction.mockResolvedValue([
      {
        requestStatus: "FAILED",
        recordCount: 1,
        errorCounts: [
          {
            reason: "PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID",
            recordCount: 1,
          },
        ],
        warningCounts: [],
      },
    ])
    await poll()

    expect(mocks.applyProcessingResult).toHaveBeenCalledTimes(1)
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith({
      id: "evt-1",
      workspaceId: "ws-1",
      to: "processed",
      processingStatus: "success",
      processingDetail: {
        requestStatus: "FAILED",
        recordCount: 1,
        errorCounts: [],
        warningCounts: [],
        duplicateRecovery: true,
      },
      nextProcessingCheckAt: null,
      processingAttempts: 1,
      expectedRequestId: "req-1",
      expectedAttempt: 0,
    })
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("a duplicate mixed with DENIED_CONSENT still fails the event", async () => {
    mocks.runAction.mockResolvedValue([
      {
        requestStatus: "FAILED",
        recordCount: 1,
        errorCounts: [
          { reason: "DUPLICATE_GCLID", recordCount: 1 },
          { reason: "DENIED_CONSENT", recordCount: 1 },
        ],
        warningCounts: [],
      },
    ])
    await poll()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed", failureStage: "processing" }),
    )
  })

  test("a duplicate whose generation moved on is ignored as a stale poll", async () => {
    mocks.applyProcessingResult.mockResolvedValue(null)
    mocks.runAction.mockResolvedValue([
      {
        requestStatus: "FAILED",
        recordCount: 1,
        errorCounts: [{ reason: "DUPLICATE_GCLID", recordCount: 1 }],
        warningCounts: [],
      },
    ])
    await poll()

    expect(mocks.warn).toHaveBeenCalled()
  })

  test("lists due events with the supplied now and a 100 page size", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([])
    await poll()
    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledTimes(1)
    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledWith({
      now: NOW,
      limit: 100,
    })
  })

  test("defaults now to the current time", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([])
    await pollGoogleAdsProcessingStatus()
    const arg = mocks.listDueForProcessingCheck.mock.calls[0][0]
    expect(arg.now).toBeInstanceOf(Date)
  })

  test("SUCCESS marks the event processed and stops polling", async () => {
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])
    await poll()

    expect(mocks.runAction).toHaveBeenCalledWith("retrieveRequestStatus", {
      ctx: { ctx: true },
      props: { requestId: "req-1" },
    })
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith({
      id: "evt-1",
      workspaceId: "ws-1",
      to: "processed",
      processingStatus: "success",
      processingDetail: {
        requestStatus: "SUCCESS",
        recordCount: 1,
        errorCounts: [],
        warningCounts: [],
      },
      nextProcessingCheckAt: null,
      processingAttempts: 1,
      expectedRequestId: "req-1",
      expectedAttempt: 0,
    })
  })

  test("a stale poll (event moved to a newer generation) logs and writes nothing else", async () => {
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])
    mocks.applyProcessingResult.mockResolvedValue(null)
    await poll()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRequestId: "req-1",
        expectedAttempt: 0,
      }),
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      { eventId: "evt-1", attempt: 0 },
      expect.stringContaining("stale processing poll"),
    )
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(CLICK_ID)
  })

  test("the processing-failure redrive is fenced on the polled request id and generation", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ attempt: 2, requestId: "req-9" }),
    ])
    mocks.runAction.mockResolvedValue([
      reqStatus("FAILED", ["PROCESSING_ERROR_REASON_INTERNAL_ERROR"]),
    ])
    mocks.redrive.mockResolvedValue(null)
    await poll()

    expect(mocks.redrive).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAttempt: 2,
        expectedRequestId: "req-9",
      }),
    )
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("open-ended Google reasons are bounded to enum shapes and 1000 chars", async () => {
    const long = Array.from(
      { length: 30 },
      (_, i) => `REASON_${i}_${"A".repeat(60)}`,
    )
    mocks.runAction.mockResolvedValue([
      reqStatus("FAILED", [`free text ${CLICK_ID}`, "x".repeat(500), ...long]),
    ])
    await poll()

    const call = mocks.applyProcessingResult.mock.calls[0][0]
    expect(call.error.length).toBeLessThanOrEqual(1000)
    expect(call.error.startsWith("UNKNOWN, UNKNOWN, REASON_0_")).toBe(true)
    expect(call.error).not.toContain(CLICK_ID)
    expect(call.processingDetail.errorCounts[0].reason).toBe("UNKNOWN")
  })

  test("FAILED marks the event failed(processing) and logs a provider error", async () => {
    mocks.runAction.mockResolvedValue([
      reqStatus("FAILED", ["PROCESSING_ERROR_REASON_INVALID_GCLID"]),
    ])
    await poll()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "failed",
        processingStatus: "failed",
        failureStage: "processing",
        error: "PROCESSING_ERROR_REASON_INVALID_GCLID",
        nextProcessingCheckAt: null,
        processingAttempts: 1,
        processingDetail: expect.objectContaining({
          requestStatus: "FAILED",
          errorCounts: [
            { reason: "PROCESSING_ERROR_REASON_INVALID_GCLID", recordCount: 1 },
          ],
        }),
      }),
    )
    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google-ads", workspaceId: "ws-1" }),
    )
    expect(mocks.redrive).not.toHaveBeenCalled()
  })

  test("a delayed capture Google rejects as too old (EVENT_TOO_OLD) is failed(processing) without redrive", async () => {
    // Real click 95 d ago, receipt 85 d ago: sent locally, expired by Google.
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({
        googleClickReceivedAt: new Date(NOW.getTime() - 85 * DAY),
      }),
    ])
    mocks.runAction.mockResolvedValue([
      reqStatus("FAILED", ["PROCESSING_ERROR_REASON_EVENT_TOO_OLD"]),
    ])
    await poll()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "failed",
        failureStage: "processing",
        error: "PROCESSING_ERROR_REASON_EVENT_TOO_OLD",
        nextProcessingCheckAt: null,
      }),
    )
    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("PARTIAL_SUCCESS is recorded as partial_success failure", async () => {
    mocks.runAction.mockResolvedValue([
      reqStatus("PARTIAL_SUCCESS", ["PROCESSING_ERROR_REASON_INVALID_GCLID"]),
    ])
    await poll()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "failed",
        processingStatus: "partial_success",
        failureStage: "processing",
      }),
    )
  })

  test("a failure without error counts uses the request status as the message", async () => {
    mocks.runAction.mockResolvedValue([reqStatus("FAILED")])
    await poll()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ error: "FAILED" }),
    )
  })

  test("does not log a provider error when the failure transition was lost", async () => {
    mocks.runAction.mockResolvedValue([reqStatus("FAILED", ["X"])])
    mocks.applyProcessingResult.mockResolvedValue(null)
    await poll()
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("a transient Google failure is redriven as a new generation after 6h", async () => {
    const redriven = makeEvent({ attempt: 1 })
    mocks.runAction.mockResolvedValue([
      reqStatus("FAILED", ["PROCESSING_ERROR_REASON_INTERNAL_ERROR"]),
    ])
    mocks.redrive.mockResolvedValue(redriven)

    await poll()

    expect(mocks.redrive).toHaveBeenCalledWith({
      id: "evt-1",
      workspaceId: "ws-1",
      fromStatuses: ["sent"],
      expectedAttempt: 0,
      expectedRequestId: "req-1",
    })
    expect(mocks.enqueueSend).toHaveBeenCalledWith(redriven, 1, 6 * HOUR)
    expect(mocks.applyProcessingResult).not.toHaveBeenCalled()
  })

  test("a transient failure at the generation cap fails instead of redriving", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ attempt: 30 }),
    ])
    mocks.runAction.mockResolvedValue([
      reqStatus("FAILED", ["PROCESSING_ERROR_REASON_INTERNAL_ERROR"]),
    ])

    await poll()

    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed", failureStage: "processing" }),
    )
  })

  test("PROCESSING stays sent and backs off by the poll count", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ processingAttempts: 1 }),
    ])
    mocks.runAction.mockResolvedValue([reqStatus("PROCESSING")])
    await poll()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith({
      id: "evt-1",
      workspaceId: "ws-1",
      to: "sent",
      processingStatus: "processing",
      nextProcessingCheckAt: new Date(NOW.getTime() + 6 * HOUR),
      processingAttempts: 2,
      expectedRequestId: "req-1",
      expectedAttempt: 0,
    })
  })

  test("an unrecognised response stays sent as unknown", async () => {
    mocks.runAction.mockResolvedValue([])
    await poll()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sent",
        processingStatus: "unknown",
        nextProcessingCheckAt: new Date(NOW.getTime() + 3 * HOUR),
      }),
    )
  })

  test("times out a request unresolved for more than 7 days", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ sentAt: new Date(NOW.getTime() - 8 * DAY) }),
    ])
    await poll()

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "failed",
        processingStatus: "timed_out",
        failureStage: "timeout",
        nextProcessingCheckAt: null,
      }),
    )
  })

  test("does not time out a request sent 6 days ago", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ sentAt: new Date(NOW.getTime() - 6 * DAY) }),
    ])
    mocks.runAction.mockResolvedValue([reqStatus("PROCESSING")])
    await poll()
    expect(mocks.runAction).toHaveBeenCalled()
  })

  test.each([
    ["no setup", null],
    [
      "needs_reauth",
      {
        connection: { status: "needs_reauth" },
        integration: { id: "int", customerId: "cust-1" },
      },
    ],
    [
      "customerId mismatch",
      {
        connection: { status: "connected" },
        integration: { id: "int", customerId: "other" },
      },
    ],
  ])("reschedules without calling Google when %s", async (_n, setup) => {
    mocks.getSetup.mockResolvedValue(setup)
    await poll()
    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sent", processingStatus: "unknown" }),
    )
  })

  test("blocked owner reschedules as unknown without calling Google", async () => {
    mocks.guard.mockResolvedValue(undefined)
    await poll()
    expect(mocks.getSetup).not.toHaveBeenCalled()
    expect(mocks.buildActionContext).not.toHaveBeenCalled()
    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt-1",
        to: "sent",
        processingStatus: "unknown",
      }),
    )
    expect(mocks.guard).toHaveBeenCalledWith("ws-1", expect.any(Function))
  })

  test("needs_reauth does not build an action context", async () => {
    mocks.getSetup.mockResolvedValue({
      connection: { status: "needs_reauth" },
      integration: { id: "int", customerId: "cust-1" },
    })
    await poll()
    expect(mocks.buildActionContext).not.toHaveBeenCalled()
  })

  test("pages while a page is full and stops at a short page", async () => {
    const full = Array.from({ length: 100 }, (_v, i) =>
      makeEvent({ id: `evt-${i}` }),
    )
    mocks.listDueForProcessingCheck
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([makeEvent({ id: "evt-last" })])
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])

    await poll()

    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledTimes(2)
    expect(mocks.runAction).toHaveBeenCalledTimes(101)
  })

  test("stops after an empty second page", async () => {
    const full = Array.from({ length: 100 }, (_v, i) =>
      makeEvent({ id: `evt-${i}` }),
    )
    mocks.listDueForProcessingCheck
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([])
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])

    await poll()

    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledTimes(2)
  })

  test("drains well past the old 10-page cap while every page is full", async () => {
    const full = Array.from({ length: 100 }, (_v, i) =>
      makeEvent({ id: `evt-${i}` }),
    )
    mocks.listDueForProcessingCheck
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([makeEvent({ id: "evt-last" })])
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])

    await poll()

    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledTimes(12)
  })

  test("stops at the 50 page safety ceiling", async () => {
    const full = Array.from({ length: 100 }, (_v, i) =>
      makeEvent({ id: `evt-${i}` }),
    )
    mocks.listDueForProcessingCheck.mockResolvedValue(full)
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])

    await poll()

    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledTimes(50)
  })

  test("stops draining once the 5 minute time budget is spent", async () => {
    const full = Array.from({ length: 100 }, (_v, i) =>
      makeEvent({ id: `evt-${i}` }),
    )
    mocks.listDueForProcessingCheck.mockResolvedValue(full)
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])
    let clock = 1_000_000
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      const value = clock
      clock += 2 * 60 * 1000
      return value
    })

    try {
      await poll()
    } finally {
      dateNow.mockRestore()
    }

    // deadline read at t=0, page 1 check at +2min, page 2 at +4min, page 3 at +6min
    expect(mocks.listDueForProcessingCheck).toHaveBeenCalledTimes(3)
  })

  test("polls at most four events at a time", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue(
      Array.from({ length: 10 }, (_v, i) => makeEvent({ id: `evt-${i}` })),
    )
    let inFlight = 0
    let peak = 0
    mocks.runAction.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return [reqStatus("SUCCESS")]
    })

    await poll()

    expect(mocks.runAction).toHaveBeenCalledTimes(10)
    expect(peak).toBe(4)
  })

  test("a failing reschedule is logged and does not abort the run", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ id: "evt-bad" }),
      makeEvent({ id: "evt-good" }),
    ])
    mocks.runAction
      .mockRejectedValueOnce(new Error("google down"))
      .mockResolvedValueOnce([reqStatus("SUCCESS")])
    mocks.applyProcessingResult.mockImplementation(
      (input: { id: string; to: string }) =>
        input.id === "evt-bad"
          ? Promise.reject(new Error(`db down for ${CLICK_ID}`))
          : Promise.resolve({ id: input.id }),
    )

    await expect(poll()).resolves.toBeUndefined()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-good", to: "processed" }),
    )
    expect(mocks.warn).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(CLICK_ID)
  })

  test("loads setup and action context once per workspace per run", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ id: "a" }),
      makeEvent({ id: "b" }),
      makeEvent({ id: "c" }),
    ])
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])

    await poll()

    expect(mocks.getSetup).toHaveBeenCalledTimes(1)
    expect(mocks.buildActionContext).toHaveBeenCalledTimes(1)
    expect(mocks.runAction).toHaveBeenCalledTimes(3)
  })

  test("memoizes per workspace, not globally", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ id: "a", workspaceId: "ws-1" }),
      makeEvent({ id: "b", workspaceId: "ws-2" }),
      makeEvent({ id: "c", workspaceId: "ws-1" }),
    ])
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])

    await poll()

    expect(mocks.getSetup).toHaveBeenCalledTimes(2)
    expect(mocks.getSetup).toHaveBeenCalledWith("ws-1")
    expect(mocks.getSetup).toHaveBeenCalledWith("ws-2")
  })

  test("does not reuse the memo across runs", async () => {
    mocks.runAction.mockResolvedValue([reqStatus("SUCCESS")])
    await poll()
    await poll()
    expect(mocks.getSetup).toHaveBeenCalledTimes(2)
  })

  test("a legacy event never reaches requestStatus:retrieve, by method or by id namespace", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ id: "legacy-1", uploadMethod: "legacy" }),
      makeEvent({
        id: "legacy-2",
        uploadMethod: "dataManager",
        requestId: "legacy:123",
      }),
    ])

    await poll()

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.applyProcessingResult).not.toHaveBeenCalled()
  })

  test("reschedules when the event has no request id", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ requestId: null }),
    ])
    await poll()
    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sent", processingStatus: "unknown" }),
    )
  })

  test("isolates a failing row, sanitizes its log and still polls the rest", async () => {
    mocks.listDueForProcessingCheck.mockResolvedValue([
      makeEvent({ id: "evt-bad" }),
      makeEvent({ id: "evt-good" }),
    ])
    mocks.runAction
      .mockRejectedValueOnce(new Error(`upstream echoed gclid=${CLICK_ID}`))
      .mockResolvedValueOnce([reqStatus("SUCCESS")])

    await expect(poll()).resolves.toBeUndefined()

    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt-bad",
        to: "sent",
        processingStatus: "unknown",
      }),
    )
    expect(mocks.applyProcessingResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-good", to: "processed" }),
    )
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.warn.mock.calls[0])).not.toContain(CLICK_ID)
  })
})

describe("sweepStrandedGoogleAdsEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    passThroughGuard()
    mocks.isSendJobLive.mockResolvedValue(false)
  })

  const sweep = () => sweepStrandedGoogleAdsEvents(NOW, 20)

  test("defaults the limit to 200", async () => {
    mocks.listStranded.mockResolvedValue([])
    await sweepStrandedGoogleAdsEvents(NOW)
    expect(mocks.listStranded).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    )
  })

  test("queries stranded events with the documented cutoffs", async () => {
    mocks.listStranded.mockResolvedValue([])
    await sweep()
    expect(mocks.listStranded).toHaveBeenCalledWith({
      pendingOlderThan: new Date(NOW.getTime() - 10 * 60 * 1000),
      sixHourGateBefore: new Date(NOW.getTime() - 6 * HOUR),
      sendingOlderThan: new Date(NOW.getTime() - 15 * 60 * 1000),
      limit: 20,
    })
  })

  test("redrives a pending event whose job is dead, delayed by the click age", async () => {
    const stranded = makeEvent({ status: "pending", attempt: 2 })
    const redriven = makeEvent({
      status: "pending",
      attempt: 3,
      googleClickReceivedAt: new Date(NOW.getTime() - 2 * HOUR),
    })
    mocks.listStranded.mockResolvedValue([stranded])
    mocks.redrive.mockResolvedValue(redriven)

    await sweep()

    expect(mocks.isSendJobLive).toHaveBeenCalledWith("evt-1", 2)
    expect(mocks.redrive).toHaveBeenCalledWith({
      id: "evt-1",
      workspaceId: "ws-1",
      fromStatuses: ["pending"],
      expectedAttempt: 2,
      expectedClaimToken: "claim-1",
    })
    expect(mocks.enqueueSend).toHaveBeenCalledWith(redriven, 3, 4 * HOUR)
  })

  test("a stranded legacy event is redriven exactly like any other (sweeper unchanged)", async () => {
    mocks.listStranded.mockResolvedValue([
      makeEvent({
        status: "sending",
        uploadMethod: "legacy",
        attempt: 1,
      }),
    ])
    mocks.redrive.mockResolvedValue({
      id: "evt-1",
      workspaceId: "ws-1",
      attempt: 2,
      googleClickReceivedAt: new Date(NOW.getTime() - 3 * DAY),
    })

    await sweepStrandedGoogleAdsEvents(NOW)

    expect(mocks.redrive).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatuses: ["sending"],
        expectedAttempt: 1,
      }),
    )
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
  })

  test("skips a pending event whose job is still live", async () => {
    mocks.listStranded.mockResolvedValue([makeEvent({ status: "pending" })])
    mocks.isSendJobLive.mockResolvedValue(true)
    await sweep()
    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("redrives a sending event with a stale claim without checking the job", async () => {
    const redriven = makeEvent({ status: "pending", attempt: 1 })
    mocks.listStranded.mockResolvedValue([makeEvent({ status: "sending" })])
    mocks.redrive.mockResolvedValue(redriven)

    await sweep()

    expect(mocks.isSendJobLive).not.toHaveBeenCalled()
    expect(mocks.redrive).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatuses: ["sending"] }),
    )
    expect(mocks.enqueueSend).toHaveBeenCalledWith(redriven, 1, 0)
  })

  test("does not enqueue when another worker already redrove the event", async () => {
    mocks.listStranded.mockResolvedValue([makeEvent({ status: "sending" })])
    mocks.redrive.mockResolvedValue(null)
    await sweep()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("runs each redrive under the blocked-owner guard for its workspace", async () => {
    mocks.listStranded.mockResolvedValue([makeEvent({ status: "sending" })])
    mocks.redrive.mockResolvedValue(makeEvent({ attempt: 1 }))
    await sweep()
    expect(mocks.guard).toHaveBeenCalledWith("ws-1", expect.any(Function))
  })

  test("a blocked workspace's stranded sending row is released to pending on the same generation", async () => {
    const event = makeEvent({ status: "sending", attempt: 5 })
    mocks.listStranded.mockResolvedValue([event])
    mocks.guard.mockResolvedValue(undefined)
    mocks.releaseClaim.mockResolvedValue(makeEvent({ status: "pending" }))
    await sweep()
    expect(mocks.releaseClaim).toHaveBeenCalledTimes(1)
    expect(mocks.releaseClaim).toHaveBeenCalledWith({
      id: event.id,
      workspaceId: event.workspaceId,
      claimToken: "claim-1",
      nextAttempt: 5,
    })
    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
    expect(mocks.touchStranded).not.toHaveBeenCalled()
  })

  test("a blocked sending row whose release lost the claim race is touched", async () => {
    const event = makeEvent({ status: "sending", attempt: 5 })
    mocks.listStranded.mockResolvedValue([event])
    mocks.guard.mockResolvedValue(undefined)
    mocks.releaseClaim.mockResolvedValue(null)
    await sweep()
    expect(mocks.touchStranded).toHaveBeenCalledWith(event)
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("a blocked sending row at the generation cap is released, not touched or failed", async () => {
    const event = makeEvent({ status: "sending", attempt: 30 })
    mocks.listStranded.mockResolvedValue([event])
    mocks.guard.mockResolvedValue(undefined)
    mocks.releaseClaim.mockResolvedValue(makeEvent({ status: "pending" }))
    await sweep()
    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ id: event.id, nextAttempt: 30 }),
    )
    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.touchStranded).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("a window full of capped blocked sending rows is cleared so the next window reaches others", async () => {
    const capped = Array.from({ length: 3 }, (_, i) =>
      makeEvent({
        id: `evt-cap-${i}`,
        workspaceId: "ws-blocked",
        status: "sending",
        attempt: 30,
        claimToken: `claim-${i}`,
      }),
    )
    const healthy = makeEvent({
      id: "evt-ok",
      workspaceId: "ws-ok",
      status: "sending",
    })
    // Sweep 1 (limit 3) sees only the capped rows; sweep 2 sees what is left.
    mocks.listStranded
      .mockResolvedValueOnce(capped)
      .mockResolvedValueOnce([healthy])
    mocks.guard.mockImplementation(
      async (workspaceId: string, fn: () => Promise<unknown>) =>
        workspaceId === "ws-blocked" ? undefined : fn(),
    )
    mocks.releaseClaim.mockResolvedValue(makeEvent({ status: "pending" }))
    mocks.redrive.mockResolvedValue(makeEvent({ id: "evt-ok", attempt: 1 }))

    await sweep()
    await sweep()

    expect(mocks.releaseClaim).toHaveBeenCalledTimes(3)
    expect(
      mocks.releaseClaim.mock.calls.map(([arg]) => arg.claimToken),
    ).toEqual(["claim-0", "claim-1", "claim-2"])
    expect(mocks.redrive).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend.mock.calls[0][0].id).toBe("evt-ok")
  })

  test("touches a blocked workspace's pending row with its status and attempt", async () => {
    const event = makeEvent({ status: "pending", attempt: 2 })
    mocks.listStranded.mockResolvedValue([event])
    mocks.guard.mockResolvedValue(undefined)
    await sweep()
    expect(mocks.touchStranded).toHaveBeenCalledTimes(1)
    expect(mocks.touchStranded).toHaveBeenCalledWith(event)
    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("does not touch a healthy row that was redriven", async () => {
    mocks.listStranded.mockResolvedValue([makeEvent({ status: "sending" })])
    mocks.redrive.mockResolvedValue(makeEvent({ attempt: 1 }))
    await sweep()
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
    expect(mocks.touchStranded).not.toHaveBeenCalled()
  })

  test("touches a pending row whose job is still live so it rotates out of the window", async () => {
    const live = makeEvent({ status: "pending" })
    mocks.listStranded.mockResolvedValue([live])
    mocks.isSendJobLive.mockResolvedValue(true)
    await sweep()
    expect(mocks.touchStranded).toHaveBeenCalledWith(live)
    expect(mocks.redrive).not.toHaveBeenCalled()
    expect(mocks.guard).not.toHaveBeenCalled()
  })

  test("a failing touch is logged and does not stop the sweep", async () => {
    mocks.listStranded.mockResolvedValue([
      makeEvent({
        id: "evt-blocked",
        workspaceId: "ws-blocked",
        status: "pending",
      }),
      makeEvent({ id: "evt-ok", workspaceId: "ws-ok", status: "sending" }),
    ])
    mocks.guard.mockImplementation(
      async (workspaceId: string, fn: () => Promise<unknown>) =>
        workspaceId === "ws-blocked" ? undefined : fn(),
    )
    mocks.touchStranded.mockRejectedValue(new Error("db down"))
    mocks.redrive.mockResolvedValue(makeEvent({ id: "evt-ok", attempt: 1 }))

    await expect(sweep()).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend.mock.calls[0][0].id).toBe("evt-ok")
  })

  test("a failing blocked-row release is logged and does not stop the sweep", async () => {
    mocks.listStranded.mockResolvedValue([
      makeEvent({
        id: "evt-blocked",
        workspaceId: "ws-blocked",
        status: "sending",
      }),
      makeEvent({ id: "evt-ok", workspaceId: "ws-ok", status: "sending" }),
    ])
    mocks.guard.mockImplementation(
      async (workspaceId: string, fn: () => Promise<unknown>) =>
        workspaceId === "ws-blocked" ? undefined : fn(),
    )
    mocks.releaseClaim.mockRejectedValue(new Error("db down"))
    mocks.redrive.mockResolvedValue(makeEvent({ id: "evt-ok", attempt: 1 }))
    await expect(sweep()).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend.mock.calls[0][0].id).toBe("evt-ok")
  })

  test("a blocked workspace does not stop other workspaces", async () => {
    mocks.listStranded.mockResolvedValue([
      makeEvent({ id: "evt-b", workspaceId: "ws-blocked", status: "sending" }),
      makeEvent({ id: "evt-ok", workspaceId: "ws-ok", status: "sending" }),
    ])
    mocks.guard.mockImplementation(
      async (workspaceId: string, fn: () => Promise<unknown>) =>
        workspaceId === "ws-blocked" ? undefined : fn(),
    )
    mocks.releaseClaim.mockResolvedValue(makeEvent({ status: "pending" }))
    mocks.redrive.mockResolvedValue(makeEvent({ id: "evt-ok", attempt: 1 }))
    await sweep()
    expect(mocks.releaseClaim).toHaveBeenCalledTimes(1)
    expect(mocks.redrive).toHaveBeenCalledTimes(1)
    expect(mocks.redrive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-ok", workspaceId: "ws-ok" }),
    )
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
  })

  describe("at the redrive generation cap", () => {
    const exhausted = (status: string) =>
      makeEvent({ status, attempt: 30, id: "evt-cap" })

    test.each([
      "pending",
      "sending",
    ])("fails a stranded %s event instead of redriving it", async (status) => {
      const redriven = makeEvent({
        id: "evt-cap",
        status: "pending",
        attempt: 31,
      })
      const claimed = makeEvent({
        id: "evt-cap",
        status: "sending",
        attempt: 31,
      })
      mocks.listStranded.mockResolvedValue([exhausted(status)])
      mocks.redrive.mockResolvedValue(redriven)
      mocks.claimForSending.mockResolvedValue(claimed)
      mocks.finishSending.mockResolvedValue({ id: "evt-cap" })

      await sweep()

      expect(mocks.redrive).toHaveBeenCalledWith({
        id: "evt-cap",
        workspaceId: "ws-1",
        fromStatuses: [status],
        expectedAttempt: 30,
        expectedClaimToken: "claim-1",
      })
      expect(mocks.claimForSending).toHaveBeenCalledWith({
        id: "evt-cap",
        workspaceId: "ws-1",
        claimToken: expect.any(String),
        attempt: 31,
      })
      const claimToken = mocks.claimForSending.mock.calls[0][0].claimToken
      expect(mocks.finishSending).toHaveBeenCalledTimes(1)
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "evt-cap",
          workspaceId: "ws-1",
          claimToken,
          to: "failed",
          failureStage: "delivery",
          error: expect.any(String),
        }),
      )
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
      expect(mocks.logProviderError).not.toHaveBeenCalled()
    })

    test("does nothing more when the redrive lost the race", async () => {
      mocks.listStranded.mockResolvedValue([exhausted("sending")])
      mocks.redrive.mockResolvedValue(null)
      await sweep()
      expect(mocks.claimForSending).not.toHaveBeenCalled()
      expect(mocks.finishSending).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
      expect(mocks.logProviderError).not.toHaveBeenCalled()
    })

    test("does nothing more when the claim is lost", async () => {
      mocks.listStranded.mockResolvedValue([exhausted("sending")])
      mocks.redrive.mockResolvedValue(makeEvent({ attempt: 31 }))
      mocks.claimForSending.mockResolvedValue(null)
      await sweep()
      expect(mocks.finishSending).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).not.toHaveBeenCalled()
      expect(mocks.logProviderError).not.toHaveBeenCalled()
    })

    test("does not log a provider error even when the failure is recorded", async () => {
      mocks.listStranded.mockResolvedValue([exhausted("pending")])
      mocks.redrive.mockResolvedValue(makeEvent({ attempt: 31 }))
      mocks.claimForSending.mockResolvedValue(makeEvent({ attempt: 31 }))
      mocks.finishSending.mockResolvedValue({ id: "evt-1" })
      await sweep()
      expect(mocks.logProviderError).not.toHaveBeenCalled()
    })

    test("one below the cap still redrives", async () => {
      mocks.listStranded.mockResolvedValue([
        makeEvent({ status: "sending", attempt: 29 }),
      ])
      mocks.redrive.mockResolvedValue(makeEvent({ attempt: 30 }))
      await sweep()
      expect(mocks.claimForSending).not.toHaveBeenCalled()
      expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
    })
  })

  test("one failing event does not stop the sweep", async () => {
    mocks.listStranded.mockResolvedValue([
      makeEvent({ id: "evt-bad", status: "sending" }),
      makeEvent({ id: "evt-good", status: "sending" }),
    ])
    mocks.redrive
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(makeEvent({ id: "evt-good", attempt: 1 }))

    await expect(sweep()).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSend.mock.calls[0][0].id).toBe("evt-good")
  })
})

describe("syncGoogleAdsSetups", () => {
  const target = (id: string) => ({ id, workspaceId: `ws-${id}` })
  const page = (from: number, count: number) =>
    Array.from({ length: count }, (_v, i) => target(`t${from + i}`))

  beforeEach(() => {
    vi.resetAllMocks()
    passThroughGuard()
    mocks.getSetup.mockResolvedValue({ connection: { status: "connected" } })
    mocks.refreshSetup.mockResolvedValue(undefined)
  })

  test("a short first page is the only page, requested without afterId", async () => {
    mocks.listSyncTargets.mockResolvedValue(page(1, 2))
    await syncGoogleAdsSetups()
    expect(mocks.listSyncTargets).toHaveBeenCalledTimes(1)
    expect(mocks.listSyncTargets).toHaveBeenCalledWith({
      afterId: undefined,
      limit: 100,
    })
  })

  test("does nothing for no targets", async () => {
    mocks.listSyncTargets.mockResolvedValue([])
    await syncGoogleAdsSetups()
    expect(mocks.guard).not.toHaveBeenCalled()
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
  })

  test("pages by the last id of a full page", async () => {
    mocks.listSyncTargets
      .mockResolvedValueOnce(page(0, 100))
      .mockResolvedValueOnce(page(100, 3))

    await syncGoogleAdsSetups()

    expect(mocks.listSyncTargets).toHaveBeenCalledTimes(2)
    expect(mocks.listSyncTargets).toHaveBeenNthCalledWith(2, {
      afterId: "t99",
      limit: 100,
    })
    expect(mocks.refreshSetup).toHaveBeenCalledTimes(103)
  })

  test.each([
    "connected",
    "degraded",
  ])("refreshes a %s setup", async (status) => {
    mocks.listSyncTargets.mockResolvedValue([target("1")])
    mocks.getSetup.mockResolvedValue({ connection: { status } })
    await syncGoogleAdsSetups()
    expect(mocks.refreshSetup).toHaveBeenCalledWith("ws-1")
  })

  test("refreshes a connected setup under the blocked-owner guard", async () => {
    mocks.listSyncTargets.mockResolvedValue([target("1")])
    await syncGoogleAdsSetups()
    expect(mocks.guard).toHaveBeenCalledWith("ws-1", expect.any(Function))
    expect(mocks.getSetup).toHaveBeenCalledWith("ws-1")
    expect(mocks.refreshSetup).toHaveBeenCalledWith("ws-1")
  })

  test.each([
    ["no setup", null],
    ["needs_reauth", { connection: { status: "needs_reauth" } }],
    ["paused", { connection: { status: "paused" } }],
    ["disconnected", { connection: { status: "disconnected" } }],
    ["no connection", { connection: null }],
  ])("skips refresh when %s", async (_n, setup) => {
    mocks.listSyncTargets.mockResolvedValue([target("1")])
    mocks.getSetup.mockResolvedValue(setup)
    await syncGoogleAdsSetups()
    expect(mocks.refreshSetup).not.toHaveBeenCalled()
  })

  test("skips a blocked owner without reading the setup", async () => {
    mocks.listSyncTargets.mockResolvedValue([target("1"), target("2")])
    mocks.guard.mockImplementation(
      async (workspaceId: string, fn: () => Promise<unknown>) =>
        workspaceId === "ws-1" ? undefined : fn(),
    )

    await syncGoogleAdsSetups()

    expect(mocks.getSetup).toHaveBeenCalledTimes(1)
    expect(mocks.getSetup).toHaveBeenCalledWith("ws-2")
    expect(mocks.refreshSetup).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSetup).toHaveBeenCalledWith("ws-2")
  })

  test("one failing row is logged and does not stop the others", async () => {
    mocks.listSyncTargets.mockResolvedValue([
      target("1"),
      target("2"),
      target("3"),
    ])
    mocks.refreshSetup
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("google down"))
      .mockResolvedValueOnce(undefined)

    await expect(syncGoogleAdsSetups()).resolves.toBeUndefined()

    expect(mocks.refreshSetup).toHaveBeenCalledTimes(3)
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-2" }),
      expect.any(String),
    )
  })

  test("a failing getSetup is also isolated per row", async () => {
    mocks.listSyncTargets.mockResolvedValue([target("1"), target("2")])
    mocks.getSetup
      .mockRejectedValueOnce(new Error("db"))
      .mockResolvedValueOnce({ connection: { status: "connected" } })

    await syncGoogleAdsSetups()

    expect(mocks.refreshSetup).toHaveBeenCalledTimes(1)
    expect(mocks.refreshSetup).toHaveBeenCalledWith("ws-2")
  })
})
