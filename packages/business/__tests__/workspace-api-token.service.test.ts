import { beforeEach, describe, expect, test, vi } from "vitest"

const whereDelete = vi.fn(async () => undefined)
const deleteFn = vi.fn(() => ({ where: whereDelete }))
const valuesInsert = vi.fn(async () => undefined)
const insert = vi.fn(() => ({ values: valuesInsert }))
const findFirstApiToken = vi.fn(
  async (): Promise<{ id: string; workspaceId: string } | undefined> =>
    undefined,
)

const innerTx = { delete: deleteFn, insert }
const transaction = vi.fn(
  async (fn: (tx: typeof innerTx) => Promise<void>) => await fn(innerTx),
)
const db = {
  transaction,
  query: {
    workspaceApiTokenModel: { findFirst: findFirstApiToken },
  },
}
vi.mock("@chatbotx.io/database/client", () => ({
  db,
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  workspaceApiTokenModel: { workspaceId: "workspaceId-column" },
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
  findFirstApiToken.mockResolvedValue(undefined)
  workspaceService.findById.mockResolvedValue({ id: "ws-1", name: "Acme" })
})

describe("workspaceApiTokenService.findWorkspaceByTokenHash", () => {
  test("resolves the workspace through the hash row", async () => {
    findFirstApiToken.mockResolvedValue({ id: "t-1", workspaceId: "ws-1" })

    const workspace = await workspaceApiTokenService.findWorkspaceByTokenHash({
      tokenHash: TOKEN_HASH,
    })

    expect(findFirstApiToken).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
    })
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
    findFirstApiToken.mockResolvedValueOnce({ id: "t-1", workspaceId: "ws-1" })
    await expect(
      workspaceApiTokenService.hasToken({ workspaceId: "ws-1" }),
    ).resolves.toBe(true)

    findFirstApiToken.mockResolvedValueOnce(undefined)
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
    expect(deleteFn).toHaveBeenCalledTimes(1)
    expect(valuesInsert).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tokenHash: TOKEN_HASH,
    })
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
