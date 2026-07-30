import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createFromImport: vi.fn(),
  listOptions: vi.fn(),
  resolveByNames: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  productCategoryService: {
    listOptions: (...args: unknown[]) => mocks.listOptions(...args),
    resolveByNames: (...args: unknown[]) => mocks.resolveByNames(...args),
  },
  productService: {
    createFromImport: (...args: unknown[]) => mocks.createFromImport(...args),
  },
}))

const { productsImportHandler } = await import(
  "../src/default/handlers/imports/handler/products/handler"
)

const importRow = {
  id: "import-1",
  workspaceId: "workspace-1",
}

const productRow = {
  sourceRow: 2,
  name: "Product",
  categoryName: "Shoes",
  productUrl: "https://example.com/products/product",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listOptions.mockResolvedValue([])
  mocks.resolveByNames.mockResolvedValue(new Map())
  mocks.createFromImport.mockResolvedValue([])
})

describe("productsImportHandler", () => {
  test("creates missing categories and attaches their workspace-scoped ids", async () => {
    mocks.resolveByNames.mockResolvedValue(new Map([["shoes", "category-1"]]))
    mocks.createFromImport.mockResolvedValue([{ id: "product-1" }])

    const result = await productsImportHandler.processBatch(
      { categoryIdsByName: new Map() },
      [productRow],
      {
        row: importRow as never,
        meta: {
          columnMap: { name: "Name", category: "Category" },
          createMissingCategories: true,
        },
      },
    )

    expect(mocks.resolveByNames).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      names: ["Shoes"],
      createMissing: true,
    })
    expect(mocks.createFromImport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      products: [
        expect.objectContaining({
          name: "Product",
          categoryId: "category-1",
          productUrl: "https://example.com/products/product",
        }),
      ],
    })
    expect(result).toEqual({ success: 1, failed: 0, errors: [] })
  })

  test("reports an unknown category without inserting the invalid row", async () => {
    const result = await productsImportHandler.processBatch(
      { categoryIdsByName: new Map() },
      [productRow],
      {
        row: importRow as never,
        meta: {
          columnMap: { name: "Name", category: "Category" },
          createMissingCategories: false,
        },
      },
    )

    expect(mocks.createFromImport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      products: [],
    })
    expect(result).toEqual({
      success: 0,
      failed: 1,
      errors: [{ row: 2, reason: "Unknown category: Shoes" }],
    })
  })

  test("reuses an existing category regardless of import header casing", async () => {
    const deps = {
      categoryIdsByName: new Map([["shoes", "category-existing"]]),
    }
    mocks.createFromImport.mockResolvedValue([{ id: "product-1" }])

    const result = await productsImportHandler.processBatch(
      deps,
      [{ ...productRow, categoryName: "shoes" }],
      {
        row: importRow as never,
        meta: {
          columnMap: { name: "Name", category: "Category" },
          createMissingCategories: true,
        },
      },
    )

    expect(mocks.resolveByNames).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      names: [],
      createMissing: true,
    })
    expect(mocks.createFromImport).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      products: [expect.objectContaining({ categoryId: "category-existing" })],
    })
    expect(result).toEqual({ success: 1, failed: 0, errors: [] })
  })

  test("turns a batch write failure into row-level diagnostics", async () => {
    mocks.createFromImport.mockRejectedValue(new Error("database unavailable"))

    const result = await productsImportHandler.processBatch(
      { categoryIdsByName: new Map() },
      [{ ...productRow, categoryName: undefined }],
      {
        row: importRow as never,
        meta: {
          columnMap: { name: "Name" },
          createMissingCategories: true,
        },
      },
    )

    expect(result).toEqual({
      success: 0,
      failed: 1,
      errors: [{ row: 2, reason: "database unavailable" }],
    })
  })
})
