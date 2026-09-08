// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
  findByPath: vi.fn(),
  findById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  mediaLibraryFileService: {
    list: mocks.list,
    findByPath: mocks.findByPath,
    findById: mocks.findById,
  },
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
  mocks.list.mockReset()
  mocks.findByPath.mockReset()
  mocks.findById.mockReset()
  mocks.assertCurrentUserCanAccessChatbot.mockClear()
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
})

// ── listMediaLibraryFiles ──────────────────────────────────────────────────────

describe("listMediaLibraryFiles", () => {
  test("asserts workspace access before delegating to the service", async () => {
    mocks.list.mockResolvedValue({ data: [] })

    await listMediaLibraryFiles({ workspaceId: WS })

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith(WS)
  })

  test("passes the request through to the service", async () => {
    mocks.list.mockResolvedValue({ data: [] })

    await listMediaLibraryFiles({ workspaceId: WS, folderId: "folder-1" })

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: "folder-1",
    })
  })

  test("returns the service result as-is", async () => {
    const response = {
      data: [
        {
          id: "file-1",
          path: "ws/1/a.png",
          url: "https://cdn.example.test/ws/1/a.png",
        },
      ],
    }
    mocks.list.mockResolvedValue(response)

    const result = await listMediaLibraryFiles({ workspaceId: WS })

    expect(result).toEqual(response)
  })
})

// ── findMediaLibraryFileByPath ─────────────────────────────────────────────────

describe("findMediaLibraryFileByPath", () => {
  test("returns the file when the service finds a match", async () => {
    const file = { id: "file-1", workspaceId: WS, path: "ws/1/a.png" }
    mocks.findByPath.mockResolvedValue(file)

    const result = await findMediaLibraryFileByPath({
      workspaceId: WS,
      path: "ws/1/a.png",
    })

    expect(result).toEqual(file)
    expect(mocks.findByPath).toHaveBeenCalledWith({
      workspaceId: WS,
      path: "ws/1/a.png",
    })
  })

  test("returns null when no row matches", async () => {
    mocks.findByPath.mockResolvedValue(null)

    const result = await findMediaLibraryFileByPath({
      workspaceId: WS,
      path: "ws/1/missing.png",
    })

    expect(result).toBeNull()
  })
})

// ── findMediaLibraryFileById ───────────────────────────────────────────────────

describe("findMediaLibraryFileById", () => {
  test("returns the file when the service finds a match", async () => {
    const file = { id: "file-1", workspaceId: WS, path: "ws/1/a.png" }
    mocks.findById.mockResolvedValue(file)

    const result = await findMediaLibraryFileById({
      workspaceId: WS,
      id: "file-1",
    })

    expect(result).toEqual(file)
    expect(mocks.findById).toHaveBeenCalledWith({
      workspaceId: WS,
      id: "file-1",
    })
  })

  test("returns null when no row matches", async () => {
    mocks.findById.mockResolvedValue(null)

    const result = await findMediaLibraryFileById({
      workspaceId: WS,
      id: "missing-id",
    })

    expect(result).toBeNull()
  })
})
