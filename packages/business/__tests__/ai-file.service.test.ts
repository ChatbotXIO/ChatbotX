import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// aiFileService — create/delete/listWithEmbeddingStatus for the Knowledge
// tab. `create` throws a "noEmbeddingProvider" marker when the workspace has
// neither an OpenAI nor a Gemini integration; `delete` swallows errors and
// logs a warning (the delete action must never reject); listWithEmbeddingStatus
// derives status precedence error > processing > success/pending.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  dispatchAuditRecord: vi.fn(),
  findFirstAiFile: vi.fn(),
  findFirstGemini: vi.fn(),
  findFirstOpenai: vi.fn(),
  findManyAiFile: vi.fn(async () => []),
  getPresignedDownload: vi.fn(async () => "https://example.com/download"),
  insertReturning: vi.fn(),
  loggerWarn: vi.fn(),
  normalizeError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
  queueAdd: vi.fn(),
  transaction: vi.fn(),
  txDeleteWhere: vi.fn(),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.loggerWarn },
}))

vi.mock("universal-error-normalizer", () => ({
  normalizeError: (error: unknown) => mocks.normalizeError(error),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: vi.fn(() => ({ where: mocks.txDeleteWhere })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: mocks.insertReturning })),
    })),
    query: {
      aiFileModel: {
        findFirst: mocks.findFirstAiFile,
        findMany: mocks.findManyAiFile,
      },
      integrationGeminiModel: { findFirst: mocks.findFirstGemini },
      integrationOpenaiModel: { findFirst: mocks.findFirstOpenai },
    },
    transaction: mocks.transaction,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiEmbeddingModel: { id: "id" },
  aiFileModel: { id: "id" },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    deleteObject: mocks.deleteObject,
    getPresignedDownload: mocks.getPresignedDownload,
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "file-1",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { processAIFile: "processAIFile" },
  aiAgentQueue: { add: mocks.queueAdd },
}))

const { aiFileService } = await import("../src/ai-file/service")

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirstOpenai.mockResolvedValue(undefined)
  mocks.findFirstGemini.mockResolvedValue(undefined)
  mocks.insertReturning.mockResolvedValue([{ id: "file-1" }])
  mocks.findFirstAiFile.mockResolvedValue({
    id: "file-1",
    workspaceId,
    path: "path/to/file",
  })
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ delete: vi.fn(() => ({ where: mocks.txDeleteWhere })) }),
  )
})

describe("aiFileService.create", () => {
  test("throws noEmbeddingProvider when neither OpenAI nor Gemini is connected", async () => {
    await expect(
      aiFileService.create({
        workspaceId,
        path: "path",
        name: "manual.pdf",
        mimeType: "application/pdf",
        size: 100,
      }),
    ).rejects.toMatchObject({ code: "noEmbeddingProvider" })

    expect(mocks.queueAdd).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("succeeds when an OpenAI integration exists: inserts, enqueues, audits", async () => {
    mocks.findFirstOpenai.mockResolvedValue({ id: "openai-1" })

    const result = await aiFileService.create({
      workspaceId,
      path: "path",
      name: "manual.pdf",
      mimeType: "application/pdf",
      size: 100,
    })

    expect(result).toEqual({ id: "file-1" })
    expect(mocks.queueAdd).toHaveBeenCalledWith("processAIFile", {
      type: "processAIFile",
      data: { aiFileId: "file-1" },
    })
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        detail: "created a new Knowledge (#file-1)",
      }),
    )
  })

  test("succeeds when only a Gemini integration exists", async () => {
    mocks.findFirstGemini.mockResolvedValue({ id: "gemini-1" })

    const result = await aiFileService.create({
      workspaceId,
      path: "path",
      name: "manual.pdf",
      mimeType: "application/pdf",
      size: 100,
    })

    expect(result).toEqual({ id: "file-1" })
  })
})

describe("aiFileService.delete", () => {
  test("deletes the object and both rows inside a transaction, then audits", async () => {
    await aiFileService.delete({ workspaceId, id: "file-1" })

    expect(mocks.deleteObject).toHaveBeenCalledWith("path/to/file")
    expect(mocks.transaction).toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        detail: "deleted a Knowledge (#file-1)",
      }),
    )
  })

  test("swallows a thrown error and logs a warning instead of rejecting", async () => {
    mocks.deleteObject.mockRejectedValueOnce(new Error("s3 down"))

    await expect(
      aiFileService.delete({ workspaceId, id: "file-1" }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerWarn).toHaveBeenCalled()
    expect(mocks.dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("Knowledge tab audit messages", () => {
  test("does not log the legacy AI Agent knowledge base message", async () => {
    mocks.findFirstOpenai.mockResolvedValue({ id: "openai-1" })

    await aiFileService.create({
      workspaceId,
      path: "path",
      name: "manual.pdf",
      mimeType: "application/pdf",
      size: 100,
    })
    await aiFileService.delete({ workspaceId, id: "file-1" })

    for (const call of mocks.dispatchAuditRecord.mock.calls) {
      expect(call[0].detail).not.toContain(
        "updated the AI Agent knowledge base",
      )
    }
  })
})

describe("aiFileService.listWithEmbeddingStatus", () => {
  test("maps status precedence: error beats pending beats success", async () => {
    mocks.findManyAiFile.mockResolvedValue([
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
    expect(mocks.getPresignedDownload).toHaveBeenCalledTimes(4)
  })
})
