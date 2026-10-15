import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claimRequest: vi.fn(),
  findOrFail: vi.fn(),
  checkpointRequest: vi.fn(),
  completeRequest: vi.fn(),
  releaseRequest: vi.fn(),
  applyPayload: vi.fn(),
  findByIdForContact: vi.fn(),
  execute: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  applyInboundWebhookPayload: mocks.applyPayload,
  contactInboxService: { findByIdForContact: mocks.findByIdForContact },
  inboundWebhookService: {
    claimRequest: mocks.claimRequest,
    findOrFail: mocks.findOrFail,
    checkpointRequest: mocks.checkpointRequest,
    completeRequest: mocks.completeRequest,
    releaseRequest: mocks.releaseRequest,
  },
}))
vi.mock("../src/trigger/services/action-executor", () => ({
  ActionExecutor: class {
    execute = mocks.execute
  },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { DrizzleQueryError } = await import("@chatbotx.io/database/client")
const { processInboundWebhookRequest, skipBlockedInboundWebhookRequest } =
  await import("../src/default/handlers/process-inbound-webhook-request")

const DATA = {
  workspaceId: "ws-1",
  inboundWebhookId: "w-1",
  requestId: "r-1",
}
const request = (overrides = {}) => ({
  id: "r-1",
  workspaceId: "ws-1",
  inboundWebhookId: "w-1",
  payload: { a: 1 },
  actionResults: null,
  ...overrides,
})
const webhook = (overrides = {}) => ({
  id: "w-1",
  workspaceId: "ws-1",
  active: true,
  actions: [
    { type: "addTag", tagIds: ["t1"] },
    { type: "startAnotherFlow", flowId: "f1" },
  ],
  ...overrides,
})
const processed = (fieldErrors: unknown[] = []) => ({
  status: "processed",
  inboxId: "inbox-1",
  contactId: "c-1",
  contactInboxId: "ci-1",
  isNew: true,
  fieldErrors,
})
const job = (attemptsMade = 0, attempts = 2) =>
  ({ attemptsMade, opts: { attempts } }) as never

const run = (jobArg = job()) => processInboundWebhookRequest(DATA, jobArg)
const completion = () => mocks.completeRequest.mock.calls[0]?.[0].completion

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claimRequest.mockResolvedValue({
    request: request(),
    claimToken: "tok-1",
  })
  mocks.findOrFail.mockResolvedValue(webhook())
  mocks.applyPayload.mockResolvedValue(processed())
  mocks.checkpointRequest.mockResolvedValue(true)
  mocks.completeRequest.mockResolvedValue(true)
  mocks.releaseRequest.mockResolvedValue(true)
  mocks.execute.mockResolvedValue({ status: "succeeded" })
  mocks.findByIdForContact.mockResolvedValue({ id: "ci-1" })
})

describe("claiming", () => {
  test("does nothing when another worker owns the request or it is finished", async () => {
    mocks.claimRequest.mockResolvedValue(null)

    await run()

    expect(mocks.findOrFail).not.toHaveBeenCalled()
    expect(mocks.applyPayload).not.toHaveBeenCalled()
    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })
})

describe("skipping", () => {
  test("an inactive webhook closes the request as skipped without applying anything", async () => {
    mocks.findOrFail.mockResolvedValue(webhook({ active: false }))

    await run()

    expect(completion()).toEqual({
      status: "skipped",
      skipReason: "webhookInactive",
    })
    expect(mocks.applyPayload).not.toHaveBeenCalled()
  })

  test("a payload that cannot be applied records why, and runs no action", async () => {
    mocks.applyPayload.mockResolvedValue({
      status: "skipped",
      reason: "inboxNotFound",
      fieldErrors: [{ target: "100", code: "invalidValue" }],
    })

    await run()

    expect(completion()).toEqual({
      status: "skipped",
      skipReason: "inboxNotFound",
      inboxId: null,
      fieldErrors: [{ target: "100", code: "invalidValue" }],
    })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.checkpointRequest).not.toHaveBeenCalled()
  })
})

