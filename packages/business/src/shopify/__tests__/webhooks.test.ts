import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findIntegration: vi.fn(),
  queueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  shopifyRepository: {
    findIntegration: (...args: unknown[]) => mocks.findIntegration(...args),
  },
}))
vi.mock("../auth", () => ({
  decryptShopifyAuth: async () => ({
    kind: "token",
    accessToken: "shpat_x",
    apiSecret: "app-secret",
  }),
  webhookSecretOf: (secret: { apiSecret: string }) => secret.apiSecret,
}))
vi.mock("../integration.service", () => ({ shopifyIntegrationService: {} }))
vi.mock("../sync.service", () => ({ shopifySyncService: {} }))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { shopifyWebhook: "shopifyWebhook" },
  getShopifyWebhookJobId: (id: string) => `shopify-webhook-${id}`,
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

const { receiveShopifyWebhook, shopifyWebhookObjectId } = await import(
  "../webhooks"
)

const deliver = (input: {
  body: unknown
  topic: string
  secret?: string
  shop?: string
}) => {
  const rawBody = JSON.stringify(input.body)
  const headers = new Headers({
    "x-shopify-hmac-sha256": createHmac("sha256", input.secret ?? "app-secret")
      .update(rawBody)
      .digest("base64"),
    "x-shopify-topic": input.topic,
    "x-shopify-shop-domain": input.shop ?? "botxshop.myshopify.com",
    "x-shopify-webhook-id": "delivery-1",
  })
  return receiveShopifyWebhook({ workspaceId: "7", rawBody, headers })
}

describe("receiveShopifyWebhook", () => {
  beforeEach(() => {
    mocks.findIntegration.mockReset().mockResolvedValue({
      workspaceId: "7",
      shopDomain: "botxshop.myshopify.com",
    })
    mocks.queueAdd.mockReset().mockResolvedValue(undefined)
  })

  test("queues a signed delivery once per webhook id", async () => {
    await expect(
      deliver({
        topic: "orders/create",
        body: { id: 5, admin_graphql_api_id: "gid://shopify/Order/5" },
      }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "shopifyWebhook",
      {
        type: "shopifyWebhook",
        data: {
          workspaceId: "7",
          topic: "orders/create",
          objectId: "gid://shopify/Order/5",
        },
      },
      { jobId: "shopify-webhook-delivery-1" },
    )
  })

  test("refuses a bad signature and ignores another store", async () => {
    await expect(
      deliver({ topic: "orders/create", body: { id: 5 }, secret: "wrong" }),
    ).resolves.toEqual({ status: 401 })
    await expect(
      deliver({
        topic: "orders/create",
        body: { id: 5 },
        shop: "other.myshopify.com",
      }),
    ).resolves.toEqual({ status: 200 })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("answers 404 for a workspace with no store", async () => {
    mocks.findIntegration.mockResolvedValue(undefined)
    await expect(
      deliver({ topic: "orders/create", body: { id: 5 } }),
    ).resolves.toEqual({ status: 404 })
  })
})

describe("shopifyWebhookObjectId", () => {
  test("names the object each topic is about", () => {
    expect(
      shopifyWebhookObjectId("inventory_levels/update", {
        inventory_item_id: 9,
      }),
    ).toBe("gid://shopify/InventoryItem/9")
    expect(shopifyWebhookObjectId("fulfillments/update", { order_id: 3 })).toBe(
      "gid://shopify/Order/3",
    )
    expect(shopifyWebhookObjectId("products/delete", { id: 4 })).toBe(
      "gid://shopify/Product/4",
    )
    expect(
      shopifyWebhookObjectId("discounts/update", {
        admin_graphql_api_id: "gid://shopify/DiscountCodeNode/2",
      }),
    ).toBe("gid://shopify/DiscountCodeNode/2")
  })
})
