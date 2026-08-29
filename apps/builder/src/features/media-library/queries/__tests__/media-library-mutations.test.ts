// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Shared mutable state (hoisted so it's available to vi.mock factories) ────

const mocks = vi.hoisted(() => {
  const insertReturning: { current: unknown[] } = { current: [] }
  const insertBuilder = {
    values: vi.fn(),
    returning: vi.fn(),
  }

  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateBuilder = {
    set: vi.fn(),
    where: updateWhere,
  }

  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const deleteBuilder = { where: deleteWhere }

  const txDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const txDeleteBuilder = { where: txDeleteWhere }
  const txDelete = vi.fn(() => txDeleteBuilder)

  return {
    insertBuilder,
    insertReturning,
    updateBuilder,
    updateWhere,
    deleteBuilder,
    deleteWhere,
    txDelete,
    txDeleteBuilder,
    txDeleteWhere,
    findManyFiles: vi.fn().mockResolvedValue([]),
    findOrFail: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    createIdFn: vi.fn(() => "generated-id"),
    loggerWarn: vi.fn(),
    sqlFn: vi.fn((strings: TemplateStringsArray) => ({
      __sql: strings.join(""),
    })),
  }
})

function wireInsertBuilder() {
  mocks.insertBuilder.values.mockImplementation(() => mocks.insertBuilder)
  mocks.insertBuilder.returning.mockImplementation(() =>
    Promise.resolve(mocks.insertReturning.current),
  )
}
wireInsertBuilder()

function wireUpdateBuilder() {
  mocks.updateBuilder.set.mockImplementation(() => mocks.updateBuilder)
}
wireUpdateBuilder()

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      mediaLibraryFileModel: { findMany: mocks.findManyFiles },
    },
    insert: vi.fn(() => mocks.insertBuilder),
    update: vi.fn(() => mocks.updateBuilder),
    delete: vi.fn(() => mocks.deleteBuilder),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ delete: mocks.txDelete }),
    ),
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  findOrFail: mocks.findOrFail,
  sql: mocks.sqlFn,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  mediaLibraryFileModel: {
    id: "file.id",
    workspaceId: "file.workspaceId",
    folderId: "file.folderId",
    isFavourite: "file.isFavourite",
    lastAccessedAt: "file.lastAccessedAt",
  },
  mediaLibraryFolderModel: {
    id: "folder.id",
    workspaceId: "folder.workspaceId",
    name: "folder.name",
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createIdFn,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: mocks.loggerWarn },
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
  wireInsertBuilder()
  wireUpdateBuilder()
  mocks.insertReturning.current = []
  mocks.updateWhere.mockClear()
  mocks.updateWhere.mockResolvedValue(undefined)
  mocks.deleteWhere.mockClear()
  mocks.deleteWhere.mockResolvedValue(undefined)
  mocks.txDelete.mockClear()
  mocks.txDeleteWhere.mockClear()
  mocks.txDeleteWhere.mockResolvedValue(undefined)
  mocks.findManyFiles.mockClear()
  mocks.findManyFiles.mockResolvedValue([])
  mocks.findOrFail.mockReset()
  mocks.deleteObject.mockClear()
  mocks.deleteObject.mockResolvedValue(undefined)
  mocks.createIdFn.mockClear()
  mocks.createIdFn.mockReturnValue("generated-id")
  mocks.loggerWarn.mockClear()
}

// ── createMediaLibraryFolder ───────────────────────────────────────────────────

