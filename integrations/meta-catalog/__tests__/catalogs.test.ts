import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  metaCatalogGraphClient: {
    get: (...args: unknown[]) => mocks.get(...args),
    post: (...args: unknown[]) => mocks.post(...args),
  },
  graphAuthHeaders: (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
  }),
}))

const { createCatalog, getCatalog, listBusinesses } = await import(
  "../src/apis/catalogs"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Meta Catalog catalogs API", () => {
  test("reads a catalog without putting the token in the URL", async () => {
    mocks.get.mockResolvedValue({
      data: { id: "catalog-1", name: "Shop", business: { id: "business-1" } },
    })

    await expect(getCatalog("token", "catalog-1", "v24.0")).resolves.toEqual({
      id: "catalog-1",
      name: "Shop",
      businessId: "business-1",
    })
    expect(mocks.get).toHaveBeenCalledWith("v24.0/catalog-1", {
      headers: { Authorization: "Bearer token" },
      searchParams: { fields: "id,name,business" },
    })
  })

  test("lists business managers and drops entries Graph returned without an id", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: [{ id: "business-1", name: "Acme" }, { name: "Broken" }],
      },
    })

    await expect(listBusinesses("token", "v24.0")).resolves.toEqual([
      { id: "business-1", name: "Acme" },
    ])
    expect(mocks.get).toHaveBeenCalledWith(
      "v24.0/me/businesses",
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    )
  })

  test("creates a commerce catalog on the owned catalogs edge", async () => {
    mocks.post.mockResolvedValue({ data: { id: "catalog-2" } })

    await expect(
      createCatalog({
        accessToken: "token",
        businessId: "business-1",
        name: "Acme Shop",
        version: "v24.0",
      }),
    ).resolves.toEqual({
      id: "catalog-2",
      name: "Acme Shop",
      businessId: "business-1",
    })
    expect(mocks.post).toHaveBeenCalledWith(
      "v24.0/business-1/owned_product_catalogs",
      {
        headers: { Authorization: "Bearer token" },
        // `commerce` is what makes the catalog accept the product items this
        // integration pushes; another vertical would reject every one of them.
        form: { name: "Acme Shop", vertical: "commerce" },
      },
    )
  })

  test("fails loudly when Graph answers a create without an id", async () => {
    mocks.post.mockResolvedValue({ data: {} })

    await expect(
      createCatalog({
        accessToken: "token",
        businessId: "business-1",
        name: "Acme Shop",
      }),
    ).rejects.toThrow("Meta did not return an ID for the new catalog")
  })
})
