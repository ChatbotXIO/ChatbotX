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
  deleteObject: vi.fn(),
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
  },
  mediaLibraryFolderRepository: {
    deleteById: mocks.deleteFolderById,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "id-1",
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, error: vi.fn() },
}))

const { mediaLibraryService } = await import("../src/media-library/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({}),
  )
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
    mocks.createFile.mockResolvedValue({ id: "file-1" })

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
    mocks.createFile.mockResolvedValue({ id: "file-1" })

    await mediaLibraryService.createFile({
      workspaceId: "ws-1",
      name: "logo.png",
      path: "public/space/ws-1/logo.png",
      mimeType: "image/png",
      size: 100,
    })

    expect(mocks.createFile).toHaveBeenCalled()
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
    expect(mocks.deleteFileById).toHaveBeenCalledWith({ id: "file-1" })
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
    mocks.findById.mockResolvedValue({ id: "file-1", isFavourite: false })

    await mediaLibraryService.toggleFavourite({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.setFavourite).toHaveBeenCalledWith({
      id: "file-1",
      isFavourite: true,
    })
  })

  test("flips isFavourite from true to false", async () => {
    mocks.findById.mockResolvedValue({ id: "file-1", isFavourite: true })

    await mediaLibraryService.toggleFavourite({
      workspaceId: "ws-1",
      fileId: "file-1",
    })

    expect(mocks.setFavourite).toHaveBeenCalledWith({
      id: "file-1",
      isFavourite: false,
    })
  })
})
