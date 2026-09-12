import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  listByFolder: vi.fn(),
  deleteByFolder: vi.fn(),
  deleteFolderById: vi.fn(),
  createFile: vi.fn(),
  findById: vi.fn(),
  deleteFileById: vi.fn(),
  setFavourite: vi.fn(),
  listByWorkspace: vi.fn(),
  countByFolder: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveToFolder: vi.fn(),
  touchLastAccessedAt: vi.fn(),
  deleteObject: vi.fn(),
  getPresignedUpload: vi.fn(),
  resolveTenantSettings: vi.fn(),
  createPending: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: {
    listByFolder: mocks.listByFolder,
    deleteByFolder: mocks.deleteByFolder,
    create: mocks.createFile,
    findById: mocks.findById,
    deleteById: mocks.deleteFileById,
    setFavourite: mocks.setFavourite,
    countByFolder: mocks.countByFolder,
    moveToFolder: mocks.moveToFolder,
    touchLastAccessedAt: mocks.touchLastAccessedAt,
  },
  mediaLibraryFolderRepository: {
    deleteById: mocks.deleteFolderById,
    listByWorkspace: mocks.listByWorkspace,
    create: mocks.createFolder,
    rename: mocks.renameFolder,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    deleteObject: mocks.deleteObject,
    getPresignedUpload: mocks.getPresignedUpload,
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "id-1",
  }
})

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, error: vi.fn() },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/file/service", () => ({
  fileService: { createPending: mocks.createPending },
}))

const { mediaLibraryService } = await import("../src/media-library/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({}),
  )
  mocks.resolveTenantSettings.mockResolvedValue({
    storageUrl: "https://cdn.example.test",
  })
})

describe("mediaLibraryService.createFile", () => {
  test("rejects a path outside both workspace prefixes", async () => {
    await expect(
      mediaLibraryService.createFile({
        workspaceId: "ws-1",
        name: "logo.png",
        path: "someone-elses/ws-2/logo.png",
        mimeType: "image/png",
        size: 100,
      }),
    ).rejects.toMatchObject({ code: "invalidPath", httpStatusCode: 400 })

    expect(mocks.createFile).not.toHaveBeenCalled()
  })

  test("accepts a workspaces/<id>/ scoped path", async () => {
    mocks.createFile.mockResolvedValue({
      id: "file-1",
      path: "workspaces/ws-1/logo.png",
    })

    await mediaLibraryService.createFile({
      workspaceId: "ws-1",
      name: "logo.png",
      path: "workspaces/ws-1/logo.png",
      mimeType: "image/png",
      size: 100,
    })

    expect(mocks.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        path: "workspaces/ws-1/logo.png",
      }),
    )
  })

  test("accepts a public/space/<id>/ scoped path", async () => {
    mocks.createFile.mockResolvedValue({
      id: "file-1",
      path: "public/space/ws-1/logo.png",
    })

    await mediaLibraryService.createFile({
      workspaceId: "ws-1",
      name: "logo.png",
      path: "public/space/ws-1/logo.png",
      mimeType: "image/png",
      size: 100,
    })

    expect(mocks.createFile).toHaveBeenCalled()
  })

  test("returns the created file with a resolved public url", async () => {
    mocks.createFile.mockResolvedValue({
      id: "file-1",
      path: "public/space/ws-1/logo.png",
    })

    const result = await mediaLibraryService.createFile({
      workspaceId: "ws-1",
      name: "logo.png",
      path: "public/space/ws-1/logo.png",
      mimeType: "image/png",
      size: 100,
    })

    expect(result).toEqual({
      id: "file-1",
      path: "public/space/ws-1/logo.png",
      url: "https://cdn.example.test/public/space/ws-1/logo.png",
    })
  })
})

