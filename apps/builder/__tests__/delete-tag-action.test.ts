// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db.update chain spies ─────────────────────────────────────────────────────
const dbUpdate = vi.fn()
const updateSet = vi.fn()
const updateWhere = vi.fn()
const updateReturning = vi.fn()

// ── business / cache spies ────────────────────────────────────────────────────
const enqueueDelete = vi.fn()
const invalidateCacheByTags = vi.fn()

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: { findMany: vi.fn().mockResolvedValue([]) },
    },
    update: (...args: unknown[]) => {
      dbUpdate(...args)
      return {
        set: (values: unknown) => {
          updateSet(values)
          return {
            where: (cond: unknown) => {
              updateWhere(cond)
              return {
                returning: (...rArgs: unknown[]) => updateReturning(...rArgs),
              }
            },
          }
        },
      }
    },
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

vi.mock("@chatbotx.io/business", () => ({
  tagSyncService: {
    enqueueDelete: (...args: unknown[]) => enqueueDelete(...args),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => invalidateCacheByTags(...args),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({
        action: () => ({}),
      }),
    }),
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
  bulkUpdateIdsRequest: {},
}))

const { deleteTags, deleteTag } = await import(
  "../src/features/tags/actions/delete-tag-action"
)

const WS = "ws-1"

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeIds = (n: number) =>
  Array.from({ length: n }, (_, i) => String(i + 1))

beforeEach(() => {
  dbUpdate.mockClear()
  updateSet.mockClear()
  updateWhere.mockClear()
  updateReturning.mockReset()
  enqueueDelete.mockClear()
  invalidateCacheByTags.mockClear()
  updateReturning.mockResolvedValue([])
})

// ── deleteTags ────────────────────────────────────────────────────────────────
describe("deleteTags", () => {
  test("calls db.update once for ≤200 ids", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }])
    await deleteTags({ workspaceId: WS, ids: ["t1"] })
    expect(dbUpdate).toHaveBeenCalledTimes(1)
  })

  test("chunks ids — 201 ids triggers exactly 2 db.update calls", async () => {
    updateReturning.mockResolvedValue([])
    await deleteTags({ workspaceId: WS, ids: makeIds(201) })
    expect(dbUpdate).toHaveBeenCalledTimes(2)
  })

  test("chunks ids — 400 ids triggers exactly 2 db.update calls", async () => {
    updateReturning.mockResolvedValue([])
    await deleteTags({ workspaceId: WS, ids: makeIds(400) })
    expect(dbUpdate).toHaveBeenCalledTimes(2)
  })

  test("enqueues only for rows actually returned by db.update", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }, { id: "t2" }])
    await deleteTags({ workspaceId: WS, ids: ["t1", "t2", "t99"] })
    expect(enqueueDelete).toHaveBeenCalledTimes(2)
    expect(enqueueDelete).toHaveBeenCalledWith({ workspaceId: WS, tagId: "t1" })
    expect(enqueueDelete).toHaveBeenCalledWith({ workspaceId: WS, tagId: "t2" })
  })

  test("empty ids — zero db.update calls and zero enqueue calls", async () => {
    await deleteTags({ workspaceId: WS, ids: [] })
    expect(dbUpdate).not.toHaveBeenCalled()
    expect(enqueueDelete).not.toHaveBeenCalled()
  })

  test("calls invalidateCacheByTags exactly once after all chunks", async () => {
    updateReturning.mockResolvedValue([])
    await deleteTags({ workspaceId: WS, ids: makeIds(201) })
    expect(invalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
    ])
  })

  test("set includes deletedAt", async () => {
    updateReturning.mockResolvedValue([])
    await deleteTags({ workspaceId: WS, ids: ["t1"] })
    const setArg = updateSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).toHaveProperty("deletedAt")
    expect(setArg.deletedAt).toBeInstanceOf(Date)
  })
})

// ── deleteTag ─────────────────────────────────────────────────────────────────
describe("deleteTag", () => {
  test("soft-deletes and enqueues when tag is found", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }])
    await deleteTag({ workspaceId: WS, id: "t1" })
    expect(dbUpdate).toHaveBeenCalledTimes(1)
    expect(enqueueDelete).toHaveBeenCalledWith({ workspaceId: WS, tagId: "t1" })
  })

  test("does not enqueue when row not found or already soft-deleted", async () => {
    updateReturning.mockResolvedValue([])
    await deleteTag({ workspaceId: WS, id: "missing" })
    expect(enqueueDelete).not.toHaveBeenCalled()
  })

  test("always calls invalidateCacheByTags regardless of row existence", async () => {
    updateReturning.mockResolvedValue([])
    await deleteTag({ workspaceId: WS, id: "t1" })
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      `workspaces:${WS}#tags`,
    ])
  })

  test("set includes deletedAt", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }])
    await deleteTag({ workspaceId: WS, id: "t1" })
    const setArg = updateSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).toHaveProperty("deletedAt")
    expect(setArg.deletedAt).toBeInstanceOf(Date)
  })
})
