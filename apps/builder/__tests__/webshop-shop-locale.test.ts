// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { getStorefront, resolveShopSession } = vi.hoisted(() => ({
  getStorefront: vi.fn(),
  resolveShopSession: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  webshopService: { getStorefront },
}))
vi.mock("../src/features/webshop/lib/shop-session", () => ({
  resolveShopSession,
}))

const { loadShop } = await import("../src/features/webshop/lib/load-shop")

const storefront = (language: string) => ({
  storeName: "Shop",
  brandColor: null,
  language,
  ordering: { open: true, reason: null },
  categories: [],
  vendors: [],
  settings: {
    payments: {
      currency: "USD",
      currencySymbol: "$",
      currencyPosition: "before",
    },
    general: {},
    checkout: {},
    shipping: {},
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  resolveShopSession.mockResolvedValue({ mode: "preview", token: "tok" })
})

describe("loadShop locale", () => {
  test("speaks the workspace language", async () => {
    getStorefront.mockResolvedValue(storefront("vi"))
    const loaded = await loadShop("11", "tok")
    expect(loaded?.shop.locale).toBe("vi")
  })

  test("falls back to English for a language the builder does not ship", async () => {
    getStorefront.mockResolvedValue(storefront("xx"))
    const loaded = await loadShop("12", "tok")
    expect(loaded?.shop.locale).toBe("en")
  })
})
