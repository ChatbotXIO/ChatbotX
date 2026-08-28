import { beforeEach, describe, expect, it, vi } from "vitest"

const logProviderErrors = vi.fn()
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderErrors: (...args: unknown[]) => logProviderErrors(...args),
}))

/** The handler enqueues the whole batch in one call; these read that call. */
const loggedInputs = () => logProviderErrors.mock.calls[0]?.[0] ?? []

const warn = vi.fn()
vi.mock("../src/lib/logger", () => ({
  logger: { warn, error: vi.fn(), info: vi.fn() },
}))

const load = async () =>
  (await import("../src/events/message/handlers/record-provider-error-log"))
    .recordProviderErrorLog

const payloadFor = (
  channel: string,
  errorData: unknown,
  overrides: Record<string, unknown> = {},
) => ({
  context: {
    workspaceId: "ws-1",
    contactId: "c-1",
    conversationId: "conv-1",
    channel,
  },
  action: { messageId: "m-1" },
  errorData,
  occurredAt: new Date(),
  ...overrides,
})

describe("recordProviderErrorLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No `vi.resetModules()`: the handler is stateless, and re-importing it
    // re-runs `@chatbotx.io/utils`'s module-level `new Snowflake(...)`, which
    // throws "Place ID 0 already in use" on the second load.
    logProviderErrors.mockReset()
    logProviderErrors.mockResolvedValue({ failedIndexes: [] })
  })

  it("logs a terminal channel failure with the channel as provider", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor("messenger", {
        message: "(#10) outside allowed window",
        code: 10,
        statusCode: 400,
        subcode: 2_018_278,
        isRetryable: false,
      }),
    ] as never)

    expect(loggedInputs()).toEqual([
      expect.objectContaining({
        provider: "messenger",
        workspaceId: "ws-1",
        contactId: "c-1",
      }),
    ])
  })

  it("skips a retryable failure so retries do not each write a row", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor("whatsapp", {
        message: "transient",
        code: 1,
        statusCode: 500,
        subcode: -1,
        isRetryable: true,
      }),
    ] as never)

    expect(logProviderErrors).not.toHaveBeenCalled()
  })

  it("logs when isRetryable is absent, treating it as terminal", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor("zalo", {
        message: "boom",
        code: 2,
        statusCode: 400,
        subcode: -1,
      }),
    ] as never)

    expect(loggedInputs()).toHaveLength(1)
  })

  it("writes no row for an unrecognised channel string", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor("some-future-channel", {
        message: "boom",
        isRetryable: false,
      }),
    ] as never)

    expect(logProviderErrors).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it("writes no row for omnichannel, the unknown-channel fallback", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor("omnichannel", { message: "boom", isRetryable: false }),
    ] as never)

    expect(logProviderErrors).not.toHaveBeenCalled()
  })

  // Audience fan-out: one failing broadcast emits one `message:failed` per
  // recipient. Those rows would bury every other failure in the feed, and the
  // broadcast report already counts them.
  it("writes no row for a broadcast send", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor(
        "whatsapp",
        { message: "template paused", isRetryable: false },
        {
          metadata: {
            type: "broadcast",
            broadcastId: "b-1",
            contactInboxId: "ci-1",
          },
        },
      ),
    ] as never)

    expect(logProviderErrors).not.toHaveBeenCalled()
  })

  it("writes no row for a sequence-schedule send", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor(
        "messenger",
        { message: "boom", isRetryable: false },
        {
          metadata: {
            type: "sequenceSchedule",
            sequenceStepId: "s-1",
            sequenceId: "seq-1",
            dispatchId: "d-1",
            contactInboxId: "ci-1",
          },
        },
      ),
    ] as never)

    expect(logProviderErrors).not.toHaveBeenCalled()
  })

  // `message-status.ts` stamps `updateStatus` on a delivery-status callback that
  // has no stored metadata to copy. The gate keys on the origin, not on
  // metadata being present, so this one still logs.
  it("logs a delivery-status failure carrying non-bulk metadata", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor(
        "whatsapp",
        { message: "undeliverable", isRetryable: false },
        { metadata: { type: "updateStatus" } },
      ),
    ] as never)

    expect(loggedInputs()).toHaveLength(1)
  })

  // The `failedIndexes` the helper returns index the *eligible* list, so a
  // skipped payload ahead of a logged one must not shift the mapping.
  it("maps failed indexes back through a batch that contains a bulk send", async () => {
    const recordProviderErrorLog = await load()
    logProviderErrors.mockResolvedValueOnce({ failedIndexes: [0] })

    await expect(
      recordProviderErrorLog([
        payloadFor(
          "whatsapp",
          { message: "bulk", isRetryable: false },
          {
            __eventBusMessageId: "evt-broadcast",
            metadata: {
              type: "broadcast",
              broadcastId: "b-1",
              contactInboxId: "ci-1",
            },
          },
        ),
        payloadFor(
          "messenger",
          { message: "single", isRetryable: false },
          { __eventBusMessageId: "evt-single" },
        ),
      ] as never),
    ).resolves.toEqual({ failedMessageIds: ["evt-single"] })

    expect(loggedInputs()).toHaveLength(1)
  })

  it("handles a batch, logging each terminal payload once", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([
      payloadFor("messenger", { message: "a", isRetryable: false }),
      payloadFor("telegram", { message: "b", isRetryable: true }),
      payloadFor("instagram", { message: "c", isRetryable: false }),
    ] as never)

    // One enqueue call for the batch, carrying only the two terminal failures.
    expect(logProviderErrors).toHaveBeenCalledTimes(1)
    expect(loggedInputs()).toHaveLength(2)
  })

  it("survives an errorData that is not an object", async () => {
    const recordProviderErrorLog = await load()

    await recordProviderErrorLog([payloadFor("smtp", "raw string")] as never)

    expect(loggedInputs()).toHaveLength(1)
  })

  it("surfaces the payloads whose enqueue failed for the event bus to retry", async () => {
    const recordProviderErrorLog = await load()
    logProviderErrors.mockResolvedValueOnce({ failedIndexes: [0] })

    await expect(
      recordProviderErrorLog([
        payloadFor(
          "messenger",
          { message: "a", isRetryable: false },
          { __eventBusMessageId: "evt-1" },
        ),
      ] as never),
    ).resolves.toEqual({ failedMessageIds: ["evt-1"] })
  })

  // `logProviderErrors` never throws by contract (it swallows and warns), so
  // this can only happen if that contract is broken. When it is, the handler
  // must not escalate: it surfaces the payload for the event bus to retry,
  // exactly as the sibling `recordContactInboxSendFailure` does.
  it("resolves without throwing when the error-log write rejects", async () => {
    const recordProviderErrorLog = await load()
    logProviderErrors.mockRejectedValueOnce(new Error("boom"))

    await expect(
      recordProviderErrorLog([
        payloadFor(
          "messenger",
          { message: "a", isRetryable: false },
          {
            __eventBusMessageId: "evt-1",
          },
        ),
      ] as never),
    ).resolves.toEqual({ failedMessageIds: ["evt-1"] })
  })
})
