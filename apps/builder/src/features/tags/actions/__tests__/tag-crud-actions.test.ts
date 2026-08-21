// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Shared mutable state (hoisted so it's available to vi.mock factories) ────

const queryResult: { findFirstReturn: unknown; findManyReturn: unknown[] } = {
  findFirstReturn: undefined,
  findManyReturn: [],
}

const insertReturning: { current: unknown[] } = { current: [] }
const updateReturning: { current: unknown[] } = { current: [] }

// The insert builder is a plain object; implementations are re-applied in
// beforeEach so they survive restoreMocks:true wiping vi.fn implementations.
const insertBuilder = {
  values: vi.fn(),
  returning: vi.fn(),
}

function wireInsertBuilder() {
  insertBuilder.values.mockImplementation(() => insertBuilder)
  insertBuilder.returning.mockImplementation(() =>
    Promise.resolve(insertReturning.current),
  )
}
wireInsertBuilder()

// Soft-delete path: db.update(tagModel).set({deletedAt}).where(...).returning()
const updateBuilder = {
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}

function wireUpdateBuilder() {
  updateBuilder.set.mockImplementation(() => updateBuilder)
  updateBuilder.where.mockImplementation(() => updateBuilder)
  updateBuilder.returning.mockImplementation(() =>
    Promise.resolve(updateReturning.current),
  )
}
wireUpdateBuilder()

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-safe-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-safe-action")>()
  return {
    ...actual,
    returnValidationErrors: vi.fn(() => {
      throw new Error("returnValidationErrors called")
    }),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: {
        findFirst: vi.fn(() => Promise.resolve(queryResult.findFirstReturn)),
        findMany: vi.fn(() => Promise.resolve(queryResult.findManyReturn)),
      },
      // better-auth (imported transitively via safe-action) resolves trusted
      // origins from custom domains in the background.
      customDomainModel: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    insert: vi.fn(() => insertBuilder),
    update: vi.fn(() => updateBuilder),
  },
  findOrFail: vi.fn(),
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
}))

// The real tagModel is needed for createSelectSchema(tagModel, …) in
// src/features/tags/schema/resource.ts
vi.mock("@chatbotx.io/database/schema", async (importOriginal) =>
  importOriginal<typeof import("@chatbotx.io/database/schema")>(),
)

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: {
    listActiveDomains: vi.fn(async () => []),
  },
  tagSyncService: {
    enqueueCreate: vi.fn(async () => undefined),
    enqueueDelete: vi.fn(async () => undefined),
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "generated-id"),
  }
})

vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/redis")>()
  return {
    ...actual,
    invalidateCacheByTags: vi.fn(),
  }
})

vi.mock("@/features/folders/actions/utils", () => ({
  ensureFolderIsExists: vi.fn(async () => undefined),
}))

// ── Lazy imports (after vi.mock) ──────────────────────────────────────────────

const { createTag } = await import("../create-tag-action")
const { deleteTags, deleteTag } = await import("../delete-tag-action")

const { db } = await import("@chatbotx.io/database/client")
const { tagSyncService } = await import("@chatbotx.io/business")
const { invalidateCacheByTags } = await import("@chatbotx.io/redis")
const { ensureFolderIsExists } = await import(
  "@/features/folders/actions/utils"
)
const { returnValidationErrors } = await import("next-safe-action")

const enqueueCreate = tagSyncService.enqueueCreate as ReturnType<typeof vi.fn>
const enqueueDelete = tagSyncService.enqueueDelete as ReturnType<typeof vi.fn>
const invalidateCacheByTagsFn = invalidateCacheByTags as ReturnType<
  typeof vi.fn
>
const ensureFolderIsExistsFn = ensureFolderIsExists as ReturnType<typeof vi.fn>
const returnValidationErrorsFn =
  returnValidationErrors as unknown as ReturnType<typeof vi.fn>

// ── Reset helper ──────────────────────────────────────────────────────────────

const WS = "ws-test-1"

