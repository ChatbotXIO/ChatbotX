import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimForSending: vi.fn(),
  finishSending: vi.fn(),
  finishSendingProcessed: vi.fn(),
  markSendAttempted: vi.fn(),
  releaseClaim: vi.fn(),
  getSetup: vi.fn(),
  buildActionContext: vi.fn(),
  resolveDeveloperToken: vi.fn(),
  runAction: vi.fn(),
  logProviderError: vi.fn(),
  enqueueSend: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsConversionEventRepository: {
    claimForSending: mocks.claimForSending,
    finishSending: mocks.finishSending,
    finishSendingProcessed: mocks.finishSendingProcessed,
    markSendAttempted: mocks.markSendAttempted,
    releaseClaim: mocks.releaseClaim,
  },
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
    resolveDeveloperToken: mocks.resolveDeveloperToken,
  },
}))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))
vi.mock("../src/google-ads/send-queue", () => ({
  enqueueSend: mocks.enqueueSend,
}))

const { GoogleAdsException } = await import(
  "@chatbotx.io/integration-google-ads"
)
const { deliverGoogleAdsConversion } = await import(
  "../src/google-ads/delivery"
)

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const CLICK_ID = "GCLID-SECRET-123"
const STAMP = "2026-10-06T00:00:00.000Z"

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  workspaceId: "ws-1",
  attempt: 2,
  customerId: "1112223333",
  conversionCustomerId: "7778889999",
  conversionActionId: "999",
  transactionId: "gads-999-order-1",
  clickIdType: "gclid",
  clickId: CLICK_ID,
  googleClickReceivedAt: new Date(Date.now() - 2 * DAY),
  occurredAt: new Date(Date.now() - DAY),
  lookbackWindowDays: 30,
  value: "12.50",
  currency: "USD",
  uploadMethod: "legacy",
  processingDetail: null,
  ...overrides,
})

const setup = {
  readiness: "ready",
  connection: { status: "active" },
  // The CURRENT connection is Data Manager: the event's pin must still win.
  integration: {
    customerId: "1112223333",
    loginCustomerId: "4445556666",
    conversionCustomerId: "7778889999",
    auth: { metadata: { uploadMethod: "dataManager" } },
  },
}

const run = (overrides: Record<string, unknown> = {}) =>
  deliverGoogleAdsConversion({
    eventId: "evt-1",
    workspaceId: "ws-1",
    attempt: 2,
    isLastInJobAttempt: false,
    ...overrides,
  })

const completed = {
  kind: "completed",
  requestId: "legacy:12345",
  fieldWarnings: [],
}

