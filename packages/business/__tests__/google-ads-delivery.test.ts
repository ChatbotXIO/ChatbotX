import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimForSending: vi.fn(),
  finishSending: vi.fn(),
  releaseClaim: vi.fn(),
  markSendAttempted: vi.fn(),
  resolveDeveloperToken: vi.fn(),
  getSetup: vi.fn(),
  buildActionContext: vi.fn(),
  runAction: vi.fn(),
  logProviderError: vi.fn(),
  enqueueSend: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  loadMatchingIdentifiers: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  googleAdsConversionEventRepository: {
    claimForSending: mocks.claimForSending,
    finishSending: mocks.finishSending,
    releaseClaim: mocks.releaseClaim,
    markSendAttempted: mocks.markSendAttempted,
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
    resolveDeveloperToken: mocks.resolveDeveloperToken,
    buildActionContext: mocks.buildActionContext,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, info: mocks.info },
}))
vi.mock("../src/google-ads/send-queue", () => ({
  enqueueSend: mocks.enqueueSend,
}))
vi.mock("../src/google-ads/customer-matching", () => ({
  loadMatchingIdentifiers: mocks.loadMatchingIdentifiers,
}))

const { GoogleAdsException } = await import(
  "@chatbotx.io/integration-google-ads"
)
const { AuthException, AuthRefreshException } = await import("@chatbotx.io/sdk")
const { deliverGoogleAdsConversion, evaluateDeliveryGuards } = await import(
  "../src/google-ads/delivery"
)

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const CLICK_ID = "GCLID-SECRET-123"

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  workspaceId: "ws-1",
  attempt: 0,
  customerId: "1112223333",
  loginCustomerId: "event-login-decoy",
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
  ...overrides,
})

const makeSetup = (overrides: Record<string, unknown> = {}) => ({
  readiness: "ready",
  connection: { status: "active" },
  integration: {
    customerId: "1112223333",
    loginCustomerId: "4445556666",
    conversionCustomerId: "7778889999",
    acceptedCustomerDataTerms: true,
  },
  ...overrides,
})

const run = (overrides: Record<string, unknown> = {}) =>
  deliverGoogleAdsConversion({
    eventId: "evt-1",
    workspaceId: "ws-1",
    attempt: 0,
    isLastInJobAttempt: false,
    ...overrides,
  })

const googleError = (status: number, message = "boom") =>
  new GoogleAdsException({ httpStatusCode: status, message, details: [] })

