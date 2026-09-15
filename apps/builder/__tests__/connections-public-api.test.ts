// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: ProcedureHandler) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getForWorkspace: vi.fn(),
  updateDisplayName: vi.fn(),
  listConnectionProviderResources: vi.fn(),
  toConnectionResource: vi.fn((row: { id: string }) => ({
    id: row.id,
    resource: true,
  })),
  toConnectSessionResource: vi.fn((row: { id: string }) => ({
    id: row.id,
    sessionResource: true,
  })),
  channelForProvider: vi.fn(
    (_provider: string): string | undefined => undefined,
  ),
  resolveOAuthCredential: vi.fn(),
  sanitizeOptionalReturnUrl: vi.fn(async (url?: string) => url),
  resolveOwnerForWorkspace: vi.fn(async () => "owner-1"),
  resolveChannelPolicy: vi.fn(
    async (
      _workspaceId: string,
    ): Promise<{
      ownerId: string
      creatable: string[]
      visibleChannels: string[]
    } | null> => null,
  ),
  findSessionByIdForWorkspace: vi.fn(),
  requireSessionByIdForWorkspace: vi.fn(),
  submitSessionInput: vi.fn(),
  cancelSession: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    list: mocks.list,
    getForWorkspace: mocks.getForWorkspace,
    updateDisplayName: mocks.updateDisplayName,
  },
  platformCredentialService: { resolveForOwner: vi.fn() },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    findByIdForWorkspace: mocks.findSessionByIdForWorkspace,
    requireByIdForWorkspace: mocks.requireSessionByIdForWorkspace,
    submitInput: mocks.submitSessionInput,
    cancel: mocks.cancelSession,
  },
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

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: connectionServiceMocks,
  CONNECTION_REGISTRY: {
    claude: { provider: { strategy: "api_key", kind: "integration" } },
    messenger: { provider: { strategy: "oauth_redirect", kind: "channel" } },
    zalo: { provider: { strategy: "oauth_redirect", kind: "channel" } },
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
  ChatbotXException: MockChatbotXException,
  notFoundException: (message: string) =>
    new MockChatbotXException(message, "notFound"),
  channelHiddenException: (channel: string) =>
    new MockChatbotXException(`${channel} hidden`, "channelHidden"),
  connectionNotConfiguredException: (provider: string) =>
    new MockChatbotXException(
      `${provider} not configured`,
      "connectionNotConfigured",
    ),
  connectSessionExpiredException: (message: string) =>
    new MockChatbotXException(message, "connectSessionExpired"),
}))

vi.mock("../src/features/connections/lib/resolve-provider", () => ({
  toConnectionResource: mocks.toConnectionResource,
  listConnectionProviderResources: mocks.listConnectionProviderResources,
  channelForProvider: mocks.channelForProvider,
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
  resolveOwnerForWorkspace: mocks.resolveOwnerForWorkspace,
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: mocks.resolveChannelPolicy,
}))

const {
  connectionsPublicRouter,
  connectionProvidersPublicRouter,
  connectSessionsPublicRouter,
} = await import("../src/features/connections/api/public")

