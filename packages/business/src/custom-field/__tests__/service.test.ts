import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  existsByNameAndType: vi.fn(),
  findByKey: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  folderEnsureExists: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  customFieldRepository: {
    existsByNameAndType: mocks.existsByNameAndType,
    findByKey: mocks.findByKey,
    create: mocks.create,
    update: mocks.update,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../../folder/service", () => ({
  folderService: {
    ensureExists: mocks.folderEnsureExists,
  },
}))

const { customFieldService } = await import("../service")
const { ChatbotXException } = await import("../../errors")

const WS = "ws-test-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("CustomFieldService.create", () => {
  test("throws nameTaken ChatbotXException when workspaceId+type+name already exists", async () => {
    mocks.existsByNameAndType.mockResolvedValueOnce(true)

    await expect(
      customFieldService.create({
        workspaceId: WS,
        data: { name: "Phone", type: "shortText" },
      }),
    ).rejects.toMatchObject({ code: "nameTaken", httpStatusCode: 400 })

    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("rejects with a real ChatbotXException instance", async () => {
    mocks.existsByNameAndType.mockResolvedValueOnce(true)

    await expect(
      customFieldService.create({
        workspaceId: WS,
        data: { name: "Phone", type: "shortText" },
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)
  })

  test("creates the field when no duplicate exists", async () => {
    mocks.existsByNameAndType.mockResolvedValueOnce(false)
    mocks.create.mockResolvedValueOnce({
      id: "field-1",
      name: "Phone",
      type: "shortText",
      workspaceId: WS,
    })

    const result = await customFieldService.create({
      workspaceId: WS,
      data: { name: "Phone", type: "shortText" },
    })

    expect(result).toEqual({
      id: "field-1",
      name: "Phone",
      type: "shortText",
      workspaceId: WS,
    })
    expect(mocks.folderEnsureExists).not.toHaveBeenCalled()
  })

  test("calls folderService.ensureExists with folderType 'customField' when folderId provided", async () => {
    mocks.existsByNameAndType.mockResolvedValueOnce(false)
    mocks.create.mockResolvedValueOnce({
      id: "field-2",
      name: "Region",
      type: "shortText",
      workspaceId: WS,
    })

    await customFieldService.create({
      workspaceId: WS,
      data: { name: "Region", type: "shortText", folderId: "10" },
    })

    expect(mocks.folderEnsureExists).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "10",
        workspaceId: WS,
        folderType: "customField",
      }),
    )
  })
})

describe("CustomFieldService.update", () => {
  test("throws nameTaken ChatbotXException when another field of the same type has the same name", async () => {
    // findByKeyOrFail -> findByKey lookup for the existing field itself
    mocks.findByKey.mockResolvedValueOnce({
      id: "field-1",
      type: "shortText",
      folderId: null,
    })
    mocks.existsByNameAndType.mockResolvedValueOnce(true)

    await expect(
      customFieldService.update(
        { workspaceId: WS, id: "field-1" },
        {
          name: "Taken",
        },
      ),
    ).rejects.toMatchObject({ code: "nameTaken", httpStatusCode: 400 })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("updates when no duplicate name exists", async () => {
    mocks.findByKey.mockResolvedValueOnce({
      id: "field-1",
      type: "shortText",
      folderId: null,
    })
    mocks.existsByNameAndType.mockResolvedValueOnce(false)
    mocks.update.mockResolvedValueOnce({
      id: "field-1",
      name: "Renamed",
      type: "shortText",
      workspaceId: WS,
    })

    const result = await customFieldService.update(
      { workspaceId: WS, id: "field-1" },
      { name: "Renamed" },
    )

    expect(result).toEqual({
      id: "field-1",
      name: "Renamed",
      type: "shortText",
      workspaceId: WS,
    })
  })

  test("does not check for duplicates when name is not part of the update", async () => {
    mocks.findByKey.mockResolvedValueOnce({
      id: "field-1",
      type: "shortText",
      folderId: null,
    })
    mocks.update.mockResolvedValueOnce({
      id: "field-1",
      name: "Existing",
      type: "shortText",
      workspaceId: WS,
    })

    await customFieldService.update(
      { workspaceId: WS, id: "field-1" },
      { description: "New description" },
    )

    expect(mocks.existsByNameAndType).not.toHaveBeenCalled()
  })
})