function resetAll() {
  // Re-apply insert chain implementations: restoreMocks:true wipes vi.fn() impls.
  wireInsertBuilder()
  wireUpdateBuilder()
  // Re-apply db.insert impl
  vi.mocked(db.insert).mockImplementation(
    () => insertBuilder as unknown as ReturnType<typeof db.insert>,
  )
  // Re-apply db.update impl (soft-delete path)
  vi.mocked(db.update).mockImplementation(
    () => updateBuilder as unknown as ReturnType<typeof db.update>,
  )
  // Re-apply query implementations that read from shared state
  vi.mocked(db.query.tagModel.findFirst).mockImplementation(
    () =>
      Promise.resolve(queryResult.findFirstReturn) as unknown as ReturnType<
        typeof db.query.tagModel.findFirst
      >,
  )
  vi.mocked(db.query.tagModel.findMany).mockImplementation(
    () =>
      Promise.resolve(queryResult.findManyReturn) as unknown as ReturnType<
        typeof db.query.tagModel.findMany
      >,
  )

  // Reset per-test state
  queryResult.findFirstReturn = undefined
  queryResult.findManyReturn = []
  insertReturning.current = []
  updateReturning.current = []
}

// ── createTag tests ───────────────────────────────────────────────────────────

describe("createTag", () => {
  beforeEach(resetAll)

  test("calls returnValidationErrors when name already exists; no insert, no enqueueCreate", async () => {
    queryResult.findFirstReturn = { id: "existing-tag-id" }

    await expect(createTag({ workspaceId: WS, name: "MyTag" })).rejects.toThrow(
      "returnValidationErrors called",
    )

    expect(returnValidationErrorsFn).toHaveBeenCalledTimes(1)
    const [, errors] = returnValidationErrorsFn.mock.calls[0] ?? []
    expect(errors).toMatchObject({
      name: { _errors: ["Name is already taken."] },
    })
    expect(db.insert).not.toHaveBeenCalled()
    expect(enqueueCreate).not.toHaveBeenCalled()
  })

  test("calls ensureFolderIsExists with (folderId, workspaceId, 'tag') when folderId provided", async () => {
    insertReturning.current = [
      { id: "tag-1", name: "Folder Tag", workspaceId: WS },
    ]

    await createTag({ workspaceId: WS, name: "Folder Tag", folderId: "42" })

    expect(ensureFolderIsExistsFn).toHaveBeenCalledTimes(1)
    expect(ensureFolderIsExistsFn).toHaveBeenCalledWith("42", WS, "tag")
  })

  test("does NOT call ensureFolderIsExists when folderId is absent", async () => {
    insertReturning.current = [
      { id: "tag-2", name: "No Folder", workspaceId: WS },
    ]

    await createTag({ workspaceId: WS, name: "No Folder" })

    expect(ensureFolderIsExistsFn).not.toHaveBeenCalled()
  })

  test("does NOT call ensureFolderIsExists when folderId is null", async () => {
    insertReturning.current = [
      { id: "tag-3", name: "Null Folder", workspaceId: WS },
    ]

    await createTag({ workspaceId: WS, name: "Null Folder", folderId: null })

    expect(ensureFolderIsExistsFn).not.toHaveBeenCalled()
  })

  test("calls enqueueCreate with workspaceId and tagId after insert returns a row", async () => {
    const newTag = { id: "tag-abc", name: "Fresh Tag", workspaceId: WS }
    insertReturning.current = [newTag]

    const result = await createTag({ workspaceId: WS, name: "Fresh Tag" })

    expect(enqueueCreate).toHaveBeenCalledTimes(1)
    expect(enqueueCreate).toHaveBeenCalledWith({
      workspaceId: WS,
      tagId: "tag-abc",
    })
    expect(result).toEqual({ data: newTag })
  })

  test("does NOT call enqueueCreate when insert returning is empty", async () => {
    insertReturning.current = []

    const result = await createTag({ workspaceId: WS, name: "Empty Insert" })

    expect(enqueueCreate).not.toHaveBeenCalled()
    expect(result).toEqual({ data: undefined })
  })

  test("passes createId-generated id into insert .values()", async () => {
    const { createId } = await import("@chatbotx.io/utils")
    vi.mocked(createId).mockReturnValueOnce("custom-id-999")

    insertReturning.current = [
      { id: "custom-id-999", name: "ID Test", workspaceId: WS },
    ]

    await createTag({ workspaceId: WS, name: "ID Test" })

    const valuesArg = insertBuilder.values.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined
    expect(valuesArg?.id).toBe("custom-id-999")
  })
})

