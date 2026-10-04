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

const connectionServiceMocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  refresh: vi.fn(),
  verify: vi.fn(),
  connectFromCredentials: vi.fn(),
  startSession: vi.fn(),
  reconnect: vi.fn(),
  connectTargets: vi.fn(),
}))

const connectionStateMocks = vi.hoisted(() => ({
  list: vi.fn(),
  getForWorkspace: vi.fn(),
  updateDisplayName: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  connectionStateService: connectionStateMocks,
  platformCredentialService: { resolveForOwner: vi.fn() },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: vi.fn(),
    cancel: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: connectionServiceMocks,
  CONNECTION_REGISTRY: {
    messenger: { provider: { strategy: "oauth_redirect", kind: "channel" } },
    claude: { provider: { strategy: "api_key", kind: "integration" } },
  },
}))

vi.mock("../src/features/connections/lib/resolve-provider", () => ({
  toConnectionResource: vi.fn((row: { id: string }) => ({ id: row.id })),
  listConnectionProviderResources: vi.fn(),
  channelForProvider: vi.fn(() => undefined),
}))

vi.mock("../src/features/connections/lib/connect-session-resource", () => ({
  toConnectSessionResource: vi.fn((row: { id: string }) => ({ id: row.id })),
}))

vi.mock("../src/features/connections/lib/resolve-connect-credential", () => ({
  resolveOAuthCredential: vi.fn(),
}))

vi.mock("@/lib/oauth-referer", () => ({
  sanitizeOptionalReturnUrl: vi.fn(async (url?: string) => url),
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(async () => "owner-1"),
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: vi.fn(async () => null),
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

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { connectionsPublicRouter } = await import(
  "../src/features/connections/api/public"
)

const TOKEN = "cbx_ws_fixture"

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

describe("real router: connections public API permission enforcement (T5)", () => {
  test.each([
    {
      label: "DELETE /v1/connections/{id}",
      invoke: () =>
        invoke(connectionsPublicRouter.disconnect, { id: "conn-1" }),
      services: () => [connectionServiceMocks.disconnect],
    },
    {
      label: "POST /v1/connections",
      invoke: () =>
        invoke(connectionsPublicRouter.create, { provider: "messenger" }),
      services: () => [
        connectionServiceMocks.connectFromCredentials,
        connectionServiceMocks.startSession,
      ],
    },
    {
      label: "POST /v1/connections/{id}/refresh",
      invoke: () => invoke(connectionsPublicRouter.refresh, { id: "conn-1" }),
      services: () => [connectionServiceMocks.refresh],
    },
    {
      label: "POST /v1/connections/{id}/verify",
      invoke: () => invoke(connectionsPublicRouter.verify, { id: "conn-1" }),
      services: () => [connectionServiceMocks.verify],
    },
    {
      label: "POST /v1/connections/{id}/reconnect",
      invoke: () => invoke(connectionsPublicRouter.reconnect, { id: "conn-1" }),
      services: () => [connectionServiceMocks.reconnect],
    },
  ])("a read_only token is denied $label before any service call", async ({
    invoke: invokeRoute,
    services,
  }) => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "read_only" as const,
        scopes: null,
      },
    })

    await expect(invokeRoute()).rejects.toMatchObject({ code: "FORBIDDEN" })

    for (const service of services()) {
      expect(service).not.toHaveBeenCalled()
    }
  })

  test("a contacts-scoped token is denied the real DELETE /v1/connections/{id} route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "full" as const,
        scopes: ["contacts"],
      },
    })

    await expect(
      invoke(connectionsPublicRouter.disconnect, { id: "conn-1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Token is not authorized for the 'channels' or 'integrations' scope",
    })
  })

  test("a channels-only token is denied creating an integration-kind (AI provider) connection", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "full" as const,
        scopes: ["channels"],
      },
    })

    await expect(
      invoke(connectionsPublicRouter.create, {
        provider: "claude",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'integrations' scope",
    })
    expect(connectionServiceMocks.connectFromCredentials).not.toHaveBeenCalled()
  })

  test("a channels-only token is denied disconnecting an integration-kind connection", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "full" as const,
        scopes: ["channels"],
      },
    })
    connectionStateMocks.getForWorkspace.mockResolvedValueOnce({
      id: "conn-1",
      provider: "claude",
    })

    await expect(
      invoke(connectionsPublicRouter.disconnect, { id: "conn-1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'integrations' scope",
    })
    expect(connectionServiceMocks.disconnect).not.toHaveBeenCalled()
  })

  test("a channels-only token's list is forced to kind: channel even with no kind filter requested", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "full" as const,
        scopes: ["channels"],
      },
    })
    connectionStateMocks.list.mockResolvedValueOnce({ data: [], count: 0 })

    await invoke(connectionsPublicRouter.list, {})

    expect(connectionStateMocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "channel" }),
    )
  })

  test("a channels-only token's list is denied with FORBIDDEN when it explicitly requests kind: integration", async () => {
    findWorkspaceByTokenHash.mockResolvedValue({
      workspace: { id: "ws-1", ownerId: "owner-1" },
      apiToken: {
        id: "token-1",
        permission: "full" as const,
        scopes: ["channels"],
      },
    })

    await expect(
      invoke(connectionsPublicRouter.list, { kind: "integration" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(connectionStateMocks.list).not.toHaveBeenCalled()
  })
})
