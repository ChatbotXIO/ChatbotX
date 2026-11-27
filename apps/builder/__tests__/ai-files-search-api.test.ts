// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as RateLimitModule from "@/lib/rate-limit/api-rate-limit"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  rateLimitCounters,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  rateLimitCounters: new Map<string, number>(),
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

const searchAIFiles = vi.fn()
vi.mock("@chatbotx.io/ai/server", () => ({ searchAIFiles }))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

// The AI file buckets run for real against an in-memory store; every other
// bucket (the per-token request limit) stays out of the way.
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
const { apiIdempotencyMiddleware } = await import("@/middlewares/idempotency")
const { AI_FILES_SEARCH_TOKEN_PATH } = await import(
  "@/features/ai-files/lib/api-paths"
)

const authResult = (permission: "full" | "read_only" = "full") => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes: null },
})

const invoke = (
  procedure: unknown,
  input: unknown,
  resHeaders = new Headers(),
) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: {
      headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }),
      resHeaders,
    },
  })

const searchResponse = {
  mode: "files",
  results: [],
  appliedConfig: {
    provider: "openai",
    modelId: "text-embedding-ada-002",
    similarityThreshold: 0.7,
    agentDefaultThreshold: 0.7,
    agentMaxResults: 5,
    limit: 10,
  },
  files: [],
  diagnosis: "noMatches",
  expected: null,
  timingsMs: { embed: 1, search: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitCounters.clear()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  findWorkspaceByTokenHash.mockResolvedValue(authResult())
  searchAIFiles.mockResolvedValue(searchResponse)
  aiFileService.listChunks.mockResolvedValue({ data: [], nextCursor: null })
})

describe("aiFiles.search", () => {
  test("searches in the token's workspace", async () => {
    await expect(
      invoke(aiFilesPublicRouter.search, { query: "price", fileIds: ["1"] }),
    ).resolves.toMatchObject({ diagnosis: "noMatches" })
    expect(searchAIFiles).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      query: "price",
      fileIds: ["1"],
    })
  })

  test("forwards the expected text and returns the verdict", async () => {
    searchAIFiles.mockResolvedValue({
      ...searchResponse,
      expected: {
        verdict: "foundButLowRank",
        matches: [
          {
            fileId: "1",
            fileName: "a.xlsx",
            chunkId: "9",
            chunkIndex: 12,
            rank: null,
          },
        ],
      },
    })

    await expect(
      invoke(aiFilesPublicRouter.search, {
        query: "price",
        fileIds: ["1"],
        expectedText: "499.000",
      }),
    ).resolves.toMatchObject({ expected: { verdict: "foundButLowRank" } })
    expect(searchAIFiles).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      query: "price",
      fileIds: ["1"],
      expectedText: "499.000",
    })
  })

  test("rejects an expected text over 200 characters or blank", async () => {
    for (const expectedText of ["x".repeat(201), "   "]) {
      await expect(
        invoke(aiFilesPublicRouter.search, {
          query: "price",
          fileIds: ["1"],
          expectedText,
        }),
      ).rejects.toMatchObject({ code: "invalidRequestData" })
    }
    expect(searchAIFiles).not.toHaveBeenCalled()
  })

  test("returns chunk positions and agent visibility per result", async () => {
    searchAIFiles.mockResolvedValue({
      ...searchResponse,
      results: [
        {
          chunkId: "9",
          fileId: "1",
          fileName: "a.xlsx",
          chunkIndex: 12,
          content: "Pro: 499.000",
          similarity: 0.8,
          rank: 1,
          passedThreshold: true,
          usedByAgent: null,
          agentVisible: true,
        },
      ],
    })

    await expect(
      invoke(aiFilesPublicRouter.search, { query: "price", fileIds: ["1"] }),
    ).resolves.toMatchObject({
      results: [{ chunkIndex: 12, agentVisible: true, usedByAgent: null }],
    })
  })

  test("rejects a request with both or neither of agentId and fileIds", async () => {
    await expect(
      invoke(aiFilesPublicRouter.search, { query: "price" }),
    ).rejects.toMatchObject({ code: "invalidRequestData" })
    await expect(
      invoke(aiFilesPublicRouter.search, {
        query: "price",
        agentId: "1",
        fileIds: ["1"],
      }),
    ).rejects.toMatchObject({ code: "invalidRequestData" })
    expect(searchAIFiles).not.toHaveBeenCalled()
  })

  test("a read_only token cannot search (each call spends an embedding)", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    await expect(
      invoke(aiFilesPublicRouter.search, { query: "price", fileIds: ["1"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(searchAIFiles).not.toHaveBeenCalled()
  })

  test("a read_only token can still list chunks", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult("read_only"))

    await expect(
      invoke(aiFilesPublicRouter.listChunks, { id: "1" }),
    ).resolves.toEqual({ data: [], nextCursor: null })
    expect(aiFileService.listChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "1",
        workspaceId: "ws-1",
        limit: 50,
      }),
    )
  })

  test("listChunks forwards fromChunkIndex and returns positions", async () => {
    aiFileService.listChunks.mockResolvedValue({
      data: [
        {
          id: "9",
          chunkIndex: 12,
          content: "c",
          status: "success",
          createdAt: new Date("2026-10-24T00:00:00.000Z"),
        },
      ],
      nextCursor: null,
    })

    await expect(
      invoke(aiFilesPublicRouter.listChunks, { id: "1", fromChunkIndex: 10 }),
    ).resolves.toMatchObject({ data: [{ chunkIndex: 12 }] })
    expect(aiFileService.listChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        aiFileId: "1",
        workspaceId: "ws-1",
        fromChunkIndex: 10,
      }),
    )
  })

  test("the sixth search in a window is rate limited before embedding", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await invoke(aiFilesPublicRouter.search, { query: "q", fileIds: ["1"] })
    }
    const resHeaders = new Headers()

    await expect(
      invoke(
        aiFilesPublicRouter.search,
        { query: "q", fileIds: ["1"] },
        resHeaders,
      ),
    ).rejects.toMatchObject({ status: 429 })
    expect(resHeaders.get("Retry-After")).toBe("10")
    expect(searchAIFiles).toHaveBeenCalledTimes(5)
  })

  test("is exempt from idempotency replay", async () => {
    const next = vi.fn().mockResolvedValue({ output: searchResponse })
    const resHeaders = new Headers()
    const middleware = apiIdempotencyMiddleware as unknown as (
      options: unknown,
      input: unknown,
      output: unknown,
    ) => Promise<unknown>

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await middleware(
        {
          context: {
            headers: new Headers({ "Idempotency-Key": "key-1" }),
            resHeaders,
            apiCredentialId: "api-token:1",
          },
          next,
          path: ["aiFiles", "search"],
          procedure: {
            "~orpc": {
              route: { method: "POST", path: AI_FILES_SEARCH_TOKEN_PATH },
            },
          },
        },
        { query: "q", fileIds: ["1"] },
        vi.fn(),
      )
    }

    expect(next).toHaveBeenCalledTimes(2)
    expect(resHeaders.get("Idempotent-Replayed")).toBeNull()
  })

  test("is registered at the path the idempotency exemption names", () => {
    expect(
      (
        aiFilesPublicRouter.search as unknown as {
          "~orpc": { route: { path: string } }
        }
      )["~orpc"].route.path,
    ).toBe(AI_FILES_SEARCH_TOKEN_PATH)
  })
})
