import { channelLimitReachedException } from "@chatbotx.io/business/errors"
import { AuthException } from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  findById: vi.fn(),
  findByProviderSourceId: vi.fn(),
  findByProviderAndSourceIdAnyWorkspace: vi.fn(async () => undefined),
  insert: vi.fn(),
  update: vi.fn(),
  findOwnerUserIdByWorkspaceId: vi.fn(async () => "owner-1"),
  transition: vi.fn(async (input: Record<string, unknown>) => ({
    id: input.connectionId,
    status: "connected",
  })),
  markUnhealthy: vi.fn(async (input: Record<string, unknown>) => ({
    id: input.connectionId,
    status: "needs_reauth",
  })),
  recordAuthSaved: vi.fn(async (input: Record<string, unknown>) => ({
    id: input.connectionId,
    status: "connected",
  })),
  loadAuthByForeignKey: vi.fn(async () => ({ authType: "none" })),
  saveAuthByForeignKey: vi.fn(async () => undefined),
  deleteRowByForeignKey: vi.fn(async () => undefined),
  insertRow: vi.fn(async () => ({ id: "sat-1", integrationId: "int-1" })),
  disconnect: vi.fn(async () => undefined),
  unsubscribe: vi.fn(async () => undefined),
  subscribe: vi.fn(async () => undefined),
  verify: vi.fn(async () => ({ ok: true })),
  ensureFreshAuth: vi.fn(async () => undefined),
  fromCredentials: vi.fn(async () => ({
    authType: "secretText",
    secretText: "sk-live",
  })),
  isUniqueViolationError: vi.fn(() => false),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => await fn("tx")),
  createSession: vi.fn(),
  findByNonce: vi.fn(),
  submitInput: vi.fn(),
  attachAuthorization: vi.fn(),
  recordResults: vi.fn(),
  failSession: vi.fn(),
  authorizeUrl: vi.fn(() => "https://provider.example.com/authorize"),
  exchangeCode: vi.fn(async () => ({
    authType: "oauth2",
    clientId: "id",
    clientSecret: "secret",
    redirectUrl: "https://x",
    tokens: { accessToken: "tok" },
  })),
  listCandidates: vi.fn(async () => [
    { sourceId: "page-1", displayName: "Page One" },
  ]),
  encryptObject: vi.fn(async () => ({
    iv: "iv",
    ciphertext: "c",
    keyId: "k",
  })),
  decryptObject: vi.fn(),
  findSessionByIdForWorkspace: vi.fn(),
  claimTarget: vi.fn(async () => true),
  inboxCreate: vi.fn(async () => ({
    inbox: { id: "inbox-new" },
    wasCreated: true,
  })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findById: mocks.findById,
    findByProviderSourceId: mocks.findByProviderSourceId,
    findByProviderAndSourceIdAnyWorkspace:
      mocks.findByProviderAndSourceIdAnyWorkspace,
    insert: mocks.insert,
    update: mocks.update,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: {
    encryptObject: mocks.encryptObject,
    decryptObject: mocks.decryptObject,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceMemberService: {
    findOwnerUserIdByWorkspaceId: mocks.findOwnerUserIdByWorkspaceId,
  },
  inboxService: { create: mocks.inboxCreate },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  connectionStateService: {
    transition: mocks.transition,
    markUnhealthy: mocks.markUnhealthy,
    recordAuthSaved: mocks.recordAuthSaved,
  },
  isActiveConnectionStatus: (status: string) =>
    status === "connected" || status === "degraded",
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    create: mocks.createSession,
    findByNonce: mocks.findByNonce,
    findByIdForWorkspace: mocks.findSessionByIdForWorkspace,
    claimTarget: mocks.claimTarget,
    submitInput: mocks.submitInput,
    attachAuthorization: mocks.attachAuthorization,
    recordResults: mocks.recordResults,
    fail: mocks.failSession,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => {
  class TestChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code: string, httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  }
  return {
    ChatbotXException: TestChatbotXException,
    channelLimitReachedException: () =>
      new TestChatbotXException(
        "Channel limit reached for this plan",
        "channelLimitReached",
        409,
      ),
    connectionInactiveException: () =>
      new TestChatbotXException(
        "This connection is not active.",
        "connectionInactive",
        409,
      ),
    connectionNotConfiguredException: (provider: string) =>
      new TestChatbotXException(
        `Connection provider "${provider}" is not configured.`,
        "connectionNotConfigured",
        500,
      ),
    connectionNotRefreshableException: (provider: string) =>
      new TestChatbotXException(
        `Connection provider "${provider}" does not support refresh.`,
        "connectionNotRefreshable",
        400,
      ),
    connectionAlreadyConnectedException: () =>
      new TestChatbotXException(
        "This provider is already connected in this workspace.",
        "connectionAlreadyConnected",
        409,
      ),
    connectionWrongStrategyException: (provider: string) =>
      new TestChatbotXException(
        `Connection provider "${provider}" does not accept direct credentials.`,
        "connectionWrongStrategy",
        400,
      ),
    connectionCredentialsRejectedException: (message: string) =>
      new TestChatbotXException(message, "connectionCredentialsRejected", 400),
    connectionNotOAuthException: (provider: string) =>
      new TestChatbotXException(
        `Connection provider "${provider}" does not support an OAuth connect flow.`,
        "connectionNotOAuth",
        400,
      ),
    connectionStateMismatchException: () =>
      new TestChatbotXException(
        "This connect session could not be verified.",
        "connectionStateMismatch",
        400,
      ),
    connectionNoCandidatesException: () =>
      new TestChatbotXException(
        "No connectable accounts were found for this authorization.",
        "connectionNoCandidates",
        400,
      ),
    connectionIdentityMismatchException: () =>
      new TestChatbotXException(
        "The reauthorized account does not match the connection being reconnected.",
        "connectionIdentityMismatch",
        400,
      ),
    connectSessionExpiredException: (message: string) =>
      new TestChatbotXException(message, "connectSessionExpired", 400),
    validationException: (field: string, message: string) => {
      const error = new TestChatbotXException(message, "validation", 422)
      return Object.assign(error, { field })
    },
    toPublicErrorMessage: (error: unknown, fallback: string) =>
      error instanceof Error ? error.message : fallback,
    notFoundException: (message: string) =>
      new TestChatbotXException(message, "notFound", 404),
  }
})

