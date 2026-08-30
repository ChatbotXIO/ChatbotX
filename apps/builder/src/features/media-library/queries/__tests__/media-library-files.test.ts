// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
  resolveTenantSettings: vi.fn(),
  getPublicFileUrl: vi.fn(
    (path: string, storageUrl: string) => `${storageUrl}/${path}`,
  ),
}))

/**
 * Builds a fresh Drizzle-style select chain. `.limit()` is used two ways in
 * queries/files.ts — chained into `.offset()` (listMediaLibraryFiles) or
 * awaited directly (findMediaLibraryFileByPath) — so the object it returns is
 * both awaitable and further chainable.
 */
function createSelectChain(result: unknown) {
  const resolved = Promise.resolve(result)
  const limitResult: {
    offset: (...args: unknown[]) => Promise<unknown>
    then: Promise<unknown>["then"]
    catch: Promise<unknown>["catch"]
  } = {
    offset: vi.fn(() => resolved),
    // biome-ignore lint/suspicious/noThenProperty: mimics Drizzle's query builder, which is both chainable and awaitable
    then: (onFulfilled, onRejected) => resolved.then(onFulfilled, onRejected),
    catch: (onRejected) => resolved.catch(onRejected),
  }

  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((..._args: unknown[]) => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => limitResult),
  }

  return { chain, limitResult }
}

const dbSelect = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: mocks.getPublicFileUrl,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { select: dbSelect },
  and: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  ilike: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  mediaLibraryFileModel: {
    id: "file.id",
    workspaceId: "file.workspaceId",
    folderId: "file.folderId",
    isFavourite: "file.isFavourite",
    name: "file.name",
    path: "file.path",
    createdAt: "file.createdAt",
    lastAccessedAt: "file.lastAccessedAt",
  },
  mediaLibraryFolderModel: {},
  // ../schemas calls createSelectSchema(...).extend(...) at module scope, and
  // files.ts imports a real value (MEDIA_LIBRARY_FILES_PAGE_SIZE) from
  // ../schemas, so this mock must return something `.extend()`-able.
  createSelectSchema: () => z.object({}),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

const {
  listMediaLibraryFiles,
  findMediaLibraryFileByPath,
  findMediaLibraryFileById,
} = await import("../files")

const WS = "workspace-1"

beforeEach(() => {
  dbSelect.mockReset()
  mocks.assertCurrentUserCanAccessChatbot.mockClear()
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.resolveTenantSettings.mockReset()
  mocks.resolveTenantSettings.mockResolvedValue({
    storageUrl: "https://cdn.example.test",
  })
  mocks.getPublicFileUrl.mockClear()
})

// ── listMediaLibraryFiles ──────────────────────────────────────────────────────

describe("listMediaLibraryFiles", () => {
  test("asserts workspace access before querying", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS })

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith(WS)
  })

  test("defaults to the root folder (folderId IS NULL) when no filter or folderId is given", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toContainEqual(["file.folderId"])
  })

  test("filters by folderId when one is provided", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS, folderId: "folder-1" })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toContainEqual(["file.folderId", "folder-1"])
  })

  test("the favourite filter takes precedence over a provided folderId", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({
      workspaceId: WS,
      folderId: "folder-1",
      filter: "favourite",
    })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toContainEqual(["file.isFavourite", true])
    expect(whereArg).not.toContainEqual(["file.folderId", "folder-1"])
  })

  test("the recent filter does not add a folder condition", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS, filter: "recent" })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).not.toContainEqual(["file.folderId"])
  })

  test("adds an ilike search condition on name when search is provided", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS, search: "logo" })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toContainEqual(["file.name", "%logo%"])
  })

  test("orders by lastAccessedAt desc when filter is recent", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS, filter: "recent" })

    expect(chain.orderBy).toHaveBeenCalledWith(["file.lastAccessedAt"])
  })

  test("orders by createdAt desc for every other filter", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS, filter: "favourite" })

    expect(chain.orderBy).toHaveBeenCalledWith(["file.createdAt"])
  })

  test("defaults to page 1 (offset 0) when page is omitted", async () => {
    const { chain, limitResult } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS })

    expect(limitResult.offset).toHaveBeenCalledWith(0)
  })

  test("paginates using (page - 1) * MEDIA_LIBRARY_FILES_PAGE_SIZE as the offset", async () => {
    const { chain, limitResult } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFiles({ workspaceId: WS, page: 3 })

    expect(chain.limit).toHaveBeenCalledWith(60)
    expect(limitResult.offset).toHaveBeenCalledWith(120)
  })

  test("maps each row's path and the workspace's storageUrl into a public url", async () => {
    const { chain } = createSelectChain([
      { id: "file-1", path: "ws/1/a.png" },
      { id: "file-2", path: "ws/1/b.png" },
    ])
    dbSelect.mockReturnValue(chain)

    const result = await listMediaLibraryFiles({ workspaceId: WS })

    expect(result.data).toEqual([
      {
        id: "file-1",
        path: "ws/1/a.png",
        url: "https://cdn.example.test/ws/1/a.png",
      },
      {
        id: "file-2",
        path: "ws/1/b.png",
        url: "https://cdn.example.test/ws/1/b.png",
      },
    ])
  })
})

// ── findMediaLibraryFileByPath ─────────────────────────────────────────────────

describe("findMediaLibraryFileByPath", () => {
  test("returns the file when a row matches workspaceId and path", async () => {
    const file = { id: "file-1", workspaceId: WS, path: "ws/1/a.png" }
    const { chain } = createSelectChain([file])
    dbSelect.mockReturnValue(chain)

    const result = await findMediaLibraryFileByPath({
      workspaceId: WS,
      path: "ws/1/a.png",
    })

    expect(result).toEqual(file)
  })

  test("returns null when no row matches", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    const result = await findMediaLibraryFileByPath({
      workspaceId: WS,
      path: "ws/1/missing.png",
    })

    expect(result).toBeNull()
  })

  test("scopes the lookup by both workspaceId and path so a path from another workspace never matches", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await findMediaLibraryFileByPath({
      workspaceId: WS,
      path: "ws/2/spoofed.png",
    })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toEqual([
      ["file.workspaceId", WS],
      ["file.path", "ws/2/spoofed.png"],
    ])
  })
})

// ── findMediaLibraryFileById ───────────────────────────────────────────────────

describe("findMediaLibraryFileById", () => {
  test("returns the file when a row matches workspaceId and id", async () => {
    const file = { id: "file-1", workspaceId: WS, path: "ws/1/a.png" }
    const { chain } = createSelectChain([file])
    dbSelect.mockReturnValue(chain)

    const result = await findMediaLibraryFileById({
      workspaceId: WS,
      id: "file-1",
    })

    expect(result).toEqual(file)
  })

  test("returns null when no row matches", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    const result = await findMediaLibraryFileById({
      workspaceId: WS,
      id: "missing-id",
    })

    expect(result).toBeNull()
  })

  test("scopes the lookup by both workspaceId and id so an id from another workspace never matches", async () => {
    const { chain } = createSelectChain([])
    dbSelect.mockReturnValue(chain)

    await findMediaLibraryFileById({
      workspaceId: WS,
      id: "file-from-ws-2",
    })

    const whereArg = chain.where.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toEqual([
      ["file.workspaceId", WS],
      ["file.id", "file-from-ws-2"],
    ])
  })
})
