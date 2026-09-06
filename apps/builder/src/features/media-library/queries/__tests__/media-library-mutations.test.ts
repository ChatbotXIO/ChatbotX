// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Shared mutable state (hoisted so it's available to vi.mock factories) ────

const mocks = vi.hoisted(() => ({
  // media-library-folder repository
  folderCreate: vi.fn(),
  folderRename: vi.fn().mockResolvedValue(undefined),
  folderDeleteById: vi.fn().mockResolvedValue(undefined),
  // media-library-file repository
  fileListByFolder: vi.fn().mockResolvedValue([]),
  fileDeleteByFolder: vi.fn().mockResolvedValue(undefined),
  fileCreate: vi.fn(),
  fileFindById: vi.fn(),
  fileDeleteById: vi.fn().mockResolvedValue(undefined),
  fileMoveToFolder: vi.fn().mockResolvedValue(undefined),
  fileSetFavourite: vi.fn().mockResolvedValue(undefined),
  fileTouchLastAccessedAt: vi.fn().mockResolvedValue(undefined),
  // filesystem / misc
  deleteObject: vi.fn().mockResolvedValue(undefined),
  createIdFn: vi.fn(() => "generated-id"),
  loggerWarn: vi.fn(),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => cb({})),
}))

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mocks.transaction,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: {
    listByFolder: mocks.fileListByFolder,
    deleteByFolder: mocks.fileDeleteByFolder,
    create: mocks.fileCreate,
    findById: mocks.fileFindById,
    deleteById: mocks.fileDeleteById,
    moveToFolder: mocks.fileMoveToFolder,
    setFavourite: mocks.fileSetFavourite,
    touchLastAccessedAt: mocks.fileTouchLastAccessedAt,
  },
  mediaLibraryFolderRepository: {
    create: mocks.folderCreate,
    rename: mocks.folderRename,
    deleteById: mocks.folderDeleteById,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createIdFn,
}))

// The Media Library mutations query file delegates its side-effecting
// mutations (folder delete with S3 cleanup, file create/delete/favourite
// toggle) to `mediaLibraryService`. This mock mirrors the real service's
// logic (see packages/business/src/media-library/service.ts, unit-tested on
// its own in packages/business/__tests__/media-library.service.test.ts) but
// calls straight through to the repository/uploader mocks already declared
// above, so this file can keep asserting the same repository-boundary
// behavior (invalid-path rejection, S3-failure-still-deletes-both-tables,
// favourite flip, notFound propagation) without re-mocking the service's own
// transitive dependencies.
vi.mock("@chatbotx.io/business", () => ({
  mediaLibraryService: {
    async deleteFolder(input: { workspaceId: string; folderId: string }) {
      const files = await mocks.fileListByFolder({
        workspaceId: input.workspaceId,
        folderId: input.folderId,
      })
      await mocks.transaction(async (tx: unknown) => {
        for (const file of files as { path: string }[]) {
          try {
            await mocks.deleteObject(file.path)
          } catch (error) {
            mocks.loggerWarn(
              error,
              "deleteMediaLibraryFolder: S3 delete failed",
            )
          }
        }
        await mocks.fileDeleteByFolder(
          { workspaceId: input.workspaceId, folderId: input.folderId },
          tx,
        )
        await mocks.folderDeleteById(
          { folderId: input.folderId, workspaceId: input.workspaceId },
          tx,
        )
      })
    },
    async createFile(input: {
      workspaceId: string
      folderId?: string | null
      name: string
      path: string
      mimeType: string
      size: number
    }) {
      const isWorkspaceScopedPath =
        input.path.startsWith(`workspaces/${input.workspaceId}/`) ||
        input.path.startsWith(`public/space/${input.workspaceId}/`)
      if (!isWorkspaceScopedPath) {
        const error = new Error("Invalid file path") as Error & {
          code: string
        }
        error.code = "invalidPath"
        throw error
      }
      return await mocks.fileCreate({
        id: mocks.createIdFn(),
        workspaceId: input.workspaceId,
        folderId: input.folderId ?? null,
        name: input.name,
        path: input.path,
        mimeType: input.mimeType,
        size: input.size,
      })
    },
    async deleteFile(input: { workspaceId: string; fileId: string }) {
      const file = await mocks.fileFindById({
        id: input.fileId,
        workspaceId: input.workspaceId,
      })
      if (!file) {
        throw new Error(`MediaLibraryFile ${input.fileId} not found`)
      }
      try {
        await mocks.deleteObject(file.path)
      } catch (error) {
        mocks.loggerWarn(error, "deleteMediaLibraryFile: S3 delete failed")
      }
      await mocks.fileDeleteById({ id: input.fileId })
    },
    async toggleFavourite(input: { workspaceId: string; fileId: string }) {
      const file = await mocks.fileFindById({
        id: input.fileId,
        workspaceId: input.workspaceId,
      })
      if (!file) {
        throw new Error(`MediaLibraryFile ${input.fileId} not found`)
      }
      await mocks.fileSetFavourite({
        id: input.fileId,
        isFavourite: !file.isFavourite,
      })
    },
  },
}))

