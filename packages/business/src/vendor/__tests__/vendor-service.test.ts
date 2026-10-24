import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createMissing: vi.fn(),
  findByNames: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  findCategory: vi.fn(),
  openHoursExists: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { name: "db" },
  isUniqueViolationError: (error: unknown) =>
    (error as { code?: string } | undefined)?.code === "23505",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  vendorRepository: {
    createMissing: (...args: unknown[]) => mocks.createMissing(...args),
    findByNames: (...args: unknown[]) => mocks.findByNames(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    find: (...args: unknown[]) => mocks.find(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
  productCategoryRepository: {
    find: (...args: unknown[]) => mocks.findCategory(...args),
  },
}))

vi.mock("../../ecommerce-open-hours/service", () => ({
  ecommerceOpenHoursService: {
    assertBelongsToWorkspace: (...args: unknown[]) =>
      mocks.openHoursExists(...args),
  },
}))

const { vendorService } = await import("../service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("vendorService.resolveByNames", () => {
  test("creates the missing names once and keys ids by lower-cased name", async () => {
    mocks.findByNames.mockResolvedValue([
      { id: "v1", name: "Acme" },
      { id: "v2", name: "Globex" },
    ])

    const ids = await vendorService.resolveByNames({
      workspaceId: "ws1",
      names: [" Acme ", "acme", "Globex", ""],
      createMissing: true,
    })

    expect(mocks.createMissing).toHaveBeenCalledWith(
      { workspaceId: "ws1", names: ["Acme", "acme", "Globex"] },
      { name: "db" },
    )
    expect(ids).toEqual(
      new Map([
        ["acme", "v1"],
        ["globex", "v2"],
      ]),
    )
  })

  test("only looks up when it may not create", async () => {
    mocks.findByNames.mockResolvedValue([])
    await vendorService.resolveByNames({
      workspaceId: "ws1",
      names: ["Acme"],
      createMissing: false,
    })
    expect(mocks.createMissing).not.toHaveBeenCalled()
  })

  test("resolves an empty name to no vendor", async () => {
    await expect(
      vendorService.resolveName({ workspaceId: "ws1", name: "  " }),
    ).resolves.toBeNull()
    expect(mocks.findByNames).not.toHaveBeenCalled()
  })
})

describe("vendorService.create", () => {
  test("turns a duplicate name into productVendorDuplicated", async () => {
    mocks.create.mockRejectedValue({ code: "23505" })
    await expect(
      vendorService.create({ workspaceId: "ws1", name: "Acme" }),
    ).rejects.toMatchObject({ code: "productVendorDuplicated" })
  })

  test("refuses a blank name", async () => {
    await expect(
      vendorService.create({ workspaceId: "ws1", name: "   " }),
    ).rejects.toMatchObject({ code: "productVendorNameRequired" })
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe("vendorService references", () => {
  test("refuses a category of another workspace", async () => {
    mocks.findCategory.mockResolvedValue(undefined)
    await expect(
      vendorService.create({
        workspaceId: "ws1",
        name: "Acme",
        categoryId: "9",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("refuses a sub-category under another category", async () => {
    mocks.findCategory.mockImplementation(
      async ({ categoryId }: { categoryId: string }) =>
        categoryId === "1"
          ? { id: "1", parentId: null }
          : { id: "2", parentId: "99" },
    )
    await expect(
      vendorService.create({
        workspaceId: "ws1",
        name: "Acme",
        categoryId: "1",
        subcategoryId: "2",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("checks the open-hours schedule belongs to the workspace", async () => {
    mocks.create.mockResolvedValue({ id: "v1" })
    await vendorService.create({
      workspaceId: "ws1",
      name: "Acme",
      openHoursId: "5",
    })
    expect(mocks.openHoursExists).toHaveBeenCalledWith({
      workspaceId: "ws1",
      openHoursId: "5",
    })
  })
})

describe("vendorService.update category consistency", () => {
  beforeEach(() => {
    mocks.update.mockResolvedValue({ id: "v1" })
  })

  test("clears a stale sub-category when the category changes alone", async () => {
    mocks.find.mockResolvedValue({ categoryId: "old", subcategoryId: "child" })
    mocks.findCategory.mockResolvedValue({ id: "x", parentId: "old" })

    await vendorService.update({
      workspaceId: "ws1",
      vendorId: "v1",
      data: { categoryId: "new" },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { categoryId: "new", subcategoryId: null },
      }),
    )
  })

  test("keeps the sub-category when it sits under the new category", async () => {
    mocks.find.mockResolvedValue({ categoryId: "old", subcategoryId: "child" })
    mocks.findCategory.mockResolvedValue({ id: "child", parentId: "new" })

    await vendorService.update({
      workspaceId: "ws1",
      vendorId: "v1",
      data: { categoryId: "new" },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ values: { categoryId: "new" } }),
    )
  })

  test("checks a sub-category sent alone against the stored category", async () => {
    mocks.find.mockResolvedValue({ categoryId: "cat", subcategoryId: null })
    mocks.findCategory.mockResolvedValue({ id: "sub", parentId: "other" })

    await expect(
      vendorService.update({
        workspaceId: "ws1",
        vendorId: "v1",
        data: { subcategoryId: "sub" },
      }),
    ).rejects.toThrow("does not belong")

    mocks.findCategory.mockResolvedValue({ id: "sub", parentId: "cat" })
    await expect(
      vendorService.update({
        workspaceId: "ws1",
        vendorId: "v1",
        data: { subcategoryId: "sub" },
      }),
    ).resolves.toBeDefined()
  })
})
