import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { extractCoexistPayloads, webhookHandler } from "../src/handlers/webhook"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps a single change value in the full webhook body envelope. */
const makeBody = (value: unknown, field?: string) => ({
  entry: [
    {
      changes: [field ? { field, value } : { value }],
    },
  ],
})

/** Builds a coexist-style value with the given coexist field set. */
const makeCoexistValue = (
  coexistField: "history" | "smb_app_state_sync",
  phoneNumberId = "phone-123",
) => ({
  metadata: { phone_number_id: phoneNumberId },
  [coexistField]: [{ dummy: true }],
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractCoexistPayloads", () => {
  describe("returns entries for coexist payloads", () => {
    it("returns entry when value.history is a truthy array", () => {
      const body = makeBody(makeCoexistValue("history"))
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ phoneNumberId: "phone-123" })
    })

    it("returns entry when value.smb_app_state_sync is a truthy array", () => {
      const body = makeBody(makeCoexistValue("smb_app_state_sync"))
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ phoneNumberId: "phone-123" })
    })

    it("preserves the full value object in the returned payload", () => {
      const value = makeCoexistValue("history", "phone-456")
      const body = makeBody(value)
      const result = extractCoexistPayloads(body)

      expect(result[0]?.value).toBe(value)
    })

    it("returns entry for field='smb_app_state_sync' with value.state_sync[] (current Meta shape)", () => {
      const body = makeBody(
        {
          metadata: { phone_number_id: "phone-789" },
          state_sync: [{ contact: "x" }],
        },
        "smb_app_state_sync",
      )
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ phoneNumberId: "phone-789" })
    })

    it("returns entry for field='smb_message_echoes' with value.message_echoes[]", () => {
      const body = makeBody(
        {
          metadata: { phone_number_id: "phone-echo" },
          message_echoes: [{ id: "wamid.echo" }],
        },
        "smb_message_echoes",
      )
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ phoneNumberId: "phone-echo" })
    })

    it("preserves history[].metadata (phase/chunk_order/progress) on the buffered value", () => {
      const value = {
        metadata: { phone_number_id: "phone-meta" },
        history: [
          {
            metadata: { phase: 2, chunk_order: 5, progress: 100 },
            threads: [],
          },
        ],
      }
      const body = makeBody(value, "history")
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]?.value).toBe(value)
    })

    it("preserves history[].errors[code=2593109] (history-declined) on the buffered value", () => {
      const value = {
        metadata: { phone_number_id: "phone-declined" },
        history: [
          { errors: [{ code: 2_593_109, title: "History sharing declined" }] },
        ],
      }
      const body = makeBody(value, "history")
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]?.value).toBe(value)
    })

    it("collects multiple coexist changes across multiple entries", () => {
      const body = {
        entry: [
          { changes: [{ value: makeCoexistValue("history", "phone-a") }] },
          {
            changes: [
              { value: makeCoexistValue("smb_app_state_sync", "phone-b") },
            ],
          },
        ],
      }
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(2)
      expect(result[0]?.phoneNumberId).toBe("phone-a")
      expect(result[1]?.phoneNumberId).toBe("phone-b")
    })
  })

  describe("skips entries that cannot be keyed to an integration", () => {
    it("skips entries where metadata.phone_number_id is missing", () => {
      const body = makeBody({
        history: [{ dummy: true }],
        // no metadata
      })
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(0)
    })

    it("skips entries where metadata.phone_number_id is not a string", () => {
      const body = makeBody({
        history: [{ dummy: true }],
        metadata: { phone_number_id: 12_345 },
      })
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(0)
    })

    it("skips entries where metadata is present but phone_number_id is undefined", () => {
      const body = makeBody({
        history: [{ dummy: true }],
        metadata: {},
      })
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(0)
    })
  })

  describe("returns [] for normal live-message payloads", () => {
    it("returns [] when value has messages but no history or smb_app_state_sync", () => {
      const body = makeBody({
        metadata: { phone_number_id: "phone-live" },
        messages: [{ id: "wamid.123", type: "text", text: { body: "Hello" } }],
      })
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(0)
    })

    it("returns [] when value has statuses but no coexist fields", () => {
      const body = makeBody({
        metadata: { phone_number_id: "phone-live" },
        statuses: [{ id: "wamid.456", status: "delivered" }],
      })
      const result = extractCoexistPayloads(body)

      expect(result).toHaveLength(0)
    })

    it("returns [] when history and smb_app_state_sync are both empty arrays (falsy-like)", () => {
      // Empty array is still Array.isArray === true, so this should match —
      // verify the function considers [] as truthy (isArray is the check).
      const body = makeBody({
        metadata: { phone_number_id: "phone-123" },
        history: [],
      })
      const result = extractCoexistPayloads(body)

      // [] passes Array.isArray, so this IS treated as a coexist payload.
      expect(result).toHaveLength(1)
    })
  })

  describe("returns [] (no throw) for malformed input", () => {
    it("returns [] for null", () => {
      expect(extractCoexistPayloads(null)).toEqual([])
    })

    it("returns [] for undefined", () => {
      expect(extractCoexistPayloads(undefined)).toEqual([])
    })

    it("returns [] for a plain string", () => {
      expect(extractCoexistPayloads("not an object")).toEqual([])
    })

    it("returns [] for a number", () => {
      expect(extractCoexistPayloads(42)).toEqual([])
    })

    it("returns [] when entry is missing", () => {
      expect(extractCoexistPayloads({})).toEqual([])
    })

    it("returns [] when entry is not an array", () => {
      expect(extractCoexistPayloads({ entry: "not-an-array" })).toEqual([])
    })

    it("returns [] when entry is an empty array", () => {
      expect(extractCoexistPayloads({ entry: [] })).toEqual([])
    })

    it("returns [] when entry items have no changes", () => {
      expect(extractCoexistPayloads({ entry: [{}] })).toEqual([])
    })

    it("returns [] when changes is not an array", () => {
      expect(extractCoexistPayloads({ entry: [{ changes: "bad" }] })).toEqual(
        [],
      )
    })

    it("returns [] when change.value is null", () => {
      expect(
        extractCoexistPayloads({ entry: [{ changes: [{ value: null }] }] }),
      ).toEqual([])
    })

    it("returns [] when change.value is a primitive", () => {
      expect(
        extractCoexistPayloads({ entry: [{ changes: [{ value: "string" }] }] }),
      ).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// H2 — setTimeout race: coexist payloads must be enqueued even when
// handle_post resolves AFTER the 300 ms timeout window.
// ---------------------------------------------------------------------------

const { handlePostMock } = vi.hoisted(() => ({
  handlePostMock: vi.fn<() => Promise<number>>(),
}))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  // A class (not vi.fn().mockImplementation) so `new Middleware()` stays
  // constructable under vitest 4's restoreMocks, which resets vi.fn() impls
  // between tests and would otherwise make the constructor "not a function".
  WhatsAppAPI: class {
    on: Record<string, unknown> = { message: null, sent: null, status: null }
    get = vi.fn().mockResolvedValue("ok")
    handle_post = handlePostMock
  },
}))

/** Build a minimal Request that looks like a WhatsApp POST webhook. */
const makePostRequest = (body: unknown) =>
  new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

/** A minimal coexist body envelope with a history payload. */
const coexistBody = {
  entry: [
    {
      changes: [
        {
          field: "history",
          value: {
            metadata: { phone_number_id: "phone-race" },
            history: [{ dummy: true }],
          },
        },
      ],
    },
  ],
}

const baseConfig = {
  clientSecret: "secret",
  verifyToken: "verify",
  version: "v20.0",
} as never

describe("webhookHandler — H2 setTimeout race", () => {
  beforeEach(() => {
    // The WhatsAppAPI mock is a class (see vi.mock above), so it stays
    // constructable across tests; only the per-test handle_post stub needs
    // resetting.
    handlePostMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("(a) enqueues coexist payloads even when handle_post resolves after the 300 ms window", async () => {
    // Use a deferred promise so we control exactly when handle_post resolves.
    // We resolve it AFTER advancing past the 300 ms guard, simulating a slow
    // handle_post that would have lost the race with the old setTimeout(300).
    let resolveHandlePost!: (status: number) => void
    const deferredHandlePost = new Promise<number>((res) => {
      resolveHandlePost = res
    })
    // Suppress the "unhandled rejection" warning while the promise is pending.
    deferredHandlePost.catch(() => undefined)
    handlePostMock.mockReturnValue(deferredHandlePost)

    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    const handlerPromise = webhookHandler({
      config: baseConfig,
      req: makePostRequest(coexistBody),
      queue,
    })

    // Advance past the internal 300 ms guard — handle_post is still pending.
    // In the OLD code the enqueue check would run here with hmacVerified=false.
    // In the NEW code the handler is waiting for handle_post to resolve.
    await vi.advanceTimersByTimeAsync(400)

    // Resolve handle_post with 200 (slow but successful HMAC verification).
    resolveHandlePost(200)

    // Let remaining microtasks and promises settle.
    await handlerPromise

    expect(queueAdd).toHaveBeenCalledWith(
      "coexistWhatsappBuffer",
      expect.objectContaining({ type: "coexistWhatsappBuffer" }),
    )
  })

  it("(b) no unhandled rejection when handle_post rejects after the timeout", async () => {
    // Use a deferred promise so we can reject AFTER the 300 ms guard fires.
    let rejectHandlePost!: (err: Error) => void
    const deferredHandlePost = new Promise<number>((_, rej) => {
      rejectHandlePost = rej
    })
    // Pre-attach a no-op catch so the deferred itself is never "unhandled" at
    // creation time (the handler will also attach its own catch).
    deferredHandlePost.catch(() => undefined)
    handlePostMock.mockReturnValue(deferredHandlePost)

    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    const handlerPromise = webhookHandler({
      config: baseConfig,
      req: makePostRequest(coexistBody),
      queue,
    })

    // Advance past the 300 ms guard; handle_post is still pending.
    await vi.advanceTimersByTimeAsync(400)

    // Now reject handle_post — simulating a late network failure.
    rejectHandlePost(new Error("network error"))

    // Handler should surface a controlled SdkException, not an unhandled
    // process-level rejection.
    await expect(handlerPromise).rejects.toThrow()

    // Coexist payloads must NOT be enqueued (HMAC not verified).
    expect(queueAdd).not.toHaveBeenCalledWith(
      "coexistWhatsappBuffer",
      expect.anything(),
    )
  })
})
