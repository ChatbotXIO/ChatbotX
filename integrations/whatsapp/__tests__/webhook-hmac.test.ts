import { createHmac } from "node:crypto"
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappConfig } from "../src/schema"

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

type MiddlewareHandlers = {
  message?: (args: unknown) => void
  sent?: () => void
  status?: (args: unknown) => void
}

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: MiddlewareHandlers = {}

    get = vi.fn()

    handle_post = vi.fn(() => {
      queueMicrotask(() => {
        this.on.sent?.()
      })
      return Promise.resolve(200)
    })
  },
}))

const { webhookHandler } = await import("../src/handlers/webhook")

const CLIENT_SECRET = "test-app-secret"

const sign = (rawBody: string, secret: string = CLIENT_SECRET): string =>
  `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`

const emptyWebhookBody = (): unknown => ({
  object: "whatsapp_business_account",
  entry: [],
})

const makeRequest = (rawBody: string, signature?: string): Request =>
  new Request("https://example.com/webhook", {
    method: "POST",
    headers: signature ? { "x-hub-signature-256": signature } : undefined,
    body: rawBody,
  })

type WebhookProps = HandleRequestProps<WhatsappConfig>

const makeProps = (input: {
  rawBody: string
  signature?: string
  queueAdd: ReturnType<typeof vi.fn>
  clientSecret?: string | undefined
  manualIntegration?: boolean
}): WebhookProps =>
  ({
    config: {
      verifyToken: "verify-token",
      clientSecret:
        "clientSecret" in input ? input.clientSecret : CLIENT_SECRET,
      manualIntegration: input.manualIntegration,
    },
    req: makeRequest(input.rawBody, input.signature),
    queue: { add: input.queueAdd },
  }) as unknown as WebhookProps

describe("webhookHandler inbound HMAC verification", () => {
  let queueAdd: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueAdd = vi.fn().mockResolvedValue(undefined)
    mockLogger.warn.mockClear()
  })

  test("accepts a POST request with a valid signature", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    await expect(
      webhookHandler(
        makeProps({ rawBody, signature: sign(rawBody), queueAdd }),
      ),
    ).resolves.toBe("ok")
  })

  test("rejects a signature with one altered byte and enqueues nothing", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())
    const validSignature = sign(rawBody)
    // Flip one hex character so the signature no longer matches.
    const lastChar = validSignature.at(-1) === "0" ? "1" : "0"
    const tamperedSignature = `${validSignature.slice(0, -1)}${lastChar}`

    await expect(
      webhookHandler(
        makeProps({ rawBody, signature: tamperedSignature, queueAdd }),
      ),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("rejects a request with an absent signature header and enqueues nothing", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    await expect(
      webhookHandler(makeProps({ rawBody, signature: undefined, queueAdd })),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("rejects a malformed signature hash (invalid hex) and enqueues nothing", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    await expect(
      webhookHandler(makeProps({ rawBody, signature: "sha256=zz", queueAdd })),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("rejects a signature header with the wrong prefix and enqueues nothing", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())
    const wrongPrefix = sign(rawBody).replace("sha256=", "sha1=")

    await expect(
      webhookHandler(makeProps({ rawBody, signature: wrongPrefix, queueAdd })),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("rejects a truncated (wrong-length) signature hash and enqueues nothing", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())
    const truncated = sign(rawBody).slice(0, 20)

    await expect(
      webhookHandler(makeProps({ rawBody, signature: truncated, queueAdd })),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("accepts a valid signature over a non-ASCII (Vietnamese) body", async () => {
    const rawBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    text: { body: "Xin chào, tôi cần hỗ trợ đặt hàng." },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    await expect(
      webhookHandler(
        makeProps({ rawBody, signature: sign(rawBody), queueAdd }),
      ),
    ).resolves.toBe("ok")
  })

  test("accepts a replay of an already-accepted valid body (dedup is the queue's job)", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())
    const signature = sign(rawBody)

    await expect(
      webhookHandler(makeProps({ rawBody, signature, queueAdd })),
    ).resolves.toBe("ok")
    await expect(
      webhookHandler(makeProps({ rawBody, signature, queueAdd })),
    ).resolves.toBe("ok")
  })

  test("rejected requests surface a 401 status via SdkException", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    try {
      await webhookHandler(
        makeProps({ rawBody, signature: undefined, queueAdd }),
      )
      throw new Error("expected webhookHandler to reject")
    } catch (err) {
      expect(err).toBeInstanceOf(SdkException)
      expect((err as SdkException).httpStatusCode).toBe(401)
    }
  })
})

describe("webhookHandler signature policy (manual integrations without an app secret)", () => {
  let queueAdd: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queueAdd = vi.fn().mockResolvedValue(undefined)
    mockLogger.warn.mockClear()
  })

  test("manual + no secret ('legacy-unverified'): accepted unsigned, warned once, and still enqueues", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    await expect(
      webhookHandler(
        makeProps({
          rawBody,
          signature: undefined,
          queueAdd,
          clientSecret: undefined,
          manualIntegration: true,
        }),
      ),
    ).resolves.toBe("ok")

    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "manual-integration-without-app-secret",
      }),
      expect.stringContaining("unverified"),
    )
  })

  test("manual + no secret, with a call-event payload: the call event is still enqueued unverified", async () => {
    const rawBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "calls",
              value: {
                metadata: { phone_number_id: "phone-1" },
                calls: [
                  {
                    id: "wacid.legacy-1",
                    from: "16315551234",
                    to: "16505551111",
                    event: "connect",
                    timestamp: "1755700000",
                    direction: "USER_INITIATED",
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    await expect(
      webhookHandler(
        makeProps({
          rawBody,
          signature: undefined,
          queueAdd,
          clientSecret: undefined,
          manualIntegration: true,
        }),
      ),
    ).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledWith(
      "whatsappCallEvent",
      expect.anything(),
      expect.anything(),
    )
  })

  test("manual + a provided secret ('enforce'): a bad signature is still rejected and enqueues nothing", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    await expect(
      webhookHandler(
        makeProps({
          rawBody,
          signature: "sha256=deadbeef",
          queueAdd,
          clientSecret: "owner-supplied-app-secret",
          manualIntegration: true,
        }),
      ),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("manual + a provided secret ('enforce'): a valid signature is accepted", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())
    const secret = "owner-supplied-app-secret"

    await expect(
      webhookHandler(
        makeProps({
          rawBody,
          signature: sign(rawBody, secret),
          queueAdd,
          clientSecret: secret,
          manualIntegration: true,
        }),
      ),
    ).resolves.toBe("ok")
  })

  test("non-manual + no secret ('enforce', misconfiguration): rejected, not treated as a legacy path", async () => {
    const rawBody = JSON.stringify(emptyWebhookBody())

    await expect(
      webhookHandler(
        makeProps({
          rawBody,
          signature: undefined,
          queueAdd,
          clientSecret: undefined,
          manualIntegration: false,
        }),
      ),
    ).rejects.toThrow(SdkException)

    expect(queueAdd).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "missing-secret" }),
      expect.stringContaining("signature verification"),
    )
  })
})
