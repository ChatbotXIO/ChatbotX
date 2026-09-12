import { beforeEach, describe, expect, test, vi } from "vitest"
import { ChatbotXException } from "../src/errors"

const {
  mockAssertPublicUrl,
  mockDeleteObject,
  mockFindByWorkspaceIdGemini,
  mockFindByWorkspaceIdOpenAI,
  mockFindOrFail,
  mockGetPresignedDownload,
  mockInsert,
  mockInsertReturning,
  mockLoggerWarn,
  mockQueueAdd,
  mockTxDeleteWhere,
  mockUploadFile,
  mockUploadFileFromUrl,
  mockFindManyAiFile,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockAssertPublicUrl: vi.fn(async () => undefined),
    mockDeleteObject: vi.fn(async () => undefined),
    mockFindByWorkspaceIdGemini: vi.fn(),
    mockFindByWorkspaceIdOpenAI: vi.fn(),
    mockFindOrFail: vi.fn(),
    mockGetPresignedDownload: vi.fn(
      async () => "https://cdn.example.com/signed",
    ),
    mockInsert,
    mockInsertReturning,
    mockLoggerWarn: vi.fn(),
    mockQueueAdd: vi.fn(),
    mockTxDeleteWhere: vi.fn(),
    mockUploadFile: vi.fn(),
    mockUploadFileFromUrl: vi.fn(),
    mockFindManyAiFile: vi.fn(async () => []),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      aiFileModel: {
        findFirst: vi.fn(),
        findMany: mockFindManyAiFile,
      },
    },
    insert: mockInsert,
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: vi.fn(() => ({ where: mockTxDeleteWhere })) }),
    ),
    $count: vi.fn(async () => 0),
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mockFindOrFail,
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiFileModel: { id: "id", workspaceId: "workspaceId", createdAt: "createdAt" },
  aiEmbeddingModel: { id: "id", aiFileId: "aiFileId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "file-1",
}))

class MockUploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UploadValidationError"
  }
}

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getPresignedDownload: mockGetPresignedDownload,
    deleteObject: mockDeleteObject,
  },
  uploadFile: mockUploadFile,
  uploadFileFromUrl: mockUploadFileFromUrl,
  UploadValidationError: MockUploadValidationError,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  HeavyJobAction: { processAIFile: "processAIFile" },
  getHeavyJobOptions: () => ({}),
  heavyQueue: { add: mockQueueAdd },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
  }),
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

vi.mock("../src/net/ssrf-guard", () => ({
  assertPublicUrl: mockAssertPublicUrl,
}))

vi.mock("../src/integration-openai/service", () => ({
  integrationOpenAIService: { findByWorkspaceId: mockFindByWorkspaceIdOpenAI },
}))

vi.mock("../src/integration-gemini/service", () => ({
  integrationGeminiService: { findByWorkspaceId: mockFindByWorkspaceIdGemini },
}))

const { aiFileService, AI_FILE_MAX_UPLOAD_BYTES } = await import(
  "../src/ai-file/service"
)

const workspaceId = "workspace-1"

function lastAuditDetail(): string {
  return dispatchAuditRecord.mock.calls.at(-1)?.[0]?.detail
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindByWorkspaceIdOpenAI.mockResolvedValue({ id: "openai-1" })
  mockFindByWorkspaceIdGemini.mockResolvedValue(undefined)
  mockInsertReturning.mockResolvedValue([
    {
      id: "file-1",
      path: "workspaces/workspace-1/ai-files/uploaded.pdf",
      name: "manual.pdf",
      mimeType: "application/pdf",
      size: 456,
      workspaceId,
    },
  ])
  mockGetPresignedDownload.mockResolvedValue("https://cdn.example.com/signed")
  mockFindOrFail.mockResolvedValue({
    id: "file-1",
    path: "workspaces/workspace-1/ai-files/file-1",
    workspaceId,
  })
})

