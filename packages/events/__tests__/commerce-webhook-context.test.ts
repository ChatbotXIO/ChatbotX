import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  hasActiveWebhooks: vi.fn(),
  queueAdd: vi.fn(),
}))

vi.mock("../src/webhook/cache", () => ({
  hasActiveWebhooks: mocks.hasActiveWebhooks,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  webhookQueue: { add: mocks.queueAdd },
}))

const { WebhookEventEmitter } = await import("../src/webhook/emitter")

const order = {
  orderId: "o-1",
  orderNumber: 1,
  status: "accepted",
  source: "webshop",
  total: 10,
  currency: "USD",
  discountCode: null,
  channel: null,
  conversationId: null,
  products: [],
}

describe("webhooks for store events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveWebhooks.mockResolvedValue(true)
  })

  test("an order event reaches webhooks outside a channel context", async () => {
    // A member accepting the order in the app: no channel-originated context.
    await WebhookEventEmitter.orderStatus("orderAccepted", "ws-1", "c-1", order)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("other events still need the channel context", async () => {
    await WebhookEventEmitter.tagApplied("ws-1", "c-1", "tag-1")
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})
