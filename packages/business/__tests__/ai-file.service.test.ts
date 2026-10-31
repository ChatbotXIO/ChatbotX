import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// The broadcast policy import reaches quota/workspace modules these narrow mocks omit.
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

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
  mockMarkChunked,
  mockQueueAdd,
  mockTxDeleteWhere,
  mockUploadFile,
  mockUploadFileFromUrl,
  mockFindManyAiFile,
  mockFindFirstAiFile,
  mockClaimProcessingRun,
  mockFinishProcessingRun,
  mockListChunks,
  mockFindChunksContaining,
  mockLoggerError,
  mockCreateId,
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
    mockMarkChunked: vi.fn(),
    mockQueueAdd: vi.fn(),
    mockTxDeleteWhere: vi.fn(() => ({ returning: async () => [] })),
    mockUploadFile: vi.fn(),
    mockUploadFileFromUrl: vi.fn(),
    mockFindManyAiFile: vi.fn(async () => []),
    mockFindFirstAiFile: vi.fn(),
    mockClaimProcessingRun: vi.fn(),
    mockFinishProcessingRun: vi.fn(),
    mockListChunks: vi.fn(),
    mockFindChunksContaining: vi.fn(),
    mockLoggerError: vi.fn(),
    mockCreateId: vi.fn(() => "file-1"),
  }
})

vi.mock("@chatbotx.io/database/repositories", () => ({
  createAiFileEmbeddingRepository: () => ({
    claimProcessingRun: mockClaimProcessingRun,
    finishProcessingRun: mockFinishProcessingRun,
    listChunks: mockListChunks,
    findChunksContaining: mockFindChunksContaining,
    markChunked: mockMarkChunked,
  }),
}))

// Bump one chunker past its stored version so "outdated" is reachable today.
vi.mock("@chatbotx.io/database/partials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/partials")>()
  return {
    ...actual,
    AI_FILE_CHUNKER_VERSIONS: {
      ...actual.AI_FILE_CHUNKER_VERSIONS,
      tabular: 2,
    },
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      aiFileModel: {
        findFirst: mockFindFirstAiFile,
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
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((field: unknown, values: unknown) => ({ field, values })),
  findOrFail: mockFindOrFail,
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiFileModel: { id: "id", workspaceId: "workspaceId", createdAt: "createdAt" },
  aiEmbeddingModel: { id: "id", aiFileId: "aiFileId" },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: mockCreateId,
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
  buildAIFileReindexJobId: (id: string, runId: string) =>
    `heavy-ai-file-${id}-reindex-${runId}`,
  getHeavyJobOptions: () => ({}),
  heavyQueue: { add: mockQueueAdd },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    debug: vi.fn(),
    error: mockLoggerError,
    info: vi.fn(),
    warn: mockLoggerWarn,
  }),
}))

const { mockAssertDeletable, mockAssertEditable } = vi.hoisted(() => ({
  mockAssertDeletable: vi.fn(),
  mockAssertEditable: vi.fn(),
}))

// The template lock guard has its own suite; these tests cover the call sites.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    useTransaction: true,
    assertDeletable: mockAssertDeletable,
    assertResourceEditable: mockAssertEditable,
  }),
}))