const findProcedure = (method: string, path: string): CapturedProcedure => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure captured for ${method} ${path}`)
  }
  return found
}

const context = {
  workspace: { id: "workspace-1", ownerId: "owner-1" },
  apiToken: { id: "token-1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.channelForProvider.mockReturnValue(undefined)
  mocks.resolveOwnerForWorkspace.mockResolvedValue("owner-1")
  mocks.resolveChannelPolicy.mockResolvedValue(null)
  mocks.sanitizeOptionalReturnUrl.mockImplementation(
    async (url?: string) => url,
  )
})

describe("connections public router", () => {
  test("registers list/get under /v1/connections and connection-providers under /v1/connection-providers", () => {
    expect(() => connectionsPublicRouter).not.toThrow()
    expect(() => connectionProvidersPublicRouter).not.toThrow()
    expect(() => connectSessionsPublicRouter).not.toThrow()
    expect(findProcedure("GET", "/v1/connections")).toBeDefined()
    expect(findProcedure("GET", "/v1/connections/{id}")).toBeDefined()
    expect(findProcedure("GET", "/v1/connection-providers")).toBeDefined()
  })
})

describe("GET /v1/connections", () => {
  const procedure = findProcedure("GET", "/v1/connections")

  test("passes filters through and computes pageCount from the total count", async () => {
    mocks.list.mockResolvedValueOnce({
      data: [{ id: "conn-1" }, { id: "conn-2" }],
      count: 45,
    })

    const result = await procedure.handler?.({
      context,
      input: {
        kind: "channel",
        provider: "messenger",
        page: 1,
        perPage: 20,
      },
    })

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "channel",
      provider: "messenger",
      channel: undefined,
      status: undefined,
      page: 1,
      perPage: 20,
    })
    expect(result).toEqual({
      data: [
        { id: "conn-1", resource: true },
        { id: "conn-2", resource: true },
      ],
      pageCount: 3,
    })
  })

  test("never returns fewer than 1 page even when count is 0", async () => {
    mocks.list.mockResolvedValueOnce({ data: [], count: 0 })

    const result = await procedure.handler?.({
      context,
      input: { page: 1, perPage: 20 },
    })

    expect((result as { pageCount: number }).pageCount).toBe(1)
  })
})

describe("GET /v1/connections/{id}", () => {
  const procedure = findProcedure("GET", "/v1/connections/{id}")

  test("throws notFoundException when the connection does not exist in this workspace", async () => {
    mocks.getForWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("Connection not found")
  })

  test("returns the resolved resource, scoped to the token's workspace", async () => {
    mocks.getForWorkspace.mockResolvedValueOnce({ id: "conn-1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "conn-1" },
    })

    expect(mocks.getForWorkspace).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ id: "conn-1", resource: true })
  })
})

describe("GET /v1/connection-providers", () => {
  const procedure = findProcedure("GET", "/v1/connection-providers")

  test("delegates to listConnectionProviderResources scoped to the token's workspace", async () => {
    mocks.listConnectionProviderResources.mockResolvedValueOnce([
      { provider: "messenger", available: true },
    ])

    const result = await procedure.handler?.({
      context,
      input: { kind: "channel" },
    })

    expect(mocks.listConnectionProviderResources).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "channel",
    })
    expect(result).toEqual({
      data: [{ provider: "messenger", available: true }],
      pageCount: 1,
    })
  })
})

describe("DELETE /v1/connections/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/connections/{id}")

  test("delegates to connectionService.disconnect scoped to the token's workspace", async () => {
    connectionServiceMocks.disconnect.mockResolvedValueOnce({ id: "conn-1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "conn-1" },
    })

    expect(connectionServiceMocks.disconnect).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ id: "conn-1", resource: true })
  })
})

describe("POST /v1/connections/{id}/refresh", () => {
  const procedure = findProcedure("POST", "/v1/connections/{id}/refresh")

  test("delegates to connectionService.refresh scoped to the token's workspace", async () => {
    connectionServiceMocks.refresh.mockResolvedValueOnce({ id: "conn-1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "conn-1" },
    })

    expect(connectionServiceMocks.refresh).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ id: "conn-1", resource: true })
  })

  test("propagates a connectionInactive failure without swallowing it", async () => {
    connectionServiceMocks.refresh.mockRejectedValueOnce(
      new MockChatbotXException(
        "This connection is not active.",
        "connectionInactive",
      ),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "conn-1" } }),
    ).rejects.toThrow("This connection is not active.")
  })
})

describe("POST /v1/connections/{id}/verify", () => {
  const procedure = findProcedure("POST", "/v1/connections/{id}/verify")

  test("delegates to connectionService.verify scoped to the token's workspace", async () => {
    connectionServiceMocks.verify.mockResolvedValueOnce({ id: "conn-1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "conn-1" },
    })

    expect(connectionServiceMocks.verify).toHaveBeenCalledWith({
      connectionId: "conn-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ id: "conn-1", resource: true })
  })
})

describe("POST /v1/connections", () => {
  const procedure = findProcedure("POST", "/v1/connections")

  test("connects a credential-strategy provider immediately and returns connection, session: null", async () => {
    mocks.channelForProvider.mockReturnValue(undefined)
    connectionServiceMocks.connectFromCredentials.mockResolvedValueOnce({
      id: "conn-1",
    })

    const result = await procedure.handler?.({
      context,
      input: { provider: "claude", config: { apiKey: "sk-live" } },
    })

    expect(connectionServiceMocks.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
    })
    expect(result).toEqual({
      connection: { id: "conn-1", resource: true },
      session: null,
    })
    expect(connectionServiceMocks.startSession).not.toHaveBeenCalled()
  })

  test("starts an OAuth session and returns connection: null, session", async () => {
    mocks.channelForProvider.mockReturnValue("messenger")
    mocks.list.mockResolvedValueOnce({ data: [], count: 0 })
    mocks.resolveChannelPolicy.mockResolvedValueOnce({
      ownerId: "owner-1",
      creatable: ["messenger"],
      visibleChannels: ["messenger"],
    })
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: { clientId: "id" },
      callbackUrl: "https://app.example.test/integrations/messenger/callback",
    })
    connectionServiceMocks.startSession.mockResolvedValueOnce({
      session: { id: "session-1" },
    })

    const result = await procedure.handler?.({
      context,
      input: { provider: "messenger" },
    })

    expect(connectionServiceMocks.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        provider: "messenger",
        purpose: "connect",
        actorTokenId: "token-1",
        platformOwnerId: "owner-1",
      }),
    )
    expect(result).toEqual({
      connection: null,
      session: { id: "session-1", sessionResource: true },
    })
  })

  test("throws channelHidden when the channel is hidden and not already connected", async () => {
    mocks.channelForProvider.mockReturnValue("messenger")
    mocks.list.mockResolvedValueOnce({ data: [], count: 0 })
    mocks.resolveChannelPolicy.mockResolvedValueOnce({
      ownerId: "owner-1",
      creatable: [],
      visibleChannels: [],
    })

    await expect(
      procedure.handler?.({ context, input: { provider: "messenger" } }),
    ).rejects.toMatchObject({ code: "channelHidden" })
    expect(connectionServiceMocks.startSession).not.toHaveBeenCalled()
  })

  test("skips the hidden-channel check when the provider is already connected in this workspace", async () => {
    mocks.channelForProvider.mockReturnValue("messenger")
    mocks.list.mockResolvedValueOnce({
      data: [{ id: "conn-existing" }],
      count: 1,
    })
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: {},
      callbackUrl: "https://app.example.test/callback",
    })
    connectionServiceMocks.startSession.mockResolvedValueOnce({
      session: { id: "session-1" },
    })

    await procedure.handler?.({ context, input: { provider: "messenger" } })

    expect(mocks.resolveChannelPolicy).not.toHaveBeenCalled()
  })
})

describe("POST /v1/connections/{id}/reconnect", () => {
  const procedure = findProcedure("POST", "/v1/connections/{id}/reconnect")

  test("throws notFound when the connection does not exist", async () => {
    mocks.getForWorkspace.mockResolvedValueOnce(undefined)
    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("starts a reconnect session for the connection's own provider", async () => {
    mocks.getForWorkspace.mockResolvedValueOnce({
      id: "conn-1",
      provider: "zalo",
    })
    mocks.resolveOAuthCredential.mockResolvedValueOnce({
      credential: { appId: "id" },
      callbackUrl: "https://app.example.test/integrations/zalo/callback",
    })
    connectionServiceMocks.reconnect.mockResolvedValueOnce({
      session: { id: "session-2" },
    })

    const result = await procedure.handler?.({
      context,
      input: { id: "conn-1" },
    })

    expect(connectionServiceMocks.reconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        workspaceId: "workspace-1",
        actorTokenId: "token-1",
        platformOwnerId: "owner-1",
      }),
    )
    expect(result).toEqual({
      connection: null,
      session: { id: "session-2", sessionResource: true },
    })
  })
})

describe("PATCH /v1/connections/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/connections/{id}")

  test("throws notFound when the connection does not exist in this workspace", async () => {
    mocks.updateDisplayName.mockResolvedValueOnce(undefined)
    await expect(
      procedure.handler?.({
        context,
        input: { id: "missing", displayName: "New name" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("renames the connection scoped to the token's workspace", async () => {
    mocks.updateDisplayName.mockResolvedValueOnce({ id: "conn-1" })

    const result = await procedure.handler?.({
      context,
      input: { id: "conn-1", displayName: "New name" },
    })

    expect(mocks.updateDisplayName).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "workspace-1",
      displayName: "New name",
    })
    expect(result).toEqual({ id: "conn-1", resource: true })
  })
})

describe("GET /v1/connect-sessions/{id}", () => {
  const procedure = () => findProcedure("GET", "/v1/connect-sessions/{id}")

  test("throws notFound when the session does not exist in this workspace", async () => {
    mocks.findSessionByIdForWorkspace.mockResolvedValueOnce(undefined)
    await expect(
      procedure().handler?.({ context, input: { id: "missing" } }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("returns the session resource scoped to the token's workspace", async () => {
    mocks.findSessionByIdForWorkspace.mockResolvedValueOnce({ id: "session-1" })
    const result = await procedure().handler?.({
      context,
      input: { id: "session-1" },
    })
    expect(mocks.findSessionByIdForWorkspace).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ id: "session-1", sessionResource: true })
  })
})

describe("POST /v1/connect-sessions/{id}/targets", () => {
  const procedure = () =>
    findProcedure("POST", "/v1/connect-sessions/{id}/targets")

  test("delegates to connectionService.connectTargets and maps the envelope", async () => {
    connectionServiceMocks.connectTargets.mockResolvedValueOnce({
      session: { id: "session-1" },
      connections: [{ id: "conn-1" }],
      outcomes: [
        { targetId: "page-1", status: "connected", connectionId: "conn-1" },
      ],
    })

    const result = await procedure().handler?.({
      context,
      input: { id: "session-1", targetIds: ["page-1"] },
    })

    expect(connectionServiceMocks.connectTargets).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      targetIds: ["page-1"],
    })
    expect(result).toEqual({
      session: { id: "session-1", sessionResource: true },
      connections: [{ id: "conn-1", resource: true }],
      outcomes: [
        { targetId: "page-1", status: "connected", connectionId: "conn-1" },
      ],
    })
  })
})

describe("POST /v1/connect-sessions/{id}/input", () => {
  const procedure = () =>
    findProcedure("POST", "/v1/connect-sessions/{id}/input")

  test("throws connectSessionExpired when the session is not awaiting input", async () => {
    mocks.requireSessionByIdForWorkspace.mockResolvedValueOnce({
      id: "session-1",
      nextAction: { type: "open_url", url: "https://x" },
    })
    await expect(
      procedure().handler?.({
        context,
        input: { id: "session-1", input: { pin: "123456" } },
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(mocks.submitSessionInput).not.toHaveBeenCalled()
  })

  test("acknowledges an enter_input session and reverts to wait", async () => {
    mocks.requireSessionByIdForWorkspace.mockResolvedValueOnce({
      id: "session-1",
      nextAction: { type: "enter_input", inputFields: [] },
    })
    mocks.submitSessionInput.mockResolvedValueOnce({ id: "session-1" })

    const result = await procedure().handler?.({
      context,
      input: { id: "session-1", input: { pin: "123456" } },
    })

    expect(mocks.submitSessionInput).toHaveBeenCalledWith({
      id: "session-1",
      nextAction: { type: "wait" },
    })
    expect(result).toEqual({ id: "session-1", sessionResource: true })
  })
})

describe("DELETE /v1/connect-sessions/{id}", () => {
  const procedure = () => findProcedure("DELETE", "/v1/connect-sessions/{id}")

  test("delegates to connectSessionService.cancel scoped to the token's workspace", async () => {
    mocks.cancelSession.mockResolvedValueOnce({ id: "session-1" })
    const result = await procedure().handler?.({
      context,
      input: { id: "session-1" },
    })
    expect(mocks.cancelSession).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "workspace-1",
    })
    expect(result).toEqual({ id: "session-1", sessionResource: true })
  })
})
