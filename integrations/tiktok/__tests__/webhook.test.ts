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

const sign = (body: string, timestamp: number) => {
  const signature = createHmac("sha256", CLIENT_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex")

  return `t=${timestamp},s=${signature}`
}

const makeProps = (
  payload: Record<string, unknown>,
  queue: MockQueue,
): HandleRequestProps<TiktokConfig> => {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)

  return {
    config,
    req: new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "TikTok-Signature": sign(body, timestamp) },
      body,
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
    const [jobName, job] = queue.add.mock.calls[0] ?? []
    expect(jobName).toBe("incomingMessage")
    expect(job).toEqual({
      type: "incomingMessage",
      data: {
        integrationType: "tiktok",
        integrationIdentifier: "account-open-id",
        payload,
      },
    })
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
})
