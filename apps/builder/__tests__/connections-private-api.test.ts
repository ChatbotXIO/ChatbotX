// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ProcedureHandler = (args: {
  context?: Record<string, unknown>
  input: Record<string, unknown>
}) => Promise<unknown>

type WorkspaceMapper = (input: Record<string, unknown>) => string

type EndpointState = {
  routeConfig?: RouteConfig
  middleware?: unknown
  workspaceMapper?: WorkspaceMapper
  handler?: ProcedureHandler
}

// Same harness shape as `ads-api.test.ts` — a fresh chain/state per
// `authorizedAPI.route(...)` call, keyed by method+path (several routes
// below share a path with a different method), so every endpoint in
// `private.ts` keeps its own captured handler.
const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const endpoints = new Map<string, EndpointState>()

    function makeProcedure(state: EndpointState) {
      const procedure = {
        input: vi.fn(() => procedure),
        output: vi.fn(() => procedure),
        errors: vi.fn(() => procedure),
        use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
          state.middleware = middleware
          state.workspaceMapper = mapper
          return procedure
        }),
        handler: vi.fn((handler: ProcedureHandler) => {
          state.handler = handler
          return { handler }
        }),
      }
      return procedure
    }

    const authorizedAPIMock = {
      route: vi.fn((config: RouteConfig) => {
        const state: EndpointState = { routeConfig: config }
        // Keyed by method+path — several private.ts routes share the same
        // path with a different method (e.g. GET/POST on `/connections`,
        // GET/PATCH/DELETE on `/connections/{id}`), so a path-only key would
        // let the later `.route()` call silently overwrite the earlier
        // endpoint's captured handler.
        endpoints.set(`${config.method} ${config.path}`, state)
        return makeProcedure(state)
      }),
    }

    return {
      authorizedAPI: authorizedAPIMock,
      mocks: {
        list: vi.fn(),
        getForWorkspace: vi.fn(),
        updateDisplayName: vi.fn(),
        connectFromCredentials: vi.fn(),
        startSession: vi.fn(),
        reconnect: vi.fn(),
        disconnect: vi.fn(),
        refresh: vi.fn(),
        verify: vi.fn(),
        connectTargets: vi.fn(),
        findByIdForWorkspace: vi.fn(),
        cancel: vi.fn(),
        listConnectionProviderResources: vi.fn(),
        toConnectionResource: vi.fn((row: { id: string }) => ({
          id: row.id,
          resource: true,
        })),
        toConnectSessionResource: vi.fn((row: { id: string }) => ({
          id: row.id,
          sessionResource: true,
        })),
        resolveChannelPolicy: vi.fn(),
        resolveOAuthCredential: vi.fn(),
        resolvePlatformOwnerId: vi.fn(async () => "owner-1"),
        sanitizeOptionalReturnUrl: vi.fn(async (url?: string) => url),
        endpoints,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))

vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    list: mocks.list,
    getForWorkspace: mocks.getForWorkspace,
    updateDisplayName: mocks.updateDisplayName,
  },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    cancel: mocks.cancel,
  },
}))

class MockChatbotXException extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  BROADCAST_PLAN_LIMIT_CODE: "broadcastPlanLimit",
  ChatbotXException: MockChatbotXException,
  channelHiddenException: (channel: string) =>
    new MockChatbotXException(`${channel} is hidden`, "channelHidden"),
  connectionNotConfiguredException: (provider: string) =>
    new MockChatbotXException(`${provider} not configured`, "notConfigured"),
  connectSessionExpiredException: (message: string) =>
    new MockChatbotXException(message, "connectSessionExpired"),
  notFoundException: (message: string) =>
    new MockChatbotXException(message, "notFound"),
  validationException: (_field: string, message: string) =>
    new MockChatbotXException(message, "validation"),
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: {
    connectFromCredentials: mocks.connectFromCredentials,
    startSession: mocks.startSession,
    reconnect: mocks.reconnect,
    disconnect: mocks.disconnect,
    refresh: mocks.refresh,
    verify: mocks.verify,
    connectTargets: mocks.connectTargets,
  },
  isCredentialStrategy: (strategy: string) =>
    strategy === "token" || strategy === "api_key" || strategy === "self_serve",
  toChannelType: (provider: string) =>
    provider === "instagramFacebook" ? "instagram" : provider,
  CONNECTION_REGISTRY: {
    claude: { provider: { strategy: "api_key", kind: "integration" } },
    messenger: { provider: { strategy: "oauth_redirect", kind: "channel" } },
  },
}))

vi.mock("../src/features/connections/lib/resolve-provider", () => ({
  toConnectionResource: mocks.toConnectionResource,
  listConnectionProviderResources: mocks.listConnectionProviderResources,
}))

vi.mock("../src/features/connections/lib/connect-session-resource", () => ({
  toConnectSessionResource: mocks.toConnectSessionResource,
}))

vi.mock("../src/features/connections/lib/resolve-connect-credential", () => ({
  resolveOAuthCredential: mocks.resolveOAuthCredential,
}))

