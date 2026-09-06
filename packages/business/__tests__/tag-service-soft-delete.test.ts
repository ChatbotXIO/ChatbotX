import { beforeEach, describe, expect, test, vi } from "vitest"

const dbUpdate = vi.fn()
const updateSet = vi.fn()
const updateWhere = vi.fn()
const updateReturning = vi.fn()
const enqueueDelete = vi.fn()
const invalidateCacheByTags = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
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

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: {
    enqueueDelete: (...args: unknown[]) => enqueueDelete(...args),
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
  folderService: {},
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

const { tagService } = await import("../src/tag/service")

const WS = "ws-1"

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

describe("tagService.softDelete", () => {
  test("calls db.update once for <=200 ids", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }])
    await tagService.softDelete({ workspaceId: WS, ids: ["t1"] })
    expect(dbUpdate).toHaveBeenCalledTimes(1)
  })

  test("chunks ids — 201 ids triggers exactly 2 db.update calls", async () => {
    updateReturning.mockResolvedValue([])
    await tagService.softDelete({ workspaceId: WS, ids: makeIds(201) })
    expect(dbUpdate).toHaveBeenCalledTimes(2)
  })

  test("chunks ids — 400 ids triggers exactly 2 db.update calls", async () => {
    updateReturning.mockResolvedValue([])
    await tagService.softDelete({ workspaceId: WS, ids: makeIds(400) })
    expect(dbUpdate).toHaveBeenCalledTimes(2)
  })

  test("enqueues only for rows actually returned by db.update", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }, { id: "t2" }])
    await tagService.softDelete({ workspaceId: WS, ids: ["t1", "t2", "t99"] })
    expect(enqueueDelete).toHaveBeenCalledTimes(2)
    expect(enqueueDelete).toHaveBeenCalledWith({ workspaceId: WS, tagId: "t1" })
    expect(enqueueDelete).toHaveBeenCalledWith({ workspaceId: WS, tagId: "t2" })
  })

  test("empty ids — zero db.update calls and zero enqueue calls", async () => {
    await tagService.softDelete({ workspaceId: WS, ids: [] })
    expect(dbUpdate).not.toHaveBeenCalled()
    expect(enqueueDelete).not.toHaveBeenCalled()
  })

  test("calls invalidateCacheByTags exactly once after all chunks", async () => {
    updateReturning.mockResolvedValue([])
    await tagService.softDelete({ workspaceId: WS, ids: makeIds(201) })
    expect(invalidateCacheByTags).toHaveBeenCalledTimes(1)
    expect(invalidateCacheByTags).toHaveBeenCalledWith(["tags", `tags:${WS}`])
  })

  test("set includes deletedAt", async () => {
    updateReturning.mockResolvedValue([])
    await tagService.softDelete({ workspaceId: WS, ids: ["t1"] })
    const setArg = updateSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).toHaveProperty("deletedAt")
    expect(setArg.deletedAt).toBeInstanceOf(Date)
  })

  test("soft-deletes and enqueues when tag is found (single id)", async () => {
    updateReturning.mockResolvedValue([{ id: "t1" }])
    await tagService.softDelete({ workspaceId: WS, ids: ["t1"] })
    expect(dbUpdate).toHaveBeenCalledTimes(1)
    expect(enqueueDelete).toHaveBeenCalledWith({ workspaceId: WS, tagId: "t1" })
  })

  test("does not enqueue when row not found or already soft-deleted", async () => {
    updateReturning.mockResolvedValue([])
    await tagService.softDelete({ workspaceId: WS, ids: ["missing"] })
    expect(enqueueDelete).not.toHaveBeenCalled()
  })
})
