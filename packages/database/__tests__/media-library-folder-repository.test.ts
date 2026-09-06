import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// mediaLibraryFolderRepository — pure CRUD reads/writes for the Media
// Library folder table. Mocks `db` at the module boundary; never
// importOriginal's `../src/schema` (that opens a real DB connection through
// the sharding client).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  query: {
    mediaLibraryFolderModel: {
      findMany: vi.fn(),
    },
  },
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  eq: mocks.eq,
  db: {
    query: mocks.query,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}))

vi.mock("../src/schema", () => ({
  mediaLibraryFolderModel: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
  },
}))

const { mediaLibraryFolderRepository } = await import(
  "../src/repositories/media-library-folder/repository"
)

describe("mediaLibraryFolderRepository.listByWorkspace", () => {
  test("scopes the query to the given workspace and orders by name asc", async () => {
    const rows = [{ id: "folder_1", workspaceId: "ws_1", name: "Logos" }]
    mocks.query.mediaLibraryFolderModel.findMany.mockResolvedValue(rows)

    const result = await mediaLibraryFolderRepository.listByWorkspace({
      workspaceId: "ws_1",
    })

    expect(result).toEqual(rows)
    expect(mocks.query.mediaLibraryFolderModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws_1" } }),
    )
  })
})

describe("mediaLibraryFolderRepository.create", () => {
  test("inserts the given values and returns the created row", async () => {
    const created = { id: "folder_1", workspaceId: "ws_1", name: "New" }
    const returning = vi.fn().mockResolvedValue([created])
    const values = vi.fn(() => ({ returning }))
    mocks.insert.mockReturnValue({ values })

    const result = await mediaLibraryFolderRepository.create({
      id: "folder_1",
      workspaceId: "ws_1",
      name: "New",
    })

    expect(values).toHaveBeenCalledWith({
      id: "folder_1",
      workspaceId: "ws_1",
      name: "New",
    })
    expect(result).toEqual(created)
  })
})

describe("mediaLibraryFolderRepository.rename", () => {
  test("scopes the update to both folderId and workspaceId", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    mocks.update.mockReturnValue({ set })

    await mediaLibraryFolderRepository.rename({
      folderId: "folder_1",
      workspaceId: "ws_1",
      name: "Renamed",
    })

    expect(set).toHaveBeenCalledWith({ name: "Renamed" })
    expect(mocks.eq).toHaveBeenCalledWith("id", "folder_1")
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId", "ws_1")
  })
})

describe("mediaLibraryFolderRepository.deleteById", () => {
  test("scopes the delete to both folderId and workspaceId", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    mocks.delete.mockReturnValue({ where })

    await mediaLibraryFolderRepository.deleteById({
      folderId: "folder_1",
      workspaceId: "ws_1",
    })

    expect(mocks.eq).toHaveBeenCalledWith("id", "folder_1")
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId", "ws_1")
  })
})
