import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findIntegration: vi.fn(),
  queueAdd: vi.fn(),
  syncProduct: vi.fn(),
  deleteProduct: vi.fn(),
  syncOrder: vi.fn(),
  syncCoupon: vi.fn(),
  deleteCoupon: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  woocommerceRepository: {
    findIntegration: (...args: unknown[]) => mocks.findIntegration(...args),
  },
}))
vi.mock("../auth", () => ({
  decryptWooCommerceAuth: async () => ({
    consumerKey: "ck_x",
    consumerSecret: "cs_x",
    webhookSecret: "webhook-secret",
    authMode: "header",
  }),
}))
vi.mock("../sync.service", () => ({
  wooCommerceSyncService: {
    syncProduct: (...args: unknown[]) => mocks.syncProduct(...args),
    deleteProduct: (...args: unknown[]) => mocks.deleteProduct(...args),
    syncOrder: (...args: unknown[]) => mocks.syncOrder(...args),
    syncCoupon: (...args: unknown[]) => mocks.syncCoupon(...args),
    deleteCoupon: (...args: unknown[]) => mocks.deleteCoupon(...args),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { woocommerceWebhook: "woocommerceWebhook" },
  getWoocommerceWebhookJobId: (id: string) => `woocommerce-webhook-${id}`,
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

const { processWooCommerceWebhook, receiveWooCommerceWebhook } = await import(
  "../webhooks"
)

const JOB_ID_PATTERN = /^woocommerce-webhook-7-[0-9a-f]{64}$/

const deliver = (input: {
  body: unknown
  topic: string | null
  secret?: string
  source?: string
}) => {
  const rawBody =
    typeof input.body === "string" ? input.body : JSON.stringify(input.body)
  const headers = new Headers({
    "x-wc-webhook-signature": createHmac(
      "sha256",
      input.secret ?? "webhook-secret",
    )
      .update(rawBody)
      .digest("base64"),
    "x-wc-webhook-source": input.source ?? "https://shop.example.com/",
    "x-wc-webhook-delivery-id": "delivery-1",
    ...(input.topic ? { "x-wc-webhook-topic": input.topic } : {}),
  })
  return receiveWooCommerceWebhook({ workspaceId: "7", rawBody, headers })
}

describe("receiveWooCommerceWebhook", () => {
  beforeEach(() => {
    mocks.findIntegration.mockReset().mockResolvedValue({
      workspaceId: "7",
      siteUrl: "https://shop.example.com",
    })
    mocks.queueAdd.mockReset().mockResolvedValue(undefined)
  })

  test("queues a signed delivery once per delivery id", async () => {
    await expect(
      deliver({
        topic: "order.updated",
        body: { id: 99, status: "completed" },
      }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "woocommerceWebhook",
      {
        type: "woocommerceWebhook",
        data: { workspaceId: "7", topic: "order.updated", resourceId: "99" },
      },
      { jobId: expect.stringMatching(JOB_ID_PATTERN) },
    )
  })

  test("two changes in the same second are two jobs; a repeat is one", async () => {
    // WooCommerce's delivery id is the webhook and the second: it repeats.
    await deliver({
      topic: "order.updated",
      body: { id: 99, status: "pending" },
    })
    await deliver({
      topic: "order.updated",
      body: { id: 99, status: "processing" },
    })
    await deliver({
      topic: "order.updated",
      body: { id: 99, status: "processing" },
    })
    const jobIds = mocks.queueAdd.mock.calls.map((call) => call[2].jobId)
    expect(jobIds[0]).not.toBe(jobIds[1])
    expect(jobIds[1]).toBe(jobIds[2])
  })

  test("answers the creation ping, even before the store is saved", async () => {
    mocks.findIntegration.mockResolvedValue(undefined)
    await expect(
      deliver({ topic: null, body: "webhook_id=12" }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("refuses a bad signature", async () => {
    await expect(
      deliver({ topic: "order.created", body: { id: 1 }, secret: "other" }),
    ).resolves.toEqual({ status: 401 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("answers 404 when no store is connected", async () => {
    mocks.findIntegration.mockResolvedValue(undefined)
    await expect(
      deliver({ topic: "order.created", body: { id: 1 } }),
    ).resolves.toEqual({ status: 404 })
  })

  test("ignores a delivery from another site", async () => {
    await expect(
      deliver({
        topic: "order.created",
        body: { id: 1 },
        source: "https://evil.example.com/",
      }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })
})

describe("processWooCommerceWebhook", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
  })

  test.each([
    ["product.updated", "syncProduct"],
    ["product.restored", "syncProduct"],
    ["product.deleted", "deleteProduct"],
    ["coupon.created", "syncCoupon"],
    ["coupon.deleted", "deleteCoupon"],
    ["order.created", "syncOrder"],
    ["order.updated", "syncOrder"],
  ] as const)("%s → %s", async (topic, handler) => {
    await processWooCommerceWebhook({
      workspaceId: "7",
      topic,
      resourceId: "5",
    })
    expect(mocks[handler]).toHaveBeenCalledWith("7", "5")
  })

  test("a deleted order keeps its mirror", async () => {
    await processWooCommerceWebhook({
      workspaceId: "7",
      topic: "order.deleted",
      resourceId: "5",
    })
    expect(mocks.syncOrder).not.toHaveBeenCalled()
  })
})