let refreshAuthHandler: unknown = vi.fn()

const mockAdapter = {
  provider: {
    kind: "channel",
    strategy: "api_key",
    configFields: [
      { name: "apiKey", type: "secret", required: true, labelKey: "x" },
    ],
    webhook: { unsubscribe: mocks.unsubscribe, subscribe: mocks.subscribe },
    verify: mocks.verify,
    fromCredentials: mocks.fromCredentials,
    describe: () => ({ sourceId: "workspace", displayName: "Test Provider" }),
    authorizeUrl: mocks.authorizeUrl,
    exchangeCode: mocks.exchangeCode,
    listCandidates: mocks.listCandidates,
    multiAccount: true,
  },
  integration: {
    disconnect: mocks.disconnect,
    ensureFreshAuth: mocks.ensureFreshAuth,
    get refreshAuth() {
      return refreshAuthHandler
    },
  },
  store: {
    loadAuthByForeignKey: mocks.loadAuthByForeignKey,
    saveAuthByForeignKey: mocks.saveAuthByForeignKey,
    deleteRowByForeignKey: mocks.deleteRowByForeignKey,
    insertRow: mocks.insertRow,
    onDisconnect: "delete_row",
    duplicateConstraint: "Test_workspaceId_key",
  },
}

vi.mock("../src/registry", () => ({
  CONNECTION_REGISTRY: new Proxy(
    {},
    {
      get: (_target, provider) =>
        provider === "unregistered" ? null : mockAdapter,
    },
  ),
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { connectionService } = await import("../src/service")

const baseConnection = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "conn-1",
  workspaceId: "ws-1",
  provider: "messenger",
  kind: "channel",
  status: "connected",
  inboxId: "inbox-1",
  integrationId: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  refreshAuthHandler = vi.fn()
  mockAdapter.provider.kind = "channel"
  mocks.findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")
  mocks.loadAuthByForeignKey.mockResolvedValue({ authType: "none" })
  mocks.verify.mockResolvedValue({ ok: true })
  mocks.fromCredentials.mockResolvedValue({
    authType: "secretText",
    secretText: "sk-live",
  })
  mocks.isUniqueViolationError.mockReturnValue(false)
  mocks.findByProviderSourceId.mockResolvedValue(undefined)
  mocks.findByProviderAndSourceIdAnyWorkspace.mockResolvedValue(undefined)
  mocks.insertRow.mockResolvedValue({ id: "sat-1", integrationId: "int-1" })
  mocks.insert.mockImplementation(async (values: Record<string, unknown>) => ({
    id: "conn-new",
    ...values,
  }))
  mocks.transition.mockImplementation(async (input) => ({
    id: input.connectionId,
    status: "disconnected",
  }))
  mocks.markUnhealthy.mockImplementation(async (input) => ({
    id: input.connectionId,
    status: "needs_reauth",
  }))
  mocks.authorizeUrl.mockReturnValue("https://provider.example.com/authorize")
  mocks.exchangeCode.mockResolvedValue({
    authType: "oauth2",
    clientId: "id",
    clientSecret: "secret",
    redirectUrl: "https://x",
    tokens: { accessToken: "tok" },
  })
  mocks.listCandidates.mockResolvedValue([
    { sourceId: "page-1", displayName: "Page One" },
  ])
  mocks.encryptObject.mockResolvedValue({
    iv: "iv",
    ciphertext: "c",
    keyId: "k",
  })
  mocks.createSession.mockResolvedValue({
    session: { id: "session-1", workspaceId: "ws-1", provider: "messenger" },
    nonce: "nonce-abc",
  })
  mocks.findByNonce.mockResolvedValue({
    id: "session-1",
    workspaceId: "ws-1",
    provider: "messenger",
    status: "pending",
  })
  mocks.submitInput.mockImplementation(
    async (input: { id: string; nextAction: unknown }) => ({
      id: input.id,
      nextAction: input.nextAction,
    }),
  )
  mocks.attachAuthorization.mockImplementation(
    async (input: Record<string, unknown>) => ({
      id: input.id,
      status: "awaiting_selection",
      targets: input.targets,
    }),
  )
  mocks.failSession.mockImplementation(
    async (input: Record<string, unknown>) => ({
      id: input.id,
      status: "failed",
    }),
  )
  mocks.findById.mockResolvedValue(baseConnection())
  mocks.recordResults.mockImplementation(
    async (input: Record<string, unknown>) => ({
      id: input.id,
      status: "completed",
    }),
  )
})

describe("ConnectionService.disconnect", () => {
  it("throws notFound when the connection does not belong to the workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)
    await expect(
      connectionService.disconnect({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Connection not found")
  })

  it("calls provider disconnect + webhook unsubscribe + deletes the satellite row, then transitions", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    const result = await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.loadAuthByForeignKey).toHaveBeenCalledWith("inbox-1")
    expect(mocks.disconnect).toHaveBeenCalledWith({ authType: "none" })
    expect(mocks.unsubscribe).toHaveBeenCalledWith({
      auth: { authType: "none" },
    })
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalledWith("inbox-1", "tx")
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "user.disconnect",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(result.status).toBe("disconnected")
  })

  it("never resolves an ownerId (channels quota) for a kind:integration connection", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({
        kind: "integration",
        inboxId: null,
        integrationId: "int-1",
      }),
    )
    await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.findOwnerUserIdByWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "user.disconnect",
      ownerId: undefined,
      tx: "tx",
    })
  })

  it("proceeds to the state transition and records lastError even when provider-side teardown throws", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.disconnect.mockRejectedValue(new Error("upstream 500"))
    await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalledWith("inbox-1", "tx")
    expect(mocks.update).toHaveBeenCalledWith(
      { id: "conn-1", values: { lastError: "upstream 500" } },
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "user.disconnect", tx: "tx" }),
    )
  })
})

