import { createHmac } from "node:crypto"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import {
  extractCoexistPayloads,
  extractSmbMessageEchoPayloads,
  webhookHandler,
} from "../src/handlers/webhook"

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

    it("never buffers field='smb_message_echoes': every echo type is delivered live", () => {
      const body = makeBody(
        {
          metadata: { phone_number_id: "phone-echo" },
          message_echoes: [
            { id: "wamid.text", type: "text" },
            { id: "wamid.edit", type: "edit" },
            { id: "wamid.revoke", type: "revoke" },
            { id: "wamid.untyped" },
          ],
        },
        "smb_message_echoes",
      )

      expect(extractCoexistPayloads(body)).toEqual([])
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

// ---------------------------------------------------------------------------
// What the business did in the WhatsApp Business app (smb_message_echoes) is
// live: one job per echo, never the Coexistence history buffer.
// ---------------------------------------------------------------------------

const ECHO_PHONE_NUMBER_ID = "106540352242922"

const buildEcho = (fields: Record<string, unknown> = {}) => ({
  from: "15550783881",
  to: "16505551234",
  to_user_id: "US.13491208655302741918",
  id: "wamid.echo-1",
  timestamp: "1739321024",
  type: "text",
  text: { body: "Here is the info" },
  ...fields,
})

const buildEditEcho = (fields: Record<string, unknown> = {}) =>
  buildEcho({
    id: "wamid.edit-1",
    type: "edit",
    text: undefined,
    edit: {
      original_message_id: "wamid.original",
      message: { type: "text", text: { body: "Corrected text" } },
    },
    ...fields,
  })

const buildRevokeEcho = (fields: Record<string, unknown> = {}) =>
  buildEcho({
    id: "wamid.revoke-1",
    type: "revoke",
    text: undefined,
    revoke: { original_message_id: "wamid.original" },
    ...fields,
  })

const buildEchoBody = (
  echoes: unknown[],
  contacts: unknown[] = [
    { wa_id: "16505551234", user_id: "US.13491208655302741918" },
  ],
  phoneNumberId = ECHO_PHONE_NUMBER_ID,
) => ({
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "smb_message_echoes",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: phoneNumberId },
            contacts,
            message_echoes: echoes,
          },
        },
      ],
    },
  ],
})

