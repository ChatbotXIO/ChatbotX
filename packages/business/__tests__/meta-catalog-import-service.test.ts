import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createFromImport: vi.fn(),
  findByRetailerIds: vi.fn(),
  linkImported: vi.fn(),
  resolveCategories: vi.fn(),
  transaction: vi.fn(),
}))

const transactionClient = { name: "transaction-client" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCatalogItemRepository: {
    findByRetailerIds: (...args: unknown[]) => mocks.findByRetailerIds(...args),
    linkImported: (...args: unknown[]) => mocks.linkImported(...args),
  },
  productRepository: {
    createFromImport: (...args: unknown[]) => mocks.createFromImport(...args),
  },
}))

vi.mock("../src/product-category", () => ({
  productCategoryService: {
    resolveByNames: (...args: unknown[]) => mocks.resolveCategories(...args),
  },
}))

const { metaCatalogImportService } = await import(
  "../src/meta-catalog-import/service"
)

const createProduct = (retailerId: string, categoryName?: string) => ({
  retailerId,
  name: `Product ${retailerId}`,
  sku: retailerId,
  price: 100,
  discount: 0,
  categoryName,
  inventoryQuantity: 0,
  inventoryPolicy: "dont_track" as const,
  images: [],
  isActive: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByRetailerIds.mockResolvedValue([])
  mocks.resolveCategories.mockResolvedValue(new Map())
  mocks.createFromImport.mockResolvedValue([])
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof transactionClient) => unknown) =>
      await callback(transactionClient),
  )
})

describe("metaCatalogImportService", () => {
  test("does not create products that are already linked or repeated in a page", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "product-existing" },
    ])

    await expect(
      metaCatalogImportService.importPage({
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        products: [
          createProduct("existing"),
          createProduct("existing"),
          createProduct("existing"),
        ],
      }),
    ).resolves.toEqual({ imported: 0, existing: 3 })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.createFromImport).not.toHaveBeenCalled()
  })

  test("creates missing categories and atomically links imported products", async () => {
    mocks.resolveCategories.mockResolvedValue(
      new Map([["shoes", "category-1"]]),
    )
    mocks.createFromImport.mockResolvedValue([
      { id: "product-1" },
      { id: "product-2" },
    ])

    await expect(
      metaCatalogImportService.importPage({
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        products: [
          createProduct("retailer-1", " Shoes "),
          createProduct("retailer-2"),
        ],
      }),
    ).resolves.toEqual({ imported: 2, existing: 0 })

    expect(mocks.resolveCategories).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      names: [" Shoes "],
      createMissing: true,
    })
    expect(mocks.createFromImport).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [
          expect.objectContaining({ categoryId: "category-1" }),
          expect.objectContaining({ categoryId: undefined }),
        ],
      }),
      transactionClient,
    )
    expect(mocks.linkImported).toHaveBeenCalledWith(
      {
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        items: [
          { productId: "product-1", retailerId: "retailer-1" },
          { productId: "product-2", retailerId: "retailer-2" },
        ],
      },
      transactionClient,
    )
  })

  test("counts existing links and duplicate new rows without duplicate inserts", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "product-existing" },
    ])
    mocks.createFromImport.mockResolvedValue([{ id: "product-new" }])

    await expect(
      metaCatalogImportService.importPage({
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        products: [
          createProduct("existing"),
          createProduct("new"),
          createProduct("new"),
        ],
      }),
    ).resolves.toEqual({ imported: 1, existing: 2 })

    expect(mocks.createFromImport).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [expect.objectContaining({ sku: "new" })],
      }),
      transactionClient,
    )
  })
})