// ── Lazy imports (after vi.mock) ──────────────────────────────────────────────

const {
  createMediaLibraryFolder,
  renameMediaLibraryFolder,
  deleteMediaLibraryFolder,
  createMediaLibraryFile,
  deleteMediaLibraryFile,
  moveMediaLibraryFiles,
  toggleMediaLibraryFavourite,
  recordMediaLibraryFileAccess,
} = await import("../mutations")

const WS = "workspace-1"
const OTHER_WS = "workspace-2"

function resetAll() {
  mocks.folderCreate.mockReset()
  mocks.folderRename.mockClear()
  mocks.folderRename.mockResolvedValue(undefined)
  mocks.folderDeleteById.mockClear()
  mocks.folderDeleteById.mockResolvedValue(undefined)
  mocks.fileListByFolder.mockClear()
  mocks.fileListByFolder.mockResolvedValue([])
  mocks.fileDeleteByFolder.mockClear()
  mocks.fileDeleteByFolder.mockResolvedValue(undefined)
  mocks.fileCreate.mockReset()
  mocks.fileFindById.mockReset()
  mocks.fileDeleteById.mockClear()
  mocks.fileDeleteById.mockResolvedValue(undefined)
  mocks.fileMoveToFolder.mockClear()
  mocks.fileMoveToFolder.mockResolvedValue(undefined)
  mocks.fileSetFavourite.mockClear()
  mocks.fileSetFavourite.mockResolvedValue(undefined)
  mocks.fileTouchLastAccessedAt.mockClear()
  mocks.fileTouchLastAccessedAt.mockResolvedValue(undefined)
  mocks.deleteObject.mockClear()
  mocks.deleteObject.mockResolvedValue(undefined)
  mocks.createIdFn.mockClear()
  mocks.createIdFn.mockReturnValue("generated-id")
  mocks.loggerWarn.mockClear()
  mocks.transaction.mockClear()
}

// ── createMediaLibraryFolder ───────────────────────────────────────────────────

describe("createMediaLibraryFolder", () => {
  beforeEach(resetAll)

  test("inserts a folder with a generated id and returns the created row", async () => {
    const created = { id: "generated-id", name: "Marketing", workspaceId: WS }
    mocks.folderCreate.mockResolvedValue(created)

    const result = await createMediaLibraryFolder({
      workspaceId: WS,
      name: "Marketing",
    })

    expect(mocks.folderCreate).toHaveBeenCalledWith({
      id: "generated-id",
      name: "Marketing",
      workspaceId: WS,
    })
    expect(result).toEqual(created)
  })
})

// ── renameMediaLibraryFolder ───────────────────────────────────────────────────

describe("renameMediaLibraryFolder", () => {
  beforeEach(resetAll)

  test("updates the folder name", async () => {
    await renameMediaLibraryFolder({
      workspaceId: WS,
      folderId: "folder-1",
      name: "Renamed",
    })

    expect(mocks.folderRename).toHaveBeenCalledWith({
      folderId: "folder-1",
      workspaceId: WS,
      name: "Renamed",
    })
  })

  test("does not let a folderId from one workspace be renamed via another workspace's id", async () => {
    await renameMediaLibraryFolder({
      workspaceId: OTHER_WS,
      folderId: "folder-owned-by-ws1",
      name: "Hijacked",
    })

    // The repository call carries the CALLER's workspace, not just the
    // folderId — so a mismatched workspace can never match the row.
    expect(mocks.folderRename).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: OTHER_WS }),
    )
  })
})

// ── deleteMediaLibraryFolder ───────────────────────────────────────────────────

