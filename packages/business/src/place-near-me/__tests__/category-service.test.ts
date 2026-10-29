import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  countLocations: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    name: "db",
    transaction: (fn: (tx: unknown) => unknown) => fn({ name: "tx" }),
  },
  isUniqueViolationError: (error: unknown) =>
    (error as { code?: string } | undefined)?.code === "23505",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  placeCategoryRepository: {
    create: (...args: unknown[]) => mocks.create(...args),
    update: (...args: unknown[]) => mocks.update(...args),
    delete: (...args: unknown[]) => mocks.delete(...args),
    countLocations: (...args: unknown[]) => mocks.countLocations(...args),
  },
}))

const { placeCategoryService } = await import("../category.service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("placeCategoryService", () => {
  test("create trims the name and maps a unique violation to placeCategoryDuplicated", async () => {
    mocks.create.mockRejectedValue({ code: "23505" })

    await expect(
      placeCategoryService.create({ workspaceId: "ws1", name: "  Stores " }),
    ).rejects.toMatchObject({
      code: "placeCategoryDuplicated",
      httpStatusCode: 409,
    })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Stores" }),
    )
  })

  test("create rejects a blank name", async () => {
    await expect(
      placeCategoryService.create({ workspaceId: "ws1", name: "   " }),
    ).rejects.toMatchObject({
      code: "placeCategoryNameRequired",
      httpStatusCode: 400,
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("update renaming to a different case of its own name succeeds", async () => {
    mocks.update.mockResolvedValue({ id: "c1", name: "STORES" })

    const row = await placeCategoryService.update({
      workspaceId: "ws1",
      categoryId: "c1",
      data: { name: "STORES" },
    })

    expect(row.name).toBe("STORES")
  })

  test("update of a missing category throws notFound", async () => {
    mocks.update.mockResolvedValue(undefined)

    await expect(
      placeCategoryService.update({
        workspaceId: "ws1",
        categoryId: "missing",
        data: { rank: 2 },
      }),
    ).rejects.toMatchObject({ message: "Place category not found" })
  })

  test("delete returns how many locations became uncategorized", async () => {
    mocks.countLocations.mockResolvedValue(3)
    mocks.delete.mockResolvedValue({ id: "c1" })

    await expect(
      placeCategoryService.delete({ workspaceId: "ws1", categoryId: "c1" }),
    ).resolves.toEqual({ uncategorizedLocationCount: 3 })
  })

  test("delete of a missing category throws notFound", async () => {
    mocks.countLocations.mockResolvedValue(0)
    mocks.delete.mockResolvedValue(undefined)

    await expect(
      placeCategoryService.delete({ workspaceId: "ws1", categoryId: "x" }),
    ).rejects.toMatchObject({ message: "Place category not found" })
  })
})
