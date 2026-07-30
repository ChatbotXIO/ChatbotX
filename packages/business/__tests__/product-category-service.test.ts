import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createMissingChildren: vi.fn(),
  createMissingByName: vi.fn(),
  deleteRow: vi.fn(),
  find: vi.fn(),
  findByNames: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  isUniqueViolationError: vi.fn(),
  listChildren: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { name: "default-db" },
  isUniqueViolationError: (...args: unknown[]) =>
    mocks.isUniqueViolationError(...args),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  productCategoryRepository: {
    create: (...args: unknown[]) => mocks.create(...args),
    createMissingByName: (...args: unknown[]) =>
      mocks.createMissingByName(...args),
    createMissingChildren: (...args: unknown[]) =>
      mocks.createMissingChildren(...args),
    delete: (...args: unknown[]) => mocks.deleteRow(...args),
    find: (...args: unknown[]) => mocks.find(...args),
    findByNames: (...args: unknown[]) => mocks.findByNames(...args),
    listChildren: (...args: unknown[]) => mocks.listChildren(...args),
    list: (...args: unknown[]) => mocks.list(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) =>
    mocks.invalidateCacheByTags(...args),
}))

const { productCategoryService } = await import(
  "../src/product-category/service"
)

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isUniqueViolationError.mockReturnValue(false)
  mocks.listChildren.mockResolvedValue([])
  mocks.list.mockResolvedValue([])
  mocks.createMissingChildren.mockResolvedValue(undefined)
  mocks.create.mockResolvedValue({ id: "category-1" })
  mocks.update.mockResolvedValue({ id: "category-1" })
  mocks.deleteRow.mockResolvedValue({ id: "category-1" })
  mocks.find.mockResolvedValue({ id: "parent-1", parentId: null })
})