describe("extractSmbMessageEchoPayloads", () => {
  it("builds one incomingMessageEcho job per sent message with its recipient's contact", () => {
    const jobs = extractSmbMessageEchoPayloads(
      buildEchoBody([
        buildEcho(),
        buildEcho({ id: "wamid.echo-2", type: "image", text: undefined }),
      ]),
    )

    expect(jobs.map((job) => job.jobId)).toEqual([
      `wa-smb-message-${ECHO_PHONE_NUMBER_ID}-wamid.echo-1`,
      `wa-smb-message-${ECHO_PHONE_NUMBER_ID}-wamid.echo-2`,
    ])
    expect(jobs[0]).toMatchObject({
      phoneNumberId: ECHO_PHONE_NUMBER_ID,
      queueJob: {
        type: "incomingMessageEcho",
        data: {
          integrationType: "whatsapp",
          integrationIdentifier: ECHO_PHONE_NUMBER_ID,
          payload: {
            kind: "smbMessageEcho",
            phoneID: ECHO_PHONE_NUMBER_ID,
            echo: { id: "wamid.echo-1", type: "text" },
            contact: { wa_id: "16505551234" },
          },
        },
      },
    })
  })

  it("turns an edit into an updateIncomingMessage job that waits for the original message", () => {
    const [job] = extractSmbMessageEchoPayloads(
      buildEchoBody([buildEditEcho()]),
    )

    expect(job).toMatchObject({
      jobId: `wa-smb-edit-${ECHO_PHONE_NUMBER_ID}-wamid.edit-1`,
      queueJob: {
        type: "updateIncomingMessage",
        data: {
          integrationType: "whatsapp",
          integrationIdentifier: ECHO_PHONE_NUMBER_ID,
          messageId: "wamid.original",
          newText: "Corrected text",
          retryIfMissing: true,
        },
      },
    })
  })

  it("reads the new text of a media edit from its caption", () => {
    const [job] = extractSmbMessageEchoPayloads(
      buildEchoBody([
        buildEditEcho({
          edit: {
            original_message_id: "wamid.original",
            message: {
              type: "image",
              image: { caption: "Updated image caption" },
            },
          },
        }),
      ]),
    )

    expect(job?.queueJob).toMatchObject({
      data: { newText: "Updated image caption" },
    })
  })

  it("turns a revoke into a deleteIncomingMessage job that waits for the original message", () => {
    const [job] = extractSmbMessageEchoPayloads(
      buildEchoBody([buildRevokeEcho()]),
    )

    expect(job).toMatchObject({
      jobId: `wa-smb-revoke-${ECHO_PHONE_NUMBER_ID}-wamid.revoke-1`,
      queueJob: {
        type: "deleteIncomingMessage",
        data: {
          integrationType: "whatsapp",
          integrationIdentifier: ECHO_PHONE_NUMBER_ID,
          messageId: "wamid.original",
          retryIfMissing: true,
        },
      },
    })
  })

  it("gives a change a longer retry horizon than a sent message", () => {
    const jobs = extractSmbMessageEchoPayloads(
      buildEchoBody([buildEcho(), buildEditEcho(), buildRevokeEcho()]),
    )

    expect(jobs.map((job) => job.options.attempts)).toEqual([5, 6, 6])
  })

  it("keeps two edits of one message as two jobs", () => {
    const jobs = extractSmbMessageEchoPayloads(
      buildEchoBody([
        buildEditEcho({ id: "wamid.edit-1" }),
        buildEditEcho({ id: "wamid.edit-2" }),
      ]),
    )

    expect(new Set(jobs.map((job) => job.jobId)).size).toBe(2)
  })

  it.each([
    ["an edit with no text", { edit: { original_message_id: "wamid.o" } }],
    [
      "an edit naming no message",
      { edit: { message: { text: { body: "x" } } } },
    ],
  ])("skips %s", (_label, fields) => {
    expect(
      extractSmbMessageEchoPayloads(buildEchoBody([buildEditEcho(fields)])),
    ).toEqual([])
  })

  it("skips a revoke that names no message", () => {
    expect(
      extractSmbMessageEchoPayloads(
        buildEchoBody([buildRevokeEcho({ revoke: {} })]),
      ),
    ).toEqual([])
  })

  it("matches each echo to its own contact by the recipient, not by position", () => {
    const jobs = extractSmbMessageEchoPayloads(
      buildEchoBody(
        [
          buildEcho({ id: "wamid.a", to: "111", to_user_id: "US.A" }),
          buildEcho({ id: "wamid.b", to: "222", to_user_id: "US.B" }),
        ],
        [
          { wa_id: "222", user_id: "US.B", profile: { name: "Bea" } },
          { wa_id: "111", user_id: "US.A", profile: { name: "Ann" } },
        ],
      ),
    )

    expect(
      jobs.map(
        (job) =>
          (job.queueJob.data as { payload: { contact?: unknown } }).payload
            .contact,
      ),
    ).toEqual([
      expect.objectContaining({ profile: { name: "Ann" } }),
      expect.objectContaining({ profile: { name: "Bea" } }),
    ])
  })

  it("matches the contact by the business-scoped user id when the phone number is omitted", () => {
    const [job] = extractSmbMessageEchoPayloads(
      buildEchoBody(
        [buildEcho({ to: undefined, to_user_id: "US.B" })],
        [
          { user_id: "US.A", profile: { username: "ann" } },
          { user_id: "US.B", profile: { username: "bea" } },
        ],
      ),
    )

    expect(job?.queueJob.data).toMatchObject({
      payload: { contact: { profile: { username: "bea" } } },
    })
  })

  it("keeps an echo whose recipient has no contact entry", () => {
    const [job] = extractSmbMessageEchoPayloads(
      buildEchoBody([buildEcho({ to_user_id: "US.unlisted", to: "999" })]),
    )

    expect(job?.queueJob.data).not.toHaveProperty("payload.contact")
  })

  it("collects echoes across several entries and changes", () => {
    const body = {
      entry: [
        ...buildEchoBody([buildEcho({ id: "wamid.one" })]).entry,
        ...buildEchoBody(
          [buildEcho({ id: "wamid.two" })],
          undefined,
          "other-phone",
        ).entry,
      ],
    }

    expect(extractSmbMessageEchoPayloads(body).map((job) => job.jobId)).toEqual(
      [
        `wa-smb-message-${ECHO_PHONE_NUMBER_ID}-wamid.one`,
        "wa-smb-message-other-phone-wamid.two",
      ],
    )
  })

  it("skips an echo without an id and keeps the rest", () => {
    const jobs = extractSmbMessageEchoPayloads(
      buildEchoBody([buildEcho({ id: undefined }), buildEcho()]),
    )

    expect(jobs).toHaveLength(1)
  })

  it.each([
    ["null", null],
    ["a string", "text"],
    ["no entry", {}],
    ["a customer message", messageBody],
    [
      "a change without a phone number id",
      makeBody({ message_echoes: [buildEcho()] }, "smb_message_echoes"),
    ],
  ])("returns [] for %s", (_label, body) => {
    expect(extractSmbMessageEchoPayloads(body)).toEqual([])
  })
})

