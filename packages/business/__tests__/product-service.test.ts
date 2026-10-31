import { beforeEach, describe, expect, test, vi } from "vitest"
import { installedResourceModelStub } from "./helpers/template-guard-mocks"

const mocks = vi.hoisted(() => ({
  categoryFind: vi.fn(),
  removeProductIds: vi.fn(),
  productCreate: vi.fn(),
  productDeleteByIds: vi.fn(),
  productFind: vi.fn(),
  productUpdate: vi.fn(),
  findProductsByIds: vi.fn(),
  transaction: vi.fn(),
  deleteRow: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
  templateInstalledResourceFindMany: vi.fn(async () => []),
  isTemplateInstalled: vi.fn(async () => true),
}))

/** Stands in for the transaction handle; every write is mocked at the repository. */
const newTx = () => ({
  delete: mocks.deleteRow,
  insert: mocks.insert,
  execute: mocks.execute,
  // Every product counts as installed here, so the lock path still runs.
  query: { templateInstalledResourceModel: installedResourceModelStub() },
})
// Fresh per test, like a real driver: the lock registry is keyed by the client.
let tx = newTx()

// The template lock guard has its own suite; these tests cover the service.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    useTransaction: true,
    assertDeletable: vi.fn(),
    assertResourceEditable: vi.fn(),
  }),
  isTemplateInstalled: mocks.isTemplateInstalled,
  changedKeysOf: vi.fn((_existing: unknown, patch: Record<string, unknown>) =>
    Object.keys(patch),
  ),
  changedStoredContentKeys: vi.fn(() => []),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
    query: {
      templateInstalledResourceModel: {
        findMany: mocks.templateInstalledResourceFindMany,
      },
    },
  },
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  discountCodeRepository: {
    removeProductIds: (...args: unknown[]) => mocks.removeProductIds(...args),
  },
  productCategoryRepository: {
    find: (...args: unknown[]) => mocks.categoryFind(...args),
  },
  productRepository: {
    create: (...args: unknown[]) => mocks.productCreate(...args),
    deleteByIds: (...args: unknown[]) => mocks.productDeleteByIds(...args),
    find: (...args: unknown[]) => mocks.productFind(...args),
    findDetail: (...args: unknown[]) => mocks.productFind(...args),
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
const { assertResourceEditable, changedStoredContentKeys } = await import(
  "../src/template/installed-resource.service"
)

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
  tx = newTx()
  mocks.categoryFind.mockResolvedValue({ id: "category-1", parentId: null })
  mocks.findProductsByIds.mockResolvedValue([])
  mocks.productCreate.mockResolvedValue({ id: "product-1" })
  mocks.productDeleteByIds.mockResolvedValue([{ id: "product-1" }])
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

  test("removes deleted products from discount codes in the same transaction", async () => {
    await productService.delete({
      ids: ["product-1"],
      workspaceId: "workspace-1",
    })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.removeProductIds).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", productIds: ["product-1"] },
      tx,
    )
  })
})

