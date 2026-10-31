import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  listCoordinates: vi.fn(),
  findCategory: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  placeLocationRepository: {
    list: (...args: unknown[]) => mocks.list(...args),
    find: (...args: unknown[]) => mocks.find(...args),
    create: (...args: unknown[]) => mocks.create(...args),
    update: (...args: unknown[]) => mocks.update(...args),
    delete: (...args: unknown[]) => mocks.delete(...args),
    listCoordinates: (...args: unknown[]) => mocks.listCoordinates(...args),
  },
  placeCategoryRepository: {
    find: (...args: unknown[]) => mocks.findCategory(...args),
  },
}))

const { placeLocationService } = await import("../location.service")

const row = {
  id: "l1",
  workspaceId: "ws1",
  name: "HQ",
  latitude: 10.5,
  longitude: 20.25,
  categoryId: null,
  categoryName: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("placeLocationService", () => {
  test("create rejects a category from another workspace", async () => {
    mocks.findCategory.mockResolvedValue(undefined)

    await expect(
      placeLocationService.create({
        workspaceId: "ws1",
        name: "HQ",
        latitude: 1,
        longitude: 2,
        categoryId: "c-other",
      }),
    ).rejects.toMatchObject({ message: "Place category does not exist." })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("create with categoryId null skips the category check", async () => {
    mocks.create.mockResolvedValue({ ...row })
    mocks.find.mockResolvedValue({ ...row })

    const item = await placeLocationService.create({
      workspaceId: "ws1",
      name: "HQ",
      latitude: 10.5,
      longitude: 20.25,
      categoryId: null,
    })

    expect(mocks.findCategory).not.toHaveBeenCalled()
    expect(item.previewUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=10.5%2C20.25",
    )
    expect(mocks.invalidate).toHaveBeenCalled()
  })

  test("list adds previewUrl to every row and passes name/page/perPage through", async () => {
    mocks.list.mockResolvedValue({ data: [row], pageCount: 3 })

    const result = await placeLocationService.list({
      workspaceId: "ws1",
      name: "hq",
      page: 2,
      perPage: 10,
    })

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "ws1",
      name: "hq",
      page: 2,
      perPage: 10,
    })
    expect(result.pageCount).toBe(3)
    expect(result.data[0]?.previewUrl).toContain("query=10.5%2C20.25")
  })

  test("update of a missing location throws notFound", async () => {
    mocks.update.mockResolvedValue(undefined)
    mocks.find.mockResolvedValue(undefined)

    await expect(
      placeLocationService.update({
        workspaceId: "ws1",
        locationId: "nope",
        data: { name: "X" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("update with empty data does not reach the repository", async () => {
    mocks.find.mockResolvedValue({ ...row })

    const item = await placeLocationService.update({
      workspaceId: "ws1",
      locationId: "l1",
      data: {},
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(item.id).toBe("l1")
  })

  test("delete of a missing location throws notFound", async () => {
    mocks.delete.mockResolvedValue(undefined)

    await expect(
      placeLocationService.delete({ workspaceId: "ws1", locationId: "nope" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("create rejects a blank name", async () => {
    await expect(
      placeLocationService.create({
        workspaceId: "ws1",
        name: "   ",
        latitude: 1,
        longitude: 2,
      }),
    ).rejects.toMatchObject({
      code: "placeLocationNameRequired",
      httpStatusCode: 400,
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("update rejects a blank name", async () => {
    await expect(
      placeLocationService.update({
        workspaceId: "ws1",
        locationId: "l1",
        data: { name: " " },
      }),
    ).rejects.toMatchObject({ code: "placeLocationNameRequired" })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("update rejects a category from another workspace without updating", async () => {
    mocks.findCategory.mockResolvedValue(undefined)

    await expect(
      placeLocationService.update({
        workspaceId: "ws1",
        locationId: "l1",
        data: { categoryId: "c-other" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("scopes by workspace and category", async () => {
    mocks.listCoordinates.mockResolvedValue([
      { id: "1", name: "Far", latitude: 21.0285, longitude: 105.8542 },
      { id: "2", name: "Near", latitude: 10.8231, longitude: 106.6297 },
    ])

    const nearest = await placeLocationService.findNearest({
      workspaceId: "ws1",
      categoryId: "7",
      latitude: 10.8,
      longitude: 106.7,
    })
    await placeLocationService.findNearest({
      workspaceId: "ws1",
      categoryId: null,
      latitude: 10.8,
      longitude: 106.7,
    })

    expect(nearest).toMatchObject({ id: "2", name: "Near" })
    expect(mocks.listCoordinates).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws1",
      categoryId: "7",
    })
    expect(mocks.listCoordinates).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws1",
      categoryId: null,
    })
  })

  test("findNearest returns null when the repository returns []", async () => {
    mocks.listCoordinates.mockResolvedValue([])

    await expect(
      placeLocationService.findNearest({
        workspaceId: "ws1",
        categoryId: null,
        latitude: 1,
        longitude: 2,
      }),
    ).resolves.toBeNull()
  })
})