describe("aiFileService.create", () => {
  test("path mode inserts, enqueues the heavy job, and audits (matches today's private behavior)", async () => {
    const result = await aiFileService.create(workspaceId, {
      name: "manual.pdf",
      path: "workspaces/workspace-1/ai-files/uploaded.pdf",
      mimeType: "application/pdf",
      size: 456,
    })

    expect(mockInsertReturning).toHaveBeenCalled()
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "processAIFile",
      { type: "processAIFile", data: { aiFileId: "file-1" } },
      { jobId: "heavy-ai-file-file-1" },
    )
    expect(lastAuditDetail()).toBe("created a new Knowledge (#file-1)")
    expect(result.processingStatus).toBe("pending")
    expect(result.chunksCount).toBe(0)
  })

  test("file mode uploads the file and returns a pending resource", async () => {
    const file = new File(["hello"], "manual.pdf", {
      type: "application/pdf",
    })
    mockUploadFile.mockResolvedValue({
      name: "manual.pdf",
      mimeType: "application/pdf",
      originPath: "workspaces/workspace-1/ai-files/file-1",
      size: 5,
      fileType: "file",
    })

    const result = await aiFileService.create(workspaceId, { file })

    expect(mockUploadFile).toHaveBeenCalledWith(
      file,
      "workspaces/workspace-1/ai-files/file-1",
      "private",
    )
    expect(result.processingStatus).toBe("pending")
    expect(result.chunksCount).toBe(0)
  })

  test("url mode checks SSRF safety before downloading", async () => {
    mockUploadFileFromUrl.mockResolvedValue({
      name: "manual.pdf",
      mimeType: "application/pdf",
      originPath: "workspaces/workspace-1/ai-files/file-1",
      size: 5,
      fileType: "file",
    })

    await aiFileService.create(workspaceId, {
      url: "https://example.com/manual.pdf",
    })

    expect(mockUploadFileFromUrl).toHaveBeenCalledWith(
      "https://example.com/manual.pdf",
      "workspaces/workspace-1/ai-files/file-1",
      "private",
      AI_FILE_MAX_UPLOAD_BYTES,
      expect.any(Function),
    )

    // The guard runs inside uploadFileFromUrl (once per redirect hop), so
    // assert the callback delegates rather than that the service called it
    // directly.
    const validate = mockUploadFileFromUrl.mock.calls[0][4]
    await validate("https://example.com/redirected.pdf")
    expect(mockAssertPublicUrl).toHaveBeenCalledWith(
      "https://example.com/redirected.pdf",
      "AI file URL",
    )
  })

  test("url mode surfaces an SSRF rejection as a businessError without fetching", async () => {
    mockAssertPublicUrl.mockRejectedValueOnce(new Error("blocked host"))
    mockUploadFileFromUrl.mockImplementation(
      async (
        url: string,
        _path: string,
        _visibility: string,
        _maxBytes: number,
        validate: (candidateUrl: string) => Promise<void>,
      ) => {
        await validate(url)
        throw new Error("unreachable: validate should have thrown")
      },
    )

    const error = await aiFileService
      .create(workspaceId, { url: "http://169.254.169.254/latest" })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatbotXException)
    expect((error as ChatbotXException).code).toBe("businessError")
    // The guard's own message (which echoes the submitted URL) must never
    // reach the caller — it is replaced with a safe, generic message.
    expect((error as ChatbotXException).message).toBe(
      "The provided URL is not allowed",
    )
    expect((error as ChatbotXException).message).not.toContain(
      "169.254.169.254",
    )
  })

  test("url mode reports an infrastructure failure as a generic 5xx without leaking details", async () => {
    mockUploadFileFromUrl.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 10.0.4.12:9000"),
    )

    const error = await aiFileService
      .create(workspaceId, { url: "https://example.com/manual.pdf" })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatbotXException)
    expect((error as ChatbotXException).code).toBe("systemError")
    expect((error as ChatbotXException).httpStatusCode).toBe(502)
    expect((error as ChatbotXException).message).not.toContain("ECONNREFUSED")
    expect((error as ChatbotXException).message).not.toContain("10.0.4.12")
  })

  test("rejects when neither OpenAI nor Gemini is configured", async () => {
    mockFindByWorkspaceIdOpenAI.mockResolvedValue(undefined)
    mockFindByWorkspaceIdGemini.mockResolvedValue(undefined)

    const error = await aiFileService
      .create(workspaceId, {
        name: "manual.pdf",
        path: "workspaces/workspace-1/ai-files/uploaded.pdf",
        mimeType: "application/pdf",
        size: 456,
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatbotXException)
    expect((error as ChatbotXException).code).toBe("noEmbeddingProvider")
    expect((error as ChatbotXException).message).toContain(
      "No embedding provider configured",
    )
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe("aiFileService.delete", () => {
  test("deletes storage, embeddings, and the row, then audits", async () => {
    await aiFileService.delete({ workspaceId, id: "file-1" })

    expect(mockDeleteObject).toHaveBeenCalledWith(
      "workspaces/workspace-1/ai-files/file-1",
    )
    expect(lastAuditDetail()).toBe("deleted a Knowledge (#file-1)")
  })

  test("swallows a storage failure instead of throwing", async () => {
    mockDeleteObject.mockRejectedValueOnce(new Error("s3 unavailable"))

    await expect(
      aiFileService.delete({ workspaceId, id: "file-1" }),
    ).resolves.toBeUndefined()

    expect(mockLoggerWarn).toHaveBeenCalled()
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("throws when the file does not belong to the workspace", async () => {
    mockFindOrFail.mockRejectedValueOnce(
      new Error("AIFile with id file-1 not found"),
    )

    await expect(
      aiFileService.delete({ workspaceId: "other-workspace", id: "file-1" }),
    ).rejects.toThrow("AIFile with id file-1 not found")
  })

  test("does not log the legacy AI Agent knowledge base message", async () => {
    await aiFileService.create(workspaceId, {
      name: "manual.pdf",
      path: "workspaces/workspace-1/ai-files/uploaded.pdf",
      mimeType: "application/pdf",
      size: 456,
    })
    await aiFileService.delete({ workspaceId, id: "file-1" })

    for (const call of dispatchAuditRecord.mock.calls) {
      expect(call[0].detail).not.toContain(
        "updated the AI Agent knowledge base",
      )
    }
  })
})

describe("aiFileService.listWithEmbeddingStatus", () => {
  test("maps status precedence: error beats pending beats success", async () => {
    mockFindManyAiFile.mockResolvedValue([
      {
        id: "file-error",
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceId,
        mimeType: "application/pdf",
        size: 1,
        name: "error.pdf",
        path: "p1",
        aiEmbeddings: [
          { id: "e1", status: "success" },
          { id: "e2", status: "error" },
        ],
      },
      {
        id: "file-pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceId,
        mimeType: "application/pdf",
        size: 1,
        name: "pending.pdf",
        path: "p2",
        aiEmbeddings: [{ id: "e3", status: "pending" }],
      },
      {
        id: "file-success",
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceId,
        mimeType: "application/pdf",
        size: 1,
        name: "success.pdf",
        path: "p3",
        aiEmbeddings: [{ id: "e4", status: "success" }],
      },
      {
        id: "file-empty",
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceId,
        mimeType: "application/pdf",
        size: 1,
        name: "empty.pdf",
        path: "p4",
        aiEmbeddings: [],
      },
    ])

    const result = await aiFileService.listWithEmbeddingStatus({ workspaceId })

    expect(result.find((f) => f.id === "file-error")?.processingStatus).toBe(
      "error",
    )
    expect(result.find((f) => f.id === "file-pending")?.processingStatus).toBe(
      "processing",
    )
    expect(result.find((f) => f.id === "file-success")?.processingStatus).toBe(
      "success",
    )
    expect(result.find((f) => f.id === "file-empty")?.processingStatus).toBe(
      "pending",
    )
    expect(mockGetPresignedDownload).toHaveBeenCalledTimes(4)
  })
})
