import { beforeEach, describe, expect, test, vi } from "vitest"

// mediaLibraryFileRepository.findById / findByPath: both scope their
// SELECT by workspaceId AND the lookup key — a file id/path that resolves
// in another workspace must come back null, not leak across workspaces.

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  desc: vi.fn((column: unknown) => ({ desc: column })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  ilike: vi.fn((column: unknown, value: unknown) => ({
    ilike: [column, value],
  })),
  select: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  count: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  eq: mocks.eq,
  desc: mocks.desc,
  isNull: mocks.isNull,
  ilike: mocks.ilike,
  db: {
    select: mocks.select,
    delete: mocks.delete,
    update: mocks.update,
    $count: mocks.count,
  },
}))
vi.mock("../src/schema", () => ({
  mediaLibraryFileModel: {
    id: "mediaLibraryFileModel.id",
    workspaceId: "mediaLibraryFileModel.workspaceId",
    path: "mediaLibraryFileModel.path",
    folderId: "mediaLibraryFileModel.folderId",
    isFavourite: "mediaLibraryFileModel.isFavourite",
    name: "mediaLibraryFileModel.name",
    lastAccessedAt: "mediaLibraryFileModel.lastAccessedAt",
    createdAt: "mediaLibraryFileModel.createdAt",
  },
}))

const { mediaLibraryFileModel } = await import("../src/schema")
const { mediaLibraryFileRepository } = await import(
  "../src/repositories/media-library-file/repository"
)

function createSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockResolvedValue(result)
  return chain
}

function createListSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.offset.mockResolvedValue(result)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere })
  mocks.deleteWhere.mockResolvedValue(undefined)
  mocks.update.mockReturnValue({ set: mocks.updateSet })
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
  mocks.updateWhere.mockResolvedValue(undefined)
})

describe("mediaLibraryFileRepository.findById", () => {
  test("scopes the where clause by workspaceId AND id", async () => {
    const chain = createSelectChain([{ id: "file-1", workspaceId: "ws-1" }])
    mocks.select.mockReturnValue(chain)

    const result = await mediaLibraryFileRepository.findById({
      workspaceId: "ws-1",
      id: "file-1",
    })

    expect(mocks.eq).toHaveBeenCalledWith(
      "mediaLibraryFileModel.workspaceId",
      "ws-1",
    )
    expect(mocks.eq).toHaveBeenCalledWith("mediaLibraryFileModel.id", "file-1")
    expect(result).toEqual({ id: "file-1", workspaceId: "ws-1" })
  })

  test("returns null for another workspace's file id", async () => {
    const chain = createSelectChain([])
    mocks.select.mockReturnValue(chain)

    const result = await mediaLibraryFileRepository.findById({
      workspaceId: "ws-2",
      id: "file-1",
    })

    expect(result).toBeNull()
  })
})

describe("mediaLibraryFileRepository.findByPath", () => {
  test("scopes the where clause by workspaceId AND path", async () => {
    const chain = createSelectChain([
      { id: "file-1", workspaceId: "ws-1", path: "a/b.png" },
    ])
    mocks.select.mockReturnValue(chain)

    const result = await mediaLibraryFileRepository.findByPath({
      workspaceId: "ws-1",
      path: "a/b.png",
    })

    expect(mocks.eq).toHaveBeenCalledWith(
      "mediaLibraryFileModel.workspaceId",
      "ws-1",
    )
    expect(mocks.eq).toHaveBeenCalledWith(
      "mediaLibraryFileModel.path",
      "a/b.png",
    )
    expect(result).toEqual({
      id: "file-1",
      workspaceId: "ws-1",
      path: "a/b.png",
    })
  })

  test("returns null for another workspace's file path", async () => {
    const chain = createSelectChain([])
    mocks.select.mockReturnValue(chain)

    const result = await mediaLibraryFileRepository.findByPath({
      workspaceId: "ws-2",
      path: "a/b.png",
    })

    expect(result).toBeNull()
  })
})

