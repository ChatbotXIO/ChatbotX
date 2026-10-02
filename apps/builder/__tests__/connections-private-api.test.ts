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
// `authorizedAPI.route(...)` call, keyed by path, so every endpoint in
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
        endpoints.set(config.path, state)
        return makeProcedure(state)
      }),
    }

    return {
      authorizedAPI: authorizedAPIMock,
      mocks: {
        list: vi.fn(),
        connectFromCredentials: vi.fn(),
        startSession: vi.fn(),
        toConnectionResource: vi.fn((row: { id: string }) => ({
          id: row.id,
          resource: true,
        })),
        toConnectSessionResource: vi.fn((row: { id: string }) => ({
          id: row.id,
          sessionResource: true,
        })),
        channelForProvider: vi.fn(
          (_provider: string): string | undefined => "messenger",
        ),
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
  connectionStateService: { list: mocks.list },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {},
}))

class MockChatbotXException extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
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
  },
  CONNECTION_REGISTRY: {
    claude: { provider: { strategy: "api_key", kind: "integration" } },
    messenger: { provider: { strategy: "oauth_redirect", kind: "channel" } },
  },
}))

vi.mock("../src/features/connections/lib/resolve-provider", () => ({
  toConnectionResource: mocks.toConnectionResource,
  channelForProvider: mocks.channelForProvider,
  listConnectionProviderResources: vi.fn(),
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

const { connectionsAPI } = await import(
  "../src/features/connections/api/private"
)

const createPath = "/workspaces/{workspaceId}/connections"

const baseInput = { workspaceId: "ws-1", provider: "claude", config: {} }
const context = { user: { id: "user-1" } }

const getCreateHandler = () => {
  const state = mocks.endpoints.get(createPath)
  if (!state?.handler) {
    throw new Error("createConnectionAPI handler was not registered")
  }
  return state.handler
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("private connectionsAPI.createConnectionAPI", () => {
  test("registers as a workspace-authorized endpoint", () => {
    expect(connectionsAPI).toHaveProperty("listConnectionsAPI")
    const state = mocks.endpoints.get(createPath)
    expect(state?.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(state?.workspaceMapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
  })

  test("calls connectionService.connectFromCredentials with actorUserId — the same service method the public route calls, with only the caller's actor identity differing", async () => {
    mocks.list.mockResolvedValue({ data: [{ id: "existing-conn" }] })
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
    })
  })

  test("calls connectionService.startSession with actorUserId for an OAuth provider — same service as the public route", async () => {
    mocks.list.mockResolvedValue({ data: [{ id: "existing-conn" }] })
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

  test("throws channelHidden when the channel has no existing connection and the tenant's policy hides it (the hidden-channel branch)", async () => {
    mocks.list.mockResolvedValue({ data: [] })
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

  test("does not hide an already-connected channel — an existing Connection row grandfathers it in regardless of the current policy", async () => {
    mocks.list.mockResolvedValue({ data: [{ id: "existing-conn" }] })
    // The hidden-channel check only ever runs when there is NO existing
    // connection (`data.length === 0`) — `resolveChannelPolicy` must not
    // even be called here, so no stub is queued for it.
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
    })
  })

  test("does not hide a channel when no tenant policy applies (non-white-label)", async () => {
    mocks.list.mockResolvedValue({ data: [] })
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
