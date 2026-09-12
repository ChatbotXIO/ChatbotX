import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"

const emit = vi.fn()

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: (...args: unknown[]) => emit(...args),
}))

// `listErrorLogs` (added alongside the existing logProviderError* free
// functions) pulls in the database client/schema/utils at module scope —
// stub them so this file's existing tests, which never exercise
// `listErrorLogs`, don't pay the cost of the real modules (and never
// importOriginal the schema module — it opens a real DB connection).
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { errorLogModel: { findMany: vi.fn() } },
    $count: vi.fn(),
  },
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  errorLogModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({}),
}))

// The service short-circuits under `isNoRedisEnv()` — true by default in
// vitest — exactly as `defaultQueue` falls back to `fakeQueue`. These tests
// exercise the real emit path, so they opt out of that fallback.
vi.mock("@chatbotx.io/worker-config", () => ({
  isNoRedisEnv: () => false,
}))

// `@chatbotx.io/utils` constructs a Snowflake singleton at module scope, which
// throws "Place ID 0 already in use" when `vi.resetModules()` re-evaluates it.
let nextId = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: () => `id-${nextId++}`,
}))

const warn = vi.fn()
vi.mock("../src/logger", () => ({ logger: { warn, error: vi.fn() } }))

const load = async () =>
  (await import("../src/error-log/service")).logProviderError

const loadBatch = async () => await import("../src/error-log/service")

/** One event per failure: the first emit's payload is the row about to be written. */
const payload = () => emit.mock.calls[0]?.[1]

