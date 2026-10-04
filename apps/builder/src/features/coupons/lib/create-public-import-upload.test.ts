import { beforeEach, describe, expect, test, vi } from "vitest"

const createPending = vi.fn()
const getPresignedUpload = vi.fn()
const getUploadHandler = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  fileService: { createPending },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getPresignedUpload },
}))

vi.mock("@/lib/upload/handlers", () => ({ getUploadHandler }))

const { createPublicCouponImportUpload } = await import(
  "./create-public-import-upload"
)

beforeEach(() => {
  vi.clearAllMocks()
  getUploadHandler.mockReturnValue(() => ({
    ok: true,
    path: "workspaces/workspace-1/imports/coupons/import-1.csv",
  }))
  getPresignedUpload.mockResolvedValue("https://upload.example.test/signed")
  createPending.mockResolvedValue({ id: "file-1" })
})

describe("createPublicCouponImportUpload", () => {
  test("derives the storage path through the import handler and creates a workspace-owned pending file", async () => {
    await expect(
      createPublicCouponImportUpload({
        workspaceId: "workspace-1",
        ownerId: "owner-1",
        fileName: "coupons.csv",
        mimeType: "text/csv",
      }),
    ).resolves.toEqual({
      fileId: "file-1",
      uploadUrl: "https://upload.example.test/signed",
    })

    expect(getUploadHandler).toHaveBeenCalledWith("import")
    expect(getPresignedUpload).toHaveBeenCalledWith(
      "workspaces/workspace-1/imports/coupons/import-1.csv",
    )
    expect(createPending).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "owner-1",
      contextType: "import",
      subType: "coupons",
      path: "workspaces/workspace-1/imports/coupons/import-1.csv",
      fileName: "coupons.csv",
      mimeType: "text/csv",
    })
  })

  test("rejects an import rejected by the established upload handler", async () => {
    getUploadHandler.mockReturnValue(() => ({
      ok: false,
      error: "Unsupported MIME type: image/png",
      status: 400,
    }))

    await expect(
      createPublicCouponImportUpload({
        workspaceId: "workspace-1",
        ownerId: "owner-1",
        fileName: "coupons.csv",
        mimeType: "text/csv",
      }),
    ).rejects.toMatchObject({ code: "couponImportUnsupportedFile" })

    expect(getPresignedUpload).not.toHaveBeenCalled()
    expect(createPending).not.toHaveBeenCalled()
  })
})
