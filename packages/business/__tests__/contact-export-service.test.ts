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
  listExportsForWorkspace: vi.fn(),
  listExportsCreatedBefore: vi.fn(),
  deleteById: vi.fn(),
  deleteObject: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  CONTACT_EXPORT_RETENTION_DAYS: 7,
  exportSubTypes: { enum: { contacts: "contacts" } },
  fileContextTypes: { enum: { export: "export" } },
  fileStatuses: { enum: { pending: "pending" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  fileRepository: {
    create: (...args: unknown[]) => mocks.fileRepositoryCreate(...args),
    findByIdForWorkspace: (...args: unknown[]) =>
      mocks.findByIdForWorkspace(...args),
    listExportsForWorkspace: (...args: unknown[]) =>
      mocks.listExportsForWorkspace(...args),
    listExportsCreatedBefore: (...args: unknown[]) =>
      mocks.listExportsCreatedBefore(...args),
    deleteById: (...args: unknown[]) => mocks.deleteById(...args),
  },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getPresignedDownload: (...args: unknown[]) =>
      mocks.getPresignedDownload(...args),
    deleteObject: (...args: unknown[]) => mocks.deleteObject(...args),
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

describe("contactExportService.listFiles", () => {
  const createdAt = new Date("2026-10-20T10:00:00.000Z")
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "f-1",
    status: "uploaded",
    fileName: "contacts-2026-10-20.csv",
    meta: { totalRecords: 12 },
    createdAt,
    userId: "u-1",
    requestedByName: "Lan",
    createdAtCursor: "2026-10-20T10:00:00.123456Z",
    ...overrides,
  })

  test("lists the workspace's contact exports with their expiry and requester, without links", async () => {
    mocks.listExportsForWorkspace.mockResolvedValueOnce([row()])

    const result = await contactExportService.listFiles({
      workspaceId: WORKSPACE_ID,
      userId: "u-1",
      limit: 20,
    })

    expect(mocks.listExportsForWorkspace).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      subType: "contacts",
      userId: "u-1",
      limit: 20,
      cursor: undefined,
    })
    expect(result).toEqual({
      data: [
        {
          id: "f-1",
          status: "uploaded",
          fileName: "contacts-2026-10-20.csv",
          totalRecords: 12,
          createdAt,
          expiresAt: new Date("2026-10-27T10:00:00.000Z"),
          requestedBy: { id: "u-1", name: "Lan" },
        },
      ],
      nextCursor: null,
    })
    expect(mocks.getPresignedDownload).not.toHaveBeenCalled()
  })

  test("returns a cursor only when a row past the page exists", async () => {
    mocks.listExportsForWorkspace.mockResolvedValueOnce([
      row({ id: "f-2" }),
      row({ id: "f-1" }),
    ])

    const result = await contactExportService.listFiles({
      workspaceId: WORKSPACE_ID,
      limit: 1,
    })

    expect(result.data.map((item) => item.id)).toEqual(["f-2"])
    // The cursor keeps the column's microseconds; a Date would drop them.
    expect(result.nextCursor).toEqual({
      createdAt: "2026-10-20T10:00:00.123456Z",
      id: "f-2",
    })
  })

  test("an export started with an API token has no requester", async () => {
    mocks.listExportsForWorkspace.mockResolvedValueOnce([
      row({
        userId: null,
        requestedByName: null,
        meta: null,
        status: "pending",
      }),
    ])

    const { data } = await contactExportService.listFiles({
      workspaceId: WORKSPACE_ID,
      limit: 20,
    })

    expect(data[0]).toMatchObject({
      requestedBy: null,
      totalRecords: null,
      status: "pending",
    })
  })
})

describe("contactExportService.purgeExpired", () => {
  const now = new Date("2026-10-29T00:00:00.000Z")
  const file = (id: string) => ({
    id,
    workspaceId: WORKSPACE_ID,
    path: `workspaces/${WORKSPACE_ID}/exports/contacts/contact_${id}.csv`,
    createdAtCursor: `2026-10-01T00:00:00.00000${id.slice(-1)}Z`,
  })

  test("reads only contact exports older than the retention", async () => {
    mocks.listExportsCreatedBefore.mockResolvedValueOnce([])

    await contactExportService.purgeExpired({ batchSize: 100, now })

    expect(mocks.listExportsCreatedBefore).toHaveBeenCalledWith({
      subType: "contacts",
      before: new Date("2026-10-22T00:00:00.000Z"),
      limit: 100,
      after: undefined,
    })
  })

  test("deletes the stored file before its row", async () => {
    mocks.listExportsCreatedBefore.mockResolvedValueOnce([file("f-1")])
    mocks.deleteObject.mockResolvedValueOnce({})

    await expect(
      contactExportService.purgeExpired({ batchSize: 100, now }),
    ).resolves.toEqual({ deleted: 1, failed: 0, nextCursor: null })

    expect(mocks.deleteObject).toHaveBeenCalledWith(file("f-1").path)
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "f-1" })
    expect(mocks.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteById.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("keeps the row when the storage delete fails, so the next sweep retries it", async () => {
    mocks.listExportsCreatedBefore.mockResolvedValueOnce([
      file("f-1"),
      file("f-2"),
    ])
    mocks.deleteObject
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValueOnce({})

    await expect(
      contactExportService.purgeExpired({ batchSize: 100, now }),
    ).resolves.toEqual({ deleted: 1, failed: 1, nextCursor: null })

    expect(mocks.deleteById).toHaveBeenCalledTimes(1)
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "f-2" })
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  test("after a full batch, points past its last row so kept rows cannot stall the sweep", async () => {
    const after = { createdAt: "2026-10-01T00:00:00.000000Z", id: "f-0" }
    mocks.listExportsCreatedBefore.mockResolvedValueOnce([
      file("f-1"),
      file("f-2"),
    ])
    mocks.deleteObject.mockRejectedValue(new Error("storage down"))

    const result = await contactExportService.purgeExpired({
      batchSize: 2,
      now,
      after,
    })

    expect(mocks.listExportsCreatedBefore).toHaveBeenCalledWith(
      expect.objectContaining({ after }),
    )
    expect(result).toEqual({
      deleted: 0,
      failed: 2,
      nextCursor: { createdAt: file("f-2").createdAtCursor, id: "f-2" },
    })
  })
})
