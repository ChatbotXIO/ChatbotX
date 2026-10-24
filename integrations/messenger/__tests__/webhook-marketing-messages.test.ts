import { createHmac } from "node:crypto"
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  PAGE_SUBSCRIBE_SCOPES,
  subscribePageToAppWebhook,
} from "../src/apis/page"
import { DEFAULT_API_VERSION } from "../src/constants"
import { webhookHandler } from "../src/handlers/webhook"
import type { MessengerConfig } from "../src/schema"

const CLIENT_SECRET = "test-client-secret"
const config = {
  clientSecret: CLIENT_SECRET,
  verifyToken: "verify-token",
} as unknown as MessengerConfig

const sign = (body: string) =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`

const run = (body: string, queue: { add: ReturnType<typeof vi.fn> }) =>
  webhookHandler({
    config,
    req: new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body) },
      body,
    }),
    queue: queue as never,
  } as HandleRequestProps<MessengerConfig>)

describe("marketing message webhooks", () => {
  let queue: { add: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  it("marketing_message_deliveries messaging item enqueues processMarketingMessageWebhook with pageId", async () => {
    const value = {
      field: "marketing_message_deliveries",
      message_id: "m-1",
      unexpected: { shape: true },
    }
    const body = JSON.stringify({
      object: "page",
      entry: [{ id: "page-9", time: 1_700_000_000, messaging: [value] }],
    })

    expect(await run(body, queue)).toBe("ok")
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledWith("processMarketingMessageWebhook", {
      type: "processMarketingMessageWebhook",
      data: {
        pageId: "page-9",
        field: "marketing_message_deliveries",
        value,
      },
    })
  })
})

// Real envelopes captured from Meta (spec V3): events are `messaging[]` items
// with a `field`, not `changes[]`.
describe("real marketing message webhook envelopes", () => {
  let queue: { add: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  it("marketing_message_delivery_failed messaging item is enqueued with the item as value", async () => {
    const body =
      '{"entry":[{"id":"236906180715173","messaging":[{"app_id":894156910972023,"business_id":553355495727951,"error_message":"Failed to send message. Please try again later","field":"marketing_message_delivery_failed","message_id":"120255821669280210","messenger_subscription_token":"6548567018098646545","page_id":236906180715173,"timestamp":1792592251}],"time":1792592261632}],"object":"page"}'

    expect(await run(body, queue)).toBe("ok")
    expect(queue.add).toHaveBeenCalledTimes(1)
    const [name, job] = queue.add.mock.calls[0]
    expect(name).toBe("processMarketingMessageWebhook")
    expect(job.data).toMatchObject({
      pageId: "236906180715173",
      field: "marketing_message_delivery_failed",
      value: {
        message_id: "120255821669280210",
        messenger_subscription_token: "6548567018098646545",
        error_message: "Failed to send message. Please try again later",
        timestamp: 1_792_592_251,
      },
    })
  })

  it("marketing_message_echoes keeps the exact digits of a numeric message_id", async () => {
    const body =
      '{"entry":[{"id":"121670690872419","messaging":[{"app_id":170005996917513,"field":"marketing_message_echoes","marketing_message_tracking_id":"ce55d4cf-080c-4907-aea3-6618276ede95","message_id":120254191797760183,"messenger_subscription_token":"516438291834149975","page_id":121670690872419,"timestamp":1792538896051}],"time":1792538899287}],"object":"page"}'

    expect(await run(body, queue)).toBe("ok")
    expect(queue.add).toHaveBeenCalledTimes(1)
    const [, job] = queue.add.mock.calls[0]
    expect(job.data).toMatchObject({
      pageId: "121670690872419",
      field: "marketing_message_echoes",
      value: {
        // 120254191797760183 is not a safe integer; JSON.parse would round it.
        message_id: "120254191797760183",
        marketing_message_tracking_id: "ce55d4cf-080c-4907-aea3-6618276ede95",
        messenger_subscription_token: "516438291834149975",
      },
    })
  })

  it("marketing_message_deliveries keeps the exact digits of a numeric messenger_subscription_token", async () => {
    const body =
      '{"entry":[{"id":"121670690872419","messaging":[{"app_id":170005996917513,"field":"marketing_message_deliveries","marketing_message_tracking_id":"ce55d4cf-080c-4907-aea3-6618276ede95","message_id":"120254191797760183","messenger_subscription_token":516438291834149975,"page_id":121670690872419,"timestamp":1792538896051}],"time":1792538899287}],"object":"page"}'

    expect(await run(body, queue)).toBe("ok")
    const [, job] = queue.add.mock.calls[0]
    expect(job.data).toMatchObject({
      field: "marketing_message_deliveries",
      value: {
        message_id: "120254191797760183",
        // 516438291834149975 is not a safe integer; JSON.parse would round it.
        messenger_subscription_token: "516438291834149975",
      },
    })
  })
})

describe("page subscription", () => {
  const URL = `https://graph.facebook.com/${DEFAULT_API_VERSION}/me/subscribed_apps`
  const MM = [
    "marketing_message_echoes",
    "marketing_message_deliveries",
    "marketing_message_delivery_failed",
  ]

  const capture = (failFirst: boolean) => {
    const bodies: string[][] = []
    server.use(
      http.post(URL, async ({ request }) => {
        const body = (await request.json()) as { subscribed_fields: string }
        bodies.push(body.subscribed_fields.split(","))
        if (failFirst && bodies.length === 1) {
          return HttpResponse.json(
            { error: { message: "bad field", code: 100 } },
            { status: 400 },
          )
        }
        return HttpResponse.json({ success: true })
      }),
    )
    return bodies
  }

  it("base scopes do not include marketing fields", () => {
    for (const f of MM) {
      expect(PAGE_SUBSCRIBE_SCOPES).not.toContain(f)
    }
  })

  it("sends base plus marketing fields on the success path", async () => {
    const bodies = capture(false)
    await subscribePageToAppWebhook({ pageId: "p", accessToken: "t" })
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toEqual(
      expect.arrayContaining([...PAGE_SUBSCRIBE_SCOPES, ...MM]),
    )
  })

  it("connect still succeeds when the marketing-inclusive subscribe is rejected", async () => {
    const bodies = capture(true)
    await expect(
      subscribePageToAppWebhook({ pageId: "p", accessToken: "t" }),
    ).resolves.toBeUndefined()
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual([...PAGE_SUBSCRIBE_SCOPES])
  })

  it("explicit fields without the flag are sent untouched (teardown)", async () => {
    const bodies = capture(false)
    await subscribePageToAppWebhook({
      pageId: "p",
      accessToken: "t",
      subscribedFields: "general_info",
    })
    expect(bodies).toEqual([["general_info"]])
  })
})