describe("ConnectionService.refresh", () => {
  it("throws connectionInactive for a disconnected connection", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({ status: "disconnected" }),
    )
    await expect(
      connectionService.refresh({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "connectionInactive" })
  })

  it("throws connectionNotRefreshable when the provider has no refreshAuth", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    refreshAuthHandler = undefined
    await expect(
      connectionService.refresh({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "connectionNotRefreshable" })
  })

  it("calls ensureFreshAuth with force:true and returns the reloaded connection", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    const result = await connectionService.refresh({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.ensureFreshAuth).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { authType: "none" } }),
      { force: true },
    )
    expect(result.id).toBe("conn-1")
  })

  it("authStore.save persists via saveAuthByForeignKey and records authExpiresAt", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.findById.mockResolvedValue(baseConnection())
    mocks.ensureFreshAuth.mockImplementation(async (ctx) => {
      await ctx.authStore.save({
        authType: "oauth2",
        tokens: { accessToken: "new", expiresAt: "2030-01-01T00:00:00.000Z" },
      })
    })
    await connectionService.refresh({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.saveAuthByForeignKey).toHaveBeenCalledWith(
      "inbox-1",
      expect.objectContaining({ authType: "oauth2" }),
    )
    expect(mocks.recordAuthSaved).toHaveBeenCalledWith({
      connectionId: "conn-1",
      authExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    })
  })

  it("authStore.markOffline calls markUnhealthy for an AuthException", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.findById.mockResolvedValue(baseConnection())
    mocks.ensureFreshAuth.mockImplementation(async (ctx) => {
      await ctx.authStore.markOffline(new AuthException("revoked"))
    })
    await connectionService.refresh({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.markUnhealthy).toHaveBeenCalledWith({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })
    expect(mocks.transition).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "refresh.transient_failure" }),
    )
  })

  it("authStore.markOffline degrades via refresh.transient_failure for a non-auth error", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.findById.mockResolvedValue(baseConnection())
    mocks.ensureFreshAuth.mockImplementation(async (ctx) => {
      await ctx.authStore.markOffline(new Error("ECONNRESET"))
    })
    await connectionService.refresh({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.markUnhealthy).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "refresh.transient_failure",
      reason: "refresh_failed",
      ownerId: "owner-1",
    })
  })
})

