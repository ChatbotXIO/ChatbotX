// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import type * as RedisModule from "@chatbotx.io/redis"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as RateLimitModule from "@/lib/rate-limit/api-rate-limit"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  rateLimitCounters,
  idempotencyRecords,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  rateLimitCounters: new Map<string, number>(),
  idempotencyRecords: new Map<string, Record<string, unknown>>(),
}))

const aiFileService = {
  listAIFiles: vi.fn(),
  findWithProcessing: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  listChunks: vi.fn(),
  reindex: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  aiFileService,
  AI_FILE_MAX_UPLOAD_BYTES: 100 * 1000 * 1000,
}))

// In-memory idempotency store with the casStore contract, so a replay goes
// through the real middleware.
vi.mock("@chatbotx.io/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof RedisModule>()
  const matches = (
    current: Record<string, unknown> | undefined,
    expected: Record<string, unknown> | null,
  ) =>
    Boolean(current && expected) &&
    Object.entries(expected ?? {}).every(
      ([field, value]) => current?.[field] === value,
    )
  return {
    ...actual,
    casStore: {
      setIfAbsent: (key: string, value: Record<string, unknown>) => {
        if (idempotencyRecords.has(key)) {
          return Promise.resolve(false)
        }
        idempotencyRecords.set(key, value)
        return Promise.resolve(true)
      },
      getJson: (key: string) =>
        Promise.resolve(idempotencyRecords.get(key) ?? null),
      compareAndDelete: (key: string, expected: Record<string, unknown>) => {
        if (!matches(idempotencyRecords.get(key), expected)) {
          return Promise.resolve(false)
        }
        idempotencyRecords.delete(key)
        return Promise.resolve(true)
      },
      compareAndSwap: (
        key: string,
        expected: Record<string, unknown> | null,
        next: Record<string, unknown>,
      ) => {
        if (!matches(idempotencyRecords.get(key), expected)) {
          return Promise.resolve(false)
        }
        idempotencyRecords.set(key, next)
        return Promise.resolve(true)
      },
    },
  }
})

vi.mock("@chatbotx.io/ai/server", () => ({ searchAIFiles: vi.fn() }))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `translated:${key}`,
}))

vi.mock("@/lib/rate-limit/api-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof RateLimitModule>()
  const store = {
    incrWithWindow: (key: string) => {
      const next = (rateLimitCounters.get(key) ?? 0) + 1
      rateLimitCounters.set(key, next)
      return Promise.resolve(next)
    },
  }
  return {
    ...actual,
    assertApiNotRateLimited: (
      props: Parameters<typeof actual.assertApiNotRateLimited>[0],
    ) =>
      props.scope.startsWith("ai-file-")
        ? actual.assertApiNotRateLimited({ ...props, store, now: 0 })
        : Promise.resolve(),
  }
})

const { call } = await import("@orpc/server")
const { aiFilesPublicRouter } = await import(
  "../src/features/ai-files/api/public"
)
const { assertAIFileActionNotRateLimited } = await import(
  "../src/features/ai-files/lib/rate-limit"
)

const authResult = (permission: "full" | "read_only" = "full") => ({
  workspace: { id: "10", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes: null },
})

const invoke = (
  procedure: unknown,
  input: unknown,
  options: { resHeaders?: Headers; idempotencyKey?: string } = {},
) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: {
      headers: new Headers({
        Authorization: "Bearer cbx_ws_fixture",
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      }),
      resHeaders: options.resHeaders ?? new Headers(),
    },
  })

const routeOf = (procedure: unknown) =>
  (procedure as { "~orpc": { route: { successStatus?: number } } })["~orpc"]
    .route

const run = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  status: "queued",
  error: null,
  queuedAt: "2026-10-24T00:00:00.000Z",
  startedAt: null,
  heartbeatAt: null,
  finishedAt: null,
  stale: false,
  ...overrides,
})

const file = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  name: "prices.csv",
  path: "workspaces/10/ai-files/1",
  size: 10,
  mimeType: "text/csv",
  workspaceId: "10",
  chunking: null,
  chunkingConfig: {
    strategy: "auto",
    chunkSize: 1000,
    overlapSize: 200,
    tabularHeaderRow: 1,
    isDefault: true,
  },
  chunkingOutdated: true,
  indexOutdated: false,
  processingRun: run(),
  createdAt: new Date("2026-10-24T00:00:00.000Z"),
  updatedAt: new Date("2026-10-24T00:00:00.000Z"),
  url: "https://files.example.com/prices.csv",
  chunksCount: 3,
  processingStatus: "success",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitCounters.clear()
  idempotencyRecords.clear()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  findWorkspaceByTokenHash.mockResolvedValue(authResult())
  aiFileService.reindex.mockResolvedValue({ file: file(), coalesced: false })
})

