import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findCategory: vi.fn(),
  assertVendor: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  productRepository: {
    find: (...args: unknown[]) => mocks.findProduct(...args),
  },
  productCategoryRepository: {
    find: (...args: unknown[]) => mocks.findCategory(...args),
  },
}))
vi.mock("@chatbotx.io/encryption/shop-token", () => ({
  SHOP_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  SHOP_PREVIEW_TOKEN_TTL_MS: 24 * 60 * 60 * 1000,
  signShopToken: async () => "contact-token",
  signShopPreviewToken: async () => "preview-token",
}))
vi.mock("../../platform/settings", () => ({
  resolveTenantSettings: async () => ({ appUrl: "https://app.example/" }),
}))
vi.mock("../../vendor/service", () => ({
  vendorService: {
    assertBelongsToWorkspace: (...args: unknown[]) =>
      mocks.assertVendor(...args),
  },
}))

const { buildWebshopButtonUrl, createWebshopLink } = await import("../link")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findProduct.mockResolvedValue({ id: "42" })
})

describe("buildWebshopButtonUrl", () => {
  test("the whole shop, for a flow button", () => {
    expect(
      buildWebshopButtonUrl({
        appUrl: "https://app.example/",
        workspaceId: "1",
      }),
    ).toBe("https://app.example/shop/1?token={{shop_token}}")
  })

  test("one product's page", () => {
    expect(
      buildWebshopButtonUrl({
        appUrl: "https://app.example",
        workspaceId: "1",
        productId: "42",
      }),
    ).toBe("https://app.example/shop/1/products/42?token={{shop_token}}")
  })
})

describe("createWebshopLink", () => {
  test("a product link: a preview to open and the button URL to copy", async () => {
    await expect(
      createWebshopLink({ workspaceId: "1", productId: "42" }),
    ).resolves.toEqual({
      url: "https://app.example/shop/1/products/42?token=preview-token",
      buttonUrl: "https://app.example/shop/1/products/42?token={{shop_token}}",
      preview: true,
      expiresInSeconds: 86_400,
    })
    expect(mocks.findProduct).toHaveBeenCalledWith({
      workspaceId: "1",
      productId: "42",
    })
  })

  test("refuses a product of another workspace", async () => {
    mocks.findProduct.mockResolvedValue(undefined)
    await expect(
      createWebshopLink({ workspaceId: "1", productId: "99" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
