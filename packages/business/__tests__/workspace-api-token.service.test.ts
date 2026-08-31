import { beforeEach, describe, expect, test, vi } from "vitest"

const findByTokenHash = vi.fn(
  async (): Promise<{ id: string; workspaceId: string } | null> => null,
)
const existsByWorkspaceId = vi.fn(async (): Promise<boolean> => false)
const deleteByWorkspaceId = vi.fn(async () => undefined)
const insert = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceApiTokenRepository: {
    findByTokenHash,
    existsByWorkspaceId,
    deleteByWorkspaceId,
    insert,
  },
}))

const transaction = vi.fn(
  async (fn: (tx: typeof db) => Promise<void>) => await fn(db),
)
const db = { transaction }
vi.mock("@chatbotx.io/database/client", () => ({
  db,
}))

// BaseService pulls invalidateCacheByTags from the redis package; the token
// lookup itself is deliberately uncached (rotation must revoke instantly).
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
  withCache: vi.fn(async (_key: string, fn: () => unknown) => fn()),
}))

const dispatchAuditRecord = vi.fn(async () => undefined)
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const workspaceService = {
  findById: vi.fn(async () => ({ id: "ws-1", name: "Acme" })),
}
vi.mock("../src/workspace/service", () => ({ workspaceService }))

const { workspaceApiTokenService } = await import(
  "../src/workspace-api-token/service"
)

const TOKEN_HASH = "a".repeat(64)

beforeEach(() => {
  vi.clearAllMocks()
  findByTokenHash.mockResolvedValue(null)
  existsByWorkspaceId.mockResolvedValue(false)
  workspaceService.findById.mockResolvedValue({ id: "ws-1", name: "Acme" })
})

describe("workspaceApiTokenService.findWorkspaceByTokenHash", () => {
  test("resolves the workspace through the hash row", async () => {
    findByTokenHash.mockResolvedValue({ id: "t-1", workspaceId: "ws-1" })

    const workspace = await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH, db)
    expect(workspaceService.findById).toHaveBeenCalledWith({
      id: "ws-1",
      tx: db,
    })
    expect(workspace).toEqual({ id: "ws-1", name: "Acme" })
  })

  test("returns undefined when no row matches the hash", async () => {
    const workspace = await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(workspace).toBeUndefined()
    expect(workspaceService.findById).not.toHaveBeenCalled()
  })
})

describe("workspaceApiTokenService.hasToken", () => {
  test("true when a row exists, false otherwise", async () => {
    existsByWorkspaceId.mockResolvedValueOnce(true)
    await expect(
      workspaceApiTokenService.hasToken({ workspaceId: "ws-1" }),
    ).resolves.toBe(true)

    existsByWorkspaceId.mockResolvedValueOnce(false)
    await expect(
      workspaceApiTokenService.hasToken({ workspaceId: "ws-1" }),
    ).resolves.toBe(false)
  })
})

describe("workspaceApiTokenService.replaceToken", () => {
  test("delete + insert run inside one transaction", async () => {
    await workspaceApiTokenService.replaceToken({
      workspaceId: "ws-1",
      tokenHash: TOKEN_HASH,
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(deleteByWorkspaceId).toHaveBeenCalledWith("ws-1", db)
    expect(insert).toHaveBeenCalledWith(
      { workspaceId: "ws-1", tokenHash: TOKEN_HASH },
      db,
    )
    expect(deleteByWorkspaceId.mock.invocationCallOrder[0]).toBeLessThan(
      insert.mock.invocationCallOrder[0],
    )
  })

  test("audits the rotation without leaking the digest", async () => {
    await workspaceApiTokenService.replaceToken({
      workspaceId: "ws-1",
      tokenHash: TOKEN_HASH,
    })

    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "created/regenerated workspace API key",
    })
    expect(JSON.stringify(dispatchAuditRecord.mock.calls)).not.toContain(
      TOKEN_HASH,
    )
  })

  test("skips the audit when running inside a caller-owned transaction", async () => {
    await workspaceApiTokenService.replaceToken({
      workspaceId: "ws-1",
      tokenHash: TOKEN_HASH,
      tx: db as never,
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })
})
