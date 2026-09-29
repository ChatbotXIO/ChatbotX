import { createHmac } from "node:crypto"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
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
// capturePostResult: the SDK middleware's message/status callback must be
// captured no matter how long handle_post takes to resolve it — there is no
// internal timeout window any more (see HIGH finding: the old 300 ms guard
// silently dropped a late result while still ACKing the webhook).
// ---------------------------------------------------------------------------

const { handlePostMock, middlewareInstances } = vi.hoisted(() => ({
  handlePostMock: vi.fn<() => Promise<number>>(),
  middlewareInstances: [] as Array<{ on: Record<string, unknown> }>,
}))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  // A class (not vi.fn().mockImplementation) so `new Middleware()` stays
  // constructable under vitest 4's restoreMocks, which resets vi.fn() impls
  // between tests and would otherwise make the constructor "not a function".
  WhatsAppAPI: class {
    on: Record<string, unknown> = { message: null, sent: null, status: null }
    get = vi.fn().mockResolvedValue("ok")
    handle_post = handlePostMock
    constructor() {
      middlewareInstances.push(this)
    }
  },
}))

// The tests below exercise the handle_post / callback-capture behavior, not
// signature verification (that is covered by webhook-hmac.test.ts). Stub the
// verifier so it settles as a resolved microtask: the real Web Crypto
// implementation resolves off the libuv threadpool, which
// vi.advanceTimersByTimeAsync cannot flush. Other exports (incl. `sha256Hex`,
// used by the coexist jobId tests below) stay real; the extractCoexistPayloads
// tests above never touch this module.
vi.mock("@chatbotx.io/utils/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils/crypto")>()),
  verifyHmacSha256Signature: vi.fn().mockResolvedValue(true),
}))

/** Matches `baseConfig.clientSecret` below — kept as its own constant so
 * `makePostRequest` doesn't need to depend on `baseConfig`'s `never` cast. */
const TEST_CLIENT_SECRET = "secret"

/** Build a minimal Request that looks like a WhatsApp POST webhook, signed
 * with `TEST_CLIENT_SECRET` so it passes HMAC verification. */
const makePostRequest = (body: unknown) => {
  const rawBody = JSON.stringify(body)
  const signature = `sha256=${createHmac("sha256", TEST_CLIENT_SECRET).update(rawBody, "utf8").digest("hex")}`
  return new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: rawBody,
  })
}

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
  clientSecret: TEST_CLIENT_SECRET,
  verifyToken: "verify",
  version: "v20.0",
} as never

/** A minimal webhook body carrying one `messages`-field change, which is the
 * only field that ever reaches `capturePostResult`/`handle_post` (see
 * `buildMessagesChangeBuffers` in `webhook.ts`). */
const messageBody = {
  entry: [
    {
      id: "waba-msg",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-msg" },
            messages: [
              {
                from: "16315551234",
                id: "wamid.trigger-1",
                timestamp: "1755700000",
                type: "text",
                text: { body: "hi" },
              },
            ],
          },
        },
      ],
    },
  ],
}

/** Fires the mocked middleware's `on.message` callback for the most recently
 * constructed `Middleware` instance — simulates whatsapp-api-js@6.2.1's
 * `post()` calling `this.on.message` synchronously inside `handle_post`. */
const fireOnMessage = (args: OnMessageArgs) => {
  const instance = middlewareInstances.at(-1)
  const onMessage = instance?.on.message as
    | ((value: OnMessageArgs) => void)
    | undefined
  onMessage?.(args)
}