describe("productService category change", () => {
  test("clears a stored sub-category that belongs to the old category", async () => {
    mocks.productFind.mockResolvedValue({
      id: "product-1",
      categoryId: "old",
      subcategoryId: "old-child",
    })
    mocks.categoryFind.mockResolvedValue({ id: "old-child", parentId: "old" })

    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { categoryId: "new" },
    })

    expect(mocks.productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          categoryId: "new",
          subcategoryId: null,
        }),
      }),
      expect.anything(),
    )
  })

  test("clears the sub-category when the category is set to null", async () => {
    mocks.productFind.mockResolvedValue({
      id: "product-1",
      categoryId: "old",
      subcategoryId: "old-child",
    })

    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { categoryId: null },
    })

    expect(mocks.productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ subcategoryId: null }),
      }),
      expect.anything(),
    )
  })

  test("keeps the sub-category when it already sits under the new category", async () => {
    mocks.productFind.mockResolvedValue({
      id: "product-1",
      categoryId: "old",
      subcategoryId: "child",
    })
    mocks.categoryFind.mockResolvedValue({ id: "child", parentId: "new" })

    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { categoryId: "new" },
    })

    const [{ values }] = mocks.productUpdate.mock.calls[0] as [
      { values: Record<string, unknown> },
    ]
    expect(values).not.toHaveProperty("subcategoryId")
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

  test("does not read the product when the patch touches no sub-category or locked content", async () => {
    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { isActive: false },
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

describe("productService template locks", () => {
  test("update opens a locked transaction and guards before reading the product", async () => {
    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { name: "Renamed", categoryId: "category-1" },
    })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(assertResourceEditable).toHaveBeenCalledTimes(1)
    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "product",
        resourceIds: ["product-1"],
        changedKeys: ["name", "categoryId"],
        referencedParents: [
          { kind: "productCategory", resourceId: "category-1" },
        ],
        tx,
      }),
    )
    expect(
      vi.mocked(assertResourceEditable).mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.categoryFind.mock.invocationCallOrder[0] as number)
    expect(
      vi.mocked(assertResourceEditable).mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.productUpdate.mock.invocationCallOrder[0] as number)
  })

  test("update holds the product and parent locks before the stored row is read", async () => {
    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { name: "Renamed", categoryId: "category-1" },
    })

    // One statement takes both keys (the product, then its category).
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.productFind.mock.invocationCallOrder[0] as number,
    )
  })

  test("update on a caller transaction guards on that transaction without opening another", async () => {
    const callerTx = { marker: "caller" }

    await productService.update({
      workspaceId: "workspace-1",
      productId: "product-1",
      data: { name: "Renamed" },
      tx: callerTx as never,
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({ tx: callerTx }),
    )
  })

  test("a blocked update never writes", async () => {
    vi.mocked(assertResourceEditable).mockRejectedValueOnce(new Error("locked"))

    await expect(
      productService.update({
        workspaceId: "workspace-1",
        productId: "product-1",
        data: { name: "Renamed" },
      }),
    ).rejects.toThrow("locked")
    expect(mocks.productUpdate).not.toHaveBeenCalled()
  })

  test("updateFull decides on locked content from the stored rows after the write", async () => {
    mocks.deleteRow.mockReturnValue({ where: vi.fn() })
    mocks.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: vi.fn() })),
    })
    mocks.productFind
      .mockResolvedValueOnce({ id: "product-1", name: "Old" })
      .mockResolvedValue({ id: "product-1", name: "Product" })
    vi.mocked(changedStoredContentKeys).mockReturnValueOnce(["name"])

    await productService.updateFull(fullUpdate)

    // The up-front call takes the locks with nothing changed yet; the second
    // one, after every child row was rewritten, carries the stored diff.
    const calls = vi.mocked(assertResourceEditable).mock.calls
    expect(calls.map(([call]) => call.changedKeys)).toEqual([[], ["name"]])
    expect(changedStoredContentKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { id: "product-1", name: "Old" },
        after: { id: "product-1", name: "Product" },
        keyMap: { options: "variantOptions" },
      }),
    )
  })

  test("updateFull on a plain (not template-installed) product skips the stored reads and the second guard pass", async () => {
    mocks.isTemplateInstalled.mockResolvedValueOnce(false)
    mocks.deleteRow.mockReturnValue({ where: vi.fn() })
    mocks.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: vi.fn() })),
    })
    mocks.productFind.mockClear()

    await productService.updateFull(fullUpdate)

    // No before/after `findDetail`, no stored diff, one guard pass (the lock).
    expect(mocks.productFind).not.toHaveBeenCalled()
    expect(changedStoredContentKeys).not.toHaveBeenCalled()
    expect(assertResourceEditable).toHaveBeenCalledTimes(1)
    expect(mocks.productUpdate).toHaveBeenCalled()
  })

  test("updateFull locks the categories and addon products the payload references", async () => {
    mocks.findProductsByIds.mockResolvedValue([{ id: "addon-1" }])
    mocks.deleteRow.mockReturnValue({ where: vi.fn() })
    mocks.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: vi.fn() })),
    })

    await productService.updateFull({
      ...fullUpdate,
      categoryId: "category-1",
      addons: [{ addonProductIds: ["addon-1"] } as never],
    })

    // Locked first (before any write), with every parent the payload names.
    expect(assertResourceEditable).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resourceIds: ["product-1"],
        changedKeys: [],
        referencedParents: [
          { kind: "productCategory", resourceId: "category-1" },
          { kind: "product", resourceId: "addon-1" },
        ],
        tx,
      }),
    )
    expect(
      vi.mocked(assertResourceEditable).mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.productUpdate.mock.invocationCallOrder[0] as number)
  })
})
