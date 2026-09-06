import { beforeEach, describe, expect, test, vi } from "vitest"

const TOKEN_CAP_ERROR_PATTERN = /maximum/
const ENCRYPTED_TEXT_PATTERN = /^enc\((.*)\)$/

const findByTokenHash = vi.fn(
  async (): Promise<{
    id: string
    workspaceId: string
    permission: string
  } | null> => null,
)
const listByWorkspaceId = vi.fn(async () => [] as unknown[])
const countByWorkspaceId = vi.fn(async (): Promise<number> => 0)
const lockWorkspaceTokens = vi.fn(async (): Promise<void> => undefined)
const deleteByIdForWorkspace = vi.fn(async (): Promise<boolean> => false)
const insert = vi.fn(async () => ({
  id: "t-1",
  workspaceId: "ws-1",
  name: "My token",
  permission: "full",
  tokenHash: "hash",
  tokenPrefix: "cbx_ws_abcd",
}))
const findDefaultByWorkspaceId = vi.fn(async (): Promise<unknown> => null)
const insertDefault = vi.fn(async (): Promise<unknown> => null)
const setEncryptedToken = vi.fn(async (): Promise<void> => undefined)

vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceApiTokenRepository: {
    findByTokenHash,
    listByWorkspaceId,
    countByWorkspaceId,
    lockWorkspaceTokens,
    deleteByIdForWorkspace,
    insert,
    findDefaultByWorkspaceId,
    insertDefault,
    setEncryptedToken,
  },
}))

const encryptText = vi.fn(async (text: string) => ({
  v: 1,
  iv: "iv",
  text: `enc(${text})`,
  tag: "tag",
}))
const decryptText = vi.fn(async (blob: { text: string }) =>
  blob.text.replace(ENCRYPTED_TEXT_PATTERN, "$1"),
)
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptText, decryptText },
}))

const generateWorkspaceToken = vi.fn(async () => ({
  token: "cbx_ws_newplaintext",
  tokenHash: "new-hash",
  tokenPrefix: "cbx_ws_newp",
}))
vi.mock("../src/workspace-api-token/credentials", () => ({
  generateWorkspaceToken,
}))