describe("productCategoryService name handling", () => {
  test("trims the name before it reaches the database", async () => {
    await productCategoryService.create({ workspaceId, name: "  Shoes  " })

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Shoes" }),
    )
  })

  test("rejects a name that is only whitespace", async () => {
    await expect(
      productCategoryService.create({ workspaceId, name: "   " }),
    ).rejects.toThrow("Product category name is required")

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("reports a unique violation as a duplicate rather than a raw db error", async () => {
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.create.mockRejectedValue(new Error("duplicate key"))

    await expect(
      productCategoryService.create({ workspaceId, name: "Shoes" }),
    ).rejects.toThrow("Product category already exists")
  })

  test("lets an unrelated database error through untouched", async () => {
    mocks.create.mockRejectedValue(new Error("connection reset"))

    await expect(
      productCategoryService.create({ workspaceId, name: "Shoes" }),
    ).rejects.toThrow("connection reset")
  })
})

describe("productCategoryService depth limit", () => {
  test("rejects a category that would be its own parent", async () => {
    await expect(
      productCategoryService.update({
        workspaceId,
        categoryId: "category-1",
        name: "Shoes",
        parentId: "category-1",
      }),
    ).rejects.toThrow("cannot be its own parent")

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("rejects a parent that lives in another workspace", async () => {
    mocks.find.mockResolvedValue(undefined)

    await expect(
      productCategoryService.create({
        workspaceId,
        name: "Sneakers",
        parentId: "parent-from-another-workspace",
      }),
    ).rejects.toThrow("Parent product category not found")

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("rejects a sub-category used as a parent, keeping the tree two deep", async () => {
    mocks.find.mockResolvedValue({ id: "sub-1", parentId: "parent-1" })

    await expect(
      productCategoryService.create({
        workspaceId,
        name: "Running",
        parentId: "sub-1",
      }),
    ).rejects.toThrow("cannot contain further sub-categories")

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("rejects demoting a category that already has children", async () => {
    mocks.listChildren.mockResolvedValue([{ id: "child-1" }])

    await expect(
      productCategoryService.update({
        workspaceId,
        categoryId: "category-1",
        name: "Shoes",
        parentId: "parent-1",
      }),
    ).rejects.toThrow("cannot itself become a sub-category")

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("accepts a top-level parent for a childless category", async () => {
    await expect(
      productCategoryService.update({
        workspaceId,
        categoryId: "category-1",
        name: "Sneakers",
        parentId: "parent-1",
      }),
    ).resolves.toMatchObject({ id: "category-1" })
  })

  test("skips the parentage checks when a rename carries no parent", async () => {
    await productCategoryService.update({
      workspaceId,
      categoryId: "category-1",
      name: "Renamed",
    })

    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.listChildren).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "category-1", name: "Renamed" }),
    )
  })

  test("promotes a sub-category back to the top level on an explicit null", async () => {
    await productCategoryService.update({
      workspaceId,
      categoryId: "category-1",
      name: "Shoes",
      parentId: null,
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
    )
  })
})

describe("productCategoryService missing rows", () => {
  test("reports a missing category on update rather than reporting success", async () => {
    mocks.update.mockResolvedValue(undefined)

    await expect(
      productCategoryService.update({
        workspaceId,
        categoryId: "ghost",
        name: "Shoes",
      }),
    ).rejects.toThrow("Product category not found")
  })

  test("reports a missing category on delete", async () => {
    mocks.deleteRow.mockResolvedValue(undefined)

    await expect(
      productCategoryService.delete({ workspaceId, categoryId: "ghost" }),
    ).rejects.toThrow("Product category not found")

    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("clears the workspace's cached list after a successful delete", async () => {
    await productCategoryService.delete({ workspaceId, categoryId: "cat-1" })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      `product-categories:${workspaceId}`,
    ])
  })
})

describe("productCategoryService resolveByNames", () => {
  test("keys the result by lower-cased name so importers can match either casing", async () => {
    mocks.list.mockResolvedValue([
      { id: "category-1", name: "Shoes", parentId: null },
    ])

    const resolved = await productCategoryService.resolveByNames({
      workspaceId,
      names: ["Shoes"],
      createMissing: false,
    })

    expect(resolved.get("shoes")).toBe("category-1")
  })

  test("matches an existing category regardless of casing without creating a duplicate", async () => {
    mocks.list.mockResolvedValue([
      { id: "category-1", name: "Electronics", parentId: null },
    ])

    const resolved = await productCategoryService.resolveByNames({
      workspaceId,
      names: ["electronics"],
      createMissing: true,
    })

    expect(mocks.createMissingByName).not.toHaveBeenCalled()
    expect(resolved.get("electronics")).toBe("category-1")
  })

  test("collapses names that differ only by case into a single creation", async () => {
    mocks.list.mockResolvedValue([])
    mocks.createMissingByName.mockResolvedValue(undefined)

    await productCategoryService.resolveByNames({
      workspaceId,
      names: [" Shoes ", "SHOES", "shoes", "", "   "],
      createMissing: true,
    })

    expect(mocks.createMissingByName).toHaveBeenCalledTimes(1)
    expect(mocks.createMissingByName).toHaveBeenCalledWith(
      { workspaceId, names: ["shoes"] },
      { name: "default-db" },
    )
  })

  test("creates the missing rows only when the import asked it to", async () => {
    mocks.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "category-2", name: "Bags", parentId: null },
      ])
    mocks.createMissingByName.mockResolvedValue(undefined)

    const resolved = await productCategoryService.resolveByNames({
      workspaceId,
      names: ["Bags"],
      createMissing: true,
    })

    expect(mocks.createMissingByName).toHaveBeenCalledWith(
      { workspaceId, names: ["Bags"] },
      { name: "default-db" },
    )
    expect(resolved.get("bags")).toBe("category-2")
  })

  test("does not create anything when the name already exists", async () => {
    mocks.list.mockResolvedValue([
      { id: "category-1", name: "Shoes", parentId: null },
    ])

    await productCategoryService.resolveByNames({
      workspaceId,
      names: ["Shoes"],
      createMissing: true,
    })

    expect(mocks.createMissingByName).not.toHaveBeenCalled()
  })
})

describe("productCategoryService resolvePaths", () => {
  test("creates and resolves a two-level category path in one transaction", async () => {
    const tx = { name: "transaction-client" }
    mocks.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "category-1", name: "Home", parentId: null },
      ])
      .mockResolvedValueOnce([
        { id: "category-1", name: "Home", parentId: null },
        {
          id: "subcategory-1",
          name: "Robot vacuums",
          parentId: "category-1",
        },
      ])
    mocks.createMissingByName.mockResolvedValue([])

    const resolved = await productCategoryService.resolvePaths({
      workspaceId,
      paths: [
        {
          categoryName: " Home ",
          subcategoryName: " Robot vacuums ",
        },
      ],
      createMissing: true,
      tx,
    })

    expect(mocks.createMissingByName).toHaveBeenCalledWith(
      { workspaceId, names: ["Home"] },
      tx,
    )
    expect(mocks.createMissingChildren).toHaveBeenCalledWith(
      {
        workspaceId,
        children: [{ parentId: "category-1", name: "Robot vacuums" }],
      },
      tx,
    )
    expect(resolved.get("home\u0000robot vacuums")).toEqual({
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
    })
  })

  test("returns nothing for a path that doesn't exist when createMissing is false", async () => {
    const resolved = await productCategoryService.resolvePaths({
      workspaceId,
      paths: [{ categoryName: "Ghost" }],
      createMissing: false,
    })

    expect(resolved.size).toBe(0)
    expect(mocks.createMissingByName).not.toHaveBeenCalled()
    expect(mocks.createMissingChildren).not.toHaveBeenCalled()
  })

  test("creates only the missing sub-category when the top-level already exists", async () => {
    const tx = { name: "transaction-client" }
    mocks.list
      .mockResolvedValueOnce([
        { id: "category-1", name: "Home", parentId: null },
      ])
      .mockResolvedValueOnce([
        { id: "category-1", name: "Home", parentId: null },
        { id: "subcategory-2", name: "Vacuums", parentId: "category-1" },
      ])

    const resolved = await productCategoryService.resolvePaths({
      workspaceId,
      paths: [{ categoryName: "Home", subcategoryName: "Vacuums" }],
      createMissing: true,
      tx,
    })

    expect(mocks.createMissingByName).not.toHaveBeenCalled()
    expect(mocks.createMissingChildren).toHaveBeenCalledWith(
      {
        workspaceId,
        children: [{ parentId: "category-1", name: "Vacuums" }],
      },
      tx,
    )
    expect(resolved.get("home\u0000vacuums")).toEqual({
      categoryId: "category-1",
      subcategoryId: "subcategory-2",
    })
  })

  test("collapses equivalent paths that differ only in whitespace into one resolution", async () => {
    const tx = { name: "transaction-client" }
    mocks.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "category-1", name: "Home", parentId: null },
      ])
      .mockResolvedValueOnce([
        { id: "category-1", name: "Home", parentId: null },
        { id: "subcategory-1", name: "Vacuums", parentId: "category-1" },
      ])
    mocks.createMissingByName.mockResolvedValue([])

    const resolved = await productCategoryService.resolvePaths({
      workspaceId,
      paths: [
        { categoryName: "Home", subcategoryName: "Vacuums" },
        { categoryName: "  Home  ", subcategoryName: "  Vacuums  " },
      ],
      createMissing: true,
      tx,
    })

    expect(mocks.createMissingByName).toHaveBeenCalledTimes(1)
    expect(mocks.createMissingByName).toHaveBeenCalledWith(
      { workspaceId, names: ["Home"] },
      tx,
    )
    expect(mocks.createMissingChildren).toHaveBeenCalledTimes(1)
    expect(mocks.createMissingChildren).toHaveBeenCalledWith(
      {
        workspaceId,
        children: [{ parentId: "category-1", name: "Vacuums" }],
      },
      tx,
    )
    expect(resolved.size).toBe(1)
    expect(resolved.get("home\u0000vacuums")).toEqual({
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
    })
  })
})
