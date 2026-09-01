import { beforeEach, describe, expect, test, vi } from "vitest"

const TOKEN_CAP_ERROR_PATTERN = /maximum/

const findByTokenHash = vi.fn(
  async (): Promise<{
    id: string
    workspaceId: string
    permission: string
  } | null> => null,
)
const listByWorkspaceId = vi.fn(async () => [] as unknown[])
const countByWorkspaceId = vi.fn(async (): Promise<number> => 0)
const deleteByIdForWorkspace = vi.fn(async (): Promise<boolean> => false)
const insert = vi.fn(async () => ({
  id: "t-1",
  workspaceId: "ws-1",
  name: "My token",
  permission: "full",
  tokenHash: "hash",
  tokenPrefix: "cbx_ws_abcd",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceApiTokenRepository: {
    findByTokenHash,
    listByWorkspaceId,
    countByWorkspaceId,
    deleteByIdForWorkspace,
    insert,
  },
}))

const db = {}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
}))

// The token lookup is cached with a 5-minute TTL and workspace-scoped tag
// invalidation on delete — see the comment above
// WORKSPACE_API_TOKEN_CACHE_TTL_SECONDS in the service. withCache is mocked
// to just call through so most tests exercise the underlying repository call
// directly; tests below assert the withCache wiring itself.
const invalidateCacheByTags = vi.fn(async () => undefined)
const withCache = vi.fn(
  async (_key: string, fn: () => unknown, _options?: unknown) => fn(),
)
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
  withCache,
}))

const dispatchAuditRecord = vi.fn(async () => undefined)
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
vi.mock("../src/logger", () => ({ logger }))

const workspaceService = {
  findById: vi.fn(async () => ({ id: "ws-1", name: "Acme" })),
}
vi.mock("../src/workspace/service", () => ({ workspaceService }))

const {
  workspaceApiTokenService,
  workspaceApiTokenCacheTag,
  MAX_WORKSPACE_API_TOKENS,
} = await import("../src/workspace-api-token/service")

const TOKEN_HASH = "a".repeat(64)

beforeEach(() => {
  vi.clearAllMocks()
  findByTokenHash.mockResolvedValue(null)
  countByWorkspaceId.mockResolvedValue(0)
  deleteByIdForWorkspace.mockResolvedValue(false)
  workspaceService.findById.mockResolvedValue({ id: "ws-1", name: "Acme" })
  invalidateCacheByTags.mockResolvedValue(undefined)
  withCache.mockImplementation(
    async (_key: string, fn: () => unknown, _options?: unknown) => fn(),
  )
})

describe("workspaceApiTokenService.findWorkspaceByTokenHash", () => {
  test("resolves the workspace and token through the hash row", async () => {
    findByTokenHash.mockResolvedValue({
      id: "t-1",
      workspaceId: "ws-1",
      permission: "full",
    })

    const auth = await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH, db)
    expect(workspaceService.findById).toHaveBeenCalledWith({
      id: "ws-1",
      tx: db,
    })
    expect(auth).toEqual({
      workspace: { id: "ws-1", name: "Acme" },
      apiToken: { id: "t-1", workspaceId: "ws-1", permission: "full" },
    })
  })

  test("returns undefined when no row matches the hash", async () => {
    const auth = await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(auth).toBeUndefined()
    expect(workspaceService.findById).not.toHaveBeenCalled()
  })

  test("caches the token-row lookup with a workspace-scoped tag and TTL", async () => {
    findByTokenHash.mockResolvedValue({
      id: "t-1",
      workspaceId: "ws-1",
      permission: "full",
    })

    await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(withCache).toHaveBeenCalledWith(
      `workspace-api-tokens:hash:${TOKEN_HASH}`,
      expect.any(Function),
      expect.objectContaining({
        ttl: 300,
        dynamicTags: expect.any(Function),
      }),
    )

    const options = withCache.mock.calls[0]?.[2] as {
      dynamicTags: (row: unknown) => string[] | undefined
    }
    expect(options.dynamicTags({ workspaceId: "ws-1" })).toEqual([
      workspaceApiTokenCacheTag("ws-1"),
    ])
    expect(options.dynamicTags(undefined)).toBeUndefined()
  })

  test("bypasses the cache when a caller-owned transaction is provided", async () => {
    findByTokenHash.mockResolvedValue({
      id: "t-1",
      workspaceId: "ws-1",
      permission: "full",
    })

    await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
      tx: db as never,
    })

    expect(withCache).not.toHaveBeenCalled()
    expect(findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH, db)
  })
})

