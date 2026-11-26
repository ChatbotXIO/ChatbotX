import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  deleteObject: vi.fn(),
  findById: vi.fn(),
  importer: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("../src/media-library/service", () => ({
  mediaLibraryService: {
    createFile: mocks.createFile,
    deleteFile: mocks.deleteFile,
  },
}))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findById: mocks.findById },
}))

const {
  IMPORTABLE_MEDIA_MIME_TYPES,
  MediaImportSession,
  SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES,
  SOCIAL_MEDIA_IMPORT_TOTAL_MAX_BYTES,
} = await import("../src/social-post/media")
const { MediaImportRefusedError, registerMediaUrlImporter } = await import(
  "../src/social-post/media-url-importer"
)

const WORKSPACE = "ws-1"
const imported = (size: number, mimeType = "image/png") => ({
  height: 10,
  mimeType,
  name: "a.png",
  size,
  width: 10,
})

describe("MediaImportSession", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    registerMediaUrlImporter(mocks.importer)
    mocks.importer.mockResolvedValue(imported(100))
    let next = 0
    mocks.createFile.mockImplementation(() =>
      Promise.resolve({ id: `file-${++next}` }),
    )
    mocks.deleteFile.mockResolvedValue(undefined)
    mocks.deleteObject.mockResolvedValue(undefined)
  })

  test("only raster images and the known video types are importable", () => {
    expect(IMPORTABLE_MEDIA_MIME_TYPES).toEqual(
      expect.arrayContaining([
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "video/mp4",
      ]),
    )
    for (const refused of ["image/svg+xml", "image/bmp", "text/html"]) {
      expect(IMPORTABLE_MEDIA_MIME_TYPES).not.toContain(refused)
    }
  })

  test("hands the importer the allowed types, the file cap and one shared signal", async () => {
    const session = new MediaImportSession(WORKSPACE)

    await session.resolve([
      { url: "https://e.com/a.png" },
      { url: "https://e.com/b.png" },
    ])

    const [first, second] = mocks.importer.mock.calls.map(([call]) => call)
    expect(first.allowedMimeTypes).toBe(IMPORTABLE_MEDIA_MIME_TYPES)
    expect(first.maxBytes).toBe(SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES)
    expect(second.signal).toBe(first.signal)
    expect(first.signal.aborted).toBe(false)
  })

  test("the byte budget of a request shrinks with every file imported", async () => {
    mocks.importer.mockResolvedValue(
      imported(SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES),
    )
    const session = new MediaImportSession(WORKSPACE)

    await session.resolve([
      { url: "https://e.com/a.png" },
      { url: "https://e.com/b.png" },
    ])
    await expect(
      session.resolve([{ url: "https://e.com/c.png" }]),
    ).rejects.toMatchObject({ code: "validation" })

    const caps = mocks.importer.mock.calls.map(([call]) => call.maxBytes)
    expect(caps[0]).toBe(SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES)
    expect(caps[1]).toBe(SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES)
    expect(SOCIAL_MEDIA_IMPORT_FILE_MAX_BYTES * 2).toBe(
      SOCIAL_MEDIA_IMPORT_TOTAL_MAX_BYTES,
    )
    expect(mocks.importer).toHaveBeenCalledTimes(2)
  })

  test("the last file gets only what is left of the total budget", async () => {
    mocks.importer.mockResolvedValueOnce(imported(60 * 1024 * 1024))
    const session = new MediaImportSession(WORKSPACE)

    await session.resolve([
      { url: "https://e.com/a.png" },
      { url: "https://e.com/b.png" },
    ])

    expect(mocks.importer.mock.calls[1]?.[0].maxBytes).toBe(
      SOCIAL_MEDIA_IMPORT_TOTAL_MAX_BYTES - 60 * 1024 * 1024,
    )
  })

  test("a refusal by the importer is a validation error", async () => {
    mocks.importer.mockRejectedValue(new MediaImportRefusedError("not allowed"))
    const session = new MediaImportSession(WORKSPACE)

    await expect(
      session.resolve([{ url: "https://e.com/a.png" }]),
    ).rejects.toMatchObject({ code: "validation", message: "not allowed" })
  })

  test("a stored type outside the importable set is dropped and refused", async () => {
    mocks.importer.mockResolvedValue(imported(10, "image/svg+xml"))
    const session = new MediaImportSession(WORKSPACE)

    await expect(
      session.resolve([{ url: "https://e.com/a.svg" }]),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1)
    expect(mocks.createFile).not.toHaveBeenCalled()
  })

  test("without an importer a URL is refused, a library file still works", async () => {
    registerMediaUrlImporter(undefined as never)
    mocks.findById.mockResolvedValue({
      id: "f1",
      mimeType: "image/png",
      path: "p",
      size: 1,
    })
    const session = new MediaImportSession(WORKSPACE)

    await expect(
      session.resolve([{ url: "https://e.com/a.png" }]),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      session.resolve([{ mediaLibraryFileId: "f1" }]),
    ).resolves.toHaveLength(1)
  })

  test("cleanup deletes every imported file once, and logs a failure instead of throwing", async () => {
    const session = new MediaImportSession(WORKSPACE)
    await session.resolve([
      { url: "https://e.com/a.png" },
      { url: "https://e.com/b.png" },
    ])
    mocks.deleteFile.mockRejectedValueOnce(new Error("storage down"))

    await expect(session.cleanup()).resolves.toBeUndefined()
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2)
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      fileId: "file-1",
      workspaceId: WORKSPACE,
    })

    await session.cleanup()
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2)
  })

  test("a file that cannot be registered leaves no object behind", async () => {
    mocks.createFile.mockRejectedValue(new Error("db down"))
    const session = new MediaImportSession(WORKSPACE)

    await expect(
      session.resolve([{ url: "https://e.com/a.png" }]),
    ).rejects.toThrow("db down")
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1)
  })
})