describe("webhookHandler — live Business-app echoes", () => {
  beforeEach(() => {
    handlePostMock.mockReset()
    handlePostMock.mockResolvedValue(200)
  })

  const handle = (
    body: unknown,
    queue: unknown,
    config: unknown = baseConfig,
  ) =>
    webhookHandler({
      config: config as never,
      req: makePostRequest(body),
      queue: queue as never,
    })

  it("enqueues a sent message as an incomingMessageEcho job that retries and dedupes", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await handle(buildEchoBody([buildEcho()]), { add: queueAdd })

    expect(queueAdd).toHaveBeenCalledTimes(1)
    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessageEcho",
      expect.objectContaining({
        type: "incomingMessageEcho",
        data: expect.objectContaining({
          integrationType: "whatsapp",
          integrationIdentifier: ECHO_PHONE_NUMBER_ID,
          payload: expect.objectContaining({ kind: "smbMessageEcho" }),
        }),
      }),
      {
        jobId: `wa-smb-message-${ECHO_PHONE_NUMBER_ID}-wamid.echo-1`,
        removeOnFail: true,
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
      },
    )
  })

  it("enqueues an edit and a revoke with their own retry options", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await handle(buildEchoBody([buildEditEcho(), buildRevokeEcho()]), {
      add: queueAdd,
    })

    expect(queueAdd).toHaveBeenCalledWith(
      "updateIncomingMessage",
      expect.objectContaining({ type: "updateIncomingMessage" }),
      expect.objectContaining({
        jobId: `wa-smb-edit-${ECHO_PHONE_NUMBER_ID}-wamid.edit-1`,
        attempts: 6,
        removeOnFail: true,
      }),
    )
    expect(queueAdd).toHaveBeenCalledWith(
      "deleteIncomingMessage",
      expect.objectContaining({ type: "deleteIncomingMessage" }),
      expect.objectContaining({
        jobId: `wa-smb-revoke-${ECHO_PHONE_NUMBER_ID}-wamid.revoke-1`,
        attempts: 6,
      }),
    )
  })

  it("does not buffer anything of the field for the history import", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await handle(
      buildEchoBody([buildEcho(), buildEditEcho(), buildRevokeEcho()]),
      { add: queueAdd },
    )

    expect(queueAdd).toHaveBeenCalledTimes(3)
    expect(queueAdd).not.toHaveBeenCalledWith(
      "coexistWhatsappBuffer",
      expect.anything(),
      expect.anything(),
    )
  })

  it("still buffers the history of the same delivery", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const body = {
      entry: [...buildEchoBody([buildEcho()]).entry, ...coexistBody.entry],
    }

    await handle(body, { add: queueAdd })

    const names = queueAdd.mock.calls.map(([name]) => name)
    expect(names).toContain("incomingMessageEcho")
    expect(names).toContain("coexistWhatsappBuffer")
  })

  it("gives a redelivered echo the same jobId", async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)

    await handle(buildEchoBody([buildEcho()]), { add: first })
    await handle(buildEchoBody([buildEcho()]), { add: second })

    expect(second.mock.calls[0]?.[2]?.jobId).toBe(
      first.mock.calls[0]?.[2]?.jobId,
    )
  })

  it("drops an echo for another number than the one the route is pinned to", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await handle(
      buildEchoBody([buildEcho()], undefined, "someone-elses-number"),
      { add: queueAdd },
      { ...(baseConfig as object), phoneNumberId: ECHO_PHONE_NUMBER_ID },
    )

    expect(queueAdd).not.toHaveBeenCalled()
  })

  it("fails the webhook when the echo cannot be enqueued so Meta redelivers it", async () => {
    const queueAdd = vi.fn().mockRejectedValue(new Error("redis down"))

    await expect(
      handle(buildEchoBody([buildEcho()]), { add: queueAdd }),
    ).rejects.toThrow()
  })

  it("fails the webhook instead of acknowledging an echo it has no queue for", async () => {
    await expect(
      handle(buildEchoBody([buildEcho()]), undefined),
    ).rejects.toThrow()
  })

  it("acknowledges a webhook without echoes when there is no queue", async () => {
    await expect(handle(messageBody, undefined)).resolves.toBeDefined()
  })
})