describe("ConnectionService.verify", () => {
  it("transitions to verify.ok on a healthy check", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.verify.mockResolvedValue({ ok: true })
    await connectionService.verify({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "verify.ok",
      ownerId: "owner-1",
    })
  })

  it("marks unhealthy with token_revoked when the health check reports a revoked auth", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.verify.mockResolvedValue({
      ok: false,
      revoked: true,
      error: "expired",
    })
    await connectionService.verify({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.markUnhealthy).toHaveBeenCalledWith({
      connectionId: "conn-1",
      reason: "token_revoked",
      ownerId: "owner-1",
    })
  })

  it("transitions to verify.failed_non_auth for a non-auth health failure", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.verify.mockResolvedValue({
      ok: false,
      revoked: false,
      error: "rate_limited",
    })
    await connectionService.verify({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })
  })
})

describe("ConnectionService.connectFromCredentials", () => {
  it("throws connectionWrongStrategy when the provider strategy is not credential-based", async () => {
    mockAdapter.provider.strategy = "oauth_redirect" as never
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toMatchObject({ code: "connectionWrongStrategy" })
    mockAdapter.provider.strategy = "api_key"
  })

  it("throws a field-scoped validation error when a required config field is missing", async () => {
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: {},
      }),
    ).rejects.toMatchObject({ code: "validation", field: "apiKey" })
    expect(mocks.fromCredentials).not.toHaveBeenCalled()
  })

  it("throws connectionCredentialsRejected when fromCredentials rejects the config", async () => {
    mocks.fromCredentials.mockRejectedValue(new Error("Invalid API key"))
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-bad" },
      }),
    ).rejects.toMatchObject({ code: "connectionCredentialsRejected" })
  })

  it("throws connectionAlreadyConnected when an active connection already exists for this provider", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-1",
      status: "connected",
    })
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toMatchObject({ code: "connectionAlreadyConnected" })
    expect(mocks.insertRow).not.toHaveBeenCalled()
  })

  it("allowUpdate: true replaces an already-connected provider's config in place instead of throwing", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-existing",
      status: "connected",
    })

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-new" },
      allowUpdate: true,
    })

    expect(mocks.insertRow).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn-existing" }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-existing",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(result.id).toBe("conn-existing")
  })

  it("maps a duplicate-constraint insert failure to connectionAlreadyConnected", async () => {
    mocks.insertRow.mockRejectedValue(new Error("unique violation"))
    mocks.isUniqueViolationError.mockReturnValue(true)
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toMatchObject({ code: "connectionAlreadyConnected" })
  })

  it("inserts a fresh Connection as disconnected then transitions it to connected inside one transaction", async () => {
    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
      actorUserId: "user-1",
    })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.insertRow).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
      "tx",
    )
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "claude",
        sourceId: "workspace",
        integrationId: "int-1",
        status: "disconnected",
        createdBy: "user-1",
      }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-new",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(result.id).toBe("conn-new")
  })

  it("subscribes the provider webhook after a successful connect", async () => {
    await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
    })

    expect(mocks.subscribe).toHaveBeenCalledWith({
      auth: { authType: "secretText", secretText: "sk-live" },
    })
  })

  it("degrades the connection when the post-connect webhook subscribe fails, without failing the connect itself", async () => {
    mocks.subscribe.mockRejectedValueOnce(new Error("webhook endpoint down"))

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
    })

    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-new",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-new",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })
    expect(result).toBeDefined()
  })

  it("passes config fields outside the provider's configFields through to the satellite insert unvalidated", async () => {
    await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live", model: "claude-3", temperature: 0.7 },
    })

    expect(mocks.insertRow).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { model: "claude-3", temperature: 0.7 },
      }),
      "tx",
    )
  })

  it("does not resolve an ownerId for a kind:integration provider", async () => {
    mockAdapter.provider.kind = "integration"
    await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
    })
    expect(mocks.findOwnerUserIdByWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: undefined }),
    )
  })

  it("revives a previously disconnected connection instead of inserting a duplicate", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-existing",
      status: "disconnected",
    })

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
    })

    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-existing",
        values: expect.objectContaining({ integrationId: "int-1" }),
      }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-existing",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(result.id).toBe("conn-existing")
  })

  it("revives a keep_row provider's still-live satellite row via saveAuthByForeignKey instead of re-inserting it", async () => {
    mockAdapter.store.onDisconnect = "keep_row"
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-existing",
      status: "disconnected",
      integrationId: "int-existing",
    })

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-live" },
    })

    expect(mocks.insertRow).not.toHaveBeenCalled()
    expect(mocks.saveAuthByForeignKey).toHaveBeenCalledWith(
      "int-existing",
      expect.objectContaining({ authType: "secretText" }),
      "tx",
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-existing",
        values: expect.objectContaining({ integrationId: "int-existing" }),
      }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-existing",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(result.id).toBe("conn-existing")

    mockAdapter.store.onDisconnect = "delete_row"
  })
})

