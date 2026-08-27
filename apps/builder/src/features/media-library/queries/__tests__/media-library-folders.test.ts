// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
  findManyFolders: vi.fn().mockResolvedValue([]),
}))

function createGroupByChain(result: unknown) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

const dbSelect = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { mediaLibraryFolderModel: { findMany: mocks.findManyFolders } },
    select: dbSelect,
  },
  count: vi.fn(() => "COUNT(*)"),
  eq: (...args: unknown[]) => args,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  mediaLibraryFileModel: {
    workspaceId: "file.workspaceId",
    folderId: "file.folderId",
  },
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

const { listMediaLibraryFolders } = await import("../folders")

const WS = "workspace-1"

beforeEach(() => {
  dbSelect.mockReset()
  mocks.assertCurrentUserCanAccessChatbot.mockClear()
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.findManyFolders.mockReset()
  mocks.findManyFolders.mockResolvedValue([])
})

describe("listMediaLibraryFolders", () => {
  test("asserts workspace access before querying", async () => {
    dbSelect.mockReturnValue(createGroupByChain([]))

    await listMediaLibraryFolders({ workspaceId: WS })

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith(WS)
  })

  test("scopes both the folder list and the file-count query to workspaceId", async () => {
    const chain = createGroupByChain([])
    dbSelect.mockReturnValue(chain)

    await listMediaLibraryFolders({ workspaceId: WS })

    expect(mocks.findManyFolders).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: WS } }),
    )
    expect(chain.where).toHaveBeenCalledWith(["file.workspaceId", WS])
  })

  test("merges the matching fileCount onto each folder", async () => {
    mocks.findManyFolders.mockResolvedValue([
      { id: "folder-1", name: "A" },
      { id: "folder-2", name: "B" },
    ])
    dbSelect.mockReturnValue(
      createGroupByChain([
        { folderId: "folder-1", count: 3 },
        { folderId: "folder-2", count: 0 },
      ]),
    )

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([
      { id: "folder-1", name: "A", fileCount: 3 },
      { id: "folder-2", name: "B", fileCount: 0 },
    ])
  })

  test("defaults fileCount to 0 for a folder missing from the grouped counts", async () => {
    mocks.findManyFolders.mockResolvedValue([
      { id: "folder-empty", name: "Empty" },
    ])
    dbSelect.mockReturnValue(createGroupByChain([]))

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([
      { id: "folder-empty", name: "Empty", fileCount: 0 },
    ])
  })

  test("returns an empty list when the workspace has no folders", async () => {
    mocks.findManyFolders.mockResolvedValue([])
    dbSelect.mockReturnValue(
      createGroupByChain([{ folderId: "orphan", count: 5 }]),
    )

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([])
  })
})
