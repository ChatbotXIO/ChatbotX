import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock function references so they are available inside vi.mock factories
// (vi.mock calls are hoisted to the top of the file by Vitest)
// ---------------------------------------------------------------------------

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbExecute,
  mockCreateMessageRepository,
  mockFindAttachmentById,
  mockUpdateAttachment,
  mockEqFn,
  mockAndFn,
  mockBuildContext,
  mockGetWhatsappClient,
  mockPutObject,
  mockRetrieveMedia,
  mockCreateId,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbExecute: vi.fn(),
  mockCreateMessageRepository: vi.fn(),
  mockFindAttachmentById: vi.fn(),
  mockUpdateAttachment: vi.fn(),
  mockEqFn: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  mockAndFn: vi.fn((...args: unknown[]) => ({ __and: args })),
  mockBuildContext: vi.fn(),
  mockGetWhatsappClient: vi.fn(),
  mockPutObject: vi.fn(),
  mockRetrieveMedia: vi.fn(),
  mockCreateId: vi.fn(() => "new-storage-id"),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    execute: mockDbExecute,
  },
  eq: mockEqFn,
  and: mockAndFn,
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    {
      identifier: (s: string) => ({ __identifier: s }),
      raw: (s: string) => s,
    },
  ),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  attachmentModel: {
    id: "id",
    workspaceId: "workspaceId",
    originPath: "originPath",
    mimeType: "mimeType",
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mockBuildContext,
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {
    constructor(message: string) {
      super(message)
      this.name = "SdkException"
    }
  },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: mockCreateId,
  }
})