describe("legacy delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.claimForSending.mockResolvedValue(makeEvent())
    mocks.getSetup.mockResolvedValue(setup)
    mocks.buildActionContext.mockResolvedValue({ ctx: true })
    mocks.resolveDeveloperToken.mockResolvedValue({
      kind: "available",
      developerToken: undefined,
    })
    mocks.markSendAttempted.mockResolvedValue(
      makeEvent({ processingDetail: { sendAttemptedAt: STAMP } }),
    )
    mocks.finishSendingProcessed.mockResolvedValue({ id: "evt-1" })
    mocks.finishSending.mockResolvedValue({ id: "evt-1" })
    mocks.releaseClaim.mockResolvedValue({
      id: "evt-1",
      attempt: 3,
      workspaceId: "ws-1",
    })
    mocks.runAction.mockResolvedValue(completed)
  })

  test("routes by the event's pinned method, stamps the attempt first, and completes directly", async () => {
    const order: string[] = []
    mocks.markSendAttempted.mockImplementation(() => {
      order.push("mark")
      return Promise.resolve(
        makeEvent({ processingDetail: { sendAttemptedAt: STAMP } }),
      )
    })
    mocks.runAction.mockImplementation(() => {
      order.push("send")
      return Promise.resolve(completed)
    })

    await run()

    expect(order).toEqual(["mark", "send"])
    expect(mocks.runAction).toHaveBeenCalledWith(
      "ingestEvent",
      expect.objectContaining({
        props: expect.objectContaining({ uploadMethod: "legacy" }),
      }),
    )
    const claimToken = mocks.claimForSending.mock.calls[0]?.[0].claimToken
    expect(mocks.markSendAttempted).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken, attempt: 2 }),
    )
    expect(mocks.finishSendingProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt-1",
        workspaceId: "ws-1",
        claimToken,
        attempt: 2,
        requestId: "legacy:12345",
        processingDetail: expect.objectContaining({
          requestStatus: "LEGACY_UPLOAD_COMPLETED",
          sendAttemptedAt: STAMP,
        }),
      }),
    )
    expect(mocks.finishSending).not.toHaveBeenCalled()
  })

  test("sends the owner's optional developer token only when present", async () => {
    mocks.resolveDeveloperToken.mockResolvedValue({
      kind: "available",
      developerToken: "dev-token-abc",
    })

    await run()

    expect(mocks.resolveDeveloperToken).toHaveBeenCalledWith("ws-1")
    expect(mocks.runAction.mock.calls[0]?.[1].props.developerToken).toBe(
      "dev-token-abc",
    )
  })

  test("an event row without a method (old fixture) is Data Manager and never stamps", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({ uploadMethod: undefined }),
    )
    mocks.runAction.mockResolvedValue({ kind: "accepted", requestId: "dm-1" })

    await run()

    expect(mocks.markSendAttempted).not.toHaveBeenCalled()
    expect(mocks.resolveDeveloperToken).not.toHaveBeenCalled()
    expect(mocks.runAction.mock.calls[0]?.[1].props.uploadMethod).toBe(
      "dataManager",
    )
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sent", requestId: "dm-1" }),
    )
    expect(mocks.finishSendingProcessed).not.toHaveBeenCalled()
  })

  test("a worker that lost the lease before sending never calls Google", async () => {
    mocks.markSendAttempted.mockResolvedValue(null)

    await run()

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  test("a stale lease at completion is logged and writes nothing else", async () => {
    mocks.finishSendingProcessed.mockResolvedValue(null)

    await run()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(mocks.finishSending).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(CLICK_ID)
  })

  describe("transient partial failures", () => {
    test.each([
      ["tooRecent", 6 * HOUR],
      ["transient", HOUR],
    ])("%s releases the lease and requeues after the right delay", async (reason, delay) => {
      mocks.runAction.mockResolvedValue({ kind: "retry", reason })

      await run()

      expect(mocks.releaseClaim).toHaveBeenCalledWith(
        expect.objectContaining({ nextAttempt: 3 }),
      )
      expect(mocks.enqueueSend).toHaveBeenCalledWith(
        expect.anything(),
        3,
        delay,
      )
      expect(mocks.finishSendingProcessed).not.toHaveBeenCalled()
    })

    test("generations are bounded: the last one fails terminally", async () => {
      mocks.claimForSending.mockResolvedValue(makeEvent({ attempt: 30 }))
      mocks.runAction.mockResolvedValue({ kind: "retry", reason: "transient" })

      await run({ attempt: 30 })

      expect(mocks.releaseClaim).not.toHaveBeenCalled()
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({ to: "failed", failureStage: "delivery" }),
      )
    })
  })

  describe("duplicate-class answers (C3)", () => {
    test("on a first attempt it is a terminal failure", async () => {
      mocks.markSendAttempted.mockResolvedValue(
        makeEvent({ processingDetail: { sendAttemptedAt: STAMP } }),
      )
      mocks.runAction.mockResolvedValue({ kind: "duplicate" })

      await run()

      expect(mocks.finishSendingProcessed).not.toHaveBeenCalled()
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({ to: "failed", failureStage: "delivery" }),
      )
    })

    test("on a replay it is recovered as processed with duplicateRecovery", async () => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ processingDetail: { sendAttemptedAt: STAMP } }),
      )
      mocks.runAction.mockResolvedValue({ kind: "duplicate" })

      await run()

      expect(mocks.finishSendingProcessed).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "legacy:recovered",
          processingDetail: expect.objectContaining({
            duplicateRecovery: true,
            sendAttemptedAt: STAMP,
          }),
        }),
      )
      expect(mocks.finishSending).not.toHaveBeenCalled()
    })

    test("Google success -> DB write failure -> redelivery ends processed, once", async () => {
      // First delivery: Google records it, then the completion write throws.
      mocks.finishSendingProcessed.mockRejectedValueOnce(
        new Error(`connection reset while writing ${CLICK_ID}`),
      )
      const firstError = await run().catch((error: unknown) => error)
      expect(mocks.runAction).toHaveBeenCalledTimes(1)
      expect(String((firstError as Error).message)).not.toContain(CLICK_ID)
      expect(mocks.releaseClaim).toHaveBeenCalledWith(
        expect.objectContaining({ nextAttempt: 2 }),
      )

      // Redelivery: the stamp survived, so Google's duplicate answer is "recorded".
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ processingDetail: { sendAttemptedAt: STAMP } }),
      )
      mocks.runAction.mockResolvedValue({ kind: "duplicate" })
      await run()

      expect(mocks.finishSendingProcessed).toHaveBeenLastCalledWith(
        expect.objectContaining({
          processingDetail: expect.objectContaining({
            duplicateRecovery: true,
          }),
        }),
      )
      expect(mocks.finishSending).not.toHaveBeenCalled()
    })
  })

  describe("failure messages", () => {
    test("CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE persists the fixed actionable message only", async () => {
      mocks.runAction.mockRejectedValue(
        new GoogleAdsException({
          httpStatusCode: 403,
          reason: "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE",
          message: `Google said no for ${CLICK_ID}`,
          retryable: false,
          details: [],
        }),
      )

      await run()

      const failed = mocks.finishSending.mock.calls[0]?.[0]
      expect(failed).toMatchObject({ to: "failed", failureStage: "delivery" })
      expect(failed.error).toContain("switch the credential to Data Manager")
      expect(failed.error.toLowerCase()).toContain("reconnect this workspace")
      expect(JSON.stringify(mocks.logProviderError.mock.calls)).not.toContain(
        CLICK_ID,
      )
    })

    test("a permanent rejection fails terminally without echoing the click id", async () => {
      mocks.runAction.mockRejectedValue(
        new GoogleAdsException({
          httpStatusCode: 400,
          reason: "CLICK_NOT_FOUND",
          message: `Google rejected the conversion: CLICK_NOT_FOUND ${CLICK_ID}`,
          retryable: false,
          details: [],
        }),
      )

      await run()

      const failed = mocks.finishSending.mock.calls[0]?.[0]
      expect(failed.to).toBe("failed")
      expect(failed.error).toContain("CLICK_NOT_FOUND")
      expect(failed.error).not.toContain(CLICK_ID)
    })

    test("a retryable error rethrown to BullMQ carries no click id", async () => {
      mocks.runAction.mockRejectedValue(
        new GoogleAdsException({
          httpStatusCode: 503,
          message: `unavailable gclid=${CLICK_ID}`,
          details: [],
        }),
      )

      const error = await run().catch((e: unknown) => e)

      expect((error as Error).message).not.toContain(CLICK_ID)
      expect(mocks.releaseClaim).toHaveBeenCalled()
    })
  })

  test.each([
    "EXPIRED_EVENT",
    "CONVERSION_PRECEDES_EVENT",
  ])("Google's %s answer is a terminal failed(delivery): never redriven, no click id", async (reason) => {
    mocks.runAction.mockRejectedValue(
      new GoogleAdsException({
        httpStatusCode: 400,
        reason,
        message: `Google rejected the conversion: ${reason} ${CLICK_ID}`,
        retryable: false,
        details: [],
      }),
    )

    await run()

    const failed = mocks.finishSending.mock.calls[0]?.[0]
    expect(failed).toMatchObject({ to: "failed", failureStage: "delivery" })
    expect(failed.error).toContain(reason)
    expect(failed.error).not.toContain(CLICK_ID)
    expect(mocks.releaseClaim).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("expiry is evaluated for legacy events too (plan §6 rule A)", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({
        googleClickReceivedAt: new Date(Date.now() - 100 * DAY),
        occurredAt: new Date(Date.now() - 20 * DAY),
        lookbackWindowDays: null,
      }),
    )

    await run()

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "skipped_expired" }),
    )
  })

  describe("granted-scope preflight", () => {
    const withScope = (scope: string | undefined) => ({
      ...setup,
      integration: {
        ...setup.integration,
        auth: { metadata: { uploadMethod: "legacy", scope } },
      },
    })

    test("a Data Manager event on a connection reconnected as legacy (adwords only) defers and never sends", async () => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager" }),
      )
      mocks.getSetup.mockResolvedValue(
        withScope("openid email https://www.googleapis.com/auth/adwords"),
      )

      await run()

      expect(mocks.runAction).not.toHaveBeenCalled()
      expect(mocks.markSendAttempted).not.toHaveBeenCalled()
      expect(mocks.finishSending).not.toHaveBeenCalled()
      expect(mocks.releaseClaim).toHaveBeenCalledWith(
        expect.objectContaining({ nextAttempt: 3 }),
      )
      expect(mocks.enqueueSend).toHaveBeenCalledWith(
        expect.anything(),
        3,
        expect.any(Number),
      )
    })

    test("an exhausted deferral budget fails with the bounded message, still without sending", async () => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", attempt: 1000 }),
      )
      mocks.getSetup.mockResolvedValue(
        withScope("https://www.googleapis.com/auth/adwords"),
      )

      await run({ attempt: 1000 })

      expect(mocks.runAction).not.toHaveBeenCalled()
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "failed",
          error: expect.stringContaining("needs_reauth"),
        }),
      )
    })

    test("a legacy event with an adwords-only grant still sends", async () => {
      mocks.getSetup.mockResolvedValue(
        withScope("https://www.googleapis.com/auth/adwords"),
      )

      await run()

      expect(mocks.runAction).toHaveBeenCalledOnce()
    })

    test("a row without a recorded scope predates the check and sends", async () => {
      mocks.getSetup.mockResolvedValue(withScope(undefined))
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager" }),
      )
      mocks.runAction.mockResolvedValue({ kind: "accepted", requestId: "dm-1" })

      await run()

      expect(mocks.runAction).toHaveBeenCalledOnce()
    })
  })
})