describe("running the actions", () => {
  test("applies the payload, checkpoints, runs each action and completes as processed", async () => {
    await run()

    expect(mocks.applyPayload).toHaveBeenCalledWith({
      webhook: webhook(),
      payload: { a: 1 },
    })
    expect(mocks.checkpointRequest.mock.calls[0]?.[0]).toEqual({
      id: "r-1",
      claimToken: "tok-1",
      progress: {
        inboxId: "inbox-1",
        contactId: "c-1",
        contactInboxId: "ci-1",
        fieldErrors: null,
        actionResults: [],
      },
    })
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute).toHaveBeenNthCalledWith(1, {
      action: { type: "addTag", tagIds: ["t1"] },
      contactId: "c-1",
      contactInboxId: "ci-1",
      workspaceId: "ws-1",
      source: { kind: "inboundWebhook", inboundWebhookId: "w-1" },
      occurrenceKey: "inboundWebhook:r-1:0",
    })
    expect(mocks.execute.mock.calls[1]?.[0].occurrenceKey).toBe(
      "inboundWebhook:r-1:1",
    )
    // One checkpoint for the apply step + one per action.
    expect(mocks.checkpointRequest).toHaveBeenCalledTimes(3)
    expect(completion()).toMatchObject({
      status: "processed",
      inboxId: "inbox-1",
      contactId: "c-1",
      actionResults: [
        { index: 0, type: "addTag", status: "succeeded" },
        { index: 1, type: "startAnotherFlow", status: "succeeded" },
      ],
    })
  })

  test("a webhook with no actions still completes", async () => {
    mocks.findOrFail.mockResolvedValue(webhook({ actions: [] }))

    await run()

    expect(mocks.execute).not.toHaveBeenCalled()
    expect(completion()).toMatchObject({
      status: "processed",
      actionResults: null,
    })
  })

  test("a failing action is recorded and the rest still run; the job does not throw", async () => {
    mocks.execute
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "succeeded" })

    await expect(run()).resolves.toBeUndefined()

    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(completion()).toMatchObject({
      status: "completedWithErrors",
      actionResults: [
        { index: 0, status: "failed", error: expect.any(String) },
        { index: 1, status: "succeeded" },
      ],
    })
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  test("a stored result only counts for the action still at its position", async () => {
    // Attempt 1 ran an addTag at index 0, then the owner replaced it.
    mocks.claimRequest.mockResolvedValue({
      request: request({
        contactId: "c-1",
        contactInboxId: "ci-1",
        inboxId: "inbox-1",
        actionResults: [{ index: 0, type: "removeTag", status: "succeeded" }],
      }),
      claimToken: "claim-1",
    })
    mocks.findByIdForContact.mockResolvedValue({ id: "ci-1" })

    await run()

    // The replaced action at index 0 runs; it is not silently treated as done.
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(completion().actionResults).toEqual([
      { index: 0, type: "addTag", status: "succeeded" },
      { index: 1, type: "startAnotherFlow", status: "succeeded" },
    ])
  })

  test("a skipped action is not reported as success", async () => {
    mocks.execute.mockResolvedValueOnce({
      status: "skipped",
      reason: "flowInactive",
    })

    await run()

    expect(completion()).toMatchObject({
      status: "completedWithErrors",
      actionResults: [
        { index: 0, status: "skipped", reason: "flowInactive" },
        { index: 1, status: "succeeded" },
      ],
    })
  })

  test("rejected field values make the request completedWithErrors", async () => {
    mocks.applyPayload.mockResolvedValue(
      processed([{ target: "100", code: "invalidValue" }]),
    )

    await run()

    expect(completion()).toMatchObject({
      status: "completedWithErrors",
      fieldErrors: [{ target: "100", code: "invalidValue" }],
    })
  })

  test("an action type outside the allowlist is skipped, never executed", async () => {
    mocks.findOrFail.mockResolvedValue(
      webhook({ actions: [{ type: "sendMetaCapiEvent" }] }),
    )

    await run()

    expect(mocks.execute).not.toHaveBeenCalled()
    expect(completion()).toMatchObject({
      status: "completedWithErrors",
      actionResults: [
        { index: 0, status: "skipped", reason: "unsupportedAction" },
      ],
    })
  })
})

const recorded = (overrides = {}) =>
  request({
    inboxId: "inbox-1",
    contactId: "c-1",
    contactInboxId: "ci-1",
    fieldErrors: null,
    actionResults: [{ index: 0, type: "addTag", status: "succeeded" }],
    ...overrides,
  })