describe("mediaLibraryService.deleteFolder", () => {
  test("swallows an S3 delete failure and still deletes both tables inside one transaction", async () => {
    mocks.listByFolder.mockResolvedValue([
      { id: "file-1", path: "workspaces/ws-1/a.png" },
    ])
    mocks.deleteObject.mockRejectedValue(new Error("S3 down"))

    await mediaLibraryService.deleteFolder({
      workspaceId: "ws-1",
      folderId: "folder-1",
    })

    expect(mocks.warn).toHaveBeenCalled()
    expect(mocks.deleteByFolder).toHaveBeenCalledWith(
      { workspaceId: "ws-1", folderId: "folder-1" },
      expect.anything(),
    )
    expect(mocks.deleteFolderById).toHaveBeenCalledWith(
      { folderId: "folder-1", workspaceId: "ws-1" },
      expect.anything(),
    )
  })

  test("deletes files and the folder in the same transaction on the happy path", async () => {
    mocks.listByFolder.mockResolvedValue([])
    mocks.deleteObject.mockResolvedValue(undefined)

    await mediaLibraryService.deleteFolder({
      workspaceId: "ws-1",
      folderId: "folder-1",
    })

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.deleteByFolder).toHaveBeenCalled()
    expect(mocks.deleteFolderById).toHaveBeenCalled()
  })
})

describe("mediaLibraryService.deleteFile", () => {
  test("throws notFound when the file does not exist", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(
      mediaLibraryService.deleteFile({
        workspaceId: "ws-1",
        fileId: "missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.deleteFileById).not.toHaveBeenCalled()
  })

  test("best-effort deletes the S3 object then the row", async () => {
    mocks.findById.mockResolvedValue({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
    })
    mocks.deleteObject.mockRejectedValue(new Error("S3 down"))

    await mediaLibraryService.deleteFile({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.warn).toHaveBeenCalled()
    expect(mocks.deleteFileById).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: "ws-1",
    })
  })
})

describe("mediaLibraryService.toggleFavourite", () => {
  test("throws notFound when the file does not exist", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(
      mediaLibraryService.toggleFavourite({
        workspaceId: "ws-1",
        fileId: "missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("flips isFavourite from false to true", async () => {
    mocks.findById.mockResolvedValue({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
      isFavourite: false,
    })

    await mediaLibraryService.toggleFavourite({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.setFavourite).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: "ws-1",
      isFavourite: true,
    })
  })

  test("flips isFavourite from true to false", async () => {
    mocks.findById.mockResolvedValue({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
      isFavourite: true,
    })

    await mediaLibraryService.toggleFavourite({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.setFavourite).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: "ws-1",
      isFavourite: false,
    })
  })
})

describe("mediaLibraryService.setFavourite", () => {
  test("throws notFound when the file does not exist", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(
      mediaLibraryService.setFavourite({
        workspaceId: "ws-1",
        fileId: "missing",
        isFavourite: true,
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.setFavourite).not.toHaveBeenCalled()
  })

  test("sets the explicit value regardless of the file's current state", async () => {
    mocks.findById.mockResolvedValue({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
      isFavourite: true,
    })

    const result = await mediaLibraryService.setFavourite({
      workspaceId: "ws-1",
      fileId: "file-1",
      isFavourite: true,
    })

    expect(mocks.setFavourite).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: "ws-1",
      isFavourite: true,
    })
    expect(result).toEqual({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
      isFavourite: true,
      url: "https://cdn.example.test/workspaces/ws-1/a.png",
    })
  })
})

