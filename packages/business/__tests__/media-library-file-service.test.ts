// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  findByPath: vi.fn(),
  findById: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: {
    list: mocks.list,
    findByPath: mocks.findByPath,
    findById: mocks.findById,
  },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

const { mediaLibraryFileService, MEDIA_LIBRARY_FILES_PAGE_SIZE } = await import(
  "../src/media-library-file/service"
)

const WS = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveTenantSettings.mockResolvedValue({
    storageUrl: "https://cdn.example.test",
  })
})

describe("mediaLibraryFileService.list", () => {
  test("passes the page size and input through to the repository", async () => {
    mocks.list.mockResolvedValue({ data: [], total: 0 })

    await mediaLibraryFileService.list({ workspaceId: WS, folderId: "f-1" })

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: "f-1",
      perPage: MEDIA_LIBRARY_FILES_PAGE_SIZE,
    })
  })

  test("passes an explicit perPage through instead of the default page size", async () => {
    mocks.list.mockResolvedValue({ data: [], total: 0 })

    await mediaLibraryFileService.list({ workspaceId: WS, perPage: 10 })

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: WS,
      perPage: 10,
    })
  })

  test("maps each row's path and the workspace's storageUrl into a public url", async () => {
    mocks.list.mockResolvedValue({
      data: [
        { id: "file-1", path: "ws/1/a.png" },
        { id: "file-2", path: "ws/1/b.png" },
      ],
      total: 2,
    })

    const result = await mediaLibraryFileService.list({ workspaceId: WS })

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

  test("derives pageCount from the repository's total and the effective perPage", async () => {
    mocks.list.mockResolvedValue({ data: [], total: 25 })

    const result = await mediaLibraryFileService.list({
      workspaceId: WS,
      perPage: 10,
    })

    expect(result.pageCount).toBe(3)
  })
})

describe("mediaLibraryFileService.findByPath", () => {
  test("scopes the lookup by both workspaceId and path", async () => {
    const file = { id: "file-1", workspaceId: WS, path: "ws/1/a.png" }
    mocks.findByPath.mockResolvedValue(file)

    const result = await mediaLibraryFileService.findByPath({
      workspaceId: WS,
      path: "ws/1/a.png",
    })

    expect(result).toEqual(file)
    expect(mocks.findByPath).toHaveBeenCalledWith({
      workspaceId: WS,
      path: "ws/1/a.png",
    })
  })
})

describe("mediaLibraryFileService.findById", () => {
  test("scopes the lookup by both workspaceId and id", async () => {
    const file = { id: "file-1", workspaceId: WS, path: "ws/1/a.png" }
    mocks.findById.mockResolvedValue(file)

    const result = await mediaLibraryFileService.findById({
      workspaceId: WS,
      id: "file-1",
    })

    expect(result).toEqual(file)
    expect(mocks.findById).toHaveBeenCalledWith({
      workspaceId: WS,
      id: "file-1",
    })
  })
})
