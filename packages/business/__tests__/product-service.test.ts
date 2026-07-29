import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  categoryFind: vi.fn(),
  productCreate: vi.fn(),
  productDeleteByIds: vi.fn(),
  productFind: vi.fn(),
  productUpdate: vi.fn(),
  findProductsByIds: vi.fn(),
  transaction: vi.fn(),
  deleteRow: vi.fn(),
  insert: vi.fn(),
}))

/** Stands in for the transaction handle; every write is mocked at the repository. */
const tx = {
  delete: mocks.deleteRow,
  insert: mocks.insert,
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  productCategoryRepository: {
    find: (...args: unknown[]) => mocks.categoryFind(...args),
  },
  productRepository: {
    create: (...args: unknown[]) => mocks.productCreate(...args),
    deleteByIds: (...args: unknown[]) => mocks.productDeleteByIds(...args),
    find: (...args: unknown[]) => mocks.productFind(...args),
    findByIds: (...args: unknown[]) => mocks.findProductsByIds(...args),
    update: (...args: unknown[]) => mocks.productUpdate(...args),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  productAddonModel: { productId: "addon-product-id" },
  productVariantModel: { productId: "variant-product-id" },
  productVariantOptionModel: { productId: "option-product-id" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { productService } = await import("../src/product/service")

const fullUpdate = {
  workspaceId: "workspace-1",
  productId: "product-1",
  name: "Product",
  variantOptions: [],
  variants: [],
  addons: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.categoryFind.mockResolvedValue({ id: "category-1", parentId: null })
  mocks.findProductsByIds.mockResolvedValue([])
  mocks.productCreate.mockResolvedValue({ id: "product-1" })
  mocks.productUpdate.mockResolvedValue({ id: "product-1" })
  mocks.productFind.mockResolvedValue({
    id: "product-1",
    categoryId: "category-1",
  })
  mocks.transaction.mockImplementation(
    async (run: (client: typeof tx) => unknown) => await run(tx),
  )
})

describe("productService workspace boundaries", () => {
  test("rejects a category that does not belong to the product workspace", async () => {
    mocks.categoryFind.mockResolvedValue(undefined)

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { categoryId: "category-from-another-workspace" },
      }),
    ).rejects.toThrow("Product category does not exist")

    expect(mocks.productUpdate).not.toHaveBeenCalled()
    expect(mocks.categoryFind).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        categoryId: "category-from-another-workspace",
      },
      expect.anything(),
    )
  })

  test("stops before replacing child rows when the product is outside the workspace", async () => {
    mocks.productUpdate.mockResolvedValue(undefined)

    await expect(productService.updateFull(fullUpdate)).rejects.toThrow(
      "Product does not exist",
    )

    expect(mocks.deleteRow).not.toHaveBeenCalled()
  })

  test("updates a product after workspace-scoped references are validated", async () => {
    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { categoryId: "category-1" },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.productUpdate).toHaveBeenCalledOnce()
  })

  test("scopes a delete to the workspace that asked for it", async () => {
    await productService.delete({
      ids: ["product-1", "product-2"],
      workspaceId: "workspace-1",
    })

    expect(mocks.productDeleteByIds).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", productIds: ["product-1", "product-2"] },
      expect.anything(),
    )
  })
})

describe("productService sub-category parentage", () => {
  /** Resolves category ids to rows, so a test can describe a whole tree at once. */
  const givenCategories = (rows: Record<string, { parentId: string | null }>) =>
    mocks.categoryFind.mockImplementation((input: { categoryId: string }) =>
      rows[input.categoryId]
        ? { id: input.categoryId, ...rows[input.categoryId] }
        : undefined,
    )

  test("rejects a sub-category that does not exist in the workspace", async () => {
    givenCategories({ "category-1": { parentId: null } })

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { categoryId: "category-1", subcategoryId: "ghost" },
      }),
    ).rejects.toThrow("Product sub-category does not exist")

    expect(mocks.productUpdate).not.toHaveBeenCalled()
  })

  test("rejects a sub-category filed under a different category", async () => {
    givenCategories({
      "category-1": { parentId: null },
      "sub-of-other": { parentId: "category-2" },
    })

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { categoryId: "category-1", subcategoryId: "sub-of-other" },
      }),
    ).rejects.toThrow("does not belong to the selected category")

    expect(mocks.productUpdate).not.toHaveBeenCalled()
  })

  test("accepts a sub-category filed under the selected category", async () => {
    givenCategories({
      "category-1": { parentId: null },
      "sub-1": { parentId: "category-1" },
    })

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { categoryId: "category-1", subcategoryId: "sub-1" },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.productUpdate).toHaveBeenCalledOnce()
  })

  test("rejects a top-level category used as a sub-category", async () => {
    givenCategories({
      "category-1": { parentId: null },
      "category-2": { parentId: null },
    })

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { categoryId: "category-1", subcategoryId: "category-2" },
      }),
    ).rejects.toThrow("does not belong to the selected category")
  })

  test("falls back to the stored category when a patch omits it", async () => {
    givenCategories({ "sub-1": { parentId: "category-1" } })
    mocks.productFind.mockResolvedValue({
      id: "product-1",
      categoryId: "category-1",
    })

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { subcategoryId: "sub-1" },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.productFind).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", productId: "product-1" },
      expect.anything(),
    )
    expect(mocks.productUpdate).toHaveBeenCalledOnce()
  })

  test("still rejects when the stored category is not the sub-category's parent", async () => {
    givenCategories({ "sub-1": { parentId: "category-1" } })
    mocks.productFind.mockResolvedValue({
      id: "product-1",
      categoryId: "category-9",
    })

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { subcategoryId: "sub-1" },
      }),
    ).rejects.toThrow("does not belong to the selected category")
  })

  test("does not read the product when the patch touches no sub-category", async () => {
    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { name: "Renamed" },
    })

    expect(mocks.productFind).not.toHaveBeenCalled()
  })
})

describe("productService write shaping", () => {
  test("stores the form's image mode as the column's type", async () => {
    await productService.create({
      data: {
        workspaceId: "workspace-1",
        name: "Product",
        images: [{ mode: "link", url: "https://example.com/a.png" }],
      },
    })

    expect(mocks.productCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ type: "link", url: "https://example.com/a.png" }],
      }),
      expect.anything(),
    )
  })

  test("leaves images alone when a patch does not mention them", async () => {
    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { name: "Renamed" },
    })

    const [{ values }] = mocks.productUpdate.mock.calls[0] as [
      { values: Record<string, unknown> },
    ]
    expect(values).not.toHaveProperty("images")
    expect(values).toMatchObject({ name: "Renamed" })
  })

  test("validates references once before inserting the full product", async () => {
    await productService.createFull({
      workspaceId: "workspace-1",
      name: "Product",
      categoryId: "category-1",
      variantOptions: [],
      variants: [],
      addons: [],
    })

    expect(mocks.categoryFind).toHaveBeenCalledOnce()
    expect(mocks.productCreate).toHaveBeenCalledOnce()
  })

  test("rejects an addon product from another workspace before inserting", async () => {
    mocks.findProductsByIds.mockResolvedValue([])

    await expect(
      productService.createFull({
        workspaceId: "workspace-1",
        name: "Product",
        variantOptions: [],
        variants: [],
        addons: [
          { name: "Extras", maxSelections: 1, addonProductIds: ["foreign"] },
        ],
      }),
    ).rejects.toThrow("addon products do not exist")

    expect(mocks.productCreate).not.toHaveBeenCalled()
  })
})