describe("mediaLibraryService.findFile", () => {
  test("throws notFound when the file does not exist", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(
      mediaLibraryService.findFile({
        workspaceId: "ws-1",
        fileId: "missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("returns the file scoped to the workspace with a resolved url", async () => {
    mocks.findById.mockResolvedValue({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
    })

    const result = await mediaLibraryService.findFile({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.findById).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      id: "file-1",
      path: "workspaces/ws-1/a.png",
      url: "https://cdn.example.test/workspaces/ws-1/a.png",
    })
  })
})

describe("mediaLibraryService.presignUpload", () => {
  test("derives a workspace-scoped key and records a pending file with a null userId", async () => {
    mocks.getPresignedUpload.mockResolvedValue(
      "https://s3.example.test/presigned",
    )

    const result = await mediaLibraryService.presignUpload({
      workspaceId: "ws-1",
      fileName: "cat.png",
      mimeType: "image/png",
    })

    expect(mocks.getPresignedUpload).toHaveBeenCalledWith(
      "public/space/ws-1/media-library/id-1",
    )
    expect(result).toEqual({
      path: "public/space/ws-1/media-library/id-1",
      uploadUrl: "https://s3.example.test/presigned",
      publicUrl:
        "https://cdn.example.test/public/space/ws-1/media-library/id-1",
    })
    expect(mocks.createPending).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: null,
      contextType: "generic",
      subType: "generic",
      path: "public/space/ws-1/media-library/id-1",
      fileName: "cat.png",
      mimeType: "image/png",
    })
  })
})

describe("mediaLibraryService.listFolders", () => {
  test("scopes both the folder list and the grouped file count to workspaceId", async () => {
    mocks.listByWorkspace.mockResolvedValue([])
    mocks.countByFolder.mockResolvedValue([])

    await mediaLibraryService.listFolders({ workspaceId: "ws-1" })

    expect(mocks.listByWorkspace).toHaveBeenCalledWith({ workspaceId: "ws-1" })
    expect(mocks.countByFolder).toHaveBeenCalledWith({ workspaceId: "ws-1" })
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

    const result = await mediaLibraryService.listFolders({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([
      { id: "folder-1", name: "A", fileCount: 3 },
      { id: "folder-2", name: "B", fileCount: 0 },
    ])
  })

  test("defaults fileCount to 0 for a folder missing from the grouped counts", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      { id: "folder-empty", name: "Empty" },
    ])
    mocks.countByFolder.mockResolvedValue([])

    const result = await mediaLibraryService.listFolders({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([
      { id: "folder-empty", name: "Empty", fileCount: 0 },
    ])
  })

  test("ignores a count row whose folder is not in the workspace list", async () => {
    mocks.listByWorkspace.mockResolvedValue([])
    mocks.countByFolder.mockResolvedValue([{ folderId: "orphan", count: 5 }])

    const result = await mediaLibraryService.listFolders({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([])
  })
})

describe("mediaLibraryService.createFolder", () => {
  test("mints the id and scopes the row to the workspace", async () => {
    mocks.createFolder.mockResolvedValue({ id: "id-1" })

    await mediaLibraryService.createFolder({
      workspaceId: "ws-1",
      name: "Campaign assets",
    })

    expect(mocks.createFolder).toHaveBeenCalledWith({
      id: "id-1",
      name: "Campaign assets",
      workspaceId: "ws-1",
    })
  })
})

describe("mediaLibraryService.renameFolder", () => {
  test("scopes the rename by workspaceId so a foreign folderId matches nothing", async () => {
    await mediaLibraryService.renameFolder({
      workspaceId: "ws-1",
      folderId: "folder-1",
      name: "Renamed",
    })

    expect(mocks.renameFolder).toHaveBeenCalledWith({
      folderId: "folder-1",
      workspaceId: "ws-1",
      name: "Renamed",
    })
  })
})

describe("mediaLibraryService.moveFiles", () => {
  test("passes the target folder through", async () => {
    await mediaLibraryService.moveFiles({
      workspaceId: "ws-1",
      fileIds: ["file-1", "file-2"],
      folderId: "folder-9",
    })

    expect(mocks.moveToFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fileIds: ["file-1", "file-2"],
      folderId: "folder-9",
    })
  })

  test("normalises an omitted folderId to null so files move to the root", async () => {
    await mediaLibraryService.moveFiles({
      workspaceId: "ws-1",
      fileIds: ["file-1"],
    })

    expect(mocks.moveToFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fileIds: ["file-1"],
      folderId: null,
    })
  })
})

describe("mediaLibraryService.recordFileAccess", () => {
  test("scopes the touch by workspaceId", async () => {
    await mediaLibraryService.recordFileAccess({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.touchLastAccessedAt).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fileId: "file-1",
    })
  })
})
