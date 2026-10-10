import { beforeEach, describe, expect, test, vi } from "vitest"

const { findById, getObject } = vi.hoisted(() => ({
  findById: vi.fn(),
  getObject: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  mediaLibraryFileRepository: { findById },
  mediaLibraryFolderRepository: {},
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploader: { getObject } }))

const { mediaLibraryService } = await import("../src/media-library/service")

const file = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  path: "public/space/9/media-library/1",
  mimeType: "image/png",
  size: 100,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getObject.mockResolvedValue(Buffer.from([1, 2, 3]))
})

describe("mediaLibraryService.readImage", () => {
  test("reads a workspace image as base64", async () => {
    findById.mockResolvedValue(file())
    await expect(
      mediaLibraryService.readImage({
        workspaceId: "9",
        fileId: "1",
        maxBytes: 1000,
      }),
    ).resolves.toEqual({ mimeType: "image/png", base64: "AQID" })
    expect(findById).toHaveBeenCalledWith({ id: "1", workspaceId: "9" })
  })

  test("refuses missing files, non-images and files over the limit", async () => {
    findById.mockResolvedValueOnce(undefined)
    await expect(
      mediaLibraryService.readImage({
        workspaceId: "9",
        fileId: "1",
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    findById.mockResolvedValueOnce(file({ mimeType: "image/svg+xml" }))
    await expect(
      mediaLibraryService.readImage({
        workspaceId: "9",
        fileId: "1",
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ field: "fileId" })
    findById.mockResolvedValueOnce(file({ size: 5000 }))
    await expect(
      mediaLibraryService.readImage({
        workspaceId: "9",
        fileId: "1",
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ field: "fileId" })
    expect(getObject).not.toHaveBeenCalled()
  })
})
