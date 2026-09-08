import { beforeEach, describe, expect, test, vi } from "vitest"

// contactExportService: PII fields are stripped from the export field list
// when the caller can't view email/phone; `exportAll` vs `contactIds` picks
// the worker job payload shape; getFile 404s across workspaces; and a
// presigned download URL is only generated once the file has uploaded.

const mocks = vi.hoisted(() => ({
  fileRepositoryCreate: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  queueAdd: vi.fn(),
  getPresignedDownload: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  exportSubTypes: { enum: { contacts: "contacts" } },
  fileContextTypes: { enum: { export: "export" } },
  fileStatuses: { enum: { pending: "pending" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  fileRepository: {
    create: (...args: unknown[]) => mocks.fileRepositoryCreate(...args),
    findByIdForWorkspace: (...args: unknown[]) =>
      mocks.findByIdForWorkspace(...args),
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getPresignedDownload: (...args: unknown[]) =>
      mocks.getPresignedDownload(...args),
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "export-id-1",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { exportContacts: "exportContacts" },
  defaultQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

vi.mock("@chatbotx.io/worker-config/contact-pii", () => ({
  stripContactPIIFields: (fields: string[], canViewPII: boolean) =>
    canViewPII
      ? [...fields]
      : fields.filter((f) => f !== "sys:email" && f !== "sys:phoneNumber"),
}))

const { contactExportService } = await import("../src/contact-export/service")

const WORKSPACE_ID = "ws-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactExportService.start", () => {
  test("strips email/phone fields when canExportEmailAndPhone is false", async () => {
    await contactExportService.start({
      workspaceId: WORKSPACE_ID,
      requestedUserId: "user-1",
      canExportEmailAndPhone: false,
      fields: ["sys:firstName", "sys:email", "sys:phoneNumber"],
      exportAll: true,
    })

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "exportContacts",
      expect.objectContaining({
        data: expect.objectContaining({ fields: ["sys:firstName"] }),
      }),
    )
  })

  test("keeps PII fields when canExportEmailAndPhone is true", async () => {
    await contactExportService.start({
      workspaceId: WORKSPACE_ID,
      requestedUserId: "user-1",
      canExportEmailAndPhone: true,
      fields: ["sys:firstName", "sys:email"],
      exportAll: true,
    })

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "exportContacts",
      expect.objectContaining({
        data: expect.objectContaining({
          fields: ["sys:firstName", "sys:email"],
        }),
      }),
    )
  })

  test("sends a filter payload (no contactIds) when exportAll is true", async () => {
    await contactExportService.start({
      workspaceId: WORKSPACE_ID,
      requestedUserId: "user-1",
      canExportEmailAndPhone: true,
      fields: ["sys:firstName"],
      exportAll: true,
      filter: { keyword: "vip" },
    })

    const [, payload] = mocks.queueAdd.mock.calls[0]
    expect(payload.data.filter).toEqual({
      keyword: "vip",
      contactFilter: undefined,
    })
    expect(payload.data.contactIds).toBeUndefined()
  })

  test("sends a contactIds payload (no filter) when exportAll is false", async () => {
    await contactExportService.start({
      workspaceId: WORKSPACE_ID,
      requestedUserId: "user-1",
      canExportEmailAndPhone: true,
      fields: ["sys:firstName"],
      exportAll: false,
      contactIds: ["c-1", "c-2"],
    })

    const [, payload] = mocks.queueAdd.mock.calls[0]
    expect(payload.data.contactIds).toEqual(["c-1", "c-2"])
    expect(payload.data.filter).toBeUndefined()
  })
})

describe("contactExportService.getFile", () => {
  test("404s when the file doesn't resolve in this workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      contactExportService.getFile({
        workspaceId: WORKSPACE_ID,
        fileId: "file-1",
      }),
    ).rejects.toThrow("Export file not found")

    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
  })

  test("returns a presigned URL only when the file has uploaded", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce({
      status: "uploaded",
      fileName: "contacts.csv",
      path: "workspaces/ws-1/exports/contacts/contact_1.csv",
      meta: { totalRecords: 42 },
    })
    mocks.getPresignedDownload.mockResolvedValueOnce("https://example.com/dl")

    const result = await contactExportService.getFile({
      workspaceId: WORKSPACE_ID,
      fileId: "file-1",
    })

    expect(mocks.getPresignedDownload).toHaveBeenCalledWith(
      "workspaces/ws-1/exports/contacts/contact_1.csv",
      300,
    )
    expect(result).toEqual({
      status: "uploaded",
      fileName: "contacts.csv",
      downloadUrl: "https://example.com/dl",
      totalRecords: 42,
    })
  })

  test("returns no download URL while the file is still pending", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce({
      status: "pending",
      fileName: "contacts.csv",
      path: "workspaces/ws-1/exports/contacts/contact_1.csv",
      meta: null,
    })

    const result = await contactExportService.getFile({
      workspaceId: WORKSPACE_ID,
      fileId: "file-1",
    })

    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: "pending",
      fileName: "contacts.csv",
      downloadUrl: null,
      totalRecords: null,
    })
  })
})