const db: { transaction?: (fn: (tx: unknown) => unknown) => unknown } = {}
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => await fn(db))
db.transaction = transaction
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
  findById: vi.fn(async () => ({ id: "ws-1", name: "Acme", token: null })),
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
  lockWorkspaceTokens.mockResolvedValue(undefined)
  deleteByIdForWorkspace.mockResolvedValue(false)
  workspaceService.findById.mockResolvedValue({
    id: "ws-1",
    name: "Acme",
    token: null,
  })
  invalidateCacheByTags.mockResolvedValue(undefined)
  withCache.mockImplementation(
    async (_key: string, fn: () => unknown, _options?: unknown) => fn(),
  )
  findDefaultByWorkspaceId.mockResolvedValue(null)
  insertDefault.mockResolvedValue(null)
  setEncryptedToken.mockResolvedValue(undefined)
  generateWorkspaceToken.mockResolvedValue({
    token: "cbx_ws_newplaintext",
    tokenHash: "new-hash",
    tokenPrefix: "cbx_ws_newp",
  })
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
      workspace: { id: "ws-1", name: "Acme", token: null },
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

  test("caches the merged {workspace, apiToken} pair under one key, tagged for both invalidation paths", async () => {
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
      dynamicTags: (result: unknown) => string[] | undefined
    }
    // Both tags must be present: `deleteToken` invalidates only the token
    // tag, a workspace update invalidates only `workspaces:<id>` — losing
    // either one would let that write serve stale cached auth data.
    expect(
      options.dynamicTags({
        workspace: { id: "ws-1" },
        apiToken: { workspaceId: "ws-1" },
      }),
    ).toEqual([workspaceApiTokenCacheTag("ws-1"), "workspaces:ws-1"])
    expect(options.dynamicTags(undefined)).toBeUndefined()
  })

  test("only calls workspaceService.findById once, inside the cached fn — not a second time after the cache resolves", async () => {
    findByTokenHash.mockResolvedValue({
      id: "t-1",
      workspaceId: "ws-1",
      permission: "full",
    })

    await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(workspaceService.findById).toHaveBeenCalledTimes(1)
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
        scopes: undefined,
      },
      db,
    )
    expect(result.id).toBe("t-1")
    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: 'created workspace API token "My token" (full, scopes: all)',
    })
    expect(JSON.stringify(dispatchAuditRecord.mock.calls)).not.toContain(
      TOKEN_HASH,
    )
  })

  test("passes explicit scopes through to the repository insert and audit line", async () => {
    await workspaceApiTokenService.createToken({
      workspaceId: "ws-1",
      name: "Scoped token",
      permission: "full",
      tokenHash: TOKEN_HASH,
      tokenPrefix: "cbx_ws_abcd",
      scopes: ["contacts", "inbox"],
    })

    expect(insert).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        tokenHash: TOKEN_HASH,
        name: "Scoped token",
        permission: "full",
        tokenPrefix: "cbx_ws_abcd",
        scopes: ["contacts", "inbox"],
      },
      db,
    )
    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail:
        'created workspace API token "Scoped token" (full, scopes: contacts,inbox)',
    })
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

  test("takes the per-workspace advisory lock inside the transaction, before the count, to close the TOCTOU race", async () => {
    await workspaceApiTokenService.createToken({
      workspaceId: "ws-1",
      name: "My token",
      permission: "full",
      tokenHash: TOKEN_HASH,
      tokenPrefix: "cbx_ws_abcd",
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    // Lock, count, and insert must all happen with the tx client returned by
    // db.transaction, not the outer db — otherwise they run outside the tx
    // and the lock cannot serialize concurrent callers.
    expect(lockWorkspaceTokens).toHaveBeenCalledWith("ws-1", db)
    expect(countByWorkspaceId).toHaveBeenCalledWith("ws-1", db)
    // The lock must be taken before the count — a lock acquired after
    // reading the count does nothing to prevent the TOCTOU race.
    expect(countByWorkspaceId.mock.invocationCallOrder[0]).toBeGreaterThan(
      lockWorkspaceTokens.mock.invocationCallOrder[0],
    )
    expect(insert.mock.invocationCallOrder[0]).toBeGreaterThan(
      countByWorkspaceId.mock.invocationCallOrder[0],
    )
  })

  test("does not open a nested transaction when a caller-owned tx is supplied", async () => {
    await workspaceApiTokenService.createToken({
      workspaceId: "ws-1",
      name: "My token",
      permission: "full",
      tokenHash: TOKEN_HASH,
      tokenPrefix: "cbx_ws_abcd",
      tx: db as never,
    })

    expect(transaction).not.toHaveBeenCalled()
  })

  test("does not throw when the audit call fails, and the token is still returned", async () => {
    dispatchAuditRecord.mockRejectedValueOnce(new Error("audit sink down"))

    await expect(
      workspaceApiTokenService.createToken({
        workspaceId: "ws-1",
        name: "My token",
        permission: "full",
        tokenHash: TOKEN_HASH,
        tokenPrefix: "cbx_ws_abcd",
      }),
    ).resolves.toMatchObject({ id: "t-1" })
    expect(logger.warn).toHaveBeenCalledTimes(1)
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

  test("does not throw when the audit call fails, and the delete still resolves", async () => {
    deleteByIdForWorkspace.mockResolvedValue(true)
    dispatchAuditRecord.mockRejectedValueOnce(new Error("audit sink down"))

    await expect(
      workspaceApiTokenService.deleteToken({ workspaceId: "ws-1", id: "t-1" }),
    ).resolves.toBe(true)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe("workspaceApiTokenService.resolveDefaultTokenPlaintext", () => {
  test("decrypts the plaintext when the default row already has an encryptedToken", async () => {
    findDefaultByWorkspaceId.mockResolvedValue({
      id: "t-default",
      workspaceId: "ws-1",
      encryptedToken: {
        v: 1,
        iv: "iv",
        text: "enc(cbx_ws_existing)",
        tag: "t",
      },
    })

    await expect(
      workspaceApiTokenService.resolveDefaultTokenPlaintext({
        workspaceId: "ws-1",
      }),
    ).resolves.toBe("cbx_ws_existing")

    expect(decryptText).toHaveBeenCalledWith(
      { v: 1, iv: "iv", text: "enc(cbx_ws_existing)", tag: "t" },
      "workspace-api-token:ws-1",
    )
    expect(insertDefault).not.toHaveBeenCalled()
    expect(setEncryptedToken).not.toHaveBeenCalled()
  })

  test("migrates a legacy default row from Workspace.token without mutating it", async () => {
    findDefaultByWorkspaceId.mockResolvedValue({
      id: "t-legacy",
      workspaceId: "ws-1",
      encryptedToken: null,
    })
    workspaceService.findById.mockResolvedValue({
      id: "ws-1",
      name: "Acme",
      token: "legacy-plaintext-token",
    })

    await expect(
      workspaceApiTokenService.resolveDefaultTokenPlaintext({
        workspaceId: "ws-1",
      }),
    ).resolves.toBe("legacy-plaintext-token")

    expect(encryptText).toHaveBeenCalledWith(
      "legacy-plaintext-token",
      "workspace-api-token:ws-1",
    )
    expect(setEncryptedToken).toHaveBeenCalledWith(
      {
        id: "t-legacy",
        workspaceId: "ws-1",
        encryptedToken: expect.objectContaining({
          text: "enc(legacy-plaintext-token)",
        }),
      },
      db,
    )
    // Workspace.token itself is never written back to.
    expect(JSON.stringify(setEncryptedToken.mock.calls)).not.toContain(
      '"token"',
    )
  })

  test("returns null when the legacy default row has no Workspace.token either", async () => {
    findDefaultByWorkspaceId.mockResolvedValue({
      id: "t-legacy",
      workspaceId: "ws-1",
      encryptedToken: null,
    })
    workspaceService.findById.mockResolvedValue({
      id: "ws-1",
      name: "Acme",
      token: null,
    })

    await expect(
      workspaceApiTokenService.resolveDefaultTokenPlaintext({
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()
    expect(setEncryptedToken).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test("mints a new full-permission default token when none exists", async () => {
    findDefaultByWorkspaceId.mockResolvedValue(null)
    insertDefault.mockResolvedValue({
      id: "t-new",
      workspaceId: "ws-1",
      encryptedToken: {
        v: 1,
        iv: "iv",
        text: "enc(cbx_ws_newplaintext)",
        tag: "t",
      },
    })

    await expect(
      workspaceApiTokenService.resolveDefaultTokenPlaintext({
        workspaceId: "ws-1",
      }),
    ).resolves.toBe("cbx_ws_newplaintext")

    expect(insertDefault).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        tokenHash: "new-hash",
        name: "Default token",
        tokenPrefix: "cbx_ws_newp",
        encryptedToken: expect.objectContaining({
          text: "enc(cbx_ws_newplaintext)",
        }),
      },
      db,
    )
  })

  test("re-selects the winning row when it loses the race to mint the default token", async () => {
    findDefaultByWorkspaceId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "t-winner",
      workspaceId: "ws-1",
      encryptedToken: { v: 1, iv: "iv", text: "enc(cbx_ws_winner)", tag: "t" },
    })
    insertDefault.mockResolvedValue(null)

    await expect(
      workspaceApiTokenService.resolveDefaultTokenPlaintext({
        workspaceId: "ws-1",
      }),
    ).resolves.toBe("cbx_ws_winner")
    expect(findDefaultByWorkspaceId).toHaveBeenCalledTimes(2)
  })

  test("mints the default token even when the workspace is already at the user-token cap", async () => {
    countByWorkspaceId.mockResolvedValue(MAX_WORKSPACE_API_TOKENS)
    findDefaultByWorkspaceId.mockResolvedValue(null)
    insertDefault.mockResolvedValue({
      id: "t-new",
      workspaceId: "ws-1",
      encryptedToken: {
        v: 1,
        iv: "iv",
        text: "enc(cbx_ws_newplaintext)",
        tag: "t",
      },
    })

    await expect(
      workspaceApiTokenService.resolveDefaultTokenPlaintext({
        workspaceId: "ws-1",
      }),
    ).resolves.toBe("cbx_ws_newplaintext")
    // No cap check gates the default-token mint path.
    expect(insertDefault).toHaveBeenCalledTimes(1)
  })
})
