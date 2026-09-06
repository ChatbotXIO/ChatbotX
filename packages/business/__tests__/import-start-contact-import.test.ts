import { beforeEach, describe, expect, test, vi } from "vitest"

// importService.startContactImport: one case per ChatbotXException code the
// guard chain can throw (file missing, wrong file type, unsupported format,
// inbox missing, an import already running) plus the happy-path enqueue
// payload once every gate passes.

const mocks = vi.hoisted(() => ({
  fileFindFirst: vi.fn(),
  importFindFirst: vi.fn(),
  inboxFind: vi.fn(),
  transaction: vi.fn(),
  queueAdd: vi.fn(),
  inferImportFormat: vi.fn(),
  getImportEntry: vi.fn(),
}))

const txHandle = {
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  insert: vi.fn(() => ({ values: vi.fn() })),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      fileModel: {
        findFirst: (...args: unknown[]) => mocks.fileFindFirst(...args),
      },
      importModel: {
        findFirst: (...args: unknown[]) => mocks.importFindFirst(...args),
      },
    },
    transaction: (cb: (tx: typeof txHandle) => Promise<unknown>) =>
      mocks.transaction(cb, txHandle),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  fileContextTypes: { enum: { import: "import" } },
  fileStatuses: { enum: { uploaded: "uploaded" } },
  importStatuses: { enum: {} },
  importTypes: { enum: { contacts: "contacts" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  fileModel: { id: "fileModel.id", workspaceId: "fileModel.workspaceId" },
  importModel: { id: "importModel.id" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
  likeContains: vi.fn(),
  parseOrderBy: vi.fn(),
}))

vi.mock("@chatbotx.io/imports", () => ({
  inferImportFormat: (...args: unknown[]) => mocks.inferImportFormat(...args),
}))

vi.mock("@chatbotx.io/imports/file-validation", () => ({
  resolveImportFileFormat: vi.fn(),
}))

vi.mock("@chatbotx.io/imports/registry", () => ({
  getImportEntry: (...args: unknown[]) => mocks.getImportEntry(...args),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "import-1",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { runImport: "runImport" },
  defaultQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { find: (...args: unknown[]) => mocks.inboxFind(...args) },
}))

const { importService } = await import("../src/import/service")

const WORKSPACE_ID = "ws-1"
const BASE_INPUT = {
  workspaceId: WORKSPACE_ID,
  userId: "user-1",
  inboxId: "inbox-1",
  fileId: "file-1",
  meta: {} as never,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getImportEntry.mockReturnValue({
    config: { acceptedFormats: ["csv", "xlsx"] },
  })
  mocks.transaction.mockImplementation(async (cb, tx) => await cb(tx))
  mocks.queueAdd.mockResolvedValue(undefined)
})

describe("importService.startContactImport", () => {
  test("throws contactImportFileNotFound when the file doesn't resolve", async () => {
    mocks.fileFindFirst.mockResolvedValueOnce(undefined)

    await expect(
      importService.startContactImport(BASE_INPUT),
    ).rejects.toMatchObject({ code: "contactImportFileNotFound" })
  })

  test("throws contactImportFileTypeInvalid when the file isn't a contacts import", async () => {
    mocks.fileFindFirst.mockResolvedValueOnce({
      id: "file-1",
      contextType: "import",
      subType: "products",
      mimeType: "text/csv",
      fileName: "a.csv",
    })

    await expect(
      importService.startContactImport(BASE_INPUT),
    ).rejects.toMatchObject({ code: "contactImportFileTypeInvalid" })
  })

  test("throws contactImportUnsupportedFormat when the format isn't accepted", async () => {
    mocks.fileFindFirst.mockResolvedValueOnce({
      id: "file-1",
      contextType: "import",
      subType: "contacts",
      mimeType: "application/zip",
      fileName: "a.zip",
    })
    mocks.inferImportFormat.mockReturnValueOnce(undefined)

    await expect(
      importService.startContactImport(BASE_INPUT),
    ).rejects.toMatchObject({ code: "contactImportUnsupportedFormat" })
  })

  test("throws contactImportInboxNotFound when the inbox doesn't resolve", async () => {
    mocks.fileFindFirst.mockResolvedValueOnce({
      id: "file-1",
      contextType: "import",
      subType: "contacts",
      mimeType: "text/csv",
      fileName: "a.csv",
    })
    mocks.inferImportFormat.mockReturnValueOnce("csv")
    mocks.inboxFind.mockResolvedValueOnce(undefined)

    await expect(
      importService.startContactImport(BASE_INPUT),
    ).rejects.toMatchObject({ code: "contactImportInboxNotFound" })

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("throws contactImportAlreadyRunning when a pending/processing import exists", async () => {
    mocks.fileFindFirst.mockResolvedValueOnce({
      id: "file-1",
      contextType: "import",
      subType: "contacts",
      mimeType: "text/csv",
      fileName: "a.csv",
    })
    mocks.inferImportFormat.mockReturnValueOnce("csv")
    mocks.inboxFind.mockResolvedValueOnce({ id: "inbox-1" })
    mocks.importFindFirst.mockResolvedValueOnce({ id: "existing-import" })

    await expect(
      importService.startContactImport(BASE_INPUT),
    ).rejects.toMatchObject({ code: "contactImportAlreadyRunning" })

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("happy path: writes the import row and enqueues runImport", async () => {
    mocks.fileFindFirst.mockResolvedValueOnce({
      id: "file-1",
      contextType: "import",
      subType: "contacts",
      mimeType: "text/csv",
      fileName: "a.csv",
    })
    mocks.inferImportFormat.mockReturnValueOnce("csv")
    mocks.inboxFind.mockResolvedValueOnce({ id: "inbox-1" })
    mocks.importFindFirst.mockResolvedValueOnce(undefined)

    const result = await importService.startContactImport({
      ...BASE_INPUT,
      actor: { ipAddress: "1.2.3.4", userAgent: "test-agent" },
    })

    expect(result).toEqual({ importId: "import-1" })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.queueAdd).toHaveBeenCalledWith("runImport", {
      type: "runImport",
      data: {
        importId: "import-1",
        ipAddress: "1.2.3.4",
        userAgent: "test-agent",
      },
    })
  })
})
