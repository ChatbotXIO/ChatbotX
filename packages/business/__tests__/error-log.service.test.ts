import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"

const add = vi.fn()

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { sendErrorLog: "sendErrorLog" },
  defaultQueue: {
    add: (...args: unknown[]) => add(...args),
  },
}))

const warn = vi.fn()
vi.mock("../src/logger", () => ({ logger: { warn, error: vi.fn() } }))

const load = async () =>
  (await import("../src/error-log/service")).logProviderError

const loadBatch = async () => await import("../src/error-log/service")

/** Every job carries a batch; the single-input path enqueues a batch of one. */
const payload = () => add.mock.calls[0]?.[1]?.data?.entries?.[0]

describe("logProviderError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    add.mockResolvedValue(undefined)
  })

  it("enqueues the provider as-is, with no operation suffix", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "mailchimp",
      workspaceId: "ws-1",
      error: new Error("boom"),
    })

    expect(payload()).toMatchObject({
      provider: "mailchimp",
      workspaceId: "ws-1",
    })
  })

  it("passes contactId through when given", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      contactId: "c-7",
      error: new Error("boom"),
    })

    expect(payload()).toMatchObject({ contactId: "c-7" })
  })

  it("omits contactId when it is null", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      contactId: null,
      error: new Error("boom"),
    })

    expect(payload().contactId).toBeUndefined()
  })

  it("takes httpCode from an SdkException status", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "whatsapp",
      workspaceId: "ws-1",
      error: new SdkException("rate limited", 4, 429),
    })

    expect(payload().error.httpCode).toBe("429")
  })

  it('maps the -1 unknown sentinel to null, never to "-1"', async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "openai",
      workspaceId: "ws-1",
      error: { message: "unknown", code: -1, statusCode: -1, subcode: -1 },
    })

    expect(payload().error.httpCode).toBeNull()
  })

  it("prefers an explicit httpCode override", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "meta-conversions",
      workspaceId: "ws-1",
      httpCode: "400",
      error: new SdkException("boom", 1, 500),
    })

    expect(payload().error.httpCode).toBe("400")
  })

  it("writes null httpCode for a plain non-HTTP error", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "google-sheets",
      workspaceId: "ws-1",
      error: new TypeError("cannot read property of undefined"),
    })

    expect(payload().error.httpCode).toBeNull()
  })

  it("carries the message only and never the stack", async () => {
    const logProviderError = await load()
    const error = new Error("boom")
    error.stack = "Error: boom\n  at /srv/app/packages/business/src/x.ts:1:1"

    await logProviderError({
      provider: "drip",
      workspaceId: "ws-1",
      error,
    })

    expect(payload().error.message).toBe("boom")
    // `ErrorLog` is workspace-facing; a stack would leak server paths.
    expect(payload().error).not.toHaveProperty("stack")
    expect(JSON.stringify(payload())).not.toContain("/srv/app/")
  })

  it("stringifies a non-Error throwable rather than losing it", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "klaviyo",
      workspaceId: "ws-1",
      error: "plain string failure",
    })

    expect(payload().error.message).toBe("plain string failure")
  })

  it("never throws when the queue is unavailable", async () => {
    const logProviderError = await load()
    add.mockRejectedValue(new Error("redis down"))

    await expect(
      logProviderError({
        provider: "sendgrid",
        workspaceId: "ws-1",
        error: new Error("boom"),
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})

describe("logProviderErrors", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    add.mockResolvedValue(undefined)
  })

  it("enqueues one job for the whole batch, not one per failure", async () => {
    const { logProviderErrors } = await loadBatch()

    await logProviderErrors(
      Array.from({ length: 40 }, (_, i) => ({
        provider: "messenger" as const,
        workspaceId: `ws-${i}`,
        error: new Error("boom"),
      })),
    )

    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0]?.[1]?.data?.entries).toHaveLength(40)
  })

  it("splits an oversized batch so one job never carries an unbounded payload", async () => {
    const { logProviderErrors, ERROR_LOG_BATCH_SIZE } = await loadBatch()

    await logProviderErrors(
      Array.from({ length: ERROR_LOG_BATCH_SIZE * 2 + 5 }, () => ({
        provider: "whatsapp" as const,
        workspaceId: "ws-1",
        error: new Error("boom"),
      })),
    )

    expect(add).toHaveBeenCalledTimes(3)
    expect(add.mock.calls[2]?.[1]?.data?.entries).toHaveLength(5)
  })

  it("reports the inputs it could not enqueue instead of throwing", async () => {
    const { logProviderErrors, ERROR_LOG_BATCH_SIZE } = await loadBatch()
    // The first chunk lands, the second does not.
    add
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("redis down"))

    const inputs = Array.from({ length: ERROR_LOG_BATCH_SIZE + 2 }, () => ({
      provider: "telegram" as const,
      workspaceId: "ws-1",
      error: new Error("boom"),
    }))

    await expect(logProviderErrors(inputs)).resolves.toEqual({
      failedIndexes: [ERROR_LOG_BATCH_SIZE, ERROR_LOG_BATCH_SIZE + 1],
    })
    expect(warn).toHaveBeenCalled()
  })

  it("enqueues nothing for an empty batch", async () => {
    const { logProviderErrors } = await loadBatch()

    await expect(logProviderErrors([])).resolves.toEqual({ failedIndexes: [] })
    expect(add).not.toHaveBeenCalled()
  })
})