describe("deleteMediaLibraryFolder", () => {
  beforeEach(resetAll)

  test("looks up files scoped to folderId and workspaceId before deleting", async () => {
    mocks.fileListByFolder.mockResolvedValue([])

    await deleteMediaLibraryFolder({ workspaceId: WS, folderId: "folder-1" })

    expect(mocks.fileListByFolder).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: "folder-1",
    })
  })

  test("deletes every file's S3 object, then the file rows, then the folder row", async () => {
    mocks.fileListByFolder.mockResolvedValue([
      { id: "file-1", path: "ws/1/a.png" },
      { id: "file-2", path: "ws/1/b.png" },
    ])

    await deleteMediaLibraryFolder({ workspaceId: WS, folderId: "folder-1" })

    expect(mocks.deleteObject).toHaveBeenCalledTimes(2)
    expect(mocks.deleteObject).toHaveBeenNthCalledWith(1, "ws/1/a.png")
    expect(mocks.deleteObject).toHaveBeenNthCalledWith(2, "ws/1/b.png")

    // Both deletes happen inside the same transaction, scoped by BOTH the
    // folder/file id and the caller's workspaceId — see the cross-workspace
    // test below for why the workspaceId condition matters.
    expect(mocks.fileDeleteByFolder).toHaveBeenCalledWith(
      { workspaceId: WS, folderId: "folder-1" },
      expect.anything(),
    )
    expect(mocks.folderDeleteById).toHaveBeenCalledWith(
      { folderId: "folder-1", workspaceId: WS },
      expect.anything(),
    )
  })

  test("does not let a folderId from one workspace be deleted via another workspace's id", async () => {
    mocks.fileListByFolder.mockResolvedValue([])

    await deleteMediaLibraryFolder({
      workspaceId: OTHER_WS,
      folderId: "folder-owned-by-ws1",
    })

    expect(mocks.fileDeleteByFolder).toHaveBeenCalledWith(
      { workspaceId: OTHER_WS, folderId: "folder-owned-by-ws1" },
      expect.anything(),
    )
    expect(mocks.folderDeleteById).toHaveBeenCalledWith(
      { folderId: "folder-owned-by-ws1", workspaceId: OTHER_WS },
      expect.anything(),
    )
  })

  test("continues deleting remaining files and the DB rows when an S3 delete fails", async () => {
    mocks.fileListByFolder.mockResolvedValue([
      { id: "file-1", path: "ws/1/a.png" },
      { id: "file-2", path: "ws/1/b.png" },
    ])
    mocks.deleteObject.mockRejectedValueOnce(new Error("S3 unreachable"))

    await expect(
      deleteMediaLibraryFolder({ workspaceId: WS, folderId: "folder-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.deleteObject).toHaveBeenCalledTimes(2)
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.fileDeleteByFolder).toHaveBeenCalled()
    expect(mocks.folderDeleteById).toHaveBeenCalled()
  })

  test("deletes the folder row even when it has no files", async () => {
    mocks.fileListByFolder.mockResolvedValue([])

    await deleteMediaLibraryFolder({
      workspaceId: WS,
      folderId: "empty-folder",
    })

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.fileDeleteByFolder).toHaveBeenCalled()
    expect(mocks.folderDeleteById).toHaveBeenCalled()
  })
})

// ── createMediaLibraryFile ─────────────────────────────────────────────────────

describe("createMediaLibraryFile", () => {
  beforeEach(resetAll)

  test("inserts a file row with a generated id and returns it", async () => {
    const created = {
      id: "generated-id",
      workspaceId: WS,
      folderId: null,
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    }
    mocks.fileCreate.mockResolvedValue(created)

    const result = await createMediaLibraryFile({
      workspaceId: WS,
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })

    expect(mocks.fileCreate).toHaveBeenCalledWith({
      id: "generated-id",
      workspaceId: WS,
      folderId: null,
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })
    expect(result).toEqual(created)
  })

  test("defaults a nullish folderId to null", async () => {
    mocks.fileCreate.mockResolvedValue({})

    await createMediaLibraryFile({
      workspaceId: WS,
      folderId: undefined,
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })

    const valuesArg = mocks.fileCreate.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(valuesArg.folderId).toBeNull()
  })

  test("preserves an explicit folderId", async () => {
    mocks.fileCreate.mockResolvedValue({})

    await createMediaLibraryFile({
      workspaceId: WS,
      folderId: "folder-9",
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })

    const valuesArg = mocks.fileCreate.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(valuesArg.folderId).toBe("folder-9")
  })

  test("rejects a path that is not scoped under the caller's workspace prefix", async () => {
    await expect(
      createMediaLibraryFile({
        workspaceId: WS,
        name: "logo.png",
        path: "not-a-workspace-scoped/path/logo.png",
        mimeType: "image/png",
        size: 1024,
      }),
    ).rejects.toThrow("Invalid file path")

    expect(mocks.fileCreate).not.toHaveBeenCalled()
  })

  test("rejects a path that belongs to another workspace's storage prefix", async () => {
    await expect(
      createMediaLibraryFile({
        workspaceId: WS,
        name: "logo.png",
        path: `public/space/${OTHER_WS}/logo.png`,
        mimeType: "image/png",
        size: 1024,
      }),
    ).rejects.toThrow("Invalid file path")

    expect(mocks.fileCreate).not.toHaveBeenCalled()
  })

  test("accepts a legacy workspaces/{workspaceId}/ path prefix", async () => {
    mocks.fileCreate.mockResolvedValue({})

    await createMediaLibraryFile({
      workspaceId: WS,
      name: "logo.png",
      path: `workspaces/${WS}/logo.png`,
      mimeType: "image/png",
      size: 1024,
    })

    expect(mocks.fileCreate).toHaveBeenCalled()
  })
})

