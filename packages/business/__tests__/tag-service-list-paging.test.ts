import { beforeEach, describe, expect, test, vi } from "vitest"

const findMany = vi.fn()
const count = vi.fn()
const cacheKeys: string[] = []

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { tagModel: { findMany: (...a: unknown[]) => findMany(...a) } },
    $count: (...a: unknown[]) => count(...a),
  },
  and: vi.fn(),
  eq: vi.fn(),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  notExists: vi.fn(),
  notInArray: vi.fn(),
  relationsFilterToSQL: () => "where-sql",
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  contactModel: {},
  contactsToTagsModel: {},
  contactToTagChannelModel: {},
  conversationModel: {},
  tagChannelModel: {},
  tagModel: { id: {}, name: {}, createdAt: {} },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: async (key: string, callback: () => Promise<unknown>) => {
    cacheKeys.push(key)
    return await callback()
  },
}))
vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({}),
  changedKeysOf: vi.fn(),
}))
vi.mock("../src/folder/service", () => ({
  toStoredFolderId: vi.fn(),
  folderService: {},
}))
vi.mock("../src/ads-conversion/service", () => ({ adsConversionService: {} }))
vi.mock("../src/contact", () => ({ contactService: {} }))
vi.mock("../src/tag/sync.service", () => ({ tagSyncService: {} }))
vi.mock("../src/tag/realtime", () => ({ publishContactTagsChanged: vi.fn() }))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

const { tagService } = await import("../src/tag/service")

beforeEach(() => {
  vi.clearAllMocks()
  cacheKeys.length = 0
  findMany.mockResolvedValue([])
  count.mockResolvedValue(25)
})

describe("tagService.list paging", () => {
  test("limits the rows to the page and reports the page count from the total", async () => {
    const result = await tagService.list({
      workspaceId: "ws",
      page: 3,
      perPage: 10,
      name: "vip",
      sort: [{ id: "name", desc: false }],
    })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 }),
    )
    expect(count).toHaveBeenCalledTimes(1)
    expect(result.pageCount).toBe(3)
  })

  test("without a page it still returns everything in one page (public API)", async () => {
    const result = await tagService.list({ workspaceId: "ws" })

    const args = findMany.mock.calls[0]?.[0] as Record<string, unknown>
    expect(args.limit).toBeUndefined()
    expect(args.offset).toBeUndefined()
    expect(count).not.toHaveBeenCalled()
    expect(result.pageCount).toBe(1)
  })

  test("caches each page and search under its own key", async () => {
    await tagService.list({ workspaceId: "ws", page: 1, perPage: 10 })
    await tagService.list({ workspaceId: "ws", page: 2, perPage: 10 })
    await tagService.list({
      workspaceId: "ws",
      page: 1,
      perPage: 10,
      name: "a",
    })

    expect(new Set(cacheKeys).size).toBe(3)
  })
})