// Regression coverage for the PR #1098 review fix: `deleteById` and
// `setFavourite` were the only two writes in this repository missing a
// `workspaceId` predicate — every service call site pre-validates via
// `findById({ id, workspaceId })` first, so this is defense-in-depth against
// a future caller that skips that check.
describe("mediaLibraryFileRepository.deleteById", () => {
  test("scopes the delete by id AND workspaceId", async () => {
    await mediaLibraryFileRepository.deleteById({
      id: "file-1",
      workspaceId: "ws-1",
    })

    expect(mocks.eq).toHaveBeenCalledWith("mediaLibraryFileModel.id", "file-1")
    expect(mocks.eq).toHaveBeenCalledWith(
      "mediaLibraryFileModel.workspaceId",
      "ws-1",
    )
    expect(mocks.and).toHaveBeenCalledWith(
      { eq: ["mediaLibraryFileModel.id", "file-1"] },
      { eq: ["mediaLibraryFileModel.workspaceId", "ws-1"] },
    )
  })
})

describe("mediaLibraryFileRepository.setFavourite", () => {
  test("scopes the update by id AND workspaceId", async () => {
    await mediaLibraryFileRepository.setFavourite({
      id: "file-1",
      workspaceId: "ws-1",
      isFavourite: true,
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({ isFavourite: true })
    expect(mocks.eq).toHaveBeenCalledWith("mediaLibraryFileModel.id", "file-1")
    expect(mocks.eq).toHaveBeenCalledWith(
      "mediaLibraryFileModel.workspaceId",
      "ws-1",
    )
    expect(mocks.and).toHaveBeenCalledWith(
      { eq: ["mediaLibraryFileModel.id", "file-1"] },
      { eq: ["mediaLibraryFileModel.workspaceId", "ws-1"] },
    )
  })
})

describe("mediaLibraryFileRepository.list", () => {
  test("returns data and total scoped by the same where clause", async () => {
    const rows = [{ id: "file-1" }, { id: "file-2" }]
    mocks.select.mockReturnValue(createListSelectChain(rows))
    mocks.count.mockResolvedValue(2)

    const result = await mediaLibraryFileRepository.list({
      workspaceId: "ws-1",
      perPage: 50,
    })

    expect(result).toEqual({ data: rows, total: 2 })
    expect(mocks.count).toHaveBeenCalledWith(mediaLibraryFileModel, {
      and: [
        { eq: ["mediaLibraryFileModel.workspaceId", "ws-1"] },
        { isNull: "mediaLibraryFileModel.folderId" },
      ],
    })
  })

  test("scopes to root-level files when no filter and no folderId are given", async () => {
    mocks.select.mockReturnValue(createListSelectChain([]))
    mocks.count.mockResolvedValue(0)

    await mediaLibraryFileRepository.list({ workspaceId: "ws-1", perPage: 50 })

    expect(mocks.isNull).toHaveBeenCalledWith("mediaLibraryFileModel.folderId")
  })

  test("filter 'favourite' ignores folderId and scopes by isFavourite instead", async () => {
    mocks.select.mockReturnValue(createListSelectChain([]))
    mocks.count.mockResolvedValue(0)

    await mediaLibraryFileRepository.list({
      workspaceId: "ws-1",
      folderId: "folder-1",
      filter: "favourite",
      perPage: 50,
    })

    expect(mocks.isNull).not.toHaveBeenCalled()
    expect(mocks.eq).toHaveBeenCalledWith(
      "mediaLibraryFileModel.isFavourite",
      true,
    )
    expect(mocks.eq).not.toHaveBeenCalledWith(
      "mediaLibraryFileModel.folderId",
      "folder-1",
    )
  })

  test("filter 'all' spans every folder with no folder condition", async () => {
    mocks.select.mockReturnValue(createListSelectChain([]))
    mocks.count.mockResolvedValue(0)

    await mediaLibraryFileRepository.list({
      workspaceId: "ws-1",
      filter: "all",
      perPage: 50,
    })

    expect(mocks.isNull).not.toHaveBeenCalled()
  })
})
