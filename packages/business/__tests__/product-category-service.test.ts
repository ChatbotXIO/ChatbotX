import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createMissingByName: vi.fn(),
  deleteRow: vi.fn(),
  find: vi.fn(),
  findByNames: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  isUniqueViolationError: vi.fn(),
  listChildren: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isUniqueViolationError: (...args: unknown[]) =>
    mocks.isUniqueViolationError(...args),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  productCategoryRepository: {
    create: (...args: unknown[]) => mocks.create(...args),
    createMissingByName: (...args: unknown[]) =>
      mocks.createMissingByName(...args),
    delete: (...args: unknown[]) => mocks.deleteRow(...args),
    find: (...args: unknown[]) => mocks.find(...args),
    findByNames: (...args: unknown[]) => mocks.findByNames(...args),
    listChildren: (...args: unknown[]) => mocks.listChildren(...args),
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
    mocks.findByNames.mockResolvedValue([{ id: "category-1", name: "Shoes" }])

    const resolved = await productCategoryService.resolveByNames({
      workspaceId,
      names: ["Shoes"],
      createMissing: false,
    })

    expect(resolved.get("shoes")).toBe("category-1")
  })

  test("trims and de-duplicates the names before querying", async () => {
    mocks.findByNames.mockResolvedValue([])

    await productCategoryService.resolveByNames({
      workspaceId,
      names: [" Shoes ", "Shoes", "", "   "],
      createMissing: false,
    })

    expect(mocks.findByNames).toHaveBeenCalledWith({
      workspaceId,
      names: ["Shoes"],
    })
  })

  test("creates the missing rows only when the import asked it to", async () => {
    mocks.createMissingByName.mockResolvedValue([
      { id: "category-2", name: "Bags" },
    ])

    const resolved = await productCategoryService.resolveByNames({
      workspaceId,
      names: ["Bags"],
      createMissing: true,
    })

    expect(mocks.findByNames).not.toHaveBeenCalled()
    expect(resolved.get("bags")).toBe("category-2")
  })
})