describe("ConnectionService.startSession", () => {
  it("throws connectionNotOAuth when the provider has no authorizeUrl", async () => {
    mockAdapter.provider.authorizeUrl = undefined as never
    await expect(
      connectionService.startSession({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "connect",
        credential: {},
        callbackUrl: "https://app.example.test/integrations/messenger/callback",
      }),
    ).rejects.toMatchObject({ code: "connectionNotOAuth" })
    mockAdapter.provider.authorizeUrl = mocks.authorizeUrl
  })

  it("creates a session, builds state as sessionId.nonce, and persists the resulting nextAction", async () => {
    const result = await connectionService.startSession({
      workspaceId: "ws-1",
      provider: "messenger",
      purpose: "connect",
      credential: { clientId: "app-1" },
      callbackUrl: "https://app.example.test/integrations/messenger/callback",
      actorUserId: "user-1",
    })

    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "connect",
        actorUserId: "user-1",
      }),
    )
    expect(mocks.authorizeUrl).toHaveBeenCalledWith({
      credential: { clientId: "app-1" },
      callbackUrl: "https://app.example.test/integrations/messenger/callback",
      state: "session-1.nonce-abc",
    })
    expect(mocks.submitInput).toHaveBeenCalledWith({
      id: "session-1",
      nextAction: {
        type: "open_url",
        url: "https://provider.example.com/authorize",
      },
    })
    expect(result.nextAction).toEqual({
      type: "open_url",
      url: "https://provider.example.com/authorize",
    })
  })
})

