import { ECOMMERCE_SETTINGS_DEFAULTS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listSearchableNames: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  productRepository: {
    listSearchableNames: (...args: unknown[]) =>
      mocks.listSearchableNames(...args),
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
}))
vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: (...args: unknown[]) => mocks.getSettings(...args),
  },
}))
vi.mock("../../platform/settings", () => ({
  resolveWorkspaceAppUrl: async () => "https://app.example",
}))
vi.mock("../../order/message-language", () => ({
  resolveCustomerMessageLanguage: async () => "vi",
}))

const { buildProductSearchReply, matchProductNames, normalizeForSearch } =
  await import("../product-search")

const products = [
  { id: "p1", name: "Áo thun" },
  { id: "p2", name: "Áo thun cotton" },
  { id: "p3", name: "Quần jean" },
  { id: "p4", name: "Đồng hồ" },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSettings.mockResolvedValue({
    ...ECOMMERCE_SETTINGS_DEFAULTS,
    general: { ...ECOMMERCE_SETTINGS_DEFAULTS.general, searchProducts: true },
  })
  mocks.listSearchableNames.mockResolvedValue(products)
})

describe("normalizeForSearch", () => {
  test("ignores case, accents, đ and punctuation", () => {
    expect(normalizeForSearch("  Đồng HỒ, giá?! ")).toBe("dong ho gia")
  })
})

describe("matchProductNames", () => {
  test("a message naming a product finds it, the exact name first", () => {
    expect(
      matchProductNames("cho mình xem ao thun nhé", products).map((p) => p.id),
    ).toEqual(["p1"])
    expect(matchProductNames("áo thun", products).map((p) => p.id)).toEqual([
      "p1",
      "p2",
    ])
  })

  test("whole words only", () => {
    expect(matchProductNames("dong hoa", products)).toEqual([])
  })

  test("too short a message matches nothing", () => {
    expect(matchProductNames("ao", products)).toEqual([])
  })

  test("accents count where the customer typed them", () => {
    const fruit = [{ id: "cam", name: "Cam" }]
    expect(matchProductNames("Cảm ơn shop", fruit)).toEqual([])
    expect(matchProductNames("cho mình 2 ký cam", fruit)).toEqual(fruit)
    expect(matchProductNames("bán cam không", fruit)).toEqual(fruit)
  })

  test("one short word does not list every name containing it", () => {
    const named = [{ id: "combo", name: "Combo mua 1 tặng 1" }]
    expect(matchProductNames("mua", named)).toEqual([])
    expect(matchProductNames("combo mua", named)).toEqual(named)
  })
})

describe("buildProductSearchReply", () => {
  test("Messenger gets a product collection of the matches", async () => {
    const step = await buildProductSearchReply({
      workspaceId: "ws1",
      contactId: "c1",
      channel: "messenger",
      text: "quần jean",
    })
    expect(step).toMatchObject({
      stepType: "sendCollection",
      collectionType: "manual",
      productIds: ["p3"],
    })
  })

  test("other channels get the names and a button opening the one product found", async () => {
    const step = await buildProductSearchReply({
      workspaceId: "ws1",
      contactId: "c1",
      channel: "whatsapp",
      text: "cho mình xem quần jean nhé",
    })
    expect(step).toMatchObject({
      stepType: "sendText",
      text: "Đây là các sản phẩm phù hợp:\n• Quần jean",
      buttons: [
        expect.objectContaining({
          label: "Xem sản phẩm",
          beforeStep: expect.objectContaining({
            url: "https://app.example/shop/ws1/products/p3?token={{shop_token}}",
          }),
        }),
      ],
    })
  })

  test("the button lists the products found, never the message", async () => {
    const step = await buildProductSearchReply({
      workspaceId: "ws1",
      contactId: "c1",
      channel: "whatsapp",
      text: "áo thun",
    })
    expect(step).toMatchObject({
      buttons: [
        expect.objectContaining({
          beforeStep: expect.objectContaining({
            url: "https://app.example/shop/ws1?token={{shop_token}}&products=p1,p2",
          }),
        }),
      ],
    })
  })

  test("nothing while the store has Search Products off", async () => {
    mocks.getSettings.mockResolvedValue({
      ...ECOMMERCE_SETTINGS_DEFAULTS,
      general: {
        ...ECOMMERCE_SETTINGS_DEFAULTS.general,
        searchProducts: false,
      },
    })
    await expect(
      buildProductSearchReply({
        workspaceId: "ws1",
        contactId: "c1",
        channel: "messenger",
        text: "quần jean",
      }),
    ).resolves.toBeNull()
    expect(mocks.listSearchableNames).not.toHaveBeenCalled()
  })

  test("nothing when the message names no product", async () => {
    await expect(
      buildProductSearchReply({
        workspaceId: "ws1",
        contactId: "c1",
        channel: "messenger",
        text: "xin chào shop",
      }),
    ).resolves.toBeNull()
  })
})
