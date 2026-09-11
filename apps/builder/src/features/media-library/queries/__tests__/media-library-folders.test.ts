// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
  listFolders: vi.fn().mockResolvedValue([]),
}))

vi.mock("@chatbotx.io/business", () => ({
  mediaLibraryService: {
    listFolders: mocks.listFolders,
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
  mocks.listFolders.mockReset()
  mocks.listFolders.mockResolvedValue([])
})

describe("listMediaLibraryFolders", () => {
  test("asserts workspace access before querying", async () => {
    await listMediaLibraryFolders({ workspaceId: WS })

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith(WS)
  })

  test("does not reach the service when the access assertion rejects", async () => {
    mocks.assertCurrentUserCanAccessChatbot.mockRejectedValue(
      new Error("forbidden"),
    )

    await expect(listMediaLibraryFolders({ workspaceId: WS })).rejects.toThrow(
      "forbidden",
    )
    expect(mocks.listFolders).not.toHaveBeenCalled()
  })

  test("scopes the service call to workspaceId", async () => {
    await listMediaLibraryFolders({ workspaceId: WS })

    expect(mocks.listFolders).toHaveBeenCalledWith({ workspaceId: WS })
  })

  test("wraps the service result in the response envelope", async () => {
    mocks.listFolders.mockResolvedValue([
      { id: "folder-1", name: "A", fileCount: 3 },
      { id: "folder-2", name: "B", fileCount: 0 },
    ])

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result).toEqual({
      data: [
        { id: "folder-1", name: "A", fileCount: 3 },
        { id: "folder-2", name: "B", fileCount: 0 },
      ],
    })
  })

  test("returns an empty list when the workspace has no folders", async () => {
    mocks.listFolders.mockResolvedValue([])

    const result = await listMediaLibraryFolders({ workspaceId: WS })

    expect(result.data).toEqual([])
  })
})