describe("aiFiles.reindex", () => {
  test("answers 202 with the new run", async () => {
    expect(routeOf(aiFilesPublicRouter.reindex).successStatus).toBe(202)

    await expect(
      invoke(aiFilesPublicRouter.reindex, { id: "1" }),
    ).resolves.toMatchObject({
      id: "1",
      coalesced: false,
      processingRun: { status: "queued", stale: false },
    })
    expect(aiFileService.reindex).toHaveBeenCalledWith({
      workspaceId: "10",
      id: "1",
    })
  })

  test("passes the chunking parameters through, and null to reset them", async () => {
    await invoke(aiFilesPublicRouter.reindex, {
      id: "1",
      chunkingConfig: { chunkSize: 500, overlapSize: 0, tabularHeaderRow: 3 },
    })
    expect(aiFileService.reindex).toHaveBeenLastCalledWith({
      workspaceId: "10",
      id: "1",
      chunkingConfig: { chunkSize: 500, overlapSize: 0, tabularHeaderRow: 3 },
    })

    await invoke(aiFilesPublicRouter.reindex, { id: "1", chunkingConfig: null })
    expect(aiFileService.reindex).toHaveBeenLastCalledWith({
      workspaceId: "10",
      id: "1",
      chunkingConfig: null,
    })
  })

  test.each([
    [{ chunkSize: 100 }],
    [{ chunkSize: 2001 }],
    [{ chunkSize: 5000 }],
    [{ overlapSize: 900 }],
    [{ tabularHeaderRow: 0 }],
    [{ strategy: "markdown" }],
    [{ unknown: true }],
  ])("rejects chunking parameters %j before reindexing", async (chunkingConfig) => {
    await expect(
      invoke(aiFilesPublicRouter.reindex, { id: "1", chunkingConfig }),
    ).rejects.toMatchObject({ code: "invalidRequestData" })
    expect(aiFileService.reindex).not.toHaveBeenCalled()
  })

  test("answers 409 when parameters meet an active run", async () => {
    aiFileService.reindex.mockRejectedValue(
      new ChatbotXException("busy", "conflict", 409),
    )

    await expect(
      invoke(aiFilesPublicRouter.reindex, {
        id: "1",
        chunkingConfig: { chunkSize: 500 },
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  test("reports a coalesced run without hiding the existing one", async () => {
    aiFileService.reindex.mockResolvedValue({
      file: file({ processingRun: run({ status: "processing" }) }),
      coalesced: true,
    })

    await expect(
      invoke(aiFilesPublicRouter.reindex, { id: "1" }),
    ).resolves.toMatchObject({
      coalesced: true,
      processingRun: { status: "processing" },
    })
  })

  test("a read_only token cannot reindex", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    await expect(
      invoke(aiFilesPublicRouter.reindex, { id: "1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(aiFileService.reindex).not.toHaveBeenCalled()
  })

  test("rejects a non-numeric id before reaching the service", async () => {
    await expect(
      invoke(aiFilesPublicRouter.reindex, { id: "abc" }),
    ).rejects.toMatchObject({ code: "invalidRequestData" })
    expect(aiFileService.reindex).not.toHaveBeenCalled()
  })

  test("the sixth reindex in a window is rate limited", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await invoke(aiFilesPublicRouter.reindex, { id: "1" })
    }
    const resHeaders = new Headers()

    await expect(
      invoke(aiFilesPublicRouter.reindex, { id: "1" }, { resHeaders }),
    ).rejects.toMatchObject({ status: 429 })
    expect(resHeaders.get("Retry-After")).toBe("10")
    expect(aiFileService.reindex).toHaveBeenCalledTimes(5)
  })
})

describe("server actions share the AI file buckets", () => {
  test.each([
    "search",
    "reindex",
  ] as const)("the sixth %s action call is rate limited with a translated message", async (operation) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assertAIFileActionNotRateLimited(operation, "10")
    }

    await expect(
      assertAIFileActionNotRateLimited(operation, "10"),
    ).rejects.toMatchObject({
      code: "tooManyRequests",
      httpStatusCode: 429,
      message:
        operation === "search"
          ? "translated:aiFiles.testQuery.rateLimited"
          : "translated:aiFiles.reindex.rateLimited",
    })
  })

  test("the public API and the action draw from the same bucket", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await invoke(aiFilesPublicRouter.reindex, { id: "1" })
    }

    await expect(
      assertAIFileActionNotRateLimited("reindex", "10"),
    ).rejects.toMatchObject({ code: "tooManyRequests" })
  })
})

describe("aiFiles.create when processing could not be queued", () => {
  const enqueueFailed = file({
    chunksCount: 0,
    chunkingOutdated: false,
    processingStatus: "pending",
    processingRun: run({
      status: "error",
      error: "enqueueFailed",
      finishedAt: "2026-10-24T00:00:01.000Z",
    }),
  })

  test("still answers 201 with the failed run so the caller can reindex", async () => {
    aiFileService.create.mockResolvedValue(enqueueFailed)
    expect(routeOf(aiFilesPublicRouter.create).successStatus).toBe(201)

    await expect(
      invoke(aiFilesPublicRouter.create, {
        url: "https://example.com/prices.csv",
      }),
    ).resolves.toMatchObject({
      id: "1",
      processingRun: { status: "error", error: "enqueueFailed" },
    })
  })

  test("a retry with the same Idempotency-Key replays the same file", async () => {
    aiFileService.create.mockResolvedValue(enqueueFailed)
    const input = { url: "https://example.com/prices.csv" }

    const first = await invoke(aiFilesPublicRouter.create, input, {
      idempotencyKey: "upload-1",
    })
    const resHeaders = new Headers()
    const second = await invoke(aiFilesPublicRouter.create, input, {
      idempotencyKey: "upload-1",
      resHeaders,
    })

    expect(aiFileService.create).toHaveBeenCalledOnce()
    expect(resHeaders.get("Idempotent-Replayed")).toBe("true")
    expect(second).toMatchObject({ id: (first as { id: string }).id })
  })
})