describe("evaluateDeliveryGuards", () => {
  const now = new Date()

  test("passes a ready account with an old-enough click", () => {
    expect(
      evaluateDeliveryGuards({
        event: makeEvent() as never,
        setup: makeSetup() as never,
        now,
      }),
    ).toBeNull()
  })

  test("skips when the account was swapped since recording", () => {
    expect(
      evaluateDeliveryGuards({
        event: makeEvent({ customerId: "other" }) as never,
        setup: makeSetup() as never,
        now,
      }),
    ).toEqual({ kind: "skip", status: "skipped_no_account" })
    expect(
      evaluateDeliveryGuards({
        event: makeEvent({ conversionCustomerId: "other" }) as never,
        setup: makeSetup() as never,
        now,
      }),
    ).toEqual({ kind: "skip", status: "skipped_no_account" })
  })

  test("skips when there is no setup at all", () => {
    expect(
      evaluateDeliveryGuards({
        event: makeEvent() as never,
        setup: null,
        now,
      }),
    ).toEqual({ kind: "skip", status: "skipped_no_account" })
  })

  test("checks expiry before readiness", () => {
    const event = makeEvent({
      googleClickReceivedAt: new Date(now.getTime() - 120 * DAY),
      occurredAt: new Date(now.getTime() - 100 * DAY),
    })
    expect(
      evaluateDeliveryGuards({
        event: event as never,
        setup: makeSetup({
          readiness: "needs_reauth",
          connection: { status: "needs_reauth" },
        }) as never,
        now,
      }),
    ).toEqual({ kind: "skip", status: "skipped_expired" })
  })

  test("defers one hour while the grant needs re-authorization", () => {
    expect(
      evaluateDeliveryGuards({
        event: makeEvent() as never,
        setup: makeSetup({
          readiness: "needs_reauth",
          connection: { status: "needs_reauth" },
        }) as never,
        now,
      }),
    ).toEqual({ kind: "defer", delayMs: HOUR, reason: "needs_reauth" })
  })

  test.each([
    ["paused", "paused", { status: "paused" }],
    ["disconnected", "disconnected", { status: "disconnected" }],
    ["no connection", "no_connection", undefined],
    ["setup incomplete", "setup_incomplete", { status: "active" }],
  ])("skips with skipped_no_account when %s", (_n, readiness, connection) => {
    expect(
      evaluateDeliveryGuards({
        event: makeEvent() as never,
        setup: makeSetup({ readiness, connection }) as never,
        now,
      }),
    ).toEqual({ kind: "skip", status: "skipped_no_account" })
  })

  test("defers by the remaining time for a click younger than 6h", () => {
    const event = makeEvent({
      googleClickReceivedAt: new Date(now.getTime() - 2 * HOUR),
      occurredAt: new Date(now.getTime() - HOUR),
    })
    expect(
      evaluateDeliveryGuards({
        event: event as never,
        setup: makeSetup() as never,
        now,
      }),
    ).toEqual({ kind: "defer", delayMs: 4 * HOUR, reason: "click_too_recent" })
  })

  test("the initial 6h delay follows the click receipt, not a back-dated occurredAt", () => {
    const event = makeEvent({
      googleClickReceivedAt: new Date(now.getTime() - 2 * HOUR),
      occurredAt: new Date(now.getTime() - 60 * DAY),
      lookbackWindowDays: null,
    })
    expect(
      evaluateDeliveryGuards({
        event: event as never,
        setup: makeSetup() as never,
        now,
      }),
    ).toEqual({ kind: "defer", delayMs: 4 * HOUR, reason: "click_too_recent" })
  })

  test("expiry is decided at actual delivery: the same event passes at 89 d and expires at 91 d", () => {
    const receivedAt = new Date(now.getTime() - 89 * DAY)
    const event = makeEvent({
      googleClickReceivedAt: receivedAt,
      occurredAt: new Date(receivedAt.getTime() + DAY),
      lookbackWindowDays: 30,
    })
    const guards = (at: Date) =>
      evaluateDeliveryGuards({
        event: event as never,
        setup: makeSetup() as never,
        now: at,
      })
    expect(guards(now)).toBeNull()
    expect(guards(new Date(now.getTime() + 2 * DAY))).toEqual({
      kind: "skip",
      status: "skipped_expired",
    })
  })

  test("a conversion before the click receipt is not skipped locally", () => {
    const event = makeEvent({
      googleClickReceivedAt: new Date(now.getTime() - 2 * DAY),
      occurredAt: new Date(now.getTime() - 102 * DAY),
    })
    expect(
      evaluateDeliveryGuards({
        event: event as never,
        setup: makeSetup() as never,
        now,
      }),
    ).toBeNull()
  })
})