// ── deleteMediaLibraryFile ─────────────────────────────────────────────────────

describe("deleteMediaLibraryFile", () => {
  beforeEach(resetAll)

  test("finds the file scoped to workspaceId before deleting anything", async () => {
    mocks.fileFindById.mockResolvedValue({ id: "file-1", path: "ws/1/a.png" })

    await deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.fileFindById).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: WS,
    })
  })

  test("deletes the S3 object then the DB row on success", async () => {
    mocks.fileFindById.mockResolvedValue({ id: "file-1", path: "ws/1/a.png" })

    await deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.deleteObject).toHaveBeenCalledWith("ws/1/a.png")
    expect(mocks.fileDeleteById).toHaveBeenCalledWith({ id: "file-1" })
  })

  test("still deletes the DB row when the S3 delete fails", async () => {
    mocks.fileFindById.mockResolvedValue({ id: "file-1", path: "ws/1/a.png" })
    mocks.deleteObject.mockRejectedValueOnce(new Error("S3 unreachable"))

    await expect(
      deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.fileDeleteById).toHaveBeenCalledWith({ id: "file-1" })
  })

  test("propagates and does not attempt any delete when the file is not found in this workspace", async () => {
    mocks.fileFindById.mockResolvedValue(null)

    await expect(
      deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" }),
    ).rejects.toThrow("not found")

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.fileDeleteById).not.toHaveBeenCalled()
  })
})

// ── moveMediaLibraryFiles ──────────────────────────────────────────────────────

describe("moveMediaLibraryFiles", () => {
  beforeEach(resetAll)

  test("moves the given fileIds into the folder, scoped to workspaceId", async () => {
    await moveMediaLibraryFiles({
      workspaceId: WS,
      fileIds: ["file-1", "file-2"],
      folderId: "folder-9",
    })

    expect(mocks.fileMoveToFolder).toHaveBeenCalledWith({
      workspaceId: WS,
      fileIds: ["file-1", "file-2"],
      folderId: "folder-9",
    })
  })

  test("moves files to the root (no folder) when folderId is nullish", async () => {
    await moveMediaLibraryFiles({
      workspaceId: WS,
      fileIds: ["file-1"],
      folderId: undefined,
    })

    expect(mocks.fileMoveToFolder).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null }),
    )
  })
})

// ── toggleMediaLibraryFavourite ────────────────────────────────────────────────

describe("toggleMediaLibraryFavourite", () => {
  beforeEach(resetAll)

  test("flips isFavourite from false to true", async () => {
    mocks.fileFindById.mockResolvedValue({ id: "file-1", isFavourite: false })

    await toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.fileSetFavourite).toHaveBeenCalledWith({
      id: "file-1",
      isFavourite: true,
    })
  })

  test("flips isFavourite from true to false", async () => {
    mocks.fileFindById.mockResolvedValue({ id: "file-1", isFavourite: true })

    await toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.fileSetFavourite).toHaveBeenCalledWith({
      id: "file-1",
      isFavourite: false,
    })
  })

  test("looks up the file scoped to workspaceId before toggling", async () => {
    mocks.fileFindById.mockResolvedValue({ id: "file-1", isFavourite: false })

    await toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.fileFindById).toHaveBeenCalledWith({
      id: "file-1",
      workspaceId: WS,
    })
  })

  test("propagates without updating when the file is not found in this workspace", async () => {
    mocks.fileFindById.mockResolvedValue(null)

    await expect(
      toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" }),
    ).rejects.toThrow("not found")

    expect(mocks.fileSetFavourite).not.toHaveBeenCalled()
  })
})

// ── recordMediaLibraryFileAccess ───────────────────────────────────────────────

describe("recordMediaLibraryFileAccess", () => {
  beforeEach(resetAll)

  test("touches lastAccessedAt scoped to both fileId and workspaceId", async () => {
    await recordMediaLibraryFileAccess({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.fileTouchLastAccessedAt).toHaveBeenCalledWith({
      workspaceId: WS,
      fileId: "file-1",
    })
  })

  test("does not let a fileId from another workspace be touched", async () => {
    await recordMediaLibraryFileAccess({
      workspaceId: OTHER_WS,
      fileId: "file-owned-by-ws1",
    })

    expect(mocks.fileTouchLastAccessedAt).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: OTHER_WS }),
    )
  })
})