describe("ConnectionService.completeAuthorization", () => {
  it("throws connectionStateMismatch when the nonce does not resolve to the claimed sessionId", async () => {
    mocks.findByNonce.mockResolvedValue({
      id: "session-other",
      status: "pending",
      provider: "messenger",
      workspaceId: "ws-1",
    })
    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectionStateMismatch" })
  })

  it("throws connectionStateMismatch when the nonce resolves to nothing (forged/expired state)", async () => {
    mocks.findByNonce.mockResolvedValue(undefined)
    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "wrong-nonce",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectionStateMismatch" })
  })

  it("throws connectSessionExpired when the session is no longer pending", async () => {
    mocks.findByNonce.mockResolvedValue({
      id: "session-1",
      status: "completed",
      provider: "messenger",
      workspaceId: "ws-1",
    })
    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
  })

  it("fails the session with exchange_failed when exchangeCode throws", async () => {
    mocks.exchangeCode.mockRejectedValue(new Error("bad code"))
    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectionCredentialsRejected" })
    expect(mocks.failSession).toHaveBeenCalledWith({
      id: "session-1",
      errorCode: "exchange_failed",
    })
  })

  it("fails the session with no_candidates when listCandidates returns an empty list", async () => {
    mocks.listCandidates.mockResolvedValue([])
    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectionNoCandidates" })
    expect(mocks.failSession).toHaveBeenCalledWith({
      id: "session-1",
      errorCode: "no_candidates",
    })
  })

  it("marks a candidate not selectable when it is already connected in this workspace", async () => {
    mocks.findByProviderAndSourceIdAnyWorkspace.mockResolvedValue({
      workspaceId: "ws-1",
      status: "connected",
    })
    await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })
    expect(mocks.attachAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            id: "page-1",
            selectable: false,
            alreadyConnected: "this_workspace",
          }),
        ],
      }),
    )
  })

  it("marks a candidate not selectable as other_workspace when connected elsewhere", async () => {
    mocks.findByProviderAndSourceIdAnyWorkspace.mockResolvedValue({
      workspaceId: "ws-2",
      status: "connected",
    })
    await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })
    expect(mocks.attachAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            id: "page-1",
            selectable: false,
            alreadyConnected: "other_workspace",
          }),
        ],
      }),
    )
  })

  it("encrypts the exchanged auth and attaches selectable targets on success", async () => {
    const result = await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })

    expect(mocks.encryptObject).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          sourceId: "page-1",
          displayName: "Page One",
        }),
      ],
      "connect-session:session-1",
    )
    expect(mocks.attachAuthorization).toHaveBeenCalledWith({
      id: "session-1",
      encryptedAuth: { iv: "iv", ciphertext: "c", keyId: "k" },
      targets: [
        expect.objectContaining({
          id: "page-1",
          name: "Page One",
          selectable: true,
        }),
      ],
    })
    expect(result.status).toBe("awaiting_selection")
  })

  it("falls back to describe() when the provider has no listCandidates", async () => {
    mockAdapter.provider.listCandidates = undefined as never
    await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })
    expect(mocks.attachAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({ id: "workspace", name: "Test Provider" }),
        ],
      }),
    )
    mockAdapter.provider.listCandidates = mocks.listCandidates
  })
})

describe("ConnectionService.reconnect", () => {
  it("throws notFound when the connection does not belong to the workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)
    await expect(
      connectionService.reconnect({
        connectionId: "conn-1",
        workspaceId: "ws-1",
        credential: {},
        callbackUrl: "https://app.example.test/callback",
      }),
    ).rejects.toThrow("Connection not found")
  })

  it("starts a session with purpose reconnect and targetConnectionId set to the existing connection", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    await connectionService.reconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
      credential: { clientId: "app-1" },
      callbackUrl: "https://app.example.test/callback",
      actorUserId: "user-1",
    })
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "reconnect",
        targetConnectionId: "conn-1",
        actorUserId: "user-1",
      }),
    )
  })
})

