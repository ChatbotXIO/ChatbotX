// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Every media-library action is a one-line `workspaceActionClient
// .bindArgsSchemas(...).inputSchema(...).action(handler)` wrapper — the
// business logic lives in `queries/mutations`. Mocking `.action()` to return
// the handler itself (instead of the real next-safe-action runtime) lets us
// call the exported `xxxAction` directly with `{ bindArgsParsedInputs,
// parsedInput }`, exercising exactly the wiring this file is responsible
// for: does the handler bind `workspaceId` correctly and delegate to the
// right mutation.
vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = vi.fn(() => chain)
  chain.inputSchema = vi.fn(() => chain)
  chain.action = vi.fn((handler: unknown) => handler)
  return { workspaceActionClient: chain }
})

vi.mock("@/features/media-library/queries/mutations", () => ({
  createMediaLibraryFolder: vi.fn(),
  renameMediaLibraryFolder: vi.fn(),
  deleteMediaLibraryFolder: vi.fn(),
  createMediaLibraryFile: vi.fn(),
  deleteMediaLibraryFile: vi.fn(),
  moveMediaLibraryFiles: vi.fn(),
  toggleMediaLibraryFavourite: vi.fn(),
  recordMediaLibraryFileAccess: vi.fn(),
}))

const {
  createMediaLibraryFolder,
  renameMediaLibraryFolder,
  deleteMediaLibraryFolder,
  createMediaLibraryFile,
  deleteMediaLibraryFile,
  moveMediaLibraryFiles,
  toggleMediaLibraryFavourite,
  recordMediaLibraryFileAccess,
} = await import("../src/features/media-library/queries/mutations")

const { createMediaLibraryFolderAction } = await import(
  "../src/features/media-library/actions/create-folder.action"
)
const { renameMediaLibraryFolderAction } = await import(
  "../src/features/media-library/actions/rename-folder.action"
)
const { deleteMediaLibraryFolderAction } = await import(
  "../src/features/media-library/actions/delete-folder.action"
)
const { createMediaLibraryFileAction } = await import(
  "../src/features/media-library/actions/create-file.action"
)
const { deleteMediaLibraryFileAction } = await import(
  "../src/features/media-library/actions/delete-file.action"
)
const { moveMediaLibraryFilesAction } = await import(
  "../src/features/media-library/actions/move-files.action"
)
const { toggleMediaLibraryFavouriteAction } = await import(
  "../src/features/media-library/actions/toggle-favourite.action"
)
const { recordMediaLibraryFileAccessAction } = await import(
  "../src/features/media-library/actions/record-access.action"
)

const WS = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createMediaLibraryFolderAction", () => {
  test("binds workspaceId from bindArgsParsedInputs and forwards the name", async () => {
    vi.mocked(createMediaLibraryFolder).mockResolvedValue(
      {} as Awaited<ReturnType<typeof createMediaLibraryFolder>>,
    )

    await (
      createMediaLibraryFolderAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: { name: string }
      }) => Promise<unknown>
    )({ bindArgsParsedInputs: [WS], parsedInput: { name: "Marketing" } })

    expect(createMediaLibraryFolder).toHaveBeenCalledWith({
      workspaceId: WS,
      name: "Marketing",
    })
  })
})

describe("renameMediaLibraryFolderAction", () => {
  test("binds workspaceId and forwards folderId + name", async () => {
    await (
      renameMediaLibraryFolderAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: { folderId: string; name: string }
      }) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WS],
      parsedInput: { folderId: "folder-1", name: "Renamed" },
    })

    expect(renameMediaLibraryFolder).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: "folder-1",
      name: "Renamed",
    })
  })
})

describe("deleteMediaLibraryFolderAction", () => {
  test("binds workspaceId and forwards the bare folderId input", async () => {
    await (
      deleteMediaLibraryFolderAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: string
      }) => Promise<unknown>
    )({ bindArgsParsedInputs: [WS], parsedInput: "folder-1" })

    expect(deleteMediaLibraryFolder).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: "folder-1",
    })
  })
})

describe("createMediaLibraryFileAction", () => {
  test("binds workspaceId and spreads the parsed file input", async () => {
    vi.mocked(createMediaLibraryFile).mockResolvedValue(
      {} as Awaited<ReturnType<typeof createMediaLibraryFile>>,
    )

    await (
      createMediaLibraryFileAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: {
          folderId: string | null
          name: string
          path: string
          mimeType: string
          size: number
        }
      }) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WS],
      parsedInput: {
        folderId: null,
        name: "logo.png",
        path: "ws/1/logo.png",
        mimeType: "image/png",
        size: 1024,
      },
    })

    expect(createMediaLibraryFile).toHaveBeenCalledWith({
      workspaceId: WS,
      folderId: null,
      name: "logo.png",
      path: "ws/1/logo.png",
      mimeType: "image/png",
      size: 1024,
    })
  })
})

describe("deleteMediaLibraryFileAction", () => {
  test("binds workspaceId and forwards the bare fileId input", async () => {
    await (
      deleteMediaLibraryFileAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: string
      }) => Promise<unknown>
    )({ bindArgsParsedInputs: [WS], parsedInput: "file-1" })

    expect(deleteMediaLibraryFile).toHaveBeenCalledWith({
      workspaceId: WS,
      fileId: "file-1",
    })
  })
})

describe("moveMediaLibraryFilesAction", () => {
  test("binds workspaceId and forwards fileIds + folderId", async () => {
    await (
      moveMediaLibraryFilesAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: { fileIds: string[]; folderId: string | null }
      }) => Promise<unknown>
    )({
      bindArgsParsedInputs: [WS],
      parsedInput: { fileIds: ["file-1", "file-2"], folderId: "folder-9" },
    })

    expect(moveMediaLibraryFiles).toHaveBeenCalledWith({
      workspaceId: WS,
      fileIds: ["file-1", "file-2"],
      folderId: "folder-9",
    })
  })
})

describe("toggleMediaLibraryFavouriteAction", () => {
  test("binds workspaceId and forwards the bare fileId input", async () => {
    await (
      toggleMediaLibraryFavouriteAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: string
      }) => Promise<unknown>
    )({ bindArgsParsedInputs: [WS], parsedInput: "file-1" })

    expect(toggleMediaLibraryFavourite).toHaveBeenCalledWith({
      workspaceId: WS,
      fileId: "file-1",
    })
  })
})

describe("recordMediaLibraryFileAccessAction", () => {
  test("binds workspaceId and forwards the bare fileId input", async () => {
    await (
      recordMediaLibraryFileAccessAction as unknown as (input: {
        bindArgsParsedInputs: [string]
        parsedInput: string
      }) => Promise<unknown>
    )({ bindArgsParsedInputs: [WS], parsedInput: "file-1" })

    expect(recordMediaLibraryFileAccess).toHaveBeenCalledWith({
      workspaceId: WS,
      fileId: "file-1",
    })
  })
})
