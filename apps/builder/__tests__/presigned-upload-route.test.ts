// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const loadServableWorkspace = vi.fn()
const assertCurrentUserCanAccessChatbot = vi.fn()
const getPresignedUpload = vi.fn()
const insertValues = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(),
  resolveTenantSettings: vi.fn(async () => ({
    storageUrl: "https://cdn.example.com",
  })),
  resolveTenantSettingsByDomain: vi.fn(async () => ({
    storageUrl: "https://cdn.example.com",
  })),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert: () => ({ values: insertValues }) },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  fileContextTypes: { enum: { generic: "generic", import: "import" } },
  fileStatuses: { enum: { pending: "pending" } },
  importTypes: { options: ["contact"] },
  uploadTypes: { options: ["import", "generic"] },
}))

vi.mock("@chatbotx.io/database/schema", () => ({ fileModel: {} }))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getPresignedUpload },
}))

vi.mock("@chatbotx.io/utils", () => ({ createId: () => "file-1" }))

vi.mock("@/features/import/schemas/presign", () => ({
  presignImportUploadRequest: {
    parse: (value: unknown) => value,
  },
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot,
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
  getCurrentUserId: vi.fn(async () => "user-1"),
}))

vi.mock("@/lib/domain", () => ({ getDomainFromHeader: vi.fn(async () => "") }))

vi.mock("@/lib/errors/server-handler", () => ({
  serverErrorHandler: (error: unknown) => {
    throw error
  },
}))

vi.mock("@/lib/serialize", () => ({
  safeJsonParse: (req: Request) => req.json(),
}))

vi.mock("@/lib/upload/handlers", () => ({
  getUploadHandler: () => () => ({ ok: true, path: "workspaces/1/logo.png" }),
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

const { POST } = await import("../src/app/api/presigned-upload/route")

const asNextRequest = (body: unknown) => {
  const request = new Request("http://localhost/api/presigned-upload", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
  return request as never
}

const validBody = {
  fileName: "logo.png",
  mimeType: "image/png",
  path: "workspaces/1/logo.png",
  subType: "generic",
  type: "generic",
  workspaceId: "1",
}

describe("POST /api/presigned-upload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadServableWorkspace.mockResolvedValue({
      servable: true,
      workspace: { id: "1" },
    })
    getPresignedUpload.mockResolvedValue("https://upload.example.com/signed")
    insertValues.mockResolvedValue(undefined)
  })

  test("mints a presigned url for a servable workspace", async () => {
    const response = await POST(asNextRequest(validBody))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      fileId: "file-1",
      presignedPostUrl: "https://upload.example.com/signed",
      publicUrl: "https://cdn.example.com/workspaces/1/logo.png",
      path: "workspaces/1/logo.png",
    })
  })

  test("rejects the upload when the workspace is frozen", async () => {
    loadServableWorkspace.mockResolvedValue({
      servable: false,
      workspace: { id: "1", scheduledDeletionAt: new Date() },
    })

    const response = await POST(asNextRequest(validBody))

    expect(response.status).toBe(403)
    expect(getPresignedUpload).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
  })

  test("rejects the upload when the workspace row no longer exists", async () => {
    loadServableWorkspace.mockResolvedValue({
      servable: false,
      workspace: undefined,
    })

    const response = await POST(asNextRequest(validBody))

    expect(response.status).toBe(403)
    expect(getPresignedUpload).not.toHaveBeenCalled()
  })
})