const lockedTx = { marker: "locked-tx" }
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: (run: (tx: unknown) => unknown) =>
    run(lockedTx),
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
  mockFindFirstAiFile.mockResolvedValue({
    id: "file-1",
    path: "workspaces/workspace-1/ai-files/uploaded.pdf",
    name: "manual.pdf",
    mimeType: "application/pdf",
    size: 456,
    workspaceId,
    aiEmbeddings: [],
  })
  mockClaimProcessingRun.mockResolvedValue(true)
  mockFinishProcessingRun.mockResolvedValue(true)
  mockCreateId.mockImplementation(() => "file-1")
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
      {
        type: "processAIFile",
        data: expect.objectContaining({
          aiFileId: "file-1",
          runId: expect.any(String),
        }),
      },
      { jobId: "heavy-ai-file-file-1" },
    )
    expect(lastAuditDetail()).toBe("created a new Knowledge (#file-1)")
    expect(result.processingStatus).toBe("pending")
    expect(result.chunksCount).toBe(0)
    expect(result.processingRun).toEqual(
      expect.objectContaining({ status: "queued", heartbeatAt: null }),
    )
  })

  test.each([
    ["another workspace's object", "workspaces/workspace-2/ai-files/x.pdf"],
    [
      "a different folder of this workspace",
      "workspaces/workspace-1/secrets/x",
    ],
    [
      "a path that climbs out of the prefix",
      "workspaces/workspace-1/ai-files/../../workspace-2/ai-files/x",
    ],
    ["a bare key", "uploads/x.pdf"],
  ])("path mode refuses %s", async (_label, path) => {
    await expect(
      aiFileService.create(workspaceId, {
        name: "x.pdf",
        path,
        mimeType: "application/pdf",
        size: 1,
      }),
    ).rejects.toMatchObject({ httpStatusCode: 400 })

    expect(mockInsertReturning).not.toHaveBeenCalled()
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

describe("aiFileService.create when enqueueing fails", () => {
  const pathInput = {
    name: "manual.pdf",
    path: "workspaces/workspace-1/ai-files/uploaded.pdf",
    mimeType: "application/pdf",
    size: 456,
  }

  test("records enqueueFailed, audits, and still returns the stored file", async () => {
    const enqueueError = new Error("redis unavailable")
    mockQueueAdd.mockRejectedValueOnce(enqueueError)

    const result = await aiFileService.create(workspaceId, pathInput)

    expect(mockFinishProcessingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "file-1",
        workspaceId,
        runId: "file-1",
        status: "error",
        error: "enqueueFailed",
      }),
    )
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything(), runId: "file-1" }),
      "Failed to enqueue AI file processing",
    )
    expect(mockLoggerError.mock.calls[0]?.[0]).not.toHaveProperty("error")
    expect(lastAuditDetail()).toBe("created a new Knowledge (#file-1)")
    expect(mockTxDeleteWhere).not.toHaveBeenCalled()
    expect(result.processingRun).toEqual(
      expect.objectContaining({
        status: "error",
        error: "enqueueFailed",
        finishedAt: expect.any(String),
      }),
    )
  })

  test("keeps the queued run when recording the failure also fails", async () => {
    mockQueueAdd.mockRejectedValueOnce(new Error("redis unavailable"))
    mockFinishProcessingRun.mockRejectedValueOnce(new Error("db unavailable"))

    const result = await aiFileService.create(workspaceId, pathInput)

    expect(result.processingRun).toEqual(
      expect.objectContaining({ status: "queued", error: null }),
    )
    expect(mockLoggerError).toHaveBeenCalledTimes(2)
  })
})

