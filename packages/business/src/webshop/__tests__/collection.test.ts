import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listForShop: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  productRepository: {
    listForShop: (...args: unknown[]) => mocks.listForShop(...args),
  },
}))
vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: (...args: unknown[]) => mocks.getSettings(...args),
  },
}))
vi.mock("../../platform/settings", () => ({
  resolveTenantSettings: async () => ({ appUrl: "https://app.example" }),
}))
vi.mock("@chatbotx.io/encryption/shop-token", () => ({
  signShopToken: async (input: { contactId: string }) =>
    `signed-${input.contactId}`,
}))
vi.mock("../../order/message-language", () => ({
  resolveCustomerMessageLanguage: async () => "vi",
}))

const { buildCollectionCards, listCollectionProducts, resolveCollectionStep } =
  await import("../collection")

const settings = (
  overrides: {
    general?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.general>
    checkout?: Partial<typeof ECOMMERCE_SETTINGS_DEFAULTS.checkout>
  } = {},
) => ({
  ...ECOMMERCE_SETTINGS_DEFAULTS,
  general: { ...ECOMMERCE_SETTINGS_DEFAULTS.general, ...overrides.general },
  payments: {
    ...ECOMMERCE_SETTINGS_DEFAULTS.payments,
    currency: "USD",
    currencySymbol: "$",
    currencyPosition: "left" as const,
  },
  checkout: { ...ECOMMERCE_SETTINGS_DEFAULTS.checkout, ...overrides.checkout },
})

const product = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Product ${id}`,
  price: 20,
  discount: 0,
  vendorDiscountPercent: 0,
  images: [{ url: `https://img/${id}.jpg`, type: "link" }],
  categoryId: "cat1",
  productUrl: `https://brand.example/${id}`,
  vendor: "Acme",
  ...overrides,
})

const automated = {
  collectionType: "automated" as const,
  conditions: {
    name: " shirt ",
    categoryId: "cat1",
    subcategoryId: "sub1",
    vendorId: "v1",
  },
  productIds: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSettings.mockResolvedValue(settings())
  mocks.listForShop.mockResolvedValue({ data: [product("p1")], pageCount: 1 })
})

describe("listCollectionProducts", () => {
  test("automated: filters like the shop, the sub-category narrowing the category", async () => {
    await listCollectionProducts({ workspaceId: "ws1", step: automated })
    expect(mocks.listForShop).toHaveBeenCalledWith({
      workspaceId: "ws1",
      keyword: "shirt",
      categoryId: "sub1",
      vendorId: "v1",
      page: 1,
      perPage: 10,
    })
  })

  test("manual: only shown products, in the chosen order", async () => {
    mocks.listForShop.mockResolvedValue({
      data: [product("p1"), product("p3")],
      pageCount: 1,
    })
    const products = await listCollectionProducts({
      workspaceId: "ws1",
      step: {
        collectionType: "manual",
        conditions: automated.conditions,
        productIds: ["p3", "p2-hidden", "p1"],
      },
    })
    expect(products.map((row) => row.id)).toEqual(["p3", "p1"])
  })
})

describe("buildCollectionCards", () => {
  test("the price stacks the vendor's discount on the product's, as the cart does", async () => {
    // 100, 10% off, vendor 20% off: 72 — never 90.
    mocks.listForShop.mockResolvedValue({
      data: [
        product("p1", { price: 100, discount: 10, vendorDiscountPercent: 20 }),
      ],
      pageCount: 1,
    })
    const [card] = await buildCollectionCards({
      workspaceId: "ws1",
      step: automated,
      appUrl: "https://app.example",
      shopToken: "TOKEN",
      language: "en",
    })
    expect(card?.subtitle).toBe("$72.00 · Acme")
  })

  test("a card per product, opening its shop page signed per contact", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({ general: { productButtons: ["addToCart"] } }),
    )
    mocks.listForShop.mockResolvedValue({
      data: [product("p1", { discount: 25 })],
      pageCount: 1,
    })
    const [card] = await buildCollectionCards({
      workspaceId: "ws1",
      step: automated,
      appUrl: "https://app.example",
      shopToken: "TOKEN",
      language: "en",
    })
    expect(card).toMatchObject({
      stepType: "sendCard",
      title: "Product p1",
      subtitle: "$15.00 · Acme",
      image: { url: "https://img/p1.jpg", mode: "url" },
    })
    expect(card?.buttons).toEqual([
      expect.objectContaining({
        label: "View",
        buttonType: "openWebsite",
        beforeStep: expect.objectContaining({
          url: "https://app.example/shop/ws1/products/p1?token=TOKEN",
        }),
      }),
    ])
  })

  test("Similar opens the product's category when the store shows that button", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({ general: { productButtons: ["addToCart", "similar"] } }),
    )
    const [card] = await buildCollectionCards({
      workspaceId: "ws1",
      step: automated,
      appUrl: "https://app.example",
      shopToken: "TOKEN",
      language: "vi",
    })
    expect(card?.buttons.map((button) => button.label)).toEqual([
      "Xem",
      "Tương tự",
    ])
    expect(card?.buttons[1]).toMatchObject({
      beforeStep: {
        url: "https://app.example/shop/ws1?token=TOKEN&category=cat1",
      },
    })
  })

  test("with the external product page checkout, Buy opens the product's own page", async () => {
    mocks.getSettings.mockResolvedValue(
      settings({ checkout: { checkoutMode: "productPage" } }),
    )
    const [card] = await buildCollectionCards({
      workspaceId: "ws1",
      step: automated,
      appUrl: "https://app.example",
      shopToken: "TOKEN",
      language: "en",
    })
    expect(card?.buttons[0]).toMatchObject({
      label: "Buy",
      beforeStep: { url: "https://brand.example/p1" },
    })
  })

  test("long names fit Messenger's 80 characters", async () => {
    mocks.listForShop.mockResolvedValue({
      data: [product("p1", { name: "x".repeat(120) })],
      pageCount: 1,
    })
    const [card] = await buildCollectionCards({
      workspaceId: "ws1",
      step: automated,
      appUrl: "https://app.example",
      shopToken: "TOKEN",
      language: "en",
    })
    expect(card?.title).toHaveLength(80)
  })
})

describe("resolveCollectionStep", () => {
  test("is null when no product matches, so the step is skipped", async () => {
    mocks.listForShop.mockResolvedValue({ data: [], pageCount: 0 })
    await expect(
      resolveCollectionStep({
        workspaceId: "ws1",
        contactId: "c1",
        step: automated,
      }),
    ).resolves.toBeNull()
  })

  test("labels the cards in the contact's language", async () => {
    const resolved = await resolveCollectionStep({
      workspaceId: "ws1",
      contactId: "c1",
      step: automated,
    })
    expect(resolved?.cards[0]?.buttons[0]?.label).toBe("Xem")
  })

  test("signs the card links for the contact", async () => {
    const resolved = await resolveCollectionStep({
      workspaceId: "ws1",
      contactId: "c1",
      step: automated,
    })
    expect(resolved?.cards[0]?.buttons[0]).toMatchObject({
      beforeStep: {
        url: "https://app.example/shop/ws1/products/p1?token=signed-c1",
      },
    })
  })
})