vi.mock("image-size", () => ({
  default: vi.fn(() => ({ width: 100, height: 200 })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Import the handler AFTER mocks
// ---------------------------------------------------------------------------

import { coexistAttachmentDownload } from "../src/integration/handlers/coexist/attachment-download"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DATA = {
  attachmentId: "att-001",
  workspaceId: "ws-100",
  channel: "messenger" as const,
  integrationId: "int-001",
}

const WA_DATA = {
  ...BASE_DATA,
  channel: "whatsapp" as const,
}

const FAKE_INTEGRATION_ROW = {
  id: "int-001",
  inboxId: "inbox-001",
  auth: { tokens: { accessToken: "token-abc" } },
}

const fakeCtx = {
  auth: { tokens: { accessToken: "token-abc" } },
  storagePrefix: "workspace/ws-100",
  uploader: { putObject: mockPutObject },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wires the repository attachment lookup.
 * Call wireSelectChain(null) to simulate "no row found".
 */
const wireSelectChain = (row: Record<string, unknown> | null) => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockResolvedValue(row ? [row] : [])
  mockDbSelect.mockReturnValue(chain)
  mockFindAttachmentById.mockResolvedValue(
    row ? { createdAt: new Date("2026-01-01T00:00:00Z"), ...row } : null,
  )
  return chain
}

/** Wires the repository update used to persist final state. */
const wireUpdateChain = () => {
  mockDbUpdate.mockImplementation(() => {
    const chain = { set: vi.fn() }
    const whereChain = { where: vi.fn().mockResolvedValue(undefined) }
    chain.set.mockReturnValue(whereChain)
    return chain
  })
  mockUpdateAttachment.mockResolvedValue(undefined)
}

/** Wires db.execute() to return the integration row. */
const wireExecute = (
  row: Record<string, unknown> | null = FAKE_INTEGRATION_ROW,
) => {
  mockDbExecute.mockResolvedValue({ rows: row ? [row] : [] })
}

/**
 * Creates a minimal fetch Response mock with a streaming body. The handler
 * reads `response.body` via a reader and caps cumulative bytes, so the mock
 * emits `totalBytes` across `chunkSize`-sized chunks.
 */
const makeFetchResponse = (opts: {
  ok?: boolean
  hasBody?: boolean
  contentType?: string
  contentLength?: string
  totalBytes?: number
  chunkSize?: number
}) => {
  const total = opts.totalBytes ?? 100
  const chunkSize = opts.chunkSize ?? 1024 * 1024
  const hasBody = opts.hasBody ?? true
  const body = hasBody
    ? new ReadableStream<Uint8Array>({
        start(controller) {
          let emitted = 0
          while (emitted < total) {
            const size = Math.min(chunkSize, total - emitted)
            controller.enqueue(new Uint8Array(size))
            emitted += size
          }
          controller.close()
        },
      })
    : null
  return {
    ok: opts.ok ?? true,
    body,
    status: 200,
    statusText: "OK",
    headers: {
      get: (key: string) => {
        if (key === "content-type") {
          return opts.contentType ?? "image/jpeg"
        }
        if (key === "content-length") {
          return opts.contentLength ?? null
        }
        return null
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("coexistAttachmentDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMessageRepository.mockResolvedValue({
      findAttachmentById: mockFindAttachmentById,
      updateAttachment: mockUpdateAttachment,
    })
    wireUpdateChain()
    mockPutObject.mockResolvedValue(undefined)
    mockBuildContext.mockResolvedValue(fakeCtx)
    mockRetrieveMedia.mockResolvedValue({
      url: "https://example.com/media/123",
      mime_type: "image/jpeg",
    })
    mockGetWhatsappClient.mockReturnValue({ retrieveMedia: mockRetrieveMedia })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY: cross-workspace IDOR
  // ─────────────────────────────────────────────────────────────────────────

  it("skips attachment from another workspace (no row returned for mismatched workspaceId)", async () => {
    // Simulate SELECT returns empty when workspaceId predicate is applied
    wireSelectChain(null)

    await coexistAttachmentDownload(BASE_DATA)

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: BASE_DATA.attachmentId }),
      expect.stringContaining("row missing — skip"),
    )
    // Must NOT download or upload anything
    expect(mockDbExecute).not.toHaveBeenCalled()
    expect(mockPutObject).not.toHaveBeenCalled()
  })

  it("passes both id and workspaceId to the repository lookup", async () => {
    wireSelectChain(null) // return empty so handler stops early — we just check lookup args

    await coexistAttachmentDownload(BASE_DATA)

    expect(mockFindAttachmentById).toHaveBeenCalledWith({
      id: BASE_DATA.attachmentId,
      workspaceId: BASE_DATA.workspaceId,
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY: timeout
  // ─────────────────────────────────────────────────────────────────────────

  it("aborts when fetch exceeds timeout — signal is an AbortSignal passed to fetch", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "https://example.com/media/file.jpg",
      mimeType: "image/jpeg",
    })
    wireExecute()

    let capturedSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined
      // Simulate an AbortError (as if AbortSignal.timeout fired)
      const err = new DOMException("The operation was aborted.", "AbortError")
      return Promise.reject(err)
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(coexistAttachmentDownload(BASE_DATA)).rejects.toThrow()

    // The signal must be an AbortSignal — proves timeout wiring
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    // No upload must have happened
    expect(mockPutObject).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("aborts when WhatsApp fetch exceeds timeout — signal is an AbortSignal", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "wa-media:media-id-xyz",
      mimeType: "image/jpeg",
    })
    wireExecute()

    let capturedSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined
      const err = new DOMException("The operation was aborted.", "AbortError")
      return Promise.reject(err)
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(coexistAttachmentDownload(WA_DATA)).rejects.toThrow()

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(mockPutObject).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY: size cap
  // ─────────────────────────────────────────────────────────────────────────

  it("rejects Messenger response with content-length exceeding MAX_ATTACHMENT_BYTES", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "https://example.com/media/huge.mp4",
      mimeType: "video/mp4",
    })
    wireExecute()

    const OVER_LIMIT = String(51 * 1024 * 1024) // 51 MB
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeFetchResponse({ contentLength: OVER_LIMIT })),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(coexistAttachmentDownload(BASE_DATA)).rejects.toThrow()
    expect(mockPutObject).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("rejects Messenger response whose body bytes exceed MAX_ATTACHMENT_BYTES (no content-length)", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "https://example.com/media/huge.mp4",
      mimeType: "video/mp4",
    })
    wireExecute()

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeFetchResponse({
          contentLength: undefined, // no header — must be caught by streaming cap
          totalBytes: 51 * 1024 * 1024, // 51 MB streamed
        }),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(coexistAttachmentDownload(BASE_DATA)).rejects.toThrow()
    expect(mockPutObject).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("rejects WhatsApp response with content-length exceeding MAX_ATTACHMENT_BYTES", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "wa-media:media-id-xyz",
      mimeType: "video/mp4",
    })
    wireExecute()

    const OVER_LIMIT = String(51 * 1024 * 1024)
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeFetchResponse({ contentLength: OVER_LIMIT })),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(coexistAttachmentDownload(WA_DATA)).rejects.toThrow()
    expect(mockPutObject).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // REGRESSION: happy path still works after all fixes
  // ─────────────────────────────────────────────────────────────────────────

  it("happy path: Messenger attachment downloads and uploads successfully", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "https://example.com/media/photo.jpg",
      mimeType: "image/jpeg",
    })
    wireExecute()

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeFetchResponse({
          contentType: "image/jpeg",
          contentLength: String(1024),
          totalBytes: 1024,
        }),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await coexistAttachmentDownload(BASE_DATA)

    expect(mockPutObject).toHaveBeenCalledOnce()
    expect(mockUpdateAttachment).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("happy path: WhatsApp attachment downloads and uploads successfully", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "wa-media:media-id-xyz",
      mimeType: "image/jpeg",
    })
    wireExecute()

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeFetchResponse({
          contentType: "image/jpeg",
          contentLength: String(2048),
          totalBytes: 2048,
        }),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await coexistAttachmentDownload(WA_DATA)

    expect(mockPutObject).toHaveBeenCalledOnce()
    expect(mockUpdateAttachment).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it("no-op when originPath is already a finalized S3 path", async () => {
    wireSelectChain({
      id: "att-001",
      originPath: "workspace/ws-100/already-uploaded-id",
      mimeType: "image/jpeg",
    })

    await coexistAttachmentDownload(BASE_DATA)

    expect(mockDbExecute).not.toHaveBeenCalled()
    expect(mockPutObject).not.toHaveBeenCalled()
  })
})