describe("createMediaLibraryFolder", () => {
  beforeEach(resetAll)

  test("inserts a folder with a generated id and returns the created row", async () => {
    const created = { id: "generated-id", name: "Marketing", workspaceId: WS }
    mocks.insertReturning.current = [created]

    const result = await createMediaLibraryFolder({
      workspaceId: WS,
      name: "Marketing",
    })

    expect(mocks.insertBuilder.values).toHaveBeenCalledWith({
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

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({ name: "Renamed" })
  })

  test("scopes the update to both folderId and workspaceId", async () => {
    await renameMediaLibraryFolder({
      workspaceId: WS,
      folderId: "folder-1",
      name: "Renamed",
    })

    // and(eq(id, folderId), eq(workspaceId, workspaceId)) with the passthrough
    // eq/and mocks: whereArg === [[idCol, folderId], [workspaceIdCol, WS]]
    const whereArg = mocks.updateWhere.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toEqual([
      ["folder.id", "folder-1"],
      ["folder.workspaceId", WS],
    ])
  })

  test("does not let a folderId from one workspace be renamed via another workspace's id", async () => {
    await renameMediaLibraryFolder({
      workspaceId: OTHER_WS,
      folderId: "folder-owned-by-ws1",
      name: "Hijacked",
    })

    const whereArg = mocks.updateWhere.mock.calls[0]?.[0] as unknown[][]
    // The workspaceId condition is present and reflects the CALLER's
    // workspace, not just the folderId — so a mismatched workspace can never
    // match the row at the SQL layer.
    expect(whereArg).toContainEqual(["folder.workspaceId", OTHER_WS])
  })
})

// ── deleteMediaLibraryFolder ───────────────────────────────────────────────────

describe("deleteMediaLibraryFolder", () => {
  beforeEach(resetAll)

  test("looks up files scoped to folderId and workspaceId before deleting", async () => {
    mocks.findManyFiles.mockResolvedValue([])

    await deleteMediaLibraryFolder({ workspaceId: WS, folderId: "folder-1" })

    expect(mocks.findManyFiles).toHaveBeenCalledWith({
      where: { folderId: "folder-1", workspaceId: WS },
      columns: { id: true, path: true },
    })
  })

  test("deletes every file's S3 object, then the file rows, then the folder row", async () => {
    mocks.findManyFiles.mockResolvedValue([
      { id: "file-1", path: "ws/1/a.png" },
      { id: "file-2", path: "ws/1/b.png" },
    ])

    await deleteMediaLibraryFolder({ workspaceId: WS, folderId: "folder-1" })

    expect(mocks.deleteObject).toHaveBeenCalledTimes(2)
    expect(mocks.deleteObject).toHaveBeenNthCalledWith(1, "ws/1/a.png")
    expect(mocks.deleteObject).toHaveBeenNthCalledWith(2, "ws/1/b.png")

    expect(mocks.txDelete).toHaveBeenCalledTimes(2)
    // First tx.delete(...) call is the file rows, second is the folder row.
    // Each is scoped by BOTH the folder/file id and the caller's workspaceId
    // — see the cross-workspace test below for why the workspaceId condition
    // matters.
    expect(mocks.txDeleteWhere).toHaveBeenNthCalledWith(1, [
      ["file.folderId", "folder-1"],
      ["file.workspaceId", WS],
    ])
    expect(mocks.txDeleteWhere).toHaveBeenNthCalledWith(2, [
      ["folder.id", "folder-1"],
      ["folder.workspaceId", WS],
    ])
  })

  test("does not let a folderId from one workspace be deleted via another workspace's id", async () => {
    mocks.findManyFiles.mockResolvedValue([])

    await deleteMediaLibraryFolder({
      workspaceId: OTHER_WS,
      folderId: "folder-owned-by-ws1",
    })

    // The workspaceId condition is present on BOTH deletes and reflects the
    // CALLER's workspace, not just the folderId — so a mismatched workspace
    // can never match the row at the SQL layer.
    expect(mocks.txDeleteWhere).toHaveBeenNthCalledWith(1, [
      ["file.folderId", "folder-owned-by-ws1"],
      ["file.workspaceId", OTHER_WS],
    ])
    expect(mocks.txDeleteWhere).toHaveBeenNthCalledWith(2, [
      ["folder.id", "folder-owned-by-ws1"],
      ["folder.workspaceId", OTHER_WS],
    ])
  })

  test("continues deleting remaining files and the DB rows when an S3 delete fails", async () => {
    mocks.findManyFiles.mockResolvedValue([
      { id: "file-1", path: "ws/1/a.png" },
      { id: "file-2", path: "ws/1/b.png" },
    ])
    mocks.deleteObject.mockRejectedValueOnce(new Error("S3 unreachable"))

    await expect(
      deleteMediaLibraryFolder({ workspaceId: WS, folderId: "folder-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.deleteObject).toHaveBeenCalledTimes(2)
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.txDelete).toHaveBeenCalledTimes(2)
  })

  test("deletes the folder row even when it has no files", async () => {
    mocks.findManyFiles.mockResolvedValue([])

    await deleteMediaLibraryFolder({
      workspaceId: WS,
      folderId: "empty-folder",
    })

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.txDelete).toHaveBeenCalledTimes(2)
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
    mocks.insertReturning.current = [created]

    const result = await createMediaLibraryFile({
      workspaceId: WS,
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })

    expect(mocks.insertBuilder.values).toHaveBeenCalledWith({
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
    mocks.insertReturning.current = [{}]

    await createMediaLibraryFile({
      workspaceId: WS,
      folderId: undefined,
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })

    const valuesArg = mocks.insertBuilder.values.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(valuesArg.folderId).toBeNull()
  })

  test("preserves an explicit folderId", async () => {
    mocks.insertReturning.current = [{}]

    await createMediaLibraryFile({
      workspaceId: WS,
      folderId: "folder-9",
      name: "logo.png",
      path: "public/space/workspace-1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })

    const valuesArg = mocks.insertBuilder.values.mock.calls[0]?.[0] as Record<
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

    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
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

    expect(mocks.insertBuilder.values).not.toHaveBeenCalled()
  })

  test("accepts a legacy workspaces/{workspaceId}/ path prefix", async () => {
    mocks.insertReturning.current = [{}]

    await createMediaLibraryFile({
      workspaceId: WS,
      name: "logo.png",
      path: `workspaces/${WS}/logo.png`,
      mimeType: "image/png",
      size: 1024,
    })

    expect(mocks.insertBuilder.values).toHaveBeenCalled()
  })
})

// ── deleteMediaLibraryFile ─────────────────────────────────────────────────────

describe("deleteMediaLibraryFile", () => {
  beforeEach(resetAll)

  test("finds the file scoped to workspaceId before deleting anything", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "file-1", path: "ws/1/a.png" })

    await deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.findOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file-1", workspaceId: WS },
      }),
    )
  })

  test("deletes the S3 object then the DB row on success", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "file-1", path: "ws/1/a.png" })

    await deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.deleteObject).toHaveBeenCalledWith("ws/1/a.png")
    expect(mocks.deleteWhere).toHaveBeenCalledWith(["file.id", "file-1"])
  })

  test("still deletes the DB row when the S3 delete fails", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "file-1", path: "ws/1/a.png" })
    mocks.deleteObject.mockRejectedValueOnce(new Error("S3 unreachable"))

    await expect(
      deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.deleteWhere).toHaveBeenCalledWith(["file.id", "file-1"])
  })

  test("propagates and does not attempt any delete when the file is not found in this workspace", async () => {
    mocks.findOrFail.mockRejectedValue(
      new Error("MediaLibraryFile file-1 not found"),
    )

    await expect(
      deleteMediaLibraryFile({ workspaceId: WS, fileId: "file-1" }),
    ).rejects.toThrow("not found")

    expect(mocks.deleteObject).not.toHaveBeenCalled()
    expect(mocks.deleteWhere).not.toHaveBeenCalled()
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

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({
      folderId: "folder-9",
    })
    expect(mocks.updateWhere).toHaveBeenCalledWith([
      ["file.workspaceId", WS],
      ["file.id", ["file-1", "file-2"]],
    ])
  })

  test("moves files to the root (no folder) when folderId is nullish", async () => {
    await moveMediaLibraryFiles({
      workspaceId: WS,
      fileIds: ["file-1"],
      folderId: undefined,
    })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({ folderId: null })
  })
})

