import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createFromImport: vi.fn(),
  findByImportIdentifiers: vi.fn(),
  findByRetailerIds: vi.fn(),
  linkImported: vi.fn(),
  lockCatalogAssignments: vi.fn(),
  resolveCategoryPaths: vi.fn(),
  transaction: vi.fn(),
  updateProduct: vi.fn(),
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
    lockCatalogAssignments: (...args: unknown[]) =>
      mocks.lockCatalogAssignments(...args),
  },
  productRepository: {
    createFromImport: (...args: unknown[]) => mocks.createFromImport(...args),
    findByImportIdentifiers: (...args: unknown[]) =>
      mocks.findByImportIdentifiers(...args),
    update: (...args: unknown[]) => mocks.updateProduct(...args),
  },
}))

vi.mock("../src/product-category", () => ({
  getProductCategoryPathKey: (path: {
    categoryName: string
    subcategoryName?: string
  }) =>
    `${path.categoryName.trim().toLowerCase()}\u0000${path.subcategoryName?.trim().toLowerCase() ?? ""}`,
  productCategoryService: {
    resolvePaths: (...args: unknown[]) => mocks.resolveCategoryPaths(...args),
  },
}))

const { metaCatalogImportService } = await import(
  "../src/meta-catalog/import.service"
)

const createProduct = (retailerId: string, categoryName?: string) => ({
  retailerId,
  name: `Product ${retailerId}`,
  sku: retailerId,
  price: 100,
  discount: 0,
  categoryName,
  subcategoryName: undefined,
  longDescription: undefined,
  tags: undefined,
  allowOutOfStockPurchase: false,
  inventoryQuantity: 0,
  inventoryPolicy: "dont_track" as const,
  images: undefined,
  isActive: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByRetailerIds.mockResolvedValue([])
  mocks.findByImportIdentifiers.mockResolvedValue([])
  mocks.lockCatalogAssignments.mockResolvedValue(undefined)
  mocks.resolveCategoryPaths.mockResolvedValue(new Map())
  mocks.createFromImport.mockResolvedValue([])
  mocks.updateProduct.mockResolvedValue({ id: "updated-product" })
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof transactionClient) => unknown) =>
      await callback(transactionClient),
  )
})