describe("reclaiming", () => {
  test("resumes from the recorded target without applying the payload again", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: recorded(),
      claimToken: "tok-2",
    })

    await run()

    // Re-applying would overwrite fields the finished actions changed.
    expect(mocks.applyPayload).not.toHaveBeenCalled()
    expect(mocks.findByIdForContact).toHaveBeenCalledWith({
      id: "ci-1",
      contactId: "c-1",
      workspaceId: "ws-1",
    })
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.execute.mock.calls[0]?.[0]).toMatchObject({
      contactId: "c-1",
      contactInboxId: "ci-1",
      occurrenceKey: "inboundWebhook:r-1:1",
    })
    expect(completion()).toMatchObject({
      status: "processed",
      actionResults: [
        { index: 0, status: "succeeded" },
        { index: 1, status: "succeeded" },
      ],
    })
  })

  test("keeps the field errors recorded by the first attempt", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: recorded({
        fieldErrors: [{ target: "100", code: "invalidValue" }],
      }),
      claimToken: "tok-2",
    })

    await run()

    expect(completion()).toMatchObject({
      status: "completedWithErrors",
      fieldErrors: [{ target: "100", code: "invalidValue" }],
    })
  })

  test("applies the payload again when the contact lost its connection to the inbox", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: recorded(),
      claimToken: "tok-2",
    })
    mocks.findByIdForContact.mockResolvedValue(null)

    await run()

    expect(mocks.applyPayload).toHaveBeenCalledTimes(1)
  })

  test("a request recorded before the connection was stored is applied again", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: recorded({ contactInboxId: null }),
      claimToken: "tok-2",
    })

    await run()

    expect(mocks.applyPayload).toHaveBeenCalledTimes(1)
    expect(mocks.findByIdForContact).not.toHaveBeenCalled()
  })

  test("a request whose first attempt never recorded a target is applied", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: request({ contactId: null, inboxId: null, actionResults: null }),
      claimToken: "tok-2",
    })

    await run()

    expect(mocks.applyPayload).toHaveBeenCalledTimes(1)
    expect(mocks.findByIdForContact).not.toHaveBeenCalled()
  })

  test("a worker that lost its claim before the first checkpoint stops quietly", async () => {
    mocks.checkpointRequest.mockResolvedValue(false)

    await expect(run()).resolves.toBeUndefined()

    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })

  test("a worker that loses its claim between actions stops without completing", async () => {
    mocks.checkpointRequest
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(run()).resolves.toBeUndefined()

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })
})

describe("failures", () => {
  test("a non-final failure gives the request back and rethrows so BullMQ retries", async () => {
    mocks.applyPayload.mockRejectedValue(new Error("db down"))

    await expect(run(job(0, 2))).rejects.toThrow("db down")

    expect(mocks.releaseRequest).toHaveBeenCalledWith({
      id: "r-1",
      claimToken: "tok-1",
    })
    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })

  test("the final failure closes the request as failed with a sanitised message", async () => {
    mocks.applyPayload.mockRejectedValue(
      new ChatbotXException(
        "Invalid phone Bearer abc.def.ghi",
        "invalidPhone",
        422,
      ),
    )

    await expect(run(job(1, 2))).rejects.toThrow("Invalid phone")

    expect(completion()).toMatchObject({
      status: "failed",
      errorCode: "invalidPhone",
    })
    expect(completion().errorMessage).not.toContain("abc.def.ghi")
    expect(mocks.releaseRequest).not.toHaveBeenCalled()
  })

  test("an unknown error is a systemError and never leaks a query dump", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: request({ attempts: 10 }),
      claimToken: "tok-1",
    })
    mocks.applyPayload.mockRejectedValue(new Error("select * from secret"))

    await expect(run(job(1, 2))).rejects.toThrow()

    expect(completion()).toMatchObject({
      status: "failed",
      errorCode: "systemError",
      errorMessage: "The request could not be processed",
    })
  })

  test("a failure while settling is logged and the original error still surfaces", async () => {
    mocks.applyPayload.mockRejectedValue(new Error("db down"))
    mocks.releaseRequest.mockRejectedValue(new Error("db still down"))

    await expect(run(job(0, 2))).rejects.toThrow("db down")

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "r-1" }),
      "Could not settle a failed inbound webhook attempt",
    )
  })
})

