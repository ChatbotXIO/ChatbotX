import { beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateIntegration: vi.fn(),
  getShop: vi.fn(),
  adopt: vi.fn(),
  listOrders: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../../audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("../../logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  shopifyRepository: {
    findIntegration: async () => ({
      workspaceId: "7",
      shopDomain: "botxshop.myshopify.com",
      shopName: "BotX",
      currency: "USD",
      orderCount: 0,
    }),
    updateIntegration: (...args: unknown[]) => mocks.updateIntegration(...args),
  },
  externalStoreRepository: { countProducts: async () => 3 },
  productCategoryRepository: {},
  vendorRepository: {},
}))
vi.mock("@chatbotx.io/integration-shopify", () => ({
  getShopifyShop: (...args: unknown[]) => mocks.getShop(...args),
  listShopifyOrders: (...args: unknown[]) => mocks.listOrders(...args),
  SHOPIFY_ORDER_SYNC_DAYS: 60,
  ShopifyApiError: class extends Error {},
}))
vi.mock("../auth", () => ({
  resolveShopifyCredentials: async () => ({
    shopDomain: "botxshop.myshopify.com",
    accessToken: "shpat_x",
  }),
}))
vi.mock("../integration.service", () => ({
  shopifyIntegrationService: { markInvalid: vi.fn() },
}))
vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: { storeSource: async () => "shopify" },
}))
vi.mock("../../ecommerce-settings/store-source", () => ({
  adoptExternalStoreCurrency: (...args: unknown[]) => mocks.adopt(...args),
}))
vi.mock("../../external-store/orders", () => ({
  EXTERNAL_CONTACT_ATTRIBUTE: "cbx_ref",
  removeOrderedFromCart: vi.fn(),
  resolveExternalOrderContact: vi.fn(),
  syncErrorMessage: (error: Error) => error.message,
  variantLabelOf: vi.fn(),
}))
vi.mock("../../order/service", () => ({ orderService: {} }))

const { shopifySyncService } = await import("../sync.service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listOrders.mockResolvedValue({
    nodes: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  })
  mocks.updateIntegration.mockImplementation(async (input) => ({
    workspaceId: "7",
    currency: input.values.currency ?? "USD",
  }))
})

test("a sync brings the Shopify store's currency to the store settings", async () => {
  mocks.getShop.mockResolvedValue({
    name: "BotX",
    currencyCode: "VND",
    myshopifyDomain: "botxshop.myshopify.com",
  })
  await shopifySyncService.run({ workspaceId: "7", scope: "orders" })
  expect(mocks.updateIntegration).toHaveBeenCalledWith({
    workspaceId: "7",
    values: { currency: "VND", shopName: "BotX" },
  })
  expect(mocks.adopt).toHaveBeenCalledWith({
    workspaceId: "7",
    source: "shopify",
    currency: "VND",
  })
})

test("an unchanged currency still reaches settings left behind", async () => {
  mocks.getShop.mockResolvedValue({
    name: "BotX",
    currencyCode: "USD",
    myshopifyDomain: "botxshop.myshopify.com",
  })
  await shopifySyncService.run({ workspaceId: "7", scope: "orders" })
  expect(mocks.adopt).toHaveBeenCalledWith(
    expect.objectContaining({ currency: "USD" }),
  )
  // Only the sync's own status writes, no currency change on the connection.
  expect(mocks.updateIntegration).not.toHaveBeenCalledWith(
    expect.objectContaining({ values: { currency: "USD", shopName: "BotX" } }),
  )
})
