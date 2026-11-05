import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirst = vi.fn()
const insertValues = vi.fn()
const insertReturning = vi.fn()
const enqueueCreate = vi.fn()
const invalidateCacheByTags = vi.fn()
const ensureExists = vi.fn()
const findOrFail = vi.fn()
const updateSet = vi.fn()

const insertBuilder = {
  values: (values: unknown) => {
    insertValues(values)
    return { returning: (...args: unknown[]) => insertReturning(...args) }
  },
}

// The template lock guard has its own suite; these tests cover the service.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: vi.fn(),
    assertResourceEditable: vi.fn(),
  }),
  // The real diff is covered by the guard suite: a key is changed when its value differs.
  changedKeysOf: (
    stored: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) => Object.keys(patch).filter((key) => stored[key] !== patch[key]),
}))

const lockOptions = vi.hoisted(() => vi.fn())

// Run the locked transaction against the same mocked client the test asserts on.
vi.mock("../src/template/template-resource-locks", async () => {
  const { db } = await import("@chatbotx.io/database/client")
  return {
    withTemplateLockedTransaction: (
      run: (tx: unknown) => unknown,
      options?: unknown,
    ) => {
      lockOptions(options)
      return run(db)
    },
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: { findFirst: (...args: unknown[]) => findFirst(...args) },
    },
    insert: () => insertBuilder,
    update: () => ({
      set: (values: unknown) => {
        updateSet(values)
        return {
          where: () => ({ returning: async () => [{ id: "tag-1" }] }),
        }
      },
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNull: (col: unknown) => ({ isNull: col }),
  findOrFail: (...args: unknown[]) => findOrFail(...args),
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
  toStoredFolderId: (folderId: string | null | undefined) =>
    !folderId || folderId === "0" ? null : folderId,
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
  findOrFail.mockResolvedValue({ id: "tag-1" })
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

describe("tagService root folder handling", () => {
  test('create treats folderId "0" as the root', async () => {
    insertReturning.mockResolvedValue([{ id: "tag-4", workspaceId: WS }])

    await tagService.create({
      workspaceId: WS,
      data: { name: "Root Tag", folderId: "0" },
    })

    expect(ensureExists).not.toHaveBeenCalled()
    const valuesArg = insertValues.mock.calls[0]?.[0] as Record<string, unknown>
    expect(valuesArg.folderId).toBeNull()
  })
})

describe("tagService.update", () => {
  test("keeps the folder when folderId is omitted", async () => {
    await tagService.update({ workspaceId: WS, id: "tag-1" }, { name: "A" })

    expect(ensureExists).not.toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith({ name: "A" })
  })

  test("validates and moves the tag to the given folder", async () => {
    await tagService.update(
      { workspaceId: WS, id: "tag-1" },
      { name: "A", folderId: "42" },
    )

    expect(ensureExists).toHaveBeenCalledWith({
      id: "42",
      workspaceId: WS,
      folderType: "tag",
    })
    expect(updateSet).toHaveBeenCalledWith({ name: "A", folderId: "42" })
  })

  test('moves the tag to the root for null or "0"', async () => {
    await tagService.update(
      { workspaceId: WS, id: "tag-1" },
      { name: "A", folderId: "0" },
    )
    await tagService.update(
      { workspaceId: WS, id: "tag-1" },
      { name: "A", folderId: null },
    )

    expect(ensureExists).not.toHaveBeenCalled()
    expect(updateSet).toHaveBeenNthCalledWith(1, { name: "A", folderId: null })
    expect(updateSet).toHaveBeenNthCalledWith(2, { name: "A", folderId: null })
  })

  test("guards a rename inside the locked transaction, before the write", async () => {
    const { assertResourceEditable } = await import(
      "../src/template/installed-resource.service"
    )
    const { db } = await import("@chatbotx.io/database/client")
    vi.mocked(assertResourceEditable).mockClear()
    updateSet.mockClear()
    findOrFail.mockResolvedValue({ id: "tag-1", name: "Old" })

    await tagService.update({ workspaceId: WS, id: "tag-1" }, { name: "New" })

    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "tag",
        resourceIds: ["tag-1"],
        changedKeys: ["name"],
        tx: db,
      }),
    )
    expect(
      vi.mocked(assertResourceEditable).mock.invocationCallOrder[0],
    ).toBeLessThan(updateSet.mock.invocationCallOrder[0] as number)
  })

  test("locks the tag before its stored row is read on the locked client", async () => {
    findOrFail.mockClear()
    lockOptions.mockClear()
    findOrFail.mockResolvedValue({ id: "tag-1", name: "Old" })

    await tagService.update({ workspaceId: WS, id: "tag-1" }, { name: "New" })

    expect(lockOptions).toHaveBeenCalledWith({
      workspaceId: WS,
      initialKeys: [{ kind: "tag", resourceId: "tag-1" }],
    })
    expect(lockOptions.mock.invocationCallOrder[0]).toBeLessThan(
      findOrFail.mock.invocationCallOrder[0] as number,
    )
    expect(findOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ client: expect.anything() }),
    )
  })

  test("a folder-only move still runs the guard, with no changed content key, so a tombstoned copy rejects it", async () => {
    const { assertResourceEditable } = await import(
      "../src/template/installed-resource.service"
    )
    vi.mocked(assertResourceEditable).mockClear()
    findOrFail.mockResolvedValue({ id: "tag-1", name: "A" })

    await tagService.update(
      { workspaceId: WS, id: "tag-1" },
      { name: "A", folderId: "0" },
    )

    expect(assertResourceEditable).toHaveBeenCalledTimes(1)
    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({ resourceKind: "tag", changedKeys: [] }),
    )
  })

  test("a blocked rename never reaches the write", async () => {
    const { assertResourceEditable } = await import(
      "../src/template/installed-resource.service"
    )
    updateSet.mockClear()
    findOrFail.mockResolvedValue({ id: "tag-1", name: "Old" })
    vi.mocked(assertResourceEditable).mockRejectedValueOnce(new Error("locked"))

    await expect(
      tagService.update({ workspaceId: WS, id: "tag-1" }, { name: "New" }),
    ).rejects.toThrow("locked")
    expect(updateSet).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })
})