// ── deleteTags tests ──────────────────────────────────────────────────────────

describe("deleteTags", () => {
  beforeEach(resetAll)

  test("does NOT call enqueueDelete when no ids match any tag", async () => {
    updateReturning.current = [] // soft-delete UPDATE matched no rows

    await deleteTags({ workspaceId: WS, ids: ["ghost-1", "ghost-2"] })

    expect(enqueueDelete).not.toHaveBeenCalled()
    expect(invalidateCacheByTagsFn).toHaveBeenCalledTimes(1)
    expect(invalidateCacheByTagsFn).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
    ])
  })

  test("calls enqueueDelete only for found tags on partial ID match", async () => {
    updateReturning.current = [{ id: "tag-1" }]

    await deleteTags({ workspaceId: WS, ids: ["tag-1", "non-existent"] })

    expect(enqueueDelete).toHaveBeenCalledTimes(1)
    expect(enqueueDelete).toHaveBeenCalledWith({
      workspaceId: WS,
      tagId: "tag-1",
    })
  })

  test("calls enqueueDelete once per tag when all ids match", async () => {
    updateReturning.current = [
      { id: "tag-a" },
      { id: "tag-b" },
      { id: "tag-c" },
    ]

    await deleteTags({ workspaceId: WS, ids: ["tag-a", "tag-b", "tag-c"] })

    expect(enqueueDelete).toHaveBeenCalledTimes(3)
    expect(enqueueDelete).toHaveBeenNthCalledWith(1, {
      workspaceId: WS,
      tagId: "tag-a",
    })
    expect(enqueueDelete).toHaveBeenNthCalledWith(2, {
      workspaceId: WS,
      tagId: "tag-b",
    })
    expect(enqueueDelete).toHaveBeenNthCalledWith(3, {
      workspaceId: WS,
      tagId: "tag-c",
    })
  })

  test("always calls invalidateCacheByTags regardless of how many tags found", async () => {
    updateReturning.current = [{ id: "tag-x" }]

    await deleteTags({ workspaceId: WS, ids: ["tag-x"] })

    expect(invalidateCacheByTagsFn).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
    ])
  })

  test("soft-deletes with workspaceId scoped to the provided workspace", async () => {
    updateReturning.current = []

    await deleteTags({ workspaceId: WS, ids: ["id-1", "id-2"] })

    // where(and(eq(tagModel.workspaceId, WS), inArray(...), isNull(...)))
    // eq/and mocks return their args, so the first member is [col, WS].
    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1)
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
    const whereArg = updateBuilder.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg?.[0]?.[1]).toBe(WS)
  })
})

// ── deleteTag (single, soft-delete path) ──────────────────────────────────────

describe("deleteTag", () => {
  beforeEach(resetAll)

  test("soft-delete → enqueueDelete → invalidateCacheByTags on success", async () => {
    updateReturning.current = [{ id: "single-tag-id" }]

    await deleteTag({ workspaceId: WS, id: "single-tag-id" })

    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1)
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
    expect(enqueueDelete).toHaveBeenCalledTimes(1)
    expect(enqueueDelete).toHaveBeenCalledWith({
      workspaceId: WS,
      tagId: "single-tag-id",
    })
    expect(invalidateCacheByTagsFn).toHaveBeenCalledTimes(1)
    expect(invalidateCacheByTagsFn).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
    ])
  })

  test("no matching tag → no enqueueDelete, still revalidates, does not throw", async () => {
    updateReturning.current = [] // tag absent or already soft-deleted

    await expect(
      deleteTag({ workspaceId: WS, id: "no-such-tag" }),
    ).resolves.toBeUndefined()

    expect(enqueueDelete).not.toHaveBeenCalled()
    expect(invalidateCacheByTagsFn).toHaveBeenCalledTimes(1)
  })
})