describe("aiFileService.reindex", () => {
  test("claims a run and enqueues it with a unique reindex job id", async () => {
    const result = await aiFileService.reindex({ workspaceId, id: "file-1" })

    expect(mockClaimProcessingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "file-1",
        workspaceId,
        run: expect.objectContaining({ status: "queued", heartbeatAt: null }),
      }),
    )
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "processAIFile",
      expect.objectContaining({
        data: expect.objectContaining({ aiFileId: "file-1", runId: "file-1" }),
      }),
      { jobId: "heavy-ai-file-file-1-reindex-file-1" },
    )
    expect(result.coalesced).toBe(false)
  })

  test("coalesces without adding another job when an active run owns the file", async () => {
    mockClaimProcessingRun.mockResolvedValueOnce(false)

    const result = await aiFileService.reindex({ workspaceId, id: "file-1" })

    expect(result.coalesced).toBe(true)
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  test("marks the run as enqueueFailed before surfacing an enqueue failure", async () => {
    mockQueueAdd.mockRejectedValueOnce(new Error("redis unavailable"))

    const error = await aiFileService
      .reindex({ workspaceId, id: "file-1" })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChatbotXException)
    expect((error as ChatbotXException).httpStatusCode).toBe(502)
    expect(mockFinishProcessingRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error: "enqueueFailed" }),
    )
  })
  test("gives every claimed run its own job id", async () => {
    mockCreateId.mockImplementationOnce(() => "run-a")
    await aiFileService.reindex({ workspaceId, id: "file-1" })
    mockCreateId.mockImplementationOnce(() => "run-b")
    await aiFileService.reindex({ workspaceId, id: "file-1" })

    expect(mockQueueAdd.mock.calls.map((call) => call[2].jobId)).toEqual([
      "heavy-ai-file-file-1-reindex-run-a",
      "heavy-ai-file-file-1-reindex-run-b",
    ])
  })

  test("does not audit a coalesced reindex", async () => {
    mockClaimProcessingRun.mockResolvedValueOnce(false)

    await aiFileService.reindex({ workspaceId, id: "file-1" })

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits a claimed reindex", async () => {
    await aiFileService.reindex({ workspaceId, id: "file-1" })

    expect(lastAuditDetail()).toBe("reindexed a Knowledge (#file-1)")
  })

  test("rejects a file of another workspace without claiming", async () => {
    mockFindFirstAiFile.mockResolvedValueOnce(undefined)

    await expect(
      aiFileService.reindex({ workspaceId: "workspace-2", id: "file-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mockClaimProcessingRun).not.toHaveBeenCalled()
  })

  test("rejects a workspace without an embedding provider before claiming", async () => {
    mockFindByWorkspaceIdOpenAI.mockResolvedValue(undefined)
    mockFindByWorkspaceIdGemini.mockResolvedValue(undefined)

    await expect(
      aiFileService.reindex({ workspaceId, id: "file-1" }),
    ).rejects.toMatchObject({ code: "noEmbeddingProvider" })
    expect(mockClaimProcessingRun).not.toHaveBeenCalled()
  })
})

describe("aiFileService.reindex with chunking parameters", () => {
  test("stores the normalized parameters in the claim", async () => {
    await aiFileService.reindex({
      workspaceId,
      id: "file-1",
      chunkingConfig: { chunkSize: 300, overlapSize: 400 },
    })

    expect(mockClaimProcessingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkingConfig: {
          strategy: "auto",
          chunkSize: 300,
          overlapSize: 150,
          tabularHeaderRow: 1,
        },
      }),
    )
  })

  test("null resets to the defaults and omitting keeps the stored ones", async () => {
    await aiFileService.reindex({
      workspaceId,
      id: "file-1",
      chunkingConfig: null,
    })
    expect(mockClaimProcessingRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ chunkingConfig: null }),
    )

    await aiFileService.reindex({ workspaceId, id: "file-1" })
    expect(
      mockClaimProcessingRun.mock.calls.at(-1)?.[0].chunkingConfig,
    ).toBeUndefined()
  })

  test("guards re-chunking first inside the locked transaction, then claims on it", async () => {
    await aiFileService.reindex({
      workspaceId,
      id: "file-1",
      chunkingConfig: { chunkSize: 500 },
    })

    expect(mockAssertEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "aiFile",
        resourceIds: ["file-1"],
        changedKeys: ["chunkingConfig"],
        tx: lockedTx,
      }),
    )
    expect(mockAssertEditable.mock.invocationCallOrder[0]).toBeLessThan(
      mockClaimProcessingRun.mock.invocationCallOrder[0] as number,
    )
  })

  test("a blocked re-chunk neither claims nor enqueues", async () => {
    mockAssertEditable.mockRejectedValueOnce(new Error("locked"))

    await expect(
      aiFileService.reindex({
        workspaceId,
        id: "file-1",
        chunkingConfig: null,
      }),
    ).rejects.toThrow("locked")
    expect(mockClaimProcessingRun).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  test("a plain reindex never takes the guard or a lock", async () => {
    mockAssertEditable.mockClear()

    await aiFileService.reindex({ workspaceId, id: "file-1" })

    expect(mockAssertEditable).not.toHaveBeenCalled()
    expect(mockClaimProcessingRun).toHaveBeenCalled()
  })

  test("rejects parameters outside the limits without claiming", async () => {
    await expect(
      aiFileService.reindex({
        workspaceId,
        id: "file-1",
        chunkingConfig: { chunkSize: 50 },
      }),
    ).rejects.toMatchObject({ code: "validation", field: "chunkingConfig" })
    expect(mockClaimProcessingRun).not.toHaveBeenCalled()
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  test("answers 409 instead of coalescing when parameters were sent", async () => {
    mockClaimProcessingRun.mockResolvedValueOnce(false)

    await expect(
      aiFileService.reindex({
        workspaceId,
        id: "file-1",
        chunkingConfig: { chunkSize: 500 },
      }),
    ).rejects.toMatchObject({ code: "conflict", httpStatusCode: 409 })
    expect(mockQueueAdd).not.toHaveBeenCalled()
  })

  test("a null reset on an active run is also a conflict", async () => {
    mockClaimProcessingRun.mockResolvedValueOnce(false)

    await expect(
      aiFileService.reindex({
        workspaceId,
        id: "file-1",
        chunkingConfig: null,
      }),
    ).rejects.toMatchObject({ code: "conflict" })
  })
})

describe("aiFileService.listChunks", () => {
  test("rejects a file of another workspace", async () => {
    mockFindFirstAiFile.mockResolvedValueOnce(undefined)

    await expect(
      aiFileService.listChunks({
        workspaceId: "workspace-2",
        aiFileId: "file-1",
        limit: 2,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mockListChunks).not.toHaveBeenCalled()
  })

  test.each([
    ["not base64 json", "abc"],
    ["a legacy plain id", "2"],
    [
      "a cursor with a non-numeric id",
      Buffer.from(JSON.stringify({ i: 1, id: "x" })).toString("base64url"),
    ],
    [
      "a cursor with a negative position",
      Buffer.from(JSON.stringify({ i: -1, id: "2" })).toString("base64url"),
    ],
  ])("rejects %s as a cursor before querying", async (_label, cursor) => {
    await expect(
      aiFileService.listChunks({
        workspaceId,
        aiFileId: "file-1",
        limit: 2,
        cursor,
      }),
    ).rejects.toMatchObject({ code: "invalidCursor", httpStatusCode: 400 })
    expect(mockListChunks).not.toHaveBeenCalled()
  })

  const row = (id: string, chunkIndex: number | null) => ({
    id,
    content: id,
    status: "success",
    createdAt: new Date("2026-10-24T00:00:00.000Z"),
    chunkIndex,
  })
  const decode = (cursor: string | null) =>
    JSON.parse(Buffer.from(cursor ?? "", "base64url").toString("utf8"))

  test("returns an opaque nextCursor only when another page exists", async () => {
    mockListChunks.mockResolvedValueOnce([
      row("11", 0),
      row("12", 1),
      row("13", 2),
    ])
    const firstPage = await aiFileService.listChunks({
      workspaceId,
      aiFileId: "file-1",
      limit: 2,
    })
    expect(firstPage.data.map((chunk) => chunk.id)).toEqual(["11", "12"])
    expect(decode(firstPage.nextCursor)).toEqual({ i: 1, id: "12" })

    mockListChunks.mockResolvedValueOnce([row("13", 2)])
    const lastPage = await aiFileService.listChunks({
      workspaceId,
      aiFileId: "file-1",
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    })
    expect(lastPage.nextCursor).toBeNull()
    expect(mockListChunks).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { chunkIndex: 1, id: "12" } }),
    )
  })

  test("encodes a null position for unnumbered rows", async () => {
    mockListChunks.mockResolvedValueOnce([
      row("21", null),
      row("22", null),
      row("23", null),
    ])

    const page = await aiFileService.listChunks({
      workspaceId,
      aiFileId: "file-1",
      limit: 2,
    })

    expect(decode(page.nextCursor)).toEqual({ i: null, id: "22" })
    expect(page.data[0]?.chunkIndex).toBeNull()
  })

  test("passes fromChunkIndex to the first page", async () => {
    mockListChunks.mockResolvedValueOnce([])

    await aiFileService.listChunks({
      workspaceId,
      aiFileId: "file-1",
      limit: 2,
      fromChunkIndex: 7,
    })

    expect(mockListChunks).toHaveBeenCalledWith(
      expect.objectContaining({ fromChunkIndex: 7, cursor: undefined }),
    )
  })
})

describe("aiFileService.findChunksContaining", () => {
  test("escapes LIKE wildcards and scopes to files of the workspace", async () => {
    mockFindManyAiFile.mockResolvedValueOnce([
      { id: "1", name: "a.xlsx" },
    ] as never)
    mockFindChunksContaining.mockResolvedValueOnce([
      { id: "c1", aiFileId: "1", chunkIndex: 3 },
    ])

    const matches = await aiFileService.findChunksContaining({
      workspaceId,
      fileIds: ["1", "9"],
      text: "50%_off\\",
    })

    expect(mockFindChunksContaining).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        fileIds: ["1"],
        pattern: "%50\\%\\_off\\\\%",
      }),
    )
    expect(matches).toEqual([
      { chunkId: "c1", fileId: "1", fileName: "a.xlsx", chunkIndex: 3 },
    ])
  })

  test("returns nothing without querying when no file belongs to the workspace", async () => {
    mockFindManyAiFile.mockResolvedValueOnce([])

    await expect(
      aiFileService.findChunksContaining({
        workspaceId,
        fileIds: ["9"],
        text: "x",
      }),
    ).resolves.toEqual([])
    expect(mockFindChunksContaining).not.toHaveBeenCalled()
  })

  test("returns nothing for blank text", async () => {
    mockFindManyAiFile.mockResolvedValueOnce([{ id: "1", name: "a" }] as never)

    await expect(
      aiFileService.findChunksContaining({
        workspaceId,
        fileIds: ["1"],
        text: "   ",
      }),
    ).resolves.toEqual([])
    expect(mockFindChunksContaining).not.toHaveBeenCalled()
  })
})