describe("ConnectionService.completeAuthorization (reconnect path)", () => {
  const reconnectSession = {
    id: "session-1",
    workspaceId: "ws-1",
    provider: "messenger",
    purpose: "reconnect",
    targetConnectionId: "conn-1",
    status: "pending",
  }

  it("verifies identity, saves auth, and revives the connection via connect.completed (not auth.saved)", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findById.mockResolvedValue(baseConnection({ sourceId: "page-1" }))
    mocks.exchangeCode.mockResolvedValue({
      authType: "oauth2",
      clientId: "id",
      clientSecret: "secret",
      redirectUrl: "https://x",
      tokens: { accessToken: "tok", expiresAt: "2030-01-01T00:00:00.000Z" },
    })
    mockAdapter.provider.describe = () => ({
      sourceId: "page-1",
      displayName: "Page One",
    })

    const result = await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })

    expect(mocks.saveAuthByForeignKey).toHaveBeenCalledWith(
      "inbox-1",
      expect.objectContaining({ authType: "oauth2" }),
      "tx",
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-1",
        values: expect.objectContaining({
          authExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          lastError: null,
        }),
      }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
    })
    expect(mocks.recordAuthSaved).not.toHaveBeenCalled()
    expect(mocks.recordResults).toHaveBeenCalledWith({
      id: "session-1",
      results: [
        { targetId: "page-1", status: "connected", connectionId: "conn-1" },
      ],
      resultConnectionIds: ["conn-1"],
    })
    expect(result.status).toBe("completed")
  })

  it("throws connectionIdentityMismatch and fails the session when the re-granted account differs", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findById.mockResolvedValue(baseConnection({ sourceId: "page-1" }))
    mockAdapter.provider.describe = () => ({
      sourceId: "page-2",
      displayName: "A Different Page",
    })

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectionIdentityMismatch" })
    expect(mocks.failSession).toHaveBeenCalledWith({
      id: "session-1",
      errorCode: "provider_denied",
    })
    expect(mocks.saveAuthByForeignKey).not.toHaveBeenCalled()

    mockAdapter.provider.describe = () => ({
      sourceId: "workspace",
      displayName: "Test Provider",
    })
  })

  it("throws notFound and fails the session when the target connection no longer exists", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.failSession).toHaveBeenCalledWith({
      id: "session-1",
      errorCode: "internal_error",
    })
  })

  it("never resolves an ownerId for a kind:integration connection being reconnected", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findById.mockResolvedValue(
      baseConnection({
        sourceId: "page-1",
        kind: "integration",
        inboxId: null,
        integrationId: "int-1",
      }),
    )
    mockAdapter.provider.describe = () => ({
      sourceId: "page-1",
      displayName: "Page One",
    })

    await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })

    expect(mocks.findOwnerUserIdByWorkspaceId).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: undefined }),
    )

    mockAdapter.provider.describe = () => ({
      sourceId: "workspace",
      displayName: "Test Provider",
    })
  })
})

