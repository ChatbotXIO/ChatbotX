import {
  wooCommerceOrderSchema,
  wooCommerceProductSchema,
} from "@chatbotx.io/integration-woocommerce"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findIntegration: vi.fn(),
  findByExternalId: vi.fn(),
  findVariantsForVariations: vi.fn(),
  findProductsByExternalIds: vi.fn(),
  deleteProductByExternalId: vi.fn(),
  upsertProduct: vi.fn(),
  syncExternal: vi.fn(),
  getProduct: vi.fn(),
  getOrder: vi.fn(),
  listVariations: vi.fn(),
  storeSource: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../../audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("../../logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  woocommerceRepository: {
    findIntegration: (...args: unknown[]) => mocks.findIntegration(...args),
    updateIntegration: vi.fn(),
  },
  orderRepository: {
    findByExternalId: (...args: unknown[]) => mocks.findByExternalId(...args),
  },
  externalStoreRepository: {
    findVariantsForVariations: (...args: unknown[]) =>
      mocks.findVariantsForVariations(...args),
    findProductsByExternalIds: (...args: unknown[]) =>
      mocks.findProductsByExternalIds(...args),
    deleteProductByExternalId: (...args: unknown[]) =>
      mocks.deleteProductByExternalId(...args),
    upsertProduct: (...args: unknown[]) => mocks.upsertProduct(...args),
  },
  productCategoryRepository: { createMissingByName: async () => [] },
  vendorRepository: { createMissing: vi.fn(), findByNames: async () => [] },
}))
vi.mock("@chatbotx.io/integration-woocommerce", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getWooCommerceProduct: (...args: unknown[]) => mocks.getProduct(...args),
  getWooCommerceOrder: (...args: unknown[]) => mocks.getOrder(...args),
  listWooCommerceVariations: (...args: unknown[]) =>
    mocks.listVariations(...args),
}))
vi.mock("../../order/service", () => ({
  orderService: {
    syncExternal: (...args: unknown[]) => mocks.syncExternal(...args),
  },
}))
vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    storeSource: (...args: unknown[]) => mocks.storeSource(...args),
  },
}))
vi.mock("../../external-store/orders", () => ({
  EXTERNAL_CONTACT_ATTRIBUTE: "cbx_ref",
  nextMirroredStatus: (_current: string, incoming: string) => incoming,
  resolveExternalOrderContact: async () => null,
  removeOrderedFromCart: vi.fn(),
  syncErrorMessage: (error: Error) => error.message,
  variantLabelOf: (combination: Record<string, string> | null) =>
    combination
      ? Object.entries(combination)
          .map(([option, value]) => `${option}: ${value}`)
          .join(", ")
      : null,
}))
vi.mock("../auth", () => ({
  resolveWooCommerceCredentials: async () => ({
    siteUrl: "https://shop.example.com",
    consumerKey: "ck",
    consumerSecret: "cs",
    authMode: "header",
  }),
}))
vi.mock("../integration.service", () => ({
  wooCommerceIntegrationService: { markInvalid: vi.fn() },
}))

const { wooCommerceSyncService } = await import("../sync.service")

const row = {
  workspaceId: "7",
  siteUrl: "https://shop.example.com",
  currency: "USD",
  status: "active",
} as never

const order = (overrides: Record<string, unknown> = {}) =>
  wooCommerceOrderSchema.parse({
    id: 99,
    number: "99",
    status: "processing",
    currency: "USD",
    total: "20",
    billing: {},
    shipping: {},
    line_items: [
      {
        id: 1,
        name: "Tee",
        product_id: 10,
        variation_id: 30,
        quantity: 1,
        subtotal: "20",
        total: "20",
        meta_data: [
          {
            key: "pa_size",
            value: "l",
            display_key: "Size",
            display_value: "L",
          },
        ],
      },
    ],
    ...overrides,
  })

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
  mocks.findIntegration.mockResolvedValue(row)
  mocks.findVariantsForVariations.mockResolvedValue([])
  mocks.findProductsByExternalIds.mockResolvedValue([])
  mocks.syncExternal.mockResolvedValue({ order: { id: "o1" }, created: true })
  mocks.storeSource.mockResolvedValue("woocommerce")
})

describe("mirrorOrder", () => {
  test("an unpaid Web Checkout order is not mirrored yet", async () => {
    mocks.findByExternalId.mockResolvedValue(undefined)
    const result = await wooCommerceSyncService.mirrorOrder(
      row,
      order({
        status: "pending",
        meta_data: [{ key: "cbx_checkout", value: "web" }],
      }),
      { announce: true },
    )
    expect(result).toBeNull()
    expect(mocks.syncExternal).not.toHaveBeenCalled()
  })

  test("a paid Web Checkout order is mirrored under its site", async () => {
    await wooCommerceSyncService.mirrorOrder(
      row,
      order({ meta_data: [{ key: "cbx_checkout", value: "web" }] }),
      { announce: true },
    )
    expect(mocks.syncExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "woocommerce",
        externalId: "shop.example.com#99",
        status: "accepted",
        announce: true,
      }),
    )
  })

  test('an "Any …" line links to the variant its meta picked', async () => {
    const variant = (externalId: string, variantId: string) => ({
      externalId,
      variantId,
      combination: { Size: externalId.endsWith("L") ? "L" : "M" },
      productId: "p1",
      productExternalId: "10",
      categoryId: null,
      vendorId: null,
    })
    mocks.findVariantsForVariations.mockResolvedValue([
      variant("30~Size=M", "v-m"),
      variant("30~Size=L", "v-l"),
    ])
    await wooCommerceSyncService.mirrorOrder(row, order(), { announce: false })
    const [{ items }] = mocks.syncExternal.mock.calls[0] as [
      { items: Array<{ variantId: string | null; productId: string | null }> },
    ]
    expect(items[0]).toMatchObject({ variantId: "v-l", productId: "p1" })
  })
})

describe("deleteProduct", () => {
  test("a deleted variation reads its variable product again", async () => {
    mocks.findVariantsForVariations.mockResolvedValue([
      { externalId: "30", productExternalId: "10" },
    ])
    mocks.getProduct.mockResolvedValue(
      wooCommerceProductSchema.parse({
        id: 10,
        name: "Tee",
        type: "variable",
        status: "publish",
        catalog_visibility: "visible",
        price: "20",
        stock_status: "instock",
      }),
    )
    mocks.listVariations.mockResolvedValue([])
    await wooCommerceSyncService.deleteProduct("7", "30")
    expect(mocks.getProduct).toHaveBeenCalledWith(expect.anything(), "10")
    expect(mocks.upsertProduct).toHaveBeenCalled()
    expect(mocks.deleteProductByExternalId).not.toHaveBeenCalled()
  })

  test("a deleted product is removed", async () => {
    await wooCommerceSyncService.deleteProduct("7", "10")
    expect(mocks.deleteProductByExternalId).toHaveBeenCalledWith({
      workspaceId: "7",
      source: "woocommerce",
      externalId: "10",
    })
  })
})

test("an order webhook refreshes stock with one connection lookup", async () => {
  mocks.getOrder.mockResolvedValue(order())
  mocks.getProduct.mockResolvedValue(null)
  await wooCommerceSyncService.syncOrder("7", "99")
  expect(mocks.findIntegration).toHaveBeenCalledTimes(1)
  expect(mocks.getProduct).toHaveBeenCalledWith(expect.anything(), "10")
})