describe("logProviderError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    emit.mockResolvedValue("stream-id")
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

  it("passes the contact's channel-side sourceId through when given", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      sourceId: "psid-7",
      error: new Error("boom"),
    })

    expect(payload()).toMatchObject({ sourceId: "psid-7" })
  })

  it("omits sourceId when it is null", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      sourceId: null,
      error: new Error("boom"),
    })

    // `.optional()`, not `.nullable()`: an absent value must be absent so
    // `JSON.stringify` drops the key rather than shipping a null.
    expect(payload().sourceId).toBeUndefined()
  })

  it("carries sourceId with no contactId — the contact-creation path", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      sourceId: "psid-7",
      error: new Error("getProfile failed"),
    })

    expect(payload()).toMatchObject({
      sourceId: "psid-7",
      contactId: undefined,
    })
  })

  it("survives a JSON round trip unchanged, keys and all", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      sourceId: "psid-7",
      error: new Error("boom"),
    })

    const entry = payload()
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry)
  })

  it("truncates detail without touching sourceId", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      sourceId: "psid-7",
      error: new Error("x".repeat(9000)),
    })

    expect(payload().error.message).toHaveLength(8192)
    expect(payload().sourceId).toBe("psid-7")
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

  it("carries the stack frames without the message prefix", async () => {
    const logProviderError = await load()
    const error = new Error("boom")
    error.stack = "Error: boom\n    at /srv/app/packages/business/src/x.ts:1:1"

    await logProviderError({
      provider: "drip",
      workspaceId: "ws-1",
      error,
    })

    // `detail` stays message-only; the stack rides `stackTrace` instead.
    expect(payload().error.message).toBe("boom")
    expect(payload().error.stackTrace).toBe(
      "    at /srv/app/packages/business/src/x.ts:1:1",
    )
    // The prefix is stripped: the message is in `detail`, not stored twice.
    expect(payload().error.stackTrace).not.toContain("boom")
  })

  it("keeps frames when a pathological message would fill the budget", async () => {
    const logProviderError = await load()
    const error = new Error("x".repeat(9000))
    error.stack = `Error: ${"x".repeat(9000)}\n    at /srv/app/a.ts:1:1`

    await logProviderError({
      provider: "drip",
      workspaceId: "ws-1",
      error,
    })

    // The regression the prefix-strip exists for: truncating the raw stack
    // would have spent all 2048 chars on the message and stored no frames.
    expect(payload().error.stackTrace).toBe("    at /srv/app/a.ts:1:1")
  })

  it("caps the stored frames at 2048 characters", async () => {
    const logProviderError = await load()
    const error = new Error("boom")
    error.stack = `Error: boom${"\n    at /srv/app/deep.ts:1:1".repeat(500)}`

    await logProviderError({
      provider: "drip",
      workspaceId: "ws-1",
      error,
    })

    expect(payload().error.stackTrace).toHaveLength(2048)
    // Top frames are the ones kept — that is where the throw site is.
    expect(
      payload().error.stackTrace.startsWith("    at /srv/app/deep.ts"),
    ).toBe(true)
  })

  it("skips frame-shaped lines that belong to the message", async () => {
    const logProviderError = await load()
    const inner = new Error("upstream 502")
    inner.stack = "Error: upstream 502\n    at /srv/app/remote.ts:1:1"
    // A wrapped error: the inner stack is now part of this error's *message*,
    // so the first `at ` line in `stack` is not a frame of the real throw.
    const error = new Error(`Provider failed: ${inner.stack}`)
    error.stack = `Error: ${error.message}\n    at /srv/app/throw-site.ts:2:2`

    await logProviderError({
      provider: "drip",
      workspaceId: "ws-1",
      error,
    })

    expect(payload().error.stackTrace).toBe("    at /srv/app/throw-site.ts:2:2")
    // The quoted inner stack stays in `detail` with the rest of the message.
    expect(payload().error.stackTrace).not.toContain("remote.ts")
    expect(payload().error.message).toContain("remote.ts")
  })

  it("omits the stack for a non-Error throwable", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "klaviyo",
      workspaceId: "ws-1",
      // The terminal-send path's shape: a ParsedError off a Redis stream, with
      // no local throw and so no meaningful stack.
      error: { message: "remote failure", statusCode: 400 },
    })

    expect(payload().error.stackTrace).toBeUndefined()
  })

  it("omits the stack when the Error carries no frames", async () => {
    const logProviderError = await load()
    const error = new Error("boom")
    error.stack = "Error: boom"

    await logProviderError({
      provider: "klaviyo",
      workspaceId: "ws-1",
      error,
    })

    expect(payload().error.stackTrace).toBeUndefined()
  })

  // The terminal outbound-send path (`recordProviderErrorLog`) never holds the
  // thrown `Error`: the emitter parsed it into a `ParsedError` before it went
  // onto the Redis stream. The frames are captured at that emit site instead
  // and handed here directly, so this input is the only way that path gets a
  // stack at all.
  it("prefers a caller-supplied stack over deriving one from the error", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      error: { message: "remote failure", statusCode: 401 },
      stackTrace: "    at /srv/app/apps/worker/src/chat/handlers/x.ts:1:1",
    })

    expect(payload().error.stackTrace).toBe(
      "    at /srv/app/apps/worker/src/chat/handlers/x.ts:1:1",
    )
  })

  // The cap is re-applied rather than trusted: the caller extracted the frames
  // in a different process, and the payload still rides the stream's byte
  // budget from here.
  it("caps a caller-supplied stack at 2048 characters", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "messenger",
      workspaceId: "ws-1",
      error: { message: "remote failure", statusCode: 401 },
      stackTrace: "    at /srv/app/deep.ts:1:1\n".repeat(500),
    })

    expect(payload().error.stackTrace).toHaveLength(2048)
  })

  it("omits the stack when the Error has no stack at all", async () => {
    const logProviderError = await load()
    const error = new Error("boom")
    error.stack = undefined

    await logProviderError({
      provider: "klaviyo",
      workspaceId: "ws-1",
      error,
    })

    expect(payload().error.stackTrace).toBeUndefined()
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

  // `detail` is workspace-facing. Before the callers stopped pre-normalizing
  // their throws, `normalizeError` produced a readable message for a shape like
  // this; `String(error)` would now write "[object Object]" into the table.
  it("does not write [object Object] for a message-less object throw", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "klaviyo",
      workspaceId: "ws-1",
      error: { code: 1 },
    })

    expect(payload().error.message).toBe("An unknown error occurred")
  })

  // The `message` key still wins over the fallback — the fallback is for when
  // there is nothing to read, not a blanket replacement for object throws.
  it("still prefers a message carried on a non-Error object", async () => {
    const logProviderError = await load()

    await logProviderError({
      provider: "klaviyo",
      workspaceId: "ws-1",
      error: { message: "remote refused", code: 1 },
    })

    expect(payload().error.message).toBe("remote refused")
  })

  it("never throws when the event bus is unavailable", async () => {
    const logProviderError = await load()
    emit.mockRejectedValue(new Error("redis down"))

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
    emit.mockResolvedValue("stream-id")
  })

  it("emits one event per failure", async () => {
    const { logProviderErrors } = await loadBatch()

    await logProviderErrors(
      Array.from({ length: 40 }, (_, i) => ({
        provider: "messenger" as const,
        workspaceId: `ws-${i}`,
        error: new Error("boom"),
      })),
    )

    expect(emit).toHaveBeenCalledTimes(40)
    expect(emit).toHaveBeenCalledWith(
      "error-log:recorded",
      expect.objectContaining({ workspaceId: "ws-0" }),
    )
  })

  it("gives every event its own row id so a redelivery cannot duplicate", async () => {
    const { logProviderErrors } = await loadBatch()

    await logProviderErrors(
      Array.from({ length: 3 }, () => ({
        provider: "whatsapp" as const,
        workspaceId: "ws-1",
        error: new Error("boom"),
      })),
    )

    const ids = emit.mock.calls.map((call) => call[1]?.id)
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true,
    )
    expect(new Set(ids).size).toBe(3)
  })

  it("reports the inputs it could not emit instead of throwing", async () => {
    const { logProviderErrors } = await loadBatch()
    // The first lands, the second does not.
    emit
      .mockResolvedValueOnce("stream-id")
      .mockRejectedValueOnce(new Error("redis down"))

    const inputs = Array.from({ length: 2 }, () => ({
      provider: "telegram" as const,
      workspaceId: "ws-1",
      error: new Error("boom"),
    }))

    await expect(logProviderErrors(inputs)).resolves.toEqual({
      failedIndexes: [1],
    })
    expect(warn).toHaveBeenCalled()
  })

  it("reports a synchronous routing failure, which emit signals with undefined", async () => {
    const { logProviderErrors } = await loadBatch()
    emit.mockReturnValueOnce(undefined)

    await expect(
      logProviderErrors([
        { provider: "zalo", workspaceId: "ws-1", error: new Error("boom") },
      ]),
    ).resolves.toEqual({ failedIndexes: [0] })
  })

  it("drops a schema rejection rather than reporting it, since a retry replays the same payload", async () => {
    const { logProviderErrors } = await loadBatch()
    // `emit` resolves to "" when the payload fails safeParse. Reporting it
    // would propagate a poison message onto the message bus via
    // `recordProviderErrorLog`.
    emit.mockResolvedValueOnce("")

    await expect(
      logProviderErrors([
        {
          provider: "instagram",
          workspaceId: "ws-1",
          error: new Error("boom"),
        },
      ]),
    ).resolves.toEqual({ failedIndexes: [] })
    expect(warn).toHaveBeenCalled()
  })

  it("emits nothing for an empty batch", async () => {
    const { logProviderErrors } = await loadBatch()

    await expect(logProviderErrors([])).resolves.toEqual({ failedIndexes: [] })
    expect(emit).not.toHaveBeenCalled()
  })
})
