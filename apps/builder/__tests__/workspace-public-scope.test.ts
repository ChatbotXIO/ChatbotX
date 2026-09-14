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

const channelTokenRefreshService = { refreshWorkspace: vi.fn() }
const workspaceLifecycleService = { freezeWorkspaceRuntime: vi.fn() }
const workspaceService = {
  findById: vi.fn(),
  update: vi.fn(),
  scheduleDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
}
const workspaceSupportAccessService = { enable: vi.fn(), disable: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  channelTokenRefreshService,
  workspaceLifecycleService,
  workspaceService,
  workspaceSupportAccessService,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: {},
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-whatsapp", () => ({ integration: {} }))

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

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { workspacePublicRouter } = await import(
  "../src/features/workspaces/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const workspaceResponse = () => ({
  id: "1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  name: "Workspace",
  defaultReply: null,
  defaultReplyFrequency: "allTime",
  targetCountry: null,
  language: "en",
  timezone: "UTC",
  brandColor: "#016DFF",
  developmentMode: false,
  smartResponseDelaySeconds: null,
  isActive: true,
  startTime: null,
  endTime: null,
  logo: null,
  scheduledDeletionAt: null,
  supportAccessUntil: null,
  capiLimitedDataUse: false,
  ownerId: "owner-1",
  tenantId: "tenant-1",
  token: "legacy-token",
  workspaceId: "untrusted-workspace",
})

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: workspace public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/workspace route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(workspacePublicRouter.get)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'workspace' scope",
    })
  })

  test("null scopes (unrestricted) passes the real DELETE /v1/workspace/deletion route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    workspaceService.cancelDeletion.mockResolvedValueOnce(undefined)

    await expect(
      invoke(workspacePublicRouter.cancelDeletion),
    ).resolves.toBeUndefined()

    expect(workspaceService.cancelDeletion).toHaveBeenCalledWith({ id: "ws-1" })
  })

  test.each([
    [
      "PATCH /v1/workspace",
      () => invoke(workspacePublicRouter.update, { name: "Renamed" }),
    ],
    [
      "PUT /v1/workspace/status",
      () =>
        invoke(workspacePublicRouter.updateStatus, {
          isActive: false,
          startTime: null,
          endTime: null,
        }),
    ],
    [
      "POST /v1/workspace/deletion",
      () => invoke(workspacePublicRouter.scheduleDeletion),
    ],
    [
      "DELETE /v1/workspace/deletion",
      () => invoke(workspacePublicRouter.cancelDeletion),
    ],
    [
      "PUT /v1/workspace/support-access",
      () =>
        invoke(workspacePublicRouter.updateSupportAccess, { enabled: true }),
    ],
    [
      "POST /v1/workspace/channel-tokens/refresh",
      () => invoke(workspacePublicRouter.refreshChannelTokens),
    ],
  ])("a read_only token is denied %s before any write service call", async (_label, run) => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null, "read_only"))

    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(workspaceService.update).not.toHaveBeenCalled()
    expect(workspaceService.scheduleDeletion).not.toHaveBeenCalled()
    expect(workspaceService.cancelDeletion).not.toHaveBeenCalled()
    expect(
      workspaceLifecycleService.freezeWorkspaceRuntime,
    ).not.toHaveBeenCalled()
    expect(workspaceSupportAccessService.enable).not.toHaveBeenCalled()
    expect(workspaceSupportAccessService.disable).not.toHaveBeenCalled()
    expect(channelTokenRefreshService.refreshWorkspace).not.toHaveBeenCalled()
  })

  describe("cross-workspace isolation: workspace identity always comes from the token", () => {
    beforeEach(() => {
      findWorkspaceByTokenHash.mockResolvedValue(
        authResult(null) /* unrestricted scope, full permission */,
      )
    })

    test("gets the authenticated workspace and removes internal fields from its response", async () => {
      workspaceService.findById.mockResolvedValueOnce(workspaceResponse())

      const result = await invoke(workspacePublicRouter.get)

      expect(workspaceService.findById).toHaveBeenCalledWith({ id: "ws-1" })
      expect(result).toMatchObject({ id: "1", name: "Workspace" })
      expect(result).not.toHaveProperty("workspaceId")
      expect(result).not.toHaveProperty("token")
      expect(result).not.toHaveProperty("ownerId")
      expect(result).not.toHaveProperty("tenantId")
    })

    test("updates only the authenticated workspace", async () => {
      const input = { name: "Renamed" }
      workspaceService.update.mockResolvedValueOnce(workspaceResponse())

      await invoke(workspacePublicRouter.update, input)

      expect(workspaceService.update).toHaveBeenCalledWith({
        id: "ws-1",
        data: input,
      })
    })

    test("enables support access only in the authenticated workspace", async () => {
      workspaceSupportAccessService.enable.mockResolvedValueOnce(undefined)

      await invoke(workspacePublicRouter.updateSupportAccess, { enabled: true })

      expect(workspaceSupportAccessService.enable).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        actorUserId: null,
      })
    })

    test("disables support access only in the authenticated workspace", async () => {
      workspaceSupportAccessService.disable.mockResolvedValueOnce(undefined)

      await invoke(workspacePublicRouter.updateSupportAccess, {
        enabled: false,
      })

      expect(workspaceSupportAccessService.disable).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        actorUserId: null,
      })
    })

    test("refreshes channel tokens only in the authenticated workspace", async () => {
      channelTokenRefreshService.refreshWorkspace.mockResolvedValueOnce({
        refreshed: 1,
        failed: 0,
      })

      await invoke(workspacePublicRouter.refreshChannelTokens)

      expect(channelTokenRefreshService.refreshWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "ws-1" }),
      )
    })
  })
})
