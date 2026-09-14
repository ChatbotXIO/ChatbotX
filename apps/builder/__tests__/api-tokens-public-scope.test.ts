// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const workspaceApiTokenService = {
  findWorkspaceByTokenHash,
  listTokens: vi.fn(),
  findTokenOrFail: vi.fn(),
  createToken: vi.fn(),
  updateToken: vi.fn(),
  rotateToken: vi.fn(),
  deleteToken: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService,
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { apiTokensPublicRouter } = await import(
  "../src/features/workspaces/api/public/api-tokens"
)

const TOKEN = "cbx_ws_fixture"
const API_TOKEN = {
  id: "1",
  name: "Managed token",
  permission: "full",
  tokenPrefix: "cbx_ws_man",
  isDefault: false,
  scopes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: API tokens public administration scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/api-tokens route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(apiTokensPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'workspace' scope",
    })
  })

  test("a workspace-scoped token is denied because API-token administration requires unrestricted access", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["workspace"]))

    await expect(invoke(apiTokensPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Only an unrestricted (All scopes) token can manage workspace API tokens",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/api-tokens route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    workspaceApiTokenService.listTokens.mockResolvedValue([API_TOKEN])

    await expect(invoke(apiTokensPublicRouter.list)).resolves.toMatchObject({
      data: [expect.objectContaining({ id: "1", name: "Managed token" })],
      pageCount: 1,
    })
  })

  test.each([
    [
      "POST /v1/api-tokens",
      () =>
        invoke(apiTokensPublicRouter.create, {
          name: "New token",
          permission: "full",
          scopes: null,
        }),
    ],
    [
      "PATCH /v1/api-tokens/{id}",
      () =>
        invoke(apiTokensPublicRouter.update, {
          id: "1",
          name: "Renamed token",
        }),
    ],
    [
      "POST /v1/api-tokens/{id}/rotate",
      () => invoke(apiTokensPublicRouter.rotate, { id: "1" }),
    ],
    [
      "DELETE /v1/api-tokens/{id}",
      () => invoke(apiTokensPublicRouter.delete, { id: "1" }),
    ],
  ])("a read_only token is denied %s before any write service call", async (_label, run) => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(workspaceApiTokenService.createToken).not.toHaveBeenCalled()
    expect(workspaceApiTokenService.updateToken).not.toHaveBeenCalled()
    expect(workspaceApiTokenService.rotateToken).not.toHaveBeenCalled()
    expect(workspaceApiTokenService.deleteToken).not.toHaveBeenCalled()
  })

  test("update scopes the token id to the authenticated workspace, never a workspace implied by input", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    workspaceApiTokenService.updateToken.mockResolvedValue(API_TOKEN)

    await invoke(apiTokensPublicRouter.update, {
      id: "999999",
      name: "Renamed token",
    })

    expect(workspaceApiTokenService.updateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        id: "999999",
        name: "Renamed token",
      }),
    )
  })
})
