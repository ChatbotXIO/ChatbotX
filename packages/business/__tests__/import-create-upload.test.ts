// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getPresignedUpload: vi.fn(),
  createPending: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getPresignedUpload: mocks.getPresignedUpload },
}))
vi.mock("../src/file/service", () => ({
  fileService: { createPending: mocks.createPending },
}))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

const { createImportUpload } = await import("../src/import/upload")

const base = {
  workspaceId: "ws-1",
  userId: null,
  type: "contacts" as const,
  fileName: "people.csv",
  mimeType: "text/csv",
  fileSize: 1024,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPresignedUpload.mockResolvedValue("https://signed.example/put")
  mocks.createPending.mockResolvedValue({ id: "file-1" })
  mocks.resolveTenantSettings.mockResolvedValue({
    storageUrl: "https://cdn.example.com",
  })
})

describe("createImportUpload", () => {
  test("records a pending import File for the workspace and returns the presigned URL", async () => {
    const result = await createImportUpload(base)

    expect(result.fileId).toBe("file-1")
    expect(result.presignedPostUrl).toBe("https://signed.example/put")
    expect(
      result.path.startsWith("workspaces/ws-1/imports/contacts/import_"),
    ).toBe(true)
    expect(result.publicUrl).toBe(`https://cdn.example.com/${result.path}`)
    expect(mocks.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: null,
        contextType: "import",
        subType: "contacts",
        fileName: "people.csv",
        mimeType: "text/csv",
        path: result.path,
      }),
    )
  })

  test("accepts xlsx for products", async () => {
    await expect(
      createImportUpload({
        ...base,
        type: "products",
        fileName: "items.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).resolves.toMatchObject({ fileId: "file-1" })
  })

  test("rejects a MIME type the import does not accept, without signing anything", async () => {
    await expect(
      createImportUpload({ ...base, mimeType: "image/png" }),
    ).rejects.toMatchObject({ code: "importUnsupportedFileType" })

    expect(mocks.getPresignedUpload).not.toHaveBeenCalled()
    expect(mocks.createPending).not.toHaveBeenCalled()
  })

  test("rejects a file name whose extension does not match the MIME type", async () => {
    await expect(
      createImportUpload({ ...base, fileName: "people.xlsx" }),
    ).rejects.toMatchObject({ code: "importUnsupportedFileType" })
  })

  test("rejects xlsx for contacts (csv only)", async () => {
    await expect(
      createImportUpload({
        ...base,
        fileName: "people.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).rejects.toMatchObject({ code: "importUnsupportedFileType" })
  })

  test("rejects a declared size over the import type's limit", async () => {
    await expect(
      createImportUpload({ ...base, fileSize: 21 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: "importFileTooLarge" })

    expect(mocks.createPending).not.toHaveBeenCalled()
  })
})
