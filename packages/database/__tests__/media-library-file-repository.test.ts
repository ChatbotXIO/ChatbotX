import { beforeEach, describe, expect, test, vi } from "vitest"

// mediaLibraryFileRepository.findById / findByPath: both scope their
// SELECT by workspaceId AND the lookup key — a file id/path that resolves
// in another workspace must come back null, not leak across workspaces.

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  select: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  eq: mocks.eq,
  db: { select: mocks.select },
}))

vi.mock("../src/schema", () => ({
  mediaLibraryFileModel: {
    id: "mediaLibraryFileModel.id",
    workspaceId: "mediaLibraryFileModel.workspaceId",
    path: "mediaLibraryFileModel.path",
  },
}))

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

beforeEach(() => {
  vi.clearAllMocks()
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
