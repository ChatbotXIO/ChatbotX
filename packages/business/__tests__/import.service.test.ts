// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockFindFile, mockTransaction, mockInsertValues } = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)

  return {
    mockFindFile: vi.fn(),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
        insert: () => ({ values: mockInsertValues }),
      }
      return await callback(tx)
    }),
    mockInsertValues,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      fileModel: {
        findFirst: mockFindFile,
      },
    },
    transaction: mockTransaction,
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  fileModel: { id: "fileModel.id", workspaceId: "fileModel.workspaceId" },
  importModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
  likeContains: vi.fn(),
  parseOrderBy: vi.fn(() => []),
}))

vi.mock("@chatbotx.io/imports/file-validation", () => ({
  resolveImportFileFormat: vi.fn(),
}))

vi.mock("@chatbotx.io/imports/registry", () => ({
  getImportEntry: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "generated-import-id"),
  }
})

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {},
}))

const { importService } = await import("../src/import/service")

describe("importService.startFlowImport", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("returns fileNotFound when the file does not exist in the workspace", async () => {
    mockFindFile.mockResolvedValue(undefined)

    await expect(
      importService.startFlowImport({
        workspaceId: "ws-1",
        userId: "user-1",
        fileId: "file-1",
      }),
    ).resolves.toEqual({ ok: false, reason: "fileNotFound" })

    expect(mockFindFile).toHaveBeenCalledWith({
      where: { id: "file-1", workspaceId: "ws-1" },
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  test("returns notAFlowImport when the file is not a flow import upload", async () => {
    mockFindFile.mockResolvedValue({
      id: "file-1",
      contextType: "generic",
      subType: "flow",
    })

    await expect(
      importService.startFlowImport({
        workspaceId: "ws-1",
        userId: "user-1",
        fileId: "file-1",
      }),
    ).resolves.toEqual({ ok: false, reason: "notAFlowImport" })

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  test("returns notAFlowImport when the file's subType is not flow", async () => {
    mockFindFile.mockResolvedValue({
      id: "file-1",
      contextType: "import",
      subType: "contacts",
    })

    await expect(
      importService.startFlowImport({
        workspaceId: "ws-1",
        userId: "user-1",
        fileId: "file-1",
      }),
    ).resolves.toEqual({ ok: false, reason: "notAFlowImport" })
  })

  test("marks the file uploaded and creates the import row atomically", async () => {
    mockFindFile.mockResolvedValue({
      id: "file-1",
      contextType: "import",
      subType: "flow",
    })

    const result = await importService.startFlowImport({
      workspaceId: "ws-1",
      userId: "user-1",
      fileId: "file-1",
    })

    expect(result).toEqual({ ok: true, importId: "generated-import-id" })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-import-id",
        workspaceId: "ws-1",
        userId: "user-1",
        fileId: "file-1",
        type: "flow",
        format: "json",
        status: "pending",
        meta: { folderId: null },
      }),
    )
  })

  test("persists the requested folder id into the import row's meta", async () => {
    mockFindFile.mockResolvedValue({
      id: "file-1",
      contextType: "import",
      subType: "flow",
    })

    await importService.startFlowImport({
      workspaceId: "ws-1",
      userId: "user-1",
      fileId: "file-1",
      folderId: "folder-1",
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { folderId: "folder-1" } }),
    )
  })
})
