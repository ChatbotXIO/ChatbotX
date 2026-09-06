// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
  listByWorkspace: vi.fn().mockResolvedValue([]),
  countByFolder: vi.fn().mockResolvedValue([]),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: {
    countByFolder: mocks.countByFolder,
  },
  mediaLibraryFolderRepository: {
    listByWorkspace: mocks.listByWorkspace,
  },
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

const { listMediaLibraryFolders } = await import("../folders")

const WS = "workspace-1"

beforeEach(() => {
  mocks.assertCurrentUserCanAccessChatbot.mockClear()
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.listByWorkspace.mockReset()
  mocks.listByWorkspace.mockResolvedValue([])
  mocks.countByFolder.mockReset()
  mocks.countByFolder.mockResolvedValue([])
})

describe("listMediaLibraryFolders", () => {
  test("asserts workspace access before querying", async () => {
    await listMediaLibraryFolders({ workspaceId: WS })

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith(WS)
  })

  test("scopes both the folder list and the file-count query to workspaceId", async () => {
    await listMediaLibraryFolders({ workspaceId: WS })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith({ workspaceId: WS })
    expect(mocks.countByFolder).toHaveBeenCalledWith({ workspaceId: WS })
  })

  test("merges the matching fileCount onto each folder", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      { id: "folder-1", name: "A" },
      { id: "folder-2", name: "B" },
    ])
    mocks.countByFolder.mockResolvedValue([
      { folderId: "folder-1", count: 3 },
      { folderId: "folder-2", count: 0 },
    ])

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([
      { id: "folder-1", name: "A", fileCount: 3 },
      { id: "folder-2", name: "B", fileCount: 0 },
    ])
  })

  test("defaults fileCount to 0 for a folder missing from the grouped counts", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      { id: "folder-empty", name: "Empty" },
    ])
    mocks.countByFolder.mockResolvedValue([])

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([
      { id: "folder-empty", name: "Empty", fileCount: 0 },
    ])
  })

  test("returns an empty list when the workspace has no folders", async () => {
    mocks.listByWorkspace.mockResolvedValue([])
    mocks.countByFolder.mockResolvedValue([{ folderId: "orphan", count: 5 }])

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([])
  })
})