describe("workspaceApiTokenService.listTokens", () => {
  test("lists tokens for the workspace", async () => {
    const rows = [{ id: "t-1" }]
    listByWorkspaceId.mockResolvedValue(rows)

    await expect(
      workspaceApiTokenService.listTokens({ workspaceId: "ws-1" }),
    ).resolves.toEqual(rows)
    expect(listByWorkspaceId).toHaveBeenCalledWith("ws-1", db)
  })
})

describe("workspaceApiTokenService.createToken", () => {
  test("creates a token and audits without leaking hash or plaintext", async () => {
    const result = await workspaceApiTokenService.createToken({
      workspaceId: "ws-1",
      name: "My token",
      permission: "full",
      tokenHash: TOKEN_HASH,
      tokenPrefix: "cbx_ws_abcd",
    })

    expect(insert).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        tokenHash: TOKEN_HASH,
        name: "My token",
        permission: "full",
        tokenPrefix: "cbx_ws_abcd",
      },
      db,
    )
    expect(result.id).toBe("t-1")
    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: 'created workspace API token "My token" (full)',
    })
    expect(JSON.stringify(dispatchAuditRecord.mock.calls)).not.toContain(
      TOKEN_HASH,
    )
  })

  test("throws when the workspace is at the token cap", async () => {
    countByWorkspaceId.mockResolvedValue(MAX_WORKSPACE_API_TOKENS)

    await expect(
      workspaceApiTokenService.createToken({
        workspaceId: "ws-1",
        name: "Overflow token",
        permission: "full",
        tokenHash: TOKEN_HASH,
        tokenPrefix: "cbx_ws_abcd",
      }),
    ).rejects.toThrow(TOKEN_CAP_ERROR_PATTERN)
    expect(insert).not.toHaveBeenCalled()
  })

  test("skips the audit when running inside a caller-owned transaction", async () => {
    await workspaceApiTokenService.createToken({
      workspaceId: "ws-1",
      name: "My token",
      permission: "full",
      tokenHash: TOKEN_HASH,
      tokenPrefix: "cbx_ws_abcd",
      tx: db as never,
    })

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("workspaceApiTokenService.deleteToken", () => {
  test("audits and invalidates the workspace's token cache tag when a row was actually deleted", async () => {
    deleteByIdForWorkspace.mockResolvedValue(true)

    await expect(
      workspaceApiTokenService.deleteToken({ workspaceId: "ws-1", id: "t-1" }),
    ).resolves.toBe(true)
    expect(deleteByIdForWorkspace).toHaveBeenCalledWith(
      { id: "t-1", workspaceId: "ws-1" },
      db,
    )
    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: 'deleted workspace API token "t-1"',
    })
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      workspaceApiTokenCacheTag("ws-1"),
    ])
  })

  test("does not audit or invalidate the cache when no row matched", async () => {
    deleteByIdForWorkspace.mockResolvedValue(false)

    await expect(
      workspaceApiTokenService.deleteToken({ workspaceId: "ws-1", id: "t-1" }),
    ).resolves.toBe(false)
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("does not throw when cache invalidation fails, and the delete still resolves", async () => {
    deleteByIdForWorkspace.mockResolvedValue(true)
    invalidateCacheByTags.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      workspaceApiTokenService.deleteToken({ workspaceId: "ws-1", id: "t-1" }),
    ).resolves.toBe(true)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: 'deleted workspace API token "t-1"',
    })
  })
})
