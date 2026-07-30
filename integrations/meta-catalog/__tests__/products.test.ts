import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  metaCatalogGraphClient: {
    get: (...args: unknown[]) => mocks.get(...args),
  },
  graphAuthHeaders: (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
  }),
}))

const { getCatalogProductsPage } = await import("../src/apis/products")
const SYNCED_PRODUCT_FIELDS_REGEX =
  /retailer_id.*images.*image_cdn_urls.*quantity_to_sell_on_facebook.*custom_label_4/

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Meta Catalog products API", () => {
  test("requests the official products edge and follows cursor pagination", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [{ id: "graph-1", retailer_id: "retailer-1", name: "One" }],
        paging: {
          cursors: { after: "cursor-2" },
          next: "https://graph.facebook.com/next",
        },
      },
    })

    await expect(
      getCatalogProductsPage({
        accessToken: "token",
        catalogId: "catalog-1",
        after: "cursor-1",
        version: "v24.0",
      }),
    ).resolves.toEqual({
      products: [{ id: "graph-1", retailer_id: "retailer-1", name: "One" }],
      invalidCount: 0,
      nextCursor: "cursor-2",
    })
    expect(mocks.get).toHaveBeenCalledWith(
      "v24.0/catalog-1/products",
      expect.objectContaining({
        // The token authenticates via a header so it never reaches a request
        // URL, where proxies and error reporters would capture it.
        headers: { Authorization: "Bearer token" },
        searchParams: {
          after: "cursor-1",
          fields: expect.stringMatching(SYNCED_PRODUCT_FIELDS_REGEX),
          limit: "100",
        },
      }),
    )
  })

  test("isolates malformed Graph products instead of failing the whole page", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [{ retailer_id: 123 }],
      },
    })

    await expect(
      getCatalogProductsPage({
        accessToken: "token",
        catalogId: "catalog-1",
      }),
    ).resolves.toEqual({
      products: [],
      invalidCount: 1,
      nextCursor: undefined,
    })
  })
})
