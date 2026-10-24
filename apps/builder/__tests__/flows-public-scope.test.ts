// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  listNodes,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  listNodes: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  flowService: { listNodes },
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

// Dynamic import: `vi.mock` is hoisted and only an import after registration
// resolves to the mocked modules.
const { call } = await import("@orpc/server")
const { flowsPublicRouter } = await import("../src/features/flows/api/public")

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

const invoke = (procedure: unknown, input: unknown) =>
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

describe("real router: flows.listNodes scope wiring", () => {
  test("a contacts-scoped token is denied GET /v1/flows/{id}/nodes with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(
      invoke(flowsPublicRouter.listNodes, { id: "7" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'automation' scope",
    })
    expect(listNodes).not.toHaveBeenCalled()
  })

  test("an automation-scoped token can list the nodes", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["automation"]))
    listNodes.mockResolvedValue([
      { flowId: "7", nodeId: "9", label: "Welcome", nodeType: "sendMessage" },
    ])

    await expect(
      invoke(flowsPublicRouter.listNodes, { id: "7" }),
    ).resolves.toEqual({
      data: [
        { flowId: "7", nodeId: "9", label: "Welcome", nodeType: "sendMessage" },
      ],
    })
    expect(listNodes).toHaveBeenCalledWith({ workspaceId: "ws-1", flowId: "7" })
  })

  test("an unrestricted token (null scopes) can list the nodes", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    listNodes.mockResolvedValue([])

    await expect(
      invoke(flowsPublicRouter.listNodes, { id: "7" }),
    ).resolves.toEqual({ data: [] })
  })
})