describe("webhookHandler — capturePostResult", () => {
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

  it("returns a message result when the SDK callback fires synchronously inside handle_post", async () => {
    handlePostMock.mockImplementation(() => {
      fireOnMessage({
        phoneID: "phone-sync",
        message: { id: "wamid.sync-1" },
      } as OnMessageArgs)
      return Promise.resolve(200)
    })

    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(messageBody),
      queue,
    })

    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        type: "incomingMessage",
        data: expect.objectContaining({ integrationIdentifier: "phone-sync" }),
      }),
      { jobId: "wa-msg-phone-sync-wamid.sync-1", removeOnFail: true },
    )
  })

  it("still returns a message result when the SDK callback fires asynchronously, more than 300 ms into handle_post — the old internal timeout would have dropped this", async () => {
    handlePostMock.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          setTimeout(() => {
            fireOnMessage({
              phoneID: "phone-late",
              message: { id: "wamid.late-1" },
            } as OnMessageArgs)
            resolve(200)
          }, 400)
        }),
    )

    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    const handlerPromise = webhookHandler({
      config: baseConfig,
      req: makePostRequest(messageBody),
      queue,
    })

    // Advance well past the OLD 300 ms guard; handle_post is still pending
    // and only fires its callback + resolves at 400 ms.
    await vi.advanceTimersByTimeAsync(400)
    await handlerPromise

    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        type: "incomingMessage",
        data: expect.objectContaining({ integrationIdentifier: "phone-late" }),
      }),
      { jobId: "wa-msg-phone-late-wamid.late-1", removeOnFail: true },
    )
  })

  it("a non-200 from handle_post skips only that item — the delivery still ACKs so Meta does not loop on a body it can never parse", async () => {
    handlePostMock.mockResolvedValue(500)

    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    await expect(
      webhookHandler({
        config: baseConfig,
        req: makePostRequest(messageBody),
        queue,
      }),
    ).resolves.toBe("ok")

    expect(queueAdd).not.toHaveBeenCalledWith(
      "incomingMessage",
      expect.anything(),
      expect.anything(),
    )
  })

  it("a rejected handle_post skips only that item, never an unhandled rejection", async () => {
    handlePostMock.mockRejectedValue(new Error("unparsable item"))

    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    await expect(
      webhookHandler({
        config: baseConfig,
        req: makePostRequest(messageBody),
        queue,
      }),
    ).resolves.toBe("ok")

    expect(queueAdd).not.toHaveBeenCalledWith(
      "incomingMessage",
      expect.anything(),
      expect.anything(),
    )
  })
})

describe("webhookHandler — coexist job dedup", () => {
  beforeEach(() => {
    handlePostMock.mockReset()
    handlePostMock.mockResolvedValue(200)
  })

  it("gives a coexist job a deterministic jobId derived from phoneNumberId + payload hash", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(coexistBody),
      queue,
    })

    const expectedHash = await sha256Hex(
      JSON.stringify(coexistBody.entry[0].changes[0].value),
    )

    expect(queueAdd).toHaveBeenCalledWith(
      "coexistWhatsappBuffer",
      expect.objectContaining({ type: "coexistWhatsappBuffer" }),
      { jobId: `wa-coexist-phone-race-${expectedHash}`, removeOnFail: true },
    )
  })

  it("gives the same coexist payload the same jobId twice, and a different payload a different jobId", async () => {
    const firstQueueAdd = vi.fn().mockResolvedValue(undefined)
    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(coexistBody),
      queue: { add: firstQueueAdd } as never,
    })
    const firstJobId = firstQueueAdd.mock.calls[0]?.[2]?.jobId

    const secondQueueAdd = vi.fn().mockResolvedValue(undefined)
    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(coexistBody),
      queue: { add: secondQueueAdd } as never,
    })
    const secondJobId = secondQueueAdd.mock.calls[0]?.[2]?.jobId

    expect(secondJobId).toBe(firstJobId)

    const differentBody = {
      entry: [
        {
          changes: [
            {
              field: "history",
              value: {
                metadata: { phone_number_id: "phone-race" },
                history: [{ dummy: "different" }],
              },
            },
          ],
        },
      ],
    }
    const thirdQueueAdd = vi.fn().mockResolvedValue(undefined)
    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(differentBody),
      queue: { add: thirdQueueAdd } as never,
    })
    const thirdJobId = thirdQueueAdd.mock.calls[0]?.[2]?.jobId

    expect(thirdJobId).not.toBe(firstJobId)
  })

  it("a failed coexist enqueue fails the webhook so Meta redelivers — history/echo payloads arrive once and must never be swallowed", async () => {
    const queueAdd = vi.fn((name: string) =>
      name === "coexistWhatsappBuffer"
        ? Promise.reject(new Error("redis down"))
        : Promise.resolve(undefined),
    )

    await expect(
      webhookHandler({
        config: baseConfig,
        req: makePostRequest(coexistBody),
        queue: { add: queueAdd } as never,
      }),
    ).rejects.toThrow()

    expect(queueAdd).toHaveBeenCalledWith(
      "coexistWhatsappBuffer",
      expect.anything(),
      expect.objectContaining({ removeOnFail: true }),
    )
  })
})
