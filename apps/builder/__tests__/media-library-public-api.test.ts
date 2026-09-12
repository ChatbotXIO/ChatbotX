import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureArgs = {
  context: { workspace: { id: string } }
  input?: Record<string, unknown>
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (args: ProcedureArgs) => unknown
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (args: ProcedureArgs) => unknown) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const mediaLibraryService = {
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  toggleFavourite: vi.fn(),
  moveFiles: vi.fn(),
}
const mediaLibraryFileService = { list: vi.fn() }
vi.mock("@chatbotx.io/business", () => ({
  mediaLibraryFileService,
  mediaLibraryService,
}))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    mediaLibraryFileModel: {},
    mediaLibraryFolderModel: {},
  }
})

await import("@/features/media-library/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const workspaceContext = { workspace: { id: "workspace-1" } }
const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the media library public router under the media scope", () => {
  expect(scopeArgAtImport).toBe("media")
})

test("registers each media-library route", () => {
  expect(
    capturedProcedures.map(({ route }) => [route.method, route.path]),
  ).toEqual([
    ["GET", "/v1/media-library/folders"],
    ["POST", "/v1/media-library/folders"],
    ["PATCH", "/v1/media-library/folders/{folderId}"],
    ["DELETE", "/v1/media-library/folders/{folderId}"],
    ["GET", "/v1/media-library/files"],
    ["POST", "/v1/media-library/files"],
    ["DELETE", "/v1/media-library/files/{fileId}"],
    ["PATCH", "/v1/media-library/files/{fileId}/favourite"],
    ["PATCH", "/v1/media-library/files/move"],
  ])
})

describe("folder routes", () => {
  test("lists workspace folders", async () => {
    const procedure = findProcedure("GET", "/v1/media-library/folders")
    const folders = [{ id: "folder-1", name: "Images", fileCount: 2 }]
    mediaLibraryService.listFolders.mockResolvedValueOnce(folders)

    await expect(
      procedure.handler?.({ context: workspaceContext }),
    ).resolves.toEqual({
      data: folders,
    })
    expect(mediaLibraryService.listFolders).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  test("creates a workspace folder", async () => {
    const procedure = findProcedure("POST", "/v1/media-library/folders")
    const folder = { id: "folder-1", name: "Images" }
    mediaLibraryService.createFolder.mockResolvedValueOnce(folder)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { name: "Images" },
      }),
    ).resolves.toEqual(folder)
    expect(mediaLibraryService.createFolder).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Images",
    })
  })

  test("renames a workspace folder", async () => {
    const procedure = findProcedure(
      "PATCH",
      "/v1/media-library/folders/{folderId}",
    )

    await procedure.handler?.({
      context: workspaceContext,
      input: { folderId: "folder-1", name: "Renamed" },
    })

    expect(mediaLibraryService.renameFolder).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      folderId: "folder-1",
      name: "Renamed",
    })
  })

  test("deletes a workspace folder", async () => {
    const procedure = findProcedure(
      "DELETE",
      "/v1/media-library/folders/{folderId}",
    )

    await procedure.handler?.({
      context: workspaceContext,
      input: { folderId: "folder-1" },
    })

    expect(mediaLibraryService.deleteFolder).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      folderId: "folder-1",
    })
  })
})

describe("file routes", () => {
  test("lists workspace files", async () => {
    const procedure = findProcedure("GET", "/v1/media-library/files")
    const response = { data: [{ id: "file-1", url: "https://cdn/file-1" }] }
    mediaLibraryFileService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { filter: "favourite", page: 2 },
      }),
    ).resolves.toEqual(response)
    expect(mediaLibraryFileService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      filter: "favourite",
      page: 2,
    })
  })

  test("creates a workspace file", async () => {
    const procedure = findProcedure("POST", "/v1/media-library/files")
    const file = { id: "file-1", name: "image.png" }
    const input = {
      folderId: "folder-1",
      name: "image.png",
      path: "media/image.png",
      mimeType: "image/png",
      size: 100,
    }
    mediaLibraryService.createFile.mockResolvedValueOnce(file)

    await expect(
      procedure.handler?.({ context: workspaceContext, input }),
    ).resolves.toEqual(file)
    expect(mediaLibraryService.createFile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ...input,
    })
  })

  test("deletes a workspace file", async () => {
    const procedure = findProcedure(
      "DELETE",
      "/v1/media-library/files/{fileId}",
    )

    await procedure.handler?.({
      context: workspaceContext,
      input: { fileId: "file-1" },
    })

    expect(mediaLibraryService.deleteFile).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fileId: "file-1",
    })
  })

  test("toggles a workspace file's favourite status", async () => {
    const procedure = findProcedure(
      "PATCH",
      "/v1/media-library/files/{fileId}/favourite",
    )

    await procedure.handler?.({
      context: workspaceContext,
      input: { fileId: "file-1" },
    })

    expect(mediaLibraryService.toggleFavourite).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fileId: "file-1",
    })
  })

  test("moves workspace files into another folder", async () => {
    const procedure = findProcedure("PATCH", "/v1/media-library/files/move")

    await procedure.handler?.({
      context: workspaceContext,
      input: { fileIds: ["file-1", "file-2"], folderId: "folder-2" },
    })

    expect(mediaLibraryService.moveFiles).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      fileIds: ["file-1", "file-2"],
      folderId: "folder-2",
    })
  })

  test("surfaces a declared delete error", async () => {
    const procedure = findProcedure(
      "DELETE",
      "/v1/media-library/files/{fileId}",
    )
    mediaLibraryService.deleteFile.mockRejectedValueOnce(
      new Error("File not found"),
    )

    await expect(
      procedure.handler?.({
        context: workspaceContext,
        input: { fileId: "missing" },
      }),
    ).rejects.toThrow("File not found")
  })
})