describe("skipBlockedInboundWebhookRequest", () => {
  test("closes the request as skipped so the re-dispatch scan stops finding it", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: request(),
      claimToken: "claim-1",
    })

    await skipBlockedInboundWebhookRequest(DATA)

    expect(mocks.completeRequest).toHaveBeenCalledWith({
      id: "r-1",
      claimToken: "claim-1",
      completion: { status: "skipped", skipReason: "workspaceBlocked" },
    })
    expect(mocks.applyPayload).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  test("does nothing when the request is already owned or finished", async () => {
    mocks.claimRequest.mockResolvedValue(null)

    await skipBlockedInboundWebhookRequest(DATA)

    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })
})

describe("the last job attempt", () => {
  const lastAttempt = () => job(1, 2)

  test("a transient infrastructure error gives the request back for the re-dispatch cron instead of failing it", async () => {
    mocks.applyPayload.mockRejectedValue(new Error("connection reset"))

    await expect(run(lastAttempt())).rejects.toThrow("connection reset")

    expect(mocks.releaseRequest).toHaveBeenCalledWith({
      id: "r-1",
      claimToken: "tok-1",
    })
    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })

  test("a lock timeout (a 5xx ChatbotXException) is transient too", async () => {
    mocks.applyPayload.mockRejectedValue(
      new ChatbotXException("Lock timeout", "lockTimeout", 500),
    )

    await expect(run(lastAttempt())).rejects.toThrow("Lock timeout")

    expect(mocks.releaseRequest).toHaveBeenCalled()
    expect(mocks.completeRequest).not.toHaveBeenCalled()
  })

  test("a business error closes the request as failed, since a retry would fail again", async () => {
    mocks.applyPayload.mockRejectedValue(
      new ChatbotXException("Quota exceeded", "quotaExceeded", 422),
    )

    await expect(run(lastAttempt())).rejects.toThrow("Quota exceeded")

    expect(completion()).toMatchObject({
      status: "failed",
      errorCode: "quotaExceeded",
    })
    expect(mocks.releaseRequest).not.toHaveBeenCalled()
  })

  test("a request that keeps failing stops being retried after its claim budget", async () => {
    mocks.claimRequest.mockResolvedValue({
      request: request({ attempts: 10 }),
      claimToken: "tok-1",
    })
    mocks.applyPayload.mockRejectedValue(new Error("still down"))

    await expect(run(lastAttempt())).rejects.toThrow("still down")

    expect(completion()).toMatchObject({
      status: "failed",
      errorCode: "systemError",
    })
  })
})

describe("database errors", () => {
  test("neither the log nor the rethrown error carries the bound values", async () => {
    const secret = "+84900000001"
    mocks.applyPayload.mockRejectedValue(
      new DrizzleQueryError(
        `insert into "Contact" values ($1)`,
        [secret],
        Object.assign(new Error(`bad value ${secret}`), { code: "23514" }),
      ),
    )

    const thrown = await run().catch((error: unknown) => error)

    expect(String((thrown as Error).message)).not.toContain(secret)
    expect((thrown as Error).message).toContain("23514")
    const loggedErrors = mocks.loggerError.mock.calls.map(
      ([fields]) => (fields as { err: unknown }).err,
    )
    expect(loggedErrors.length).toBeGreaterThan(0)
    for (const logged of loggedErrors) {
      expect(logged).not.toBeInstanceOf(DrizzleQueryError)
      expect(String((logged as Error).message)).not.toContain(secret)
    }
  })

  const dbError = (secret: string) =>
    new DrizzleQueryError(
      `update "InboundWebhookRequest" set x = $1`,
      [secret],
      Object.assign(new Error(`bad value ${secret}`), { code: "57P01" }),
    )

  test("a failing claim is reduced before it reaches BullMQ", async () => {
    mocks.claimRequest.mockRejectedValue(dbError("claim-secret"))

    const thrown = await run().catch((error: unknown) => error)

    expect(thrown).not.toBeInstanceOf(DrizzleQueryError)
    expect((thrown as Error).message).not.toContain("claim-secret")
  })

  test("a failing settlement is logged without its bound values", async () => {
    mocks.applyPayload.mockRejectedValue(new Error("db down"))
    mocks.releaseRequest.mockRejectedValue(dbError("settle-secret"))

    await expect(run(job(0, 2))).rejects.toThrow("db down")

    for (const [fields] of mocks.loggerError.mock.calls) {
      const logged = (fields as { err: unknown }).err
      expect(logged).not.toBeInstanceOf(DrizzleQueryError)
      expect(String((logged as Error).message)).not.toContain("settle-secret")
    }
  })
})