describe("aiFileService.findManyByIds", () => {
  test("drops ids that are not numeric before querying", async () => {
    mockFindManyAiFile.mockResolvedValueOnce([])

    await aiFileService.findManyByIds({ workspaceId, ids: ["1", "abc", "2"] })

    expect(mockFindManyAiFile).toHaveBeenCalledWith({
      where: { workspaceId, id: { in: ["1", "2"] } },
    })
  })

  test("does not query when no id is numeric", async () => {
    await expect(
      aiFileService.findManyByIds({ workspaceId, ids: ["abc"] }),
    ).resolves.toEqual([])
    expect(mockFindManyAiFile).not.toHaveBeenCalled()
  })
})

describe("aiFileService.markProcessingRunFailed", () => {
  test("rejects an unknown error code without writing", async () => {
    await expect(
      aiFileService.markProcessingRunFailed({
        aiFileId: "file-1",
        workspaceId,
        runId: "run-1",
        code: "boom" as never,
      }),
    ).rejects.toThrow()
    expect(mockFinishProcessingRun).not.toHaveBeenCalled()
  })
})

describe("aiFileService.findWithProcessing chunking parameters and positions", () => {
  const stored = (overrides: Record<string, unknown>) => ({
    id: "file-1",
    path: "p",
    workspaceId,
    chunking: null,
    chunkingConfig: null,
    processingRun: null,
    aiEmbeddings: [],
    ...overrides,
  })

  test("reports the defaults when nothing is stored", async () => {
    mockFindFirstAiFile.mockResolvedValueOnce(stored({}))

    const file = await aiFileService.findWithProcessing({
      where: { id: "file-1", workspaceId },
    })

    expect(file?.chunkingConfig).toEqual({
      strategy: "auto",
      chunkSize: 1000,
      overlapSize: 200,
      tabularHeaderRow: 1,
      isDefault: true,
    })
  })

  test("reports stored parameters merged with the defaults", async () => {
    mockFindFirstAiFile.mockResolvedValueOnce(
      stored({ chunkingConfig: { chunkSize: 500 } }),
    )

    const file = await aiFileService.findWithProcessing({
      where: { id: "file-1", workspaceId },
    })

    expect(file?.chunkingConfig).toMatchObject({
      chunkSize: 500,
      overlapSize: 200,
      isDefault: false,
    })
  })

  test.each([
    ["no chunks", [], false],
    [
      "every chunk numbered",
      [{ id: "1", status: "success", chunkIndex: 0 }],
      false,
    ],
    [
      "some chunks unnumbered",
      [
        { id: "1", status: "success", chunkIndex: 0 },
        { id: "2", status: "success", chunkIndex: null },
      ],
      true,
    ],
    [
      "all chunks unnumbered",
      [{ id: "1", status: "success", chunkIndex: null }],
      true,
    ],
  ])("indexOutdated with %s", async (_label, aiEmbeddings, expected) => {
    mockFindFirstAiFile.mockResolvedValueOnce(stored({ aiEmbeddings }))

    const file = await aiFileService.findWithProcessing({
      where: { id: "file-1", workspaceId },
    })

    expect(file?.indexOutdated).toBe(expected)
  })
})

