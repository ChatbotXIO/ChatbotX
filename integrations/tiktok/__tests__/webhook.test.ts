import { createHmac } from "node:crypto"
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import type { TiktokConfig } from "../src/schema"

type MockQueue = { add: MockInstance }

const CLIENT_SECRET = "test-client-secret"
const config = {
  clientId: "test-client-id",
  clientSecret: CLIENT_SECRET,
  openId: "account-open-id",
  redirectUrl: "https://example.com/callback",
} as TiktokConfig

const buildPayload = (event: string) => ({
  client_key: "client-key",
  event,
  create_time: 1_700_000_000,
  user_openid: "sender-open-id",
  content: '{"message":"hello"}',
})

const sign = (
  body: string,
  timestamp: number,
  secret: string = CLIENT_SECRET,
) => {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")

  return `t=${timestamp},s=${signature}`
}

const makeProps = (
  payload: Record<string, unknown>,
  queue: MockQueue,
  overrides: {
    config?: TiktokConfig
    signatureHeader?: string | null
    signSecret?: string
    timestamp?: number
  } = {},
): HandleRequestProps<TiktokConfig> => {
  const body = JSON.stringify(payload)
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000)
  const signatureHeader =
    overrides.signatureHeader === undefined
      ? sign(body, timestamp, overrides.signSecret)
      : overrides.signatureHeader

  const headers: Record<string, string> = {}
  if (signatureHeader !== null) {
    headers["TikTok-Signature"] = signatureHeader
  }

  return {
    config: overrides.config ?? config,
    req: new Request("https://example.com/webhook", {
      body,
      headers,
      method: "POST",
    }),
    queue: queue as never,
  }
}

describe("webhookHandler", () => {
  let queue: MockQueue

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  test.each([
    "im_receive_msg",
    "im_send_msg",
  ])("enqueues %s as an incoming TikTok message", async (event) => {
    const payload = buildPayload(event)

    await expect(webhookHandler(makeProps(payload, queue))).resolves.toBe("ok")

    expect(queue.add).toHaveBeenCalledTimes(1)
    const [jobName, job, options] = queue.add.mock.calls[0] ?? []
    expect(jobName).toBe("incomingMessage")
    expect(job).toEqual({
      type: "incomingMessage",
      data: {
        integrationType: "tiktok",
        integrationIdentifier: "account-open-id",
        payload,
      },
    })
    // im_send_msg is the echo of our own outgoing API call; delaying it
    // guards against the echo arriving before the send API response does.
    expect(options).toEqual(
      event === "im_send_msg" ? { delay: 2000 } : undefined,
    )
  })

  test("does not enqueue an authorization removal event", async () => {
    await expect(
      webhookHandler(makeProps(buildPayload("authorization.removed"), queue)),
    ).resolves.toBe("ok")

    expect(queue.add).not.toHaveBeenCalled()
  })

  test("does not enqueue an unsupported event", async () => {
    await expect(
      webhookHandler(makeProps(buildPayload("profile.updated"), queue)),
    ).resolves.toBe("ok")

    expect(queue.add).not.toHaveBeenCalled()
  })

  test("does not enqueue a schema-invalid payload", async () => {
    const invalidPayload = {
      client_key: "client-key",
      create_time: "not-a-number",
      event: "im_receive_msg",
      user_openid: "sender-open-id",
      // `content` intentionally omitted — fails `tiktokWebhookEventSchema`.
    }

    await expect(
      webhookHandler(makeProps(invalidPayload, queue)),
    ).resolves.toBe("ok")

    expect(queue.add).not.toHaveBeenCalled()
  })

  // Anti-replay/anti-forgery branches: every one of these must reject before
  // an event is ever parsed or enqueued, or a forged/replayed request would
  // pass as a legitimate webhook call.
  test.each([
    {
      buildProps: (queue: MockQueue) =>
        makeProps(buildPayload("im_receive_msg"), queue, {
          signatureHeader: null,
        }),
      name: "the signature header is missing",
    },
    {
      buildProps: (queue: MockQueue) =>
        makeProps(buildPayload("im_receive_msg"), queue, {
          signSecret: "wrong-secret",
        }),
      name: "the signature was produced with the wrong secret",
    },
    {
      buildProps: (queue: MockQueue) =>
        makeProps(buildPayload("im_receive_msg"), queue, {
          timestamp: Math.floor(Date.now() / 1000) - 301,
        }),
      name: "the timestamp is older than the 300s replay window",
    },
    {
      buildProps: (queue: MockQueue) =>
        makeProps(buildPayload("im_receive_msg"), queue, {
          timestamp: Math.floor(Date.now() / 1000) + 3,
        }),
      name: "the timestamp is more than 2s ahead (clock skew)",
    },
  ])("rejects the webhook when $name", async ({ buildProps }) => {
    await expect(webhookHandler(buildProps(queue))).rejects.toThrow(
      "Invalid or missing webhook signature",
    )

    expect(queue.add).not.toHaveBeenCalled()
  })

  test("rejects an empty webhook payload before verifying the signature", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request("https://example.com/webhook", {
          body: "",
          headers: {
            "TikTok-Signature": sign("", Math.floor(Date.now() / 1000)),
          },
          method: "POST",
        }),
        queue: queue as never,
      }),
    ).rejects.toThrow("Empty webhook payload")

    expect(queue.add).not.toHaveBeenCalled()
  })

  test("rejects when the integration config has no client secret", async () => {
    const payload = buildPayload("im_receive_msg")

    await expect(
      webhookHandler(
        makeProps(payload, queue, {
          config: { ...config, clientSecret: "" },
        }),
      ),
    ).rejects.toThrow("Missing client secret for webhook verification")

    expect(queue.add).not.toHaveBeenCalled()
  })
})