// ── toggleMediaLibraryFavourite ────────────────────────────────────────────────

describe("toggleMediaLibraryFavourite", () => {
  beforeEach(resetAll)

  test("flips isFavourite from false to true", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "file-1", isFavourite: false })

    await toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({ isFavourite: true })
  })

  test("flips isFavourite from true to false", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "file-1", isFavourite: true })

    await toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({ isFavourite: false })
  })

  test("looks up the file scoped to workspaceId before toggling", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "file-1", isFavourite: false })

    await toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.findOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "file-1", workspaceId: WS },
      }),
    )
  })

  test("propagates without updating when the file is not found in this workspace", async () => {
    mocks.findOrFail.mockRejectedValue(new Error("not found"))

    await expect(
      toggleMediaLibraryFavourite({ workspaceId: WS, fileId: "file-1" }),
    ).rejects.toThrow("not found")

    expect(mocks.updateBuilder.set).not.toHaveBeenCalled()
  })
})

// ── recordMediaLibraryFileAccess ───────────────────────────────────────────────

describe("recordMediaLibraryFileAccess", () => {
  beforeEach(resetAll)

  test("sets lastAccessedAt to CURRENT_TIMESTAMP", async () => {
    await recordMediaLibraryFileAccess({ workspaceId: WS, fileId: "file-1" })

    expect(mocks.updateBuilder.set).toHaveBeenCalledWith({
      lastAccessedAt: { __sql: "CURRENT_TIMESTAMP" },
    })
  })

  test("scopes the update to both fileId and workspaceId", async () => {
    await recordMediaLibraryFileAccess({ workspaceId: WS, fileId: "file-1" })

    const whereArg = mocks.updateWhere.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toEqual([
      ["file.id", "file-1"],
      ["file.workspaceId", WS],
    ])
  })

  test("does not let a fileId from another workspace be touched", async () => {
    await recordMediaLibraryFileAccess({
      workspaceId: OTHER_WS,
      fileId: "file-owned-by-ws1",
    })

    const whereArg = mocks.updateWhere.mock.calls[0]?.[0] as unknown[][]
    expect(whereArg).toContainEqual(["file.workspaceId", OTHER_WS])
  })
})
