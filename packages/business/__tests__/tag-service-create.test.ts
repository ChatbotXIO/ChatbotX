import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirst = vi.fn()
const insertValues = vi.fn()
const insertReturning = vi.fn()
const enqueueCreate = vi.fn()
const invalidateCacheByTags = vi.fn()
const ensureExists = vi.fn()

const insertBuilder = {
  values: (values: unknown) => {
    insertValues(values)
    return { returning: (...args: unknown[]) => insertReturning(...args) }
  },
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: { findFirst: (...args: unknown[]) => findFirst(...args) },
    },
    insert: () => insertBuilder,
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNull: (col: unknown) => ({ isNull: col }),
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: {},
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: {
    enqueueCreate: (...args: unknown[]) => enqueueCreate(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => invalidateCacheByTags(...args),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))

vi.mock("../src/folder/service", () => ({
  folderService: {
    ensureExists: (...args: unknown[]) => ensureExists(...args),
  },
}))

vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: {},
}))

vi.mock("../src/contact", () => ({
  contactService: {},
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "generated-id" }
})

const { tagService } = await import("../src/tag/service")

const WS = "ws-test-1"

beforeEach(() => {
  vi.clearAllMocks()
  findFirst.mockResolvedValue(undefined)
  insertReturning.mockResolvedValue([])
})

describe("tagService.create", () => {
  test("throws a validation exception when name already exists; no insert, no enqueueCreate", async () => {
    findFirst.mockResolvedValue({ id: "existing-tag-id" })

    await expect(
      tagService.create({ workspaceId: WS, data: { name: "MyTag" } }),
    ).rejects.toMatchObject({
      field: "name",
      message: "Name is already taken.",
    })

    expect(insertValues).not.toHaveBeenCalled()
    expect(enqueueCreate).not.toHaveBeenCalled()
  })

  test("calls folderService.ensureExists when folderId provided", async () => {
    insertReturning.mockResolvedValue([
      { id: "tag-1", name: "Folder Tag", workspaceId: WS },
    ])

    await tagService.create({
      workspaceId: WS,
      data: { name: "Folder Tag", folderId: "42" },
    })

    expect(ensureExists).toHaveBeenCalledTimes(1)
    expect(ensureExists).toHaveBeenCalledWith({
      id: "42",
      workspaceId: WS,
      folderType: "tag",
    })
  })

  test("does NOT call ensureExists when folderId is absent", async () => {
    insertReturning.mockResolvedValue([
      { id: "tag-2", name: "No Folder", workspaceId: WS },
    ])

    await tagService.create({ workspaceId: WS, data: { name: "No Folder" } })

    expect(ensureExists).not.toHaveBeenCalled()
  })

  test("does NOT call ensureExists when folderId is null", async () => {
    insertReturning.mockResolvedValue([
      { id: "tag-3", name: "Null Folder", workspaceId: WS },
    ])

    await tagService.create({
      workspaceId: WS,
      data: { name: "Null Folder", folderId: null },
    })

    expect(ensureExists).not.toHaveBeenCalled()
  })

  test("calls enqueueCreate with workspaceId and tagId after insert returns a row", async () => {
    const newTag = { id: "tag-abc", name: "Fresh Tag", workspaceId: WS }
    insertReturning.mockResolvedValue([newTag])

    const result = await tagService.create({
      workspaceId: WS,
      data: { name: "Fresh Tag" },
    })

    expect(enqueueCreate).toHaveBeenCalledTimes(1)
    expect(enqueueCreate).toHaveBeenCalledWith({
      workspaceId: WS,
      tagId: "tag-abc",
    })
    expect(result).toEqual({ data: newTag })
  })

  test("does NOT call enqueueCreate when insert returning is empty", async () => {
    insertReturning.mockResolvedValue([])

    const result = await tagService.create({
      workspaceId: WS,
      data: { name: "Empty Insert" },
    })

    expect(enqueueCreate).not.toHaveBeenCalled()
    expect(result).toEqual({ data: undefined })
  })

  test("passes createId-generated id into insert .values()", async () => {
    insertReturning.mockResolvedValue([
      { id: "generated-id", name: "ID Test", workspaceId: WS },
    ])

    await tagService.create({ workspaceId: WS, data: { name: "ID Test" } })

    const valuesArg = insertValues.mock.calls[0]?.[0] as Record<string, unknown>
    expect(valuesArg.id).toBe("generated-id")
  })
})
