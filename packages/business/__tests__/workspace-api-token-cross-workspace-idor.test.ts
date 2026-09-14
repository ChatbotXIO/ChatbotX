import { beforeEach, describe, expect, test, vi } from "vitest"

type TokenRow = {
  id: string
  workspaceId: string
  isDefault: boolean
  name: string
  permission: string
  scopes: string[] | null
}

const tokenRows: TokenRow[] = [
  {
    id: "token-a",
    workspaceId: "workspace-a",
    isDefault: false,
    name: "Token A",
    permission: "full",
    scopes: null,
  },
]

const findByIdForWorkspace = vi.fn(
  async ({ workspaceId, id }: { workspaceId: string; id: string }) =>
    tokenRows.find((row) => row.id === id && row.workspaceId === workspaceId) ??
    undefined,
)

const updateByIdForWorkspace = vi.fn(
  ({ workspaceId, id }: { workspaceId: string; id: string }) =>
    tokenRows.find(
      (candidate) =>
        candidate.id === id && candidate.workspaceId === workspaceId,
    ),
)

const deleteByIdForWorkspace = vi.fn(
  async ({ id, workspaceId }: { id: string; workspaceId: string }) =>
    tokenRows.some((row) => row.id === id && row.workspaceId === workspaceId),
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: vi.fn() },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  workspaceApiTokenRepository: {
    findByIdForWorkspace,
    updateByIdForWorkspace,
    deleteByIdForWorkspace,
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptText: vi.fn(), decryptText: vi.fn() },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(async () => undefined),
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { findById: vi.fn() },
}))

const { workspaceApiTokenService } = await import(
  "../src/workspace-api-token/service"
)

beforeEach(() => {
  findByIdForWorkspace.mockClear()
  updateByIdForWorkspace.mockClear()
  deleteByIdForWorkspace.mockClear()
})

describe("workspaceApiTokenService — cross-workspace isolation (IDOR)", () => {
  test("findTokenOrFail resolves a token scoped to its own workspace", async () => {
    const token = await workspaceApiTokenService.findTokenOrFail({
      workspaceId: "workspace-a",
      id: "token-a",
    })

    expect(token).toMatchObject({ id: "token-a" })
  })

  test("findTokenOrFail throws not-found for a token id that exists under a different workspace", async () => {
    await expect(
      workspaceApiTokenService.findTokenOrFail({
        workspaceId: "workspace-b",
        id: "token-a",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("updateToken never reaches the repository write for a cross-workspace token id", async () => {
    await expect(
      workspaceApiTokenService.updateToken({
        workspaceId: "workspace-b",
        id: "token-a",
        name: "Hijacked name",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(updateByIdForWorkspace).not.toHaveBeenCalled()
  })

  test("deleteToken reports no deletion for a cross-workspace token id", async () => {
    const deleted = await workspaceApiTokenService.deleteToken({
      workspaceId: "workspace-b",
      id: "token-a",
    })

    expect(deleted).toBe(false)
    expect(deleteByIdForWorkspace).toHaveBeenCalledWith(
      { id: "token-a", workspaceId: "workspace-b" },
      expect.anything(),
    )
  })
})
