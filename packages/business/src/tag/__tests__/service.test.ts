import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  existsByName: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  folderEnsureExists: vi.fn(),
  enqueueCreate: vi.fn(),
  enqueueDelete: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagRepository: {
    existsByName: mocks.existsByName,
    findById: mocks.findById,
    create: mocks.create,
    update: mocks.update,
    softDeleteMany: vi.fn(async () => []),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {},
}))

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: vi.fn(async () => undefined),
  emitTagRemoved: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../../ads-conversion/service", () => ({
  adsConversionService: {
    enqueueTagAppliedEvaluationsBulk: vi.fn(async () => undefined),
  },
}))

vi.mock("../../contact", () => ({
  contactService: {
    findManyByIds: vi.fn(async () => []),
  },
}))

vi.mock("../../folder", () => ({
  folderService: {
    ensureExists: mocks.folderEnsureExists,
  },
}))

vi.mock("../../logger", () => ({
  logger: { error: vi.fn() },
}))

vi.mock("../sync.service", () => ({
  tagSyncService: {
    enqueueCreate: mocks.enqueueCreate,
    enqueueDelete: mocks.enqueueDelete,
    enqueueAttachMany: vi.fn(async () => undefined),
  },
}))

const { tagService } = await import("../service")
const { ChatbotXException } = await import("../../errors")

const WS = "ws-test-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("TagService.create", () => {
  test("throws nameTaken ChatbotXException when an active tag with the same name exists", async () => {
    mocks.existsByName.mockResolvedValueOnce(true)

    await expect(
      tagService.create({ workspaceId: WS, data: { name: "MyTag" } }),
    ).rejects.toMatchObject({
      code: "nameTaken",
      httpStatusCode: 400,
    })

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.enqueueCreate).not.toHaveBeenCalled()
  })

  test("rejects with a real ChatbotXException instance", async () => {
    mocks.existsByName.mockResolvedValueOnce(true)

    await expect(
      tagService.create({ workspaceId: WS, data: { name: "MyTag" } }),
    ).rejects.toBeInstanceOf(ChatbotXException)
  })

  test("calls folderService.ensureExists with folderType 'tag' when folderId provided", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.create.mockResolvedValueOnce({
      id: "tag-1",
      name: "Folder Tag",
      workspaceId: WS,
      folderId: "42",
    })

    await tagService.create({
      workspaceId: WS,
      data: { name: "Folder Tag", folderId: "42" },
    })

    expect(mocks.folderEnsureExists).toHaveBeenCalledTimes(1)
    expect(mocks.folderEnsureExists).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "42",
        workspaceId: WS,
        folderType: "tag",
      }),
    )
  })

  test("does NOT call folderService.ensureExists when folderId is absent", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.create.mockResolvedValueOnce({
      id: "tag-2",
      name: "No Folder",
      workspaceId: WS,
    })

    await tagService.create({ workspaceId: WS, data: { name: "No Folder" } })

    expect(mocks.folderEnsureExists).not.toHaveBeenCalled()
  })

  test("enqueues tag sync create after a successful insert", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.create.mockResolvedValueOnce({
      id: "tag-abc",
      name: "Fresh Tag",
      workspaceId: WS,
    })

    const result = await tagService.create({
      workspaceId: WS,
      data: { name: "Fresh Tag" },
    })

    expect(mocks.enqueueCreate).toHaveBeenCalledWith({
      workspaceId: WS,
      tagId: "tag-abc",
    })
    expect(result).toEqual({
      id: "tag-abc",
      name: "Fresh Tag",
      workspaceId: WS,
    })
  })

  test("passes the folderId through to repository create", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.create.mockResolvedValueOnce({
      id: "custom-id-999",
      name: "ID Test",
      workspaceId: WS,
    })

    await tagService.create({ workspaceId: WS, data: { name: "ID Test" } })

    expect(mocks.create).toHaveBeenCalledWith(
      { workspaceId: WS, name: "ID Test", folderId: null },
      expect.anything(),
    )
  })
})

describe("TagService.update", () => {
  test("throws nameTaken ChatbotXException when another active tag has the same name", async () => {
    mocks.existsByName.mockResolvedValueOnce(true)

    await expect(
      tagService.update({
        workspaceId: WS,
        id: "tag-1",
        data: { name: "Taken" },
      }),
    ).rejects.toMatchObject({ code: "nameTaken", httpStatusCode: 400 })

    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("throws when the target tag does not exist", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.findById.mockResolvedValueOnce(undefined)

    await expect(
      tagService.update({
        workspaceId: WS,
        id: "missing-tag",
        data: { name: "New Name" },
      }),
    ).rejects.toThrow("Tag not found")

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("passes tx through to findById (existence check runs in the caller's transaction)", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.findById.mockResolvedValueOnce({ id: "tag-1" })
    mocks.update.mockResolvedValueOnce({
      id: "tag-1",
      name: "Renamed",
      workspaceId: WS,
    })

    const fakeTx = { fake: "tx" }
    await tagService.update({
      workspaceId: WS,
      id: "tag-1",
      data: { name: "Renamed" },
      tx: fakeTx as never,
    })

    expect(mocks.findById).toHaveBeenCalledWith(
      { id: "tag-1", workspaceId: WS },
      fakeTx,
    )
  })

  test("updates the name and invalidates cache tags on success", async () => {
    mocks.existsByName.mockResolvedValueOnce(false)
    mocks.findById.mockResolvedValueOnce({ id: "tag-1" })
    mocks.update.mockResolvedValueOnce({
      id: "tag-1",
      name: "Renamed",
      workspaceId: WS,
    })

    const result = await tagService.update({
      workspaceId: WS,
      id: "tag-1",
      data: { name: "Renamed" },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      { id: "tag-1", workspaceId: WS, name: "Renamed" },
      expect.anything(),
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
      `tags:${WS}:tag-1`,
    ])
    expect(result).toEqual({ id: "tag-1", name: "Renamed", workspaceId: WS })
  })
})

describe("TagService.deleteMany", () => {
  test("does NOT enqueue delete when no ids match any tag", async () => {
    const { tagRepository } = await import("@chatbotx.io/database/repositories")
    vi.mocked(tagRepository.softDeleteMany).mockResolvedValueOnce([])

    await tagService.deleteMany({ workspaceId: WS, ids: ["ghost-1"] })

    expect(mocks.enqueueDelete).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
    ])
  })

  test("enqueues delete once per matched tag", async () => {
    const { tagRepository } = await import("@chatbotx.io/database/repositories")
    vi.mocked(tagRepository.softDeleteMany).mockResolvedValueOnce([
      { id: "tag-a" },
      { id: "tag-b" },
    ])

    await tagService.deleteMany({
      workspaceId: WS,
      ids: ["tag-a", "tag-b", "non-existent"],
    })

    expect(mocks.enqueueDelete).toHaveBeenCalledTimes(2)
    expect(mocks.enqueueDelete).toHaveBeenNthCalledWith(1, {
      workspaceId: WS,
      tagId: "tag-a",
    })
    expect(mocks.enqueueDelete).toHaveBeenNthCalledWith(2, {
      workspaceId: WS,
      tagId: "tag-b",
    })
  })
})