vi.mock("@/lib/oauth-referer", () => ({
  sanitizeOptionalReturnUrl: mocks.sanitizeOptionalReturnUrl,
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: mocks.resolvePlatformOwnerId,
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: mocks.resolveChannelPolicy,
}))

// Deliberate dynamic import, not a runtime-selected module: `private.ts`
// must load after every `vi.mock(...)` above has registered, so a
// top-level `import` (which Vitest would hoist above the mocks) can't be
// used here — same boundary-exercising pattern as `ads-api.test.ts`.
const { connectionsAPI, connectSessionsAPI } = await import(
  "../src/features/connections/api/private"
)

const createPath = "/workspaces/{workspaceId}/connections"

const baseInput = { workspaceId: "ws-1", provider: "claude", config: {} }
const context = { user: { id: "user-1" } }

const getHandler = (method: string, path: string) => {
  const state = mocks.endpoints.get(`${method} ${path}`)
  if (!state?.handler) {
    throw new Error(`${method} ${path} handler was not registered`)
  }
  return state.handler
}

const getCreateHandler = () => getHandler("POST", createPath)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("private connectionsAPI.createConnectionAPI", () => {
  test("registers as a workspace-authorized endpoint", () => {
    expect(connectionsAPI).toHaveProperty("listConnectionsAPI")
    const state = mocks.endpoints.get(`POST ${createPath}`)
    expect(state?.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(state?.workspaceMapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
  })

  test("calls connectionService.connectFromCredentials with actorUserId — the same service method the public route calls, with only the caller's actor identity differing", async () => {
    mocks.connectFromCredentials.mockResolvedValueOnce({ id: "conn-1" })

    const handler = getCreateHandler()
    const result = await handler({ context, input: baseInput })

    expect(mocks.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "claude",
      config: {},
      actorUserId: "user-1",
    })
    expect(result).toEqual({
      connection: { id: "conn-1", resource: true },
      session: null,
      secret: null,
    })
  })

  test("calls connectionService.startSession with actorUserId for an OAuth provider — same service as the public route", async () => {
    mocks.resolveChannelPolicy.mockResolvedValueOnce({
      ownerId: "owner-1",
      visibleChannels: ["messenger"],
    })
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: { clientId: "id" },
      callbackUrl: "https://app.example.com/callback",
    })
    mocks.startSession.mockResolvedValueOnce({ session: { id: "session-1" } })

    const handler = getCreateHandler()
    await handler({
      context,
      input: { workspaceId: "ws-1", provider: "messenger", config: {} },
    })

    expect(mocks.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "messenger",
        actorUserId: "user-1",
        platformOwnerId: "owner-1",
      }),
    )
    expect(mocks.startSession.mock.calls[0]?.[0]).not.toHaveProperty(
      "actorTokenId",
    )
  })

  test("throws channelHidden when the tenant's policy hides the channel (the hidden-channel branch)", async () => {
    mocks.resolveChannelPolicy.mockResolvedValueOnce({
      ownerId: "owner-1",
      visibleChannels: [],
    })

    const handler = getCreateHandler()
    await expect(
      handler({
        context,
        input: { workspaceId: "ws-1", provider: "messenger", config: {} },
      }),
    ).rejects.toMatchObject({ code: "channelHidden" })

    expect(mocks.connectFromCredentials).not.toHaveBeenCalled()
  })

  test("does not hide a channel that is grandfathered into visibleChannels despite an empty creatable set (an already-connected channel stays connectable)", async () => {
    mocks.resolveChannelPolicy.mockResolvedValueOnce({
      ownerId: "owner-1",
      visibleChannels: ["messenger"],
    })
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: { clientId: "id" },
      callbackUrl: "https://app.example.com/callback",
    })
    mocks.startSession.mockResolvedValueOnce({ session: { id: "session-1" } })

    const handler = getCreateHandler()
    const result = await handler({
      context,
      input: { workspaceId: "ws-1", provider: "messenger", config: {} },
    })

    expect(result).toEqual({
      connection: null,
      session: { id: "session-1", sessionResource: true },
      secret: null,
    })
  })

  test("does not hide a channel when no tenant policy applies (non-white-label)", async () => {
    mocks.resolveChannelPolicy.mockResolvedValueOnce(null)
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: { clientId: "id" },
      callbackUrl: "https://app.example.com/callback",
    })
    mocks.startSession.mockResolvedValueOnce({ session: { id: "session-1" } })

    const handler = getCreateHandler()
    await expect(
      handler({
        context,
        input: { workspaceId: "ws-1", provider: "messenger", config: {} },
      }),
    ).resolves.toBeDefined()
  })
})

describe("private connectionsAPI.listConnectionsAPI", () => {
  test("passes workspaceId through to connectionStateService.list", async () => {
    mocks.list.mockResolvedValueOnce({ data: [], count: 0 })

    const handler = getHandler("GET", "/workspaces/{workspaceId}/connections")
    await handler({
      context,
      input: { workspaceId: "ws-1", page: 1, perPage: 20 },
    })

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })
})