describe("metaCatalogImportService", () => {
  test("updates a linked product once when its retailer ID is repeated in a page", async () => {
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

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.createFromImport).not.toHaveBeenCalled()
    expect(mocks.updateProduct).toHaveBeenCalledTimes(1)
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        productId: "product-existing",
        values: expect.objectContaining({
          name: "Product existing",
        }),
      },
      transactionClient,
    )
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.not.objectContaining({ sku: expect.anything() }),
      }),
      transactionClient,
    )
  })

  test("refreshes all mutable product fields from an existing Meta item", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "product-existing" },
    ])
    mocks.resolveCategoryPaths.mockResolvedValue(
      new Map([
        [
          "robot vacuum\u0000appliances",
          { categoryId: "category-1", subcategoryId: "subcategory-1" },
        ],
      ]),
    )

    await metaCatalogImportService.importPage({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      products: [
        {
          ...createProduct("existing", " Robot Vacuum "),
          subcategoryName: " Appliances ",
          name: "Robot hút bụi KOMI 298",
          price: 1_025_000,
          discount: 25_001,
          currency: "VND",
          productUrl: "https://example.com/komi-298",
          shortDescription: "Updated from Meta",
          longDescription: "Long description from Meta",
          tags: ["featured", "robot"],
          vendor: "Test2",
          inventoryQuantity: 0,
          inventoryPolicy: "track",
          allowOutOfStockPurchase: true,
          images: [{ url: "https://example.com/komi-298.jpg", type: "link" }],
          isActive: false,
        },
      ],
    })

    expect(mocks.updateProduct).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        productId: "product-existing",
        values: {
          categoryId: "category-1",
          subcategoryId: "subcategory-1",
          currency: "VND",
          discount: 25_001,
          images: [{ url: "https://example.com/komi-298.jpg", type: "link" }],
          inventoryPolicy: "track",
          inventoryQuantity: 0,
          allowOutOfStockPurchase: true,
          isActive: false,
          longDescription: "Long description from Meta",
          name: "Robot hút bụi KOMI 298",
          price: 1_025_000,
          productUrl: "https://example.com/komi-298",
          shortDescription: "Updated from Meta",
          tags: ["featured", "robot"],
          vendor: "Test2",
        },
      },
      transactionClient,
    )
  })

  test("creates missing categories and atomically links imported products", async () => {
    mocks.resolveCategoryPaths.mockResolvedValue(
      new Map([
        ["shoes\u0000", { categoryId: "category-1", subcategoryId: null }],
      ]),
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

    expect(mocks.resolveCategoryPaths).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      paths: [{ categoryName: " Shoes ", subcategoryName: undefined }],
      createMissing: true,
      tx: transactionClient,
    })
    expect(mocks.createFromImport).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [
          expect.objectContaining({ categoryId: "category-1" }),
          expect.not.objectContaining({ categoryId: expect.anything() }),
        ],
      }),
      transactionClient,
    )
    expect(mocks.updateProduct).not.toHaveBeenCalled()
    expect(mocks.lockCatalogAssignments).toHaveBeenCalledWith(
      {
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
      },
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

  test("updates and links a local product whose SKU already matches the Meta retailer ID", async () => {
    mocks.findByImportIdentifiers.mockResolvedValue([
      { id: "local-product", sku: " META-SKU " },
    ])

    await expect(
      metaCatalogImportService.importPage({
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        products: [createProduct("META-SKU")],
      }),
    ).resolves.toEqual({ imported: 0, existing: 1 })

    expect(mocks.findByImportIdentifiers).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        retailerIds: ["META-SKU"],
      },
      transactionClient,
    )
    expect(mocks.createFromImport).not.toHaveBeenCalled()
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "local-product" }),
      transactionClient,
    )
    expect(mocks.linkImported).toHaveBeenCalledWith(
      {
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        items: [{ productId: "local-product", retailerId: "META-SKU" }],
      },
      transactionClient,
    )
  })

  test("rejects a retailer ID that matches one product ID and another product SKU", async () => {
    mocks.findByImportIdentifiers.mockResolvedValue([
      { id: "shared-identifier", sku: "SKU-A" },
      { id: "other-product", sku: "shared-identifier" },
    ])

    await expect(
      metaCatalogImportService.importPage({
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        products: [createProduct("shared-identifier")],
      }),
    ).rejects.toThrow(
      'Meta Catalog retailer ID "shared-identifier" matches multiple product identifiers',
    )

    expect(mocks.updateProduct).not.toHaveBeenCalled()
    expect(mocks.createFromImport).not.toHaveBeenCalled()
    expect(mocks.linkImported).not.toHaveBeenCalled()
  })

  test("does not erase existing images when Meta returns no usable image field", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "product-existing" },
    ])

    await metaCatalogImportService.importPage({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      products: [
        {
          ...createProduct("existing"),
          inventoryQuantity: undefined,
          inventoryPolicy: undefined,
          allowOutOfStockPurchase: undefined,
        },
      ],
    })

    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.not.objectContaining({
          images: expect.anything(),
          inventoryQuantity: expect.anything(),
          inventoryPolicy: expect.anything(),
          allowOutOfStockPurchase: expect.anything(),
        }),
      }),
      transactionClient,
    )
  })

  test("does not overwrite price or active state when Meta omits them", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "product-existing" },
    ])

    await metaCatalogImportService.importPage({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      products: [
        {
          ...createProduct("existing"),
          price: undefined,
          discount: undefined,
          isActive: undefined,
        },
      ],
    })

    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.not.objectContaining({
          price: expect.anything(),
          discount: expect.anything(),
          isActive: expect.anything(),
        }),
      }),
      transactionClient,
    )
  })

  test("propagates explicit Meta clears to nullable local fields", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "product-existing" },
    ])

    await metaCatalogImportService.importPage({
      workspaceId: "workspace-1",
      integrationMetaCatalogId: "connection-1",
      catalogId: "catalog-1",
      products: [
        {
          ...createProduct("existing"),
          productUrl: null,
          shortDescription: null,
          longDescription: null,
          categoryName: null,
          subcategoryName: null,
          vendor: null,
        },
      ],
    })

    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          productUrl: null,
          shortDescription: null,
          longDescription: null,
          categoryId: null,
          subcategoryId: null,
          vendor: null,
        }),
      }),
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
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-existing",
      }),
      transactionClient,
    )
  })

  test("fails instead of reporting success when a retailer link has no workspace product", async () => {
    mocks.findByRetailerIds.mockResolvedValue([
      { retailerId: "existing", productId: "missing-product" },
    ])
    mocks.updateProduct.mockResolvedValue(undefined)

    await expect(
      metaCatalogImportService.importPage({
        workspaceId: "workspace-1",
        integrationMetaCatalogId: "connection-1",
        catalogId: "catalog-1",
        products: [createProduct("existing")],
      }),
    ).rejects.toThrow(
      'Meta Catalog retailer ID "existing" points to a missing product',
    )

    expect(mocks.linkImported).not.toHaveBeenCalled()
  })
})