describe("ConnectionService.connectTargets", () => {
  const awaitingSession = {
    id: "session-1",
    workspaceId: "ws-1",
    provider: "messenger",
    status: "awaiting_selection",
    encryptedAuth: { iv: "iv", ciphertext: "c", keyId: "k" },
    targets: [
      { id: "page-1", name: "Page One", selectable: true },
      {
        id: "page-2",
        name: "Page Two",
        selectable: false,
        alreadyConnected: "other_workspace",
      },
    ],
  }

  beforeEach(() => {
    mocks.findSessionByIdForWorkspace.mockResolvedValue(awaitingSession)
    mocks.decryptObject.mockResolvedValue([
      {
        sourceId: "page-1",
        displayName: "Page One",
        auth: { authType: "none" },
      },
      {
        sourceId: "page-2",
        displayName: "Page Two",
        auth: { authType: "none" },
      },
    ])
    mocks.claimTarget.mockResolvedValue(true)
    mocks.recordResults.mockImplementation(async (input) => ({
      ...awaitingSession,
      status: "completed",
      results: input.results,
      resultConnectionIds: input.resultConnectionIds,
    }))
    // Real `describe()` derives the descriptor from `auth`, not from the
    // candidate's own redacted `sourceId`/`displayName` — the shared
    // `mockAdapter` default ignores its input, so tests that need a
    // specific descriptor stand one up per candidate here.
    mockAdapter.provider.describe = () => ({
      sourceId: "page-1",
      displayName: "Page One",
    })
  })

  afterEach(() => {
    mockAdapter.provider.describe = () => ({
      sourceId: "workspace",
      displayName: "Test Provider",
    })
  })

  it("throws connectSessionExpired when the session is not awaiting_selection", async () => {
    mocks.findSessionByIdForWorkspace.mockResolvedValue({
      ...awaitingSession,
      status: "pending",
    })
    await expect(
      connectionService.connectTargets({
        sessionId: "session-1",
        workspaceId: "ws-1",
        targetIds: ["page-1"],
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
  })

  it("connects a selectable target: creates the inbox with skipQuota, inserts the Connection, and reports connected", async () => {
    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(mocks.claimTarget).toHaveBeenCalledWith({
      id: "session-1",
      targetId: "page-1",
    })
    expect(mocks.inboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          channel: "messenger",
          sourceId: "page-1",
        }),
        ownerId: "owner-1",
        skipQuota: true,
      }),
    )
    expect(mocks.insertRow).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox-new" }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "connect.completed",
        ownerId: "owner-1",
      }),
    )
    expect(result.outcomes).toEqual([
      { targetId: "page-1", status: "connected", connectionId: "conn-new" },
    ])
    expect(result.connections).toHaveLength(1)
    expect(mocks.recordResults).toHaveBeenCalledWith({
      id: "session-1",
      results: result.outcomes,
      resultConnectionIds: ["conn-new"],
    })
  })

  it("subscribes the provider webhook for the newly connected target", async () => {
    await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(mocks.subscribe).toHaveBeenCalledWith({
      auth: { authType: "none" },
    })
  })

  it("maps a non-selectable already-connected target to duplicated without claiming it", async () => {
    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-2"],
    })
    expect(mocks.claimTarget).not.toHaveBeenCalled()
    expect(result.outcomes).toEqual([
      { targetId: "page-2", status: "duplicated", reason: "alreadyConnected" },
    ])
  })

  it("maps a claim race (already claimed by a prior call) to duplicated without connecting twice", async () => {
    mocks.claimTarget.mockResolvedValue(false)
    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })
    expect(mocks.insertRow).not.toHaveBeenCalled()
    expect(result.outcomes).toEqual([
      { targetId: "page-1", status: "duplicated", reason: "alreadyConnected" },
    ])
  })

  it("maps a channelLimitReached failure from connectCandidate to a limitReached outcome", async () => {
    mocks.findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")
    mocks.inboxCreate.mockRejectedValue(channelLimitReachedException())
    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })
    expect(result.outcomes).toEqual([
      { targetId: "page-1", status: "limitReached", reason: "workspaceLimit" },
    ])
    expect(result.connections).toHaveLength(0)
  })

  it("maps an unrecognized targetId to a failed/unknown outcome", async () => {
    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["ghost-page"],
    })
    expect(result.outcomes).toEqual([
      { targetId: "ghost-page", status: "failed", reason: "unknown" },
    ])
  })

  it("revives a keep_row provider's still-live satellite row instead of re-inserting it", async () => {
    mockAdapter.store.onDisconnect = "keep_row"
    mocks.inboxCreate.mockResolvedValue({
      inbox: { id: "inbox-new" },
      wasCreated: true,
    })
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-existing",
      status: "disconnected",
      inboxId: "inbox-existing",
    })

    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(mocks.insertRow).not.toHaveBeenCalled()
    expect(mocks.saveAuthByForeignKey).toHaveBeenCalledWith(
      "inbox-existing",
      { authType: "none" },
      "tx",
    )
    expect(result.outcomes).toEqual([
      {
        targetId: "page-1",
        status: "connected",
        connectionId: "conn-existing",
      },
    ])

    mockAdapter.store.onDisconnect = "delete_row"
  })

  it("sets Connection.createdBy to null for a token-initiated connect (no actorUserId) (T7)", async () => {
    await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
      // No `actorUserId` — the shape a public-API-token-authenticated
      // `POST /v1/connect-sessions/{id}/targets` call always uses (the
      // route never resolves/forwards one), matching `ConnectSession`'s
      // own "token-actor session's Connection rows are created with
      // createdBy = null" convention.
    })

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: null }),
      "tx",
    )
  })
})