describe("aiFileService.findWithProcessing derived fields", () => {
  const chunking = (strategy: string, chunkerVersion: number) => ({
    strategy,
    chunkerVersion,
    chunkSize: 1000,
    overlapSize: 0,
    chunkCount: 1,
    processedAt: "2026-10-24T00:00:00.000Z",
  })
  const embedding = [{ id: "e1", status: "success" }]

  test.each([
    ["no metadata but chunks exist", null, embedding, true],
    ["no metadata and no chunks", null, [], false],
    ["an older chunker version", chunking("tabular", 1), embedding, true],
    ["the current chunker version", chunking("prose", 1), embedding, false],
    ["malformed metadata", { strategy: "tabular" }, embedding, true],
  ])("chunkingOutdated with %s", async (_label, stored, aiEmbeddings, expected) => {
    mockFindFirstAiFile.mockResolvedValueOnce({
      id: "file-1",
      path: "p",
      workspaceId,
      chunking: stored,
      processingRun: null,
      aiEmbeddings,
    })

    const file = await aiFileService.findWithProcessing({
      where: { id: "file-1", workspaceId },
    })

    expect(file?.chunkingOutdated).toBe(expected)
  })

  describe("processingRun.stale", () => {
    const NOW = new Date("2026-10-24T12:00:00.000Z")
    const HOUR = 60 * 60 * 1000
    const iso = (offsetMs: number) =>
      new Date(NOW.getTime() + offsetMs).toISOString()

    const readRun = async (run: Record<string, unknown>) => {
      mockFindFirstAiFile.mockResolvedValueOnce({
        id: "file-1",
        path: "p",
        workspaceId,
        chunking: null,
        processingRun: {
          id: "run-1",
          status: "processing",
          error: null,
          queuedAt: iso(-3 * HOUR),
          startedAt: null,
          heartbeatAt: null,
          finishedAt: null,
          ...run,
        },
        aiEmbeddings: [],
      })
      const file = await aiFileService.findWithProcessing({
        where: { id: "file-1", workspaceId },
      })
      return file?.processingRun
    }

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test("uses heartbeatAt when present", async () => {
      expect((await readRun({ heartbeatAt: iso(-HOUR + 1) }))?.stale).toBe(
        false,
      )
      expect((await readRun({ heartbeatAt: iso(-HOUR - 1) }))?.stale).toBe(true)
    })

    test("falls back to queuedAt without a heartbeat", async () => {
      expect(
        (await readRun({ status: "queued", queuedAt: iso(-HOUR + 1) }))?.stale,
      ).toBe(false)
      expect(
        (await readRun({ status: "queued", queuedAt: iso(-HOUR - 1) }))?.stale,
      ).toBe(true)
    })

    test("is never stale once finished", async () => {
      expect(
        (await readRun({ status: "success", finishedAt: iso(-2 * HOUR) }))
          ?.stale,
      ).toBe(false)
    })

    test("reads malformed jsonb as null with a warning", async () => {
      expect(await readRun({ status: "unknown-status" })).toBeNull()
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { aiFileId: "file-1" },
        "Invalid AI file processing run",
      )
    })
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

  test("is refused for a file a template installed with deletion disallowed", async () => {
    mockAssertDeletable.mockRejectedValueOnce(
      Object.assign(new Error("locked"), {
        code: "templateAllowDeleteViolation",
      }),
    )

    await expect(
      aiFileService.delete({ workspaceId, id: "file-1" }),
    ).rejects.toMatchObject({ code: "templateAllowDeleteViolation" })

    expect(mockAssertDeletable).toHaveBeenCalledWith({
      workspaceId,
      resourceKind: "aiFile",
      resourceIds: ["file-1"],
    })
    expect(mockDeleteObject).not.toHaveBeenCalled()
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

describe("aiFileService.markChunked", () => {
  const input = {
    aiFileId: "file-1",
    workspaceId,
    chunking: {
      strategy: "tabular" as const,
      chunkerVersion: 1,
      chunkSize: 1000,
      overlapSize: 0,
      chunkCount: 2,
      processedAt: "2026-10-24T00:00:00.000Z",
    },
  }

  test("validates then delegates the workspace-scoped update to the repository", async () => {
    await aiFileService.markChunked(input)

    expect(mockMarkChunked).toHaveBeenCalledWith(input)
  })

  test("rejects invalid metadata without calling the repository", async () => {
    await expect(
      aiFileService.markChunked({
        ...input,
        chunking: { ...input.chunking, processedAt: "not-an-iso-date" },
      }),
    ).rejects.toThrow()

    expect(mockMarkChunked).not.toHaveBeenCalled()
  })

  test("rejects unknown metadata fields without calling the repository", async () => {
    const withUnknownField = { ...input.chunking, unexpected: true }

    await expect(
      aiFileService.markChunked({ ...input, chunking: withUnknownField }),
    ).rejects.toThrow()

    expect(mockMarkChunked).not.toHaveBeenCalled()
  })
})