describe("private connectionsAPI.getConnectionAPI", () => {
  test("passes workspaceId through to connectionStateService.getForWorkspace", async () => {
    mocks.getForWorkspace.mockResolvedValueOnce({
      id: "conn-1",
      provider: "claude",
    })

    const handler = getHandler(
      "GET",
      "/workspaces/{workspaceId}/connections/{id}",
    )
    const result = await handler({
      context,
      input: { workspaceId: "ws-1", id: "conn-1" },
    })

    expect(mocks.getForWorkspace).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ id: "conn-1", resource: true })
  })
})

describe("private connectionsAPI.reconnectConnectionAPI", () => {
  test("passes workspaceId and actorUserId through to connectionService.reconnect", async () => {
    mocks.getForWorkspace.mockResolvedValueOnce({
      id: "conn-1",
      provider: "messenger",
    })
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: { clientId: "id" },
      callbackUrl: "https://app.example.com/callback",
    })
    mocks.reconnect.mockResolvedValueOnce({ session: { id: "session-1" } })

    const handler = getHandler(
      "POST",
      "/workspaces/{workspaceId}/connections/{id}/reconnect",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "conn-1" },
    })

    expect(mocks.reconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        workspaceId: "ws-1",
        actorUserId: "user-1",
        platformOwnerId: "owner-1",
      }),
    )
  })
})

describe("private connectionsAPI.updateConnectionAPI", () => {
  test("passes workspaceId through to connectionStateService.updateDisplayName", async () => {
    mocks.updateDisplayName.mockResolvedValueOnce({
      id: "conn-1",
      provider: "claude",
    })

    const handler = getHandler(
      "PUT",
      "/workspaces/{workspaceId}/connections/{id}",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "conn-1", displayName: "New name" },
    })

    expect(mocks.updateDisplayName).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "ws-1",
      displayName: "New name",
    })
  })
})

describe("private connectionsAPI.disconnectConnectionAPI", () => {
  test("passes workspaceId through to connectionService.disconnect", async () => {
    mocks.disconnect.mockResolvedValueOnce({ id: "conn-1", provider: "claude" })

    const handler = getHandler(
      "DELETE",
      "/workspaces/{workspaceId}/connections/{id}",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "conn-1" },
    })

    expect(mocks.disconnect).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
  })
})

describe("private connectionsAPI.refreshConnectionAPI", () => {
  test("passes workspaceId through to connectionService.refresh", async () => {
    mocks.refresh.mockResolvedValueOnce({ id: "conn-1", provider: "claude" })

    const handler = getHandler(
      "POST",
      "/workspaces/{workspaceId}/connections/{id}/refresh",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "conn-1" },
    })

    expect(mocks.refresh).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
  })
})

describe("private connectionsAPI.verifyConnectionAPI", () => {
  test("passes workspaceId through to connectionService.verify", async () => {
    mocks.verify.mockResolvedValueOnce({ id: "conn-1", provider: "claude" })

    const handler = getHandler(
      "POST",
      "/workspaces/{workspaceId}/connections/{id}/verify",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "conn-1" },
    })

    expect(mocks.verify).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
  })
})

describe("private connectionsAPI.listConnectionProvidersAPI", () => {
  test("passes workspaceId through to listConnectionProviderResources", async () => {
    mocks.listConnectionProviderResources.mockResolvedValueOnce([])

    const handler = getHandler(
      "GET",
      "/workspaces/{workspaceId}/connection-providers",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1" },
    })

    expect(mocks.listConnectionProviderResources).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })
})

describe("private connectSessionsAPI.getConnectSessionAPI", () => {
  test("passes workspaceId through to connectSessionService.findByIdForWorkspace", async () => {
    expect(connectSessionsAPI).toHaveProperty("getConnectSessionAPI")
    mocks.findByIdForWorkspace.mockResolvedValueOnce({ id: "session-1" })

    const handler = getHandler(
      "GET",
      "/workspaces/{workspaceId}/connect-sessions/{id}",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "session-1" },
    })

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
    })
  })
})

describe("private connectSessionsAPI.connectSessionTargetsAPI", () => {
  test("passes workspaceId and actorUserId through to connectionService.connectTargets", async () => {
    mocks.connectTargets.mockResolvedValueOnce({
      session: { id: "session-1" },
      connections: [],
      outcomes: [],
    })

    const handler = getHandler(
      "POST",
      "/workspaces/{workspaceId}/connect-sessions/{id}/targets",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "session-1", targetIds: ["t-1"] },
    })

    expect(mocks.connectTargets).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["t-1"],
      actorUserId: "user-1",
    })
  })
})

describe("private connectSessionsAPI.cancelConnectSessionAPI", () => {
  test("passes workspaceId through to connectSessionService.cancel", async () => {
    mocks.cancel.mockResolvedValueOnce({ id: "session-1" })

    const handler = getHandler(
      "DELETE",
      "/workspaces/{workspaceId}/connect-sessions/{id}",
    )
    await handler({
      context,
      input: { workspaceId: "ws-1", id: "session-1" },
    })

    expect(mocks.cancel).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
    })
  })
})
