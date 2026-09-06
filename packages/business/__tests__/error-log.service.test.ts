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