describe("deliverGoogleAdsConversion", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.claimForSending.mockResolvedValue(makeEvent())
    mocks.getSetup.mockResolvedValue(makeSetup())
    mocks.buildActionContext.mockResolvedValue({ ctx: true })
    mocks.runAction.mockResolvedValue({ kind: "accepted", requestId: "req-1" })
    mocks.finishSending.mockResolvedValue({ id: "evt-1" })
    mocks.releaseClaim.mockResolvedValue({
      id: "evt-1",
      attempt: 1,
      workspaceId: "ws-1",
    })
  })

  test("logs only the field path and reason of each fieldWarning and still marks sent", async () => {
    mocks.runAction.mockResolvedValue({
      kind: "accepted",
      requestId: "req-1",
      fieldWarnings: [
        {
          field: "adIdentifiers.gclid",
          reason: "WARNING_REASON_GENERIC",
          description: `value ${CLICK_ID} customer@example.com`,
        },
      ],
    })

    await run()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
    const [fields, message] = mocks.warn.mock.calls[0]
    expect(message).toBe("google ads: Data Manager returned field warnings")
    expect(fields).toMatchObject({
      eventId: "evt-1",
      workspaceId: "ws-1",
      warningCount: 1,
      warnings: [
        { field: "adIdentifiers.gclid", reason: "WARNING_REASON_GENERIC" },
      ],
    })
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(CLICK_ID)
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("example.com")
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sent", requestId: "req-1" }),
    )
  })

  test("a fieldWarning that is not an object is logged as an empty summary", async () => {
    mocks.runAction.mockResolvedValue({
      kind: "accepted",
      requestId: "req-1",
      fieldWarnings: ["customer@example.com", null, { field: 5 }],
    })

    await run()

    const [fields] = mocks.warn.mock.calls[0]
    expect(fields.warnings).toEqual([{}, {}, {}])
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("example.com")
  })

  test("does not log when there are no fieldWarnings", async () => {
    mocks.runAction.mockResolvedValue({
      kind: "accepted",
      requestId: "req-1",
      fieldWarnings: [],
    })
    await run()
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("claims the event generation with a fresh lease token", async () => {
    await run({ attempt: 3 })
    expect(mocks.claimForSending).toHaveBeenCalledWith({
      id: "evt-1",
      workspaceId: "ws-1",
      claimToken: expect.any(String),
      attempt: 3,
    })
  })

  test("is a no-op when the claim is lost", async () => {
    mocks.claimForSending.mockResolvedValue(null)
    await run()
    expect(mocks.getSetup).not.toHaveBeenCalled()
    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.finishSending).not.toHaveBeenCalled()
  })

  test("sends the event and records the request id with the first status check", async () => {
    await run()

    expect(mocks.runAction).toHaveBeenCalledWith("ingestEvent", {
      ctx: { ctx: true },
      props: {
        uploadMethod: "dataManager",
        loginAccountId: "4445556666",
        operatingAccountId: "7778889999",
        conversionActionId: "999",
        event: {
          transactionId: "gads-999-order-1",
          eventTimestamp: expect.any(Date),
          clickIdType: "gclid",
          clickId: CLICK_ID,
          value: 12.5,
          currency: "USD",
        },
      },
    })
    const claimToken = mocks.claimForSending.mock.calls[0][0].claimToken
    expect(mocks.finishSending).toHaveBeenCalledTimes(1)
    const finish = mocks.finishSending.mock.calls[0][0]
    expect(finish).toMatchObject({
      id: "evt-1",
      workspaceId: "ws-1",
      claimToken,
      to: "sent",
      requestId: "req-1",
      processingStatus: "processing",
    })
    expect(
      finish.nextProcessingCheckAt.getTime() - finish.sentAt.getTime(),
    ).toBe(3 * HOUR)
  })

  test("uses the integration login account, not the event's recorded one", async () => {
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        integration: {
          customerId: "1112223333",
          loginCustomerId: "current-manager",
          conversionCustomerId: "7778889999",
        },
      }),
    )
    await run()
    const { props } = mocks.runAction.mock.calls[0][1]
    expect(props.loginAccountId).toBe("current-manager")
    expect(props.loginAccountId).not.toBe(makeEvent().loginCustomerId)
  })

  test.each([
    ["same account, direct", "1112223333", null, "1112223333"],
    ["same account, via manager", "1112223333", "4445556666", "4445556666"],
    ["cross-account, direct", "7778889999", null, "7778889999"],
    ["cross-account, via manager", "7778889999", "4445556666", "4445556666"],
  ])("login account for %s topology", async (_name, conversion, login, expected) => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({ conversionCustomerId: conversion }),
    )
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        integration: {
          customerId: "1112223333",
          loginCustomerId: login,
          conversionCustomerId: conversion,
        },
      }),
    )
    await run()
    const { props } = mocks.runAction.mock.calls[0][1]
    expect(props.loginAccountId).toBe(expected)
    expect(props.operatingAccountId).toBe(conversion)
  })

  test("omits a null value and currency", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({ value: null, currency: null }),
    )
    await run()
    const { props } = mocks.runAction.mock.calls[0][1]
    expect(props.event.value).toBeUndefined()
    expect(props.event.currency).toBeUndefined()
  })

  test("fails the event immediately when Google accepts without a request id", async () => {
    mocks.runAction.mockResolvedValue({
      kind: "accepted",
      requestId: undefined,
    })
    await expect(run({ isLastInJobAttempt: false })).resolves.toBeUndefined()
    expect(mocks.releaseClaim).not.toHaveBeenCalled()
    expect(mocks.finishSending).toHaveBeenCalledTimes(1)
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed", failureStage: "delivery" }),
    )
    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
  })

  test("skips with skipped_no_account when the Connection is not active", async () => {
    mocks.getSetup.mockResolvedValue(null)
    await run()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "skipped_no_account" }),
    )
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("skips with skipped_expired when outside the lookback window", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({
        googleClickReceivedAt: new Date(Date.now() - 200 * DAY),
        occurredAt: new Date(Date.now() - 100 * DAY),
      }),
    )
    await run()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "skipped_expired" }),
    )
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("defers a too-recent click with the remaining delay as the next generation", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({
        attempt: 1,
        googleClickReceivedAt: new Date(Date.now() - 2 * HOUR),
        occurredAt: new Date(Date.now() - HOUR),
      }),
    )
    const released = { id: "evt-1", workspaceId: "ws-1", attempt: 2 }
    mocks.releaseClaim.mockResolvedValue(released)

    await run({ attempt: 1 })

    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-1", nextAttempt: 2 }),
    )
    const [event, attempt, delay] = mocks.enqueueSend.mock.calls[0]
    expect(event).toBe(released)
    expect(attempt).toBe(2)
    expect(delay).toBeGreaterThan(3.9 * HOUR)
    expect(delay).toBeLessThanOrEqual(4 * HOUR)
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("needs_reauth releases the claim to attempt+1 and re-enqueues in 1h", async () => {
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        readiness: "needs_reauth",
        connection: { status: "needs_reauth" },
      }),
    )
    const released = { id: "evt-1", workspaceId: "ws-1", attempt: 1 }
    mocks.releaseClaim.mockResolvedValue(released)

    await run()

    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ nextAttempt: 1 }),
    )
    expect(mocks.enqueueSend).toHaveBeenCalledWith(released, 1, HOUR)
    expect(mocks.runAction).not.toHaveBeenCalled()
  })

  test("does not enqueue when the deferral lost its lease", async () => {
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        readiness: "needs_reauth",
        connection: { status: "needs_reauth" },
      }),
    )
    mocks.releaseClaim.mockResolvedValue(null)
    await run()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("fails once the redrive generation cap (30) is reached", async () => {
    mocks.claimForSending.mockResolvedValue(makeEvent({ attempt: 30 }))
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        readiness: "needs_reauth",
        connection: { status: "needs_reauth" },
      }),
    )

    await run({ attempt: 30 })

    expect(mocks.releaseClaim).not.toHaveBeenCalled()
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed", failureStage: "delivery" }),
    )
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("still defers at generation 29", async () => {
    mocks.claimForSending.mockResolvedValue(makeEvent({ attempt: 29 }))
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        readiness: "needs_reauth",
        connection: { status: "needs_reauth" },
      }),
    )
    mocks.releaseClaim.mockResolvedValue({
      id: "evt-1",
      workspaceId: "ws-1",
      attempt: 30,
    })
    await run({ attempt: 29 })
    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ nextAttempt: 30 }),
    )
  })

  test.each([
    ["AuthException", () => new AuthException("expired")],
    [
      "terminal AuthRefreshException",
      () =>
        new AuthRefreshException("revoked", new AuthException("invalid_grant")),
    ],
  ])("%s during send takes the reauth path", async (_name, makeError) => {
    mocks.runAction.mockRejectedValue(makeError())
    const released = { id: "evt-1", workspaceId: "ws-1", attempt: 1 }
    mocks.releaseClaim.mockResolvedValue(released)

    await run()

    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ nextAttempt: 1 }),
    )
    expect(mocks.enqueueSend).toHaveBeenCalledWith(released, 1, HOUR)
    expect(mocks.finishSending).not.toHaveBeenCalled()
  })

  test("a transient AuthRefreshException is not a reauth deferral: it retries through BullMQ, sanitized", async () => {
    mocks.runAction.mockRejectedValue(
      new AuthRefreshException(
        `refresh failed for ${CLICK_ID}`,
        new Error("ECONNRESET"),
      ),
    )
    mocks.releaseClaim.mockResolvedValue({ id: "evt-1" })

    const thrown = await run().catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).not.toContain(CLICK_ID)
    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ nextAttempt: 0 }),
    )
    expect(mocks.enqueueSend).not.toHaveBeenCalled()
  })

  test("logs a sanitized warning, with event id and generation, when the claim is lost", async () => {
    mocks.runAction.mockResolvedValue({
      kind: "accepted",
      requestId: "req-1",
      fieldWarnings: [],
    })
    mocks.finishSending.mockResolvedValue(null)

    await run()

    expect(mocks.warn).toHaveBeenCalledWith(
      { eventId: "evt-1", workspaceId: "ws-1", attempt: 0 },
      expect.stringContaining("lease lost"),
    )
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(CLICK_ID)
  })

  test("a retryable GoogleAdsException releases the claim on the same generation and rethrows", async () => {
    mocks.claimForSending.mockResolvedValue(makeEvent({ attempt: 4 }))
    mocks.runAction.mockRejectedValue(
      googleError(503, `boom for click ${CLICK_ID}`),
    )

    const thrown = await run({ attempt: 4 }).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(GoogleAdsException)
    expect((thrown as Error).message).not.toContain(CLICK_ID)

    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt-1", nextAttempt: 4 }),
    )
    expect(mocks.finishSending).not.toHaveBeenCalled()
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("a retryable Google error on the last job attempt defers one hour instead of failing", async () => {
    mocks.runAction.mockRejectedValue(googleError(503))
    const released = { id: "evt-1", workspaceId: "ws-1", attempt: 1 }
    mocks.releaseClaim.mockResolvedValue(released)

    await expect(run({ isLastInJobAttempt: true })).resolves.toBeUndefined()

    expect(mocks.releaseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ nextAttempt: 1 }),
    )
    expect(mocks.enqueueSend).toHaveBeenCalledWith(released, 1, HOUR)
    expect(mocks.finishSending).not.toHaveBeenCalled()
  })

  test("a quota error (429) on the last job attempt is deferred the same way", async () => {
    mocks.runAction.mockRejectedValue(googleError(429))
    mocks.releaseClaim.mockResolvedValue({
      id: "evt-1",
      workspaceId: "ws-1",
      attempt: 1,
    })

    await run({ isLastInJobAttempt: true })

    expect(mocks.enqueueSend).toHaveBeenCalledWith(expect.anything(), 1, HOUR)
    expect(mocks.finishSending).not.toHaveBeenCalled()
  })

  test("a retryable Google error still fails once the redrive generations are used up", async () => {
    mocks.claimForSending.mockResolvedValue(makeEvent({ attempt: 30 }))
    mocks.runAction.mockRejectedValue(googleError(503))

    await run({ attempt: 30, isLastInJobAttempt: true })

    expect(mocks.enqueueSend).not.toHaveBeenCalled()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed", failureStage: "delivery" }),
    )
  })

  test("a non-Google error on the last job attempt still fails the event", async () => {
    mocks.runAction.mockRejectedValue(new Error("unexpected"))

    await expect(run({ isLastInJobAttempt: true })).resolves.toBeUndefined()

    expect(mocks.enqueueSend).not.toHaveBeenCalled()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "failed", failureStage: "delivery" }),
    )
  })

  test("Data Manager's 'conversion action created too recently' defers six hours from the first attempt", async () => {
    mocks.runAction.mockRejectedValue(
      new GoogleAdsException({
        httpStatusCode: 400,
        reason: "CONVERSION_ACTION_TOO_RECENTLY_CREATED",
        retryable: false,
        message: "too recent",
        details: [],
      }),
    )
    const released = { id: "evt-1", workspaceId: "ws-1", attempt: 1 }
    mocks.releaseClaim.mockResolvedValue(released)

    await run({ isLastInJobAttempt: false })

    expect(mocks.enqueueSend).toHaveBeenCalledWith(released, 1, 6 * HOUR)
    expect(mocks.finishSending).not.toHaveBeenCalled()
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("a terminal GoogleAdsException fails the event and logs a sanitized provider error", async () => {
    mocks.runAction.mockRejectedValue(
      googleError(400, `Invalid click ${CLICK_ID} for account`),
    )

    await run()

    expect(mocks.releaseClaim).not.toHaveBeenCalled()
    const finish = mocks.finishSending.mock.calls[0][0]
    expect(finish).toMatchObject({ to: "failed", failureStage: "delivery" })
    expect(finish.error).not.toContain(CLICK_ID)
    expect(finish.error).toContain("[redacted]")

    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
    const logged = mocks.logProviderError.mock.calls[0][0]
    expect(logged).toMatchObject({
      provider: "google-ads",
      workspaceId: "ws-1",
      httpCode: "400",
    })
    expect(logged.error).toBeInstanceOf(Error)
    expect(JSON.stringify(logged)).not.toContain(CLICK_ID)
    expect(logged.error.message).not.toContain(CLICK_ID)
  })

  test("does not log a provider error when the failure lost its lease", async () => {
    mocks.runAction.mockRejectedValue(googleError(400))
    mocks.finishSending.mockResolvedValue(null)
    await run()
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("a stale claim token makes the final transition a no-op", async () => {
    mocks.finishSending.mockResolvedValue(null)
    await expect(run()).resolves.toBeUndefined()
    expect(mocks.logProviderError).not.toHaveBeenCalled()
    expect(mocks.releaseClaim).not.toHaveBeenCalled()
  })

  test("every lease operation carries the claim token from the claim", async () => {
    mocks.getSetup.mockResolvedValue(
      makeSetup({
        readiness: "needs_reauth",
        connection: { status: "needs_reauth" },
      }),
    )
    await run()
    const claimToken = mocks.claimForSending.mock.calls[0][0].claimToken
    expect(mocks.releaseClaim.mock.calls[0][0]).toMatchObject({
      id: "evt-1",
      workspaceId: "ws-1",
      claimToken,
    })
  })
})

describe("deliverGoogleAdsConversion consent from the event options", () => {
  const entry = (status: "granted" | "denied" | null) => ({
    status,
    source: status === null ? "notProvided" : "fixed",
  })
  const options = (
    adUserData: "granted" | "denied" | null,
    adPersonalization: "granted" | "denied" | null,
  ) => ({
    version: 1,
    identity: {
      version: 1,
      configuredPolicy: "id",
      effectivePolicy: "id",
      keySource: "explicit",
      id: "order-1",
    },
    timeSource: "recorded",
    consent: {
      adUserData: entry(adUserData),
      adPersonalization: entry(adPersonalization),
    },
  })
  const sentEvent = () =>
    mocks.runAction.mock.calls[0][1].props.event as Record<string, unknown>

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getSetup.mockResolvedValue(makeSetup())
    mocks.buildActionContext.mockResolvedValue({ ctx: true })
    mocks.runAction.mockResolvedValue({ kind: "accepted", requestId: "req-1" })
    mocks.finishSending.mockResolvedValue({ id: "evt-1" })
  })

  test("null options send no consent", async () => {
    mocks.claimForSending.mockResolvedValue(makeEvent({ options: null }))

    await run()

    expect(sentEvent().consent).toBeUndefined()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sent" }),
    )
  })

  test("a Data Manager event sends both snapshot settings", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({
        uploadMethod: "dataManager",
        options: options("granted", "denied"),
      }),
    )

    await run()

    expect(sentEvent().consent).toEqual({
      adUserData: "granted",
      adPersonalization: "denied",
    })
  })

  test("a legacy event sends ad user data only, from its pinned method", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({
        uploadMethod: "legacy",
        options: options("denied", "granted"),
      }),
    )
    mocks.resolveDeveloperToken.mockResolvedValue({
      kind: "available",
      developerToken: undefined,
    })
    mocks.markSendAttempted.mockResolvedValue({
      processingDetail: { sendAttemptedAt: "2026-10-07T00:00:00.000Z" },
    })

    await run()

    expect(sentEvent().consent).toEqual({ adUserData: "denied" })
  })

  test("a snapshot with nothing answered sends an empty consent", async () => {
    mocks.claimForSending.mockResolvedValue(
      makeEvent({ options: options(null, null) }),
    )

    await run()

    expect(sentEvent().consent).toEqual({})
  })

  test.each([
    ["an unknown version", { ...options(null, null), version: 3 }],
    ["a malformed snapshot", { version: 1 }],
  ])("%s fails terminally with no HTTP call", async (_label, unreadable) => {
    mocks.claimForSending.mockResolvedValue(makeEvent({ options: unreadable }))

    await run()

    expect(mocks.runAction).not.toHaveBeenCalled()
    expect(mocks.finishSending).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "failed",
        failureStage: "delivery",
        error: "Unsupported conversion options version",
      }),
    )
    // A local version mismatch is not a Google failure.
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  describe("customer matching from the options snapshot", () => {
    const MATCHING = {
      status: "enabled",
      email: "{{email}}",
      phone: "{{phone}}",
    }
    const HASHES = { emailAddress: "a".repeat(64), phoneNumber: "b".repeat(64) }
    const v2 = (matching: unknown) => ({
      ...options("granted", "granted"),
      version: 2,
      matching,
    })

    const resolveMatchingTemplates = vi.fn()

    test("loads the identifiers at delivery from the recorded configuration and sends them", async () => {
      mocks.loadMatchingIdentifiers.mockResolvedValue(HASHES)
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: v2(MATCHING) }),
      )

      await run({ resolveMatchingTemplates })

      expect(mocks.loadMatchingIdentifiers).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
        MATCHING,
        resolveMatchingTemplates,
      )
      expect(sentEvent().userIdentifiers).toEqual(HASHES)
    })

    test("sends no identifiers when the contact yields none, and still sends the conversion", async () => {
      mocks.loadMatchingIdentifiers.mockResolvedValue(undefined)
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: v2(MATCHING) }),
      )

      await run()

      expect(sentEvent().userIdentifiers).toBeUndefined()
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({ to: "sent" }),
      )
    })

    test("a v1 snapshot and null options ask for no matching at all", async () => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ options: options("granted", "granted") }),
      )

      await run()

      expect(mocks.loadMatchingIdentifiers).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        undefined,
      )
      expect(sentEvent().userIdentifiers).toBeUndefined()
    })

    test("an enabled snapshot that yields nothing is logged without any value and still sent", async () => {
      mocks.loadMatchingIdentifiers.mockResolvedValue(undefined)
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: v2(MATCHING) }),
      )

      await run()

      expect(mocks.info).toHaveBeenCalledWith(
        { eventId: "evt-1", workspaceId: "ws-1" },
        expect.stringContaining("no usable identifier"),
      )
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({ to: "sent" }),
      )
    })

    test("withholds the identifiers, without loading them, when the customer data terms are not accepted", async () => {
      mocks.getSetup.mockResolvedValue(
        makeSetup({
          integration: {
            customerId: "1112223333",
            loginCustomerId: "4445556666",
            conversionCustomerId: "7778889999",
            acceptedCustomerDataTerms: false,
          },
        }),
      )
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: v2(MATCHING) }),
      )

      await run({ resolveMatchingTemplates })

      expect(mocks.loadMatchingIdentifiers).not.toHaveBeenCalled()
      expect(sentEvent().userIdentifiers).toBeUndefined()
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({ to: "sent" }),
      )
    })

    test("treats unknown terms (null) as not accepted and withholds the identifiers", async () => {
      mocks.getSetup.mockResolvedValue(
        makeSetup({
          integration: {
            customerId: "1112223333",
            loginCustomerId: "4445556666",
            conversionCustomerId: "7778889999",
            acceptedCustomerDataTerms: null,
          },
        }),
      )
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: v2(MATCHING) }),
      )

      await run({ resolveMatchingTemplates })

      expect(mocks.loadMatchingIdentifiers).not.toHaveBeenCalled()
      expect(sentEvent().userIdentifiers).toBeUndefined()
    })

    test("a lookup failure is retried, not turned into a click-only send", async () => {
      mocks.loadMatchingIdentifiers.mockRejectedValue(new Error("db down"))
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: v2(MATCHING) }),
      )
      mocks.releaseClaim.mockResolvedValue({ id: "evt-1" })

      await expect(run()).rejects.toThrow("db down")

      expect(mocks.runAction).not.toHaveBeenCalled()
    })
  })

  describe("customer properties from the options snapshot", () => {
    const properties = (status: string) => ({
      ...options("granted", "granted"),
      version: 2,
      customerProperties: {
        status,
        customerType: "NEW",
        customerValueBucket: "HIGH",
      },
    })

    test("an enabled snapshot sends the recorded values", async () => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({
          uploadMethod: "dataManager",
          options: properties("enabled"),
        }),
      )

      await run()

      expect(sentEvent().userProperties).toEqual({
        customerType: "NEW",
        customerValueBucket: "HIGH",
      })
    })

    test.each([
      "withheldConsent",
      "unsupportedTransport",
    ])("a %s snapshot sends nothing and still sends the conversion", async (status) => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ uploadMethod: "dataManager", options: properties(status) }),
      )

      await run()

      expect(sentEvent().userProperties).toBeUndefined()
      expect(mocks.finishSending).toHaveBeenCalledWith(
        expect.objectContaining({ to: "sent" }),
      )
    })

    test("a v1 snapshot sends no properties", async () => {
      mocks.claimForSending.mockResolvedValue(
        makeEvent({ options: options("granted", "granted") }),
      )

      await run()

      expect(sentEvent().userProperties).toBeUndefined()
    })
  })
})
