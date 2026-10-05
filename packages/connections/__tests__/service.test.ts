import { channelLimitReachedException } from "@chatbotx.io/business/errors"
import { ConnectionProviderRejectedError, SdkException } from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const SESSION_STATE_PATTERN = /^[^.]+\.nonce-abc$/

const mocks = vi.hoisted(() => ({
  toChannelTypeMock: (provider: string) =>
    provider === "instagramFacebook" ? "instagram" : provider,
  findByIdForWorkspace: vi.fn(),
  findById: vi.fn(),
  findByProviderSourceId: vi.fn(),
  findByProviderAndSourceIdAnyWorkspace: vi.fn(async () => undefined),
  findByProviderAndSourceIdsAnyWorkspace: vi.fn(async () => []),
  insert: vi.fn(),
  update: vi.fn(async () => undefined),
  findOwnerUserIdByWorkspaceId: vi.fn(async () => "owner-1"),
  transition: vi.fn(async (input: Record<string, unknown>) => ({
    id: input.connectionId,
    status: "connected",
  })),
  markUnhealthy: vi.fn(async (input: Record<string, unknown>) => ({
    id: input.connectionId,
    status: "needs_reauth",
  })),
  compensateQuotaConsumption: vi.fn(async () => undefined),
  releasePendingQuota: vi.fn(async () => undefined),
  recordAuthSaved: vi.fn(async (input: Record<string, unknown>) => ({
    id: input.connectionId,
    status: "connected",
  })),
  loadAuthByForeignKey: vi.fn(async () => ({ authType: "none" })),
  saveAuthByForeignKey: vi.fn(async () => true),
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
  claimAuthorization: vi.fn(),
  attachAuthorization: vi.fn(),
  recordResults: vi.fn(),
  completeReconnect: vi.fn(),
  releaseAuthorization: vi.fn(),
  storeAuthorization: vi.fn(),
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
  releaseTarget: vi.fn(async () => undefined),
  inboxCreate: vi.fn(async () => ({
    inbox: { id: "inbox-new" },
    wasCreated: true,
  })),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findById: mocks.findById,
    findByProviderSourceId: mocks.findByProviderSourceId,
    findByProviderAndSourceIdAnyWorkspace:
      mocks.findByProviderAndSourceIdAnyWorkspace,
    findByProviderAndSourceIdsAnyWorkspace:
      mocks.findByProviderAndSourceIdsAnyWorkspace,
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
  authExpiresAtOf: (auth: {
    authType: string
    tokens?: { expiresAt?: string }
  }) =>
    auth.authType === "oauth2" && auth.tokens?.expiresAt
      ? new Date(auth.tokens.expiresAt)
      : null,
  connectionStateService: {
    transition: mocks.transition,
    markUnhealthy: mocks.markUnhealthy,
    compensateQuotaConsumption: mocks.compensateQuotaConsumption,
    releasePendingQuota: mocks.releasePendingQuota,
    recordAuthSaved: mocks.recordAuthSaved,
  },
  InvalidConnectionTransitionException: Error,
  // These six used to be real (unmocked) functions defined locally in
  // `internal.ts`; they moved to `@chatbotx.io/business/connection`'s
  // `upsert.ts` so business-layer services could call `upsertConnectionRow`
  // directly inside their own transaction without a package cycle. Mirrors
  // that module's real logic, wired to this file's own `mocks.*` stand-ins
  // for the DB/quota primitives it calls.
  resolveForeignKey: (connection: {
    inboxId?: string | null
    integrationId?: string | null
  }) => connection.inboxId ?? connection.integrationId ?? null,
  resolveOwnerId: async (connection: { kind: string; workspaceId: string }) =>
    connection.kind === "channel"
      ? await mocks.findOwnerUserIdByWorkspaceId({
          workspaceId: connection.workspaceId,
        })
      : undefined,
  toChannelType: mocks.toChannelTypeMock,
  withQuotaCompensation: async (
    input: {
      ownerId: string | undefined
      quotaConsumption: {
        consumed: boolean
        workspaceId?: string
        workspaceUsageIncremented: boolean
      }
    },
    operation: () => Promise<unknown>,
  ) => {
    try {
      return await operation()
    } catch (err) {
      const { ownerId, quotaConsumption } = input
      if (
        quotaConsumption.consumed &&
        quotaConsumption.workspaceId &&
        ownerId
      ) {
        try {
          await mocks.compensateQuotaConsumption({
            ownerId,
            workspaceId: quotaConsumption.workspaceId,
            workspaceUsageIncremented:
              quotaConsumption.workspaceUsageIncremented,
          })
        } catch (compensationErr) {
          mocks.loggerError(
            {
              err: compensationErr,
              workspaceId: quotaConsumption.workspaceId,
              ownerId,
            },
            "connection: quota compensation failed",
          )
        }
      }
      throw err
    }
  },
  saveOrInsertSatellite: async (input: {
    tx: unknown
    inboxId?: string | null
    auth: unknown
    descriptor: { sourceId: string; displayName: string }
    extraConfig: Record<string, unknown>
    existing?: { inboxId?: string | null; integrationId?: string | null }
    store: {
      saveAuthByForeignKey: typeof mocks.saveAuthByForeignKey
      insertRow: typeof mocks.insertRow
      duplicateConstraint?: string
    }
    kind: string
    workspaceId: string
  }) => {
    const existingForeignKey = input.existing
      ? (input.existing.inboxId ?? input.existing.integrationId ?? null)
      : null
    if (
      existingForeignKey &&
      (await input.store.saveAuthByForeignKey(
        existingForeignKey,
        input.workspaceId,
        input.auth,
        input.extraConfig,
        input.tx,
      ))
    ) {
      return input.existing?.integrationId ?? undefined
    }
    try {
      const inserted = await input.store.insertRow(
        {
          kind: input.kind,
          workspaceId: input.workspaceId,
          inboxId: input.inboxId,
          auth: input.auth,
          descriptor: input.descriptor,
          config: input.extraConfig,
        },
        input.tx,
      )
      return inserted.integrationId
    } catch (err) {
      if (
        input.store.duplicateConstraint &&
        mocks.isUniqueViolationError(err, input.store.duplicateConstraint)
      ) {
        throw Object.assign(
          new Error("This provider is already connected in this workspace."),
          { code: "connectionAlreadyConnected", httpStatusCode: 409 },
        )
      }
      throw err
    }
  },
  upsertConnectionRow: async (input: {
    tx: unknown
    workspaceId: string
    provider: string
    kind: string
    descriptor: { sourceId: string; displayName: string }
    auth: unknown
    extraConfig: Record<string, unknown>
    existing:
      | {
          id: string
          workspaceId: string
          inboxId?: string | null
          integrationId?: string | null
        }
      | undefined
    store: {
      saveAuthByForeignKey: typeof mocks.saveAuthByForeignKey
      insertRow: typeof mocks.insertRow
      duplicateConstraint?: string
    }
    ownerId: string | undefined
    quotaConsumption: Record<string, unknown>
    actorUserId?: string | null
    inboxId?: string | null
  }) => {
    const existingForeignKey = input.existing
      ? (input.existing.inboxId ?? input.existing.integrationId ?? null)
      : null
    let integrationId: string | undefined
    if (
      existingForeignKey &&
      (await input.store.saveAuthByForeignKey(
        existingForeignKey,
        input.workspaceId,
        input.auth,
        input.extraConfig,
        input.tx,
      ))
    ) {
      integrationId = input.existing?.integrationId ?? undefined
    } else {
      try {
        const inserted = await input.store.insertRow(
          {
            kind: input.kind,
            workspaceId: input.workspaceId,
            inboxId: input.inboxId,
            auth: input.auth,
            descriptor: input.descriptor,
            config: input.extraConfig,
          },
          input.tx,
        )
        integrationId = inserted.integrationId
      } catch (err) {
        if (
          input.store.duplicateConstraint &&
          mocks.isUniqueViolationError(err, input.store.duplicateConstraint)
        ) {
          throw Object.assign(
            new Error("This provider is already connected in this workspace."),
            { code: "connectionAlreadyConnected", httpStatusCode: 409 },
          )
        }
        throw err
      }
    }

    if (input.existing) {
      await mocks.update(
        {
          id: input.existing.id,
          workspaceId: input.existing.workspaceId,
          values: {
            inboxId: input.inboxId ?? input.existing.inboxId,
            integrationId: integrationId ?? null,
            displayName: input.descriptor.displayName,
            lastError: null,
          },
        },
        input.tx,
      )
      return await mocks.transition({
        connectionId: input.existing.id,
        event: "connect.completed",
        ownerId: input.ownerId,
        tx: input.tx,
        quotaConsumption: input.quotaConsumption,
      })
    }

    let created: { id: string }
    try {
      created = await mocks.insert(
        {
          workspaceId: input.workspaceId,
          provider: input.provider,
          kind: input.kind,
          channel:
            input.kind === "channel"
              ? mocks.toChannelTypeMock(input.provider)
              : null,
          sourceId: input.descriptor.sourceId,
          displayName: input.descriptor.displayName,
          inboxId: input.inboxId ?? null,
          integrationId: integrationId ?? null,
          status: "disconnected",
          statusReason: "manual",
          disconnectedAt: new Date(),
          createdBy: input.actorUserId ?? null,
        },
        input.tx,
      )
    } catch (err) {
      if (
        mocks.isUniqueViolationError(
          err,
          "Connection_workspaceId_provider_sourceId_key",
        )
      ) {
        throw Object.assign(
          new Error("This provider is already connected in this workspace."),
          { code: "connectionAlreadyConnected", httpStatusCode: 409 },
        )
      }
      throw err
    }
    return await mocks.transition({
      connectionId: created.id,
      event: "connect.completed",
      ownerId: input.ownerId,
      tx: input.tx,
      quotaConsumption: input.quotaConsumption,
    })
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
    releaseTarget: mocks.releaseTarget,
    releaseAuthorization: mocks.releaseAuthorization,
    storeAuthorization: mocks.storeAuthorization,
    submitInput: mocks.submitInput,
    claimAuthorization: mocks.claimAuthorization,
    attachAuthorization: mocks.attachAuthorization,
    recordResults: mocks.recordResults,
    completeReconnect: mocks.completeReconnect,
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
        400,
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
    connectionProviderUnavailableException: (httpStatusCode: 502 | 503) =>
      new TestChatbotXException(
        "The provider is temporarily unavailable. Please try again.",
        "connectionProviderUnavailable",
        httpStatusCode,
      ),
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
      get: (_target, provider) => {
        if (provider === "unregistered") {
          return null
        }
        return provider === "chatbotx"
          ? { ...mockAdapter, store: undefined }
          : mockAdapter
      },
    },
  ),
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: mocks.loggerError, info: vi.fn() },
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
  mocks.saveAuthByForeignKey.mockResolvedValue(true)
  mocks.verify.mockResolvedValue({ ok: true })
  mocks.fromCredentials.mockResolvedValue({
    authType: "secretText",
    secretText: "sk-live",
  })
  mocks.isUniqueViolationError.mockReturnValue(false)
  mocks.update.mockResolvedValue(baseConnection())
  mocks.findByProviderSourceId.mockResolvedValue(undefined)
  mocks.findByProviderAndSourceIdAnyWorkspace.mockResolvedValue(undefined)
  mocks.findByProviderAndSourceIdsAnyWorkspace.mockResolvedValue([])
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
  mocks.createSession.mockImplementation(
    async (input: {
      id: string
      nextAction: (nonce: string) => unknown
      workspaceId: string
      provider: string
    }) => ({
      session: {
        id: input.id,
        workspaceId: input.workspaceId,
        provider: input.provider,
        nextAction: input.nextAction("nonce-abc"),
      },
      nonce: "nonce-abc",
    }),
  )

  mocks.findByNonce.mockResolvedValue({
    id: "session-1",
    workspaceId: "ws-1",
    provider: "messenger",
    status: "pending",
  })
  mocks.claimAuthorization.mockImplementation(
    async (input: Record<string, unknown>) => ({
      id: input.id,
      workspaceId: input.workspaceId,
      provider: "messenger",
      status: "authorized",
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

  mocks.completeReconnect.mockImplementation(
    async (input: Record<string, unknown>) => ({
      id: input.id,
      status: "completed",
      results: [input.result],
    }),
  )
  mocks.storeAuthorization.mockImplementation(
    async (input: Record<string, unknown>) => ({
      id: input.id,
      workspaceId: input.workspaceId,
      provider: "messenger",
      status: "authorized",
      encryptedAuth: input.encryptedAuth,
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

  it("calls provider disconnect + webhook unsubscribe, transitions, then deletes the satellite row", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    const result = await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.loadAuthByForeignKey).toHaveBeenCalledWith("inbox-1", "ws-1")
    expect(mocks.disconnect).toHaveBeenCalledWith({ authType: "none" })
    expect(mocks.unsubscribe).toHaveBeenCalledWith({
      auth: { authType: "none" },
    })
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalledWith(
      "inbox-1",
      "ws-1",
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "user.disconnect",
      ownerId: "owner-1",
      tx: "tx",
      pendingRelease: { current: null },
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
      pendingRelease: { current: null },
    })
  })

  it("finishes local cleanup even when provider-side teardown fails, recording the error instead of blocking", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.disconnect.mockRejectedValue(new Error("upstream 500"))

    const result = await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })

    expect(result.status).toBe("disconnected")
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalledWith(
      "inbox-1",
      "ws-1",
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "user.disconnect",
      ownerId: "owner-1",
      tx: "tx",
      pendingRelease: { current: null },
    })
    expect(mocks.update).toHaveBeenCalledWith(
      {
        id: "conn-1",
        workspaceId: "ws-1",
        values: { lastError: "upstream 500" },
      },
      "tx",
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: "upstream 500" }),
        connectionId: "conn-1",
        provider: "messenger",
      },
      "connection disconnect: provider-side disconnect failed",
    )
  })

  it("finishes local cleanup when provider authentication is unavailable", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.loadAuthByForeignKey.mockResolvedValueOnce(null)

    await expect(
      connectionService.disconnect({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toMatchObject({ status: "disconnected" })

    expect(mocks.disconnect).not.toHaveBeenCalled()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: {
          lastError: "Provider authentication was unavailable for teardown",
        },
      }),
      "tx",
    )
  })

  it("finishes local cleanup when both provider disconnect and webhook unsubscribe fail, recording both errors", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.disconnect.mockRejectedValueOnce(
      new Error("provider disconnect failed"),
    )
    mocks.unsubscribe.mockRejectedValueOnce(new Error("unsubscribe failed"))

    const result = await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })

    expect(result.status).toBe("disconnected")
    expect(mocks.unsubscribe).toHaveBeenCalledWith({
      auth: { authType: "none" },
    })
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      {
        id: "conn-1",
        workspaceId: "ws-1",
        values: {
          lastError: "provider disconnect failed; unsubscribe failed",
        },
      },
      "tx",
    )
  })

  it("still calls webhook unsubscribe when provider disconnect fails, then finishes local cleanup anyway (I11)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.disconnect.mockRejectedValueOnce(
      new Error("Method is not implemented."),
    )
    mocks.unsubscribe.mockResolvedValueOnce(undefined)

    const result = await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })

    expect(result.status).toBe("disconnected")
    expect(mocks.unsubscribe).toHaveBeenCalledWith({
      auth: { authType: "none" },
    })
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalled()
  })

  it("still calls provider disconnect when webhook unsubscribe fails, then finishes local cleanup anyway", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.disconnect.mockResolvedValueOnce(undefined)
    mocks.unsubscribe.mockRejectedValueOnce(new Error("unsubscribe failed"))

    const result = await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })

    expect(result.status).toBe("disconnected")
    expect(mocks.disconnect).toHaveBeenCalledWith({ authType: "none" })
    expect(mocks.deleteRowByForeignKey).toHaveBeenCalled()
  })

  it("leaves Connection.lastError null when teardown succeeds (no spurious error stored)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.disconnect.mockResolvedValueOnce(undefined)
    mocks.unsubscribe.mockResolvedValueOnce(undefined)
    await connectionService.disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })
    expect(mocks.update).not.toHaveBeenCalled()
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
      "ws-1",
      expect.objectContaining({ authType: "oauth2" }),
    )
    expect(mocks.recordAuthSaved).toHaveBeenCalledWith({
      connectionId: "conn-1",
      authExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    })
  })

  it("keeps rotated auth when the connection became inactive before mirroring", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.findById.mockResolvedValue(baseConnection())
    mocks.recordAuthSaved.mockRejectedValueOnce(
      new Error("connection inactive"),
    )
    mocks.ensureFreshAuth.mockImplementation(async (ctx) => {
      await ctx.authStore.save({
        authType: "oauth2",
        tokens: { accessToken: "rotated" },
      })
    })

    await expect(
      connectionService.refresh({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toMatchObject({ id: "conn-1" })

    expect(mocks.saveAuthByForeignKey).toHaveBeenCalledWith(
      "inbox-1",
      "ws-1",
      expect.objectContaining({
        authType: "oauth2",
        tokens: { accessToken: "rotated" },
      }),
    )
  })

  it("does not record refreshed auth when no satellite row matches", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.saveAuthByForeignKey.mockResolvedValue(false)
    mocks.ensureFreshAuth.mockImplementation(async (ctx) => {
      await ctx.authStore.save({ authType: "none" })
    })

    await expect(
      connectionService.refresh({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("auth persistence did not match a satellite row")

    expect(mocks.recordAuthSaved).not.toHaveBeenCalled()
  })

  it("authStore.markOffline records every terminal provider error as a refresh failure", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseConnection())
    mocks.findById.mockResolvedValue(baseConnection())
    mocks.ensureFreshAuth.mockImplementation(async (ctx) => {
      await ctx.authStore.markOffline(new Error("provider revoked token"))
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

  it("returns a client error when a built-in connection has no auth store", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({ provider: "chatbotx" }),
    )

    await expect(
      connectionService.verify({
        connectionId: "conn-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({
      code: "connectionNotConfigured",
      httpStatusCode: 400,
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
  beforeEach(() => {
    mockAdapter.provider.kind = "integration"
  })
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
    mocks.fromCredentials.mockRejectedValue(
      new ConnectionProviderRejectedError("Invalid API key"),
    )
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-bad" },
      }),
    ).rejects.toMatchObject({ code: "connectionCredentialsRejected" })
  })

  it("maps an SDK 4xx provider error to credential rejection", async () => {
    mocks.fromCredentials.mockRejectedValue(
      new SdkException("Invalid bot token", "invalid_token", 400),
    )

    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "telegram",
        config: { apiKey: "sk-bad" },
      }),
    ).rejects.toMatchObject({ code: "connectionCredentialsRejected" })
  })

  it("maps an SDK 5xx provider error to a retryable gateway failure", async () => {
    mocks.fromCredentials.mockRejectedValue(
      new SdkException("Provider unavailable", "upstream_error", 503),
    )

    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "telegram",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toMatchObject({
      code: "connectionProviderUnavailable",
      httpStatusCode: 502,
    })
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
      ownerId: undefined,
      tx: "tx",
      quotaConsumption: expect.anything(),
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
        statusReason: "manual",
        disconnectedAt: expect.any(Date),
        createdBy: "user-1",
      }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-new",
      event: "connect.completed",
      ownerId: undefined,
      tx: "tx",
      quotaConsumption: expect.anything(),
    })
    expect(result.id).toBe("conn-new")
  })

  it("releases a consumed quota reservation when the connection transaction rolls back", async () => {
    mockAdapter.provider.kind = "channel"
    mocks.transition.mockImplementationOnce((input) => {
      Object.assign(input.quotaConsumption as object, {
        consumed: true,
        workspaceId: "ws-1",
        workspaceUsageIncremented: true,
      })
      return { id: input.connectionId, status: "connected" }
    })
    mocks.transaction.mockImplementationOnce(async (fn) => {
      await fn("tx")
      throw new Error("transaction commit failed")
    })

    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "telegram",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toThrow("transaction commit failed")

    expect(mocks.compensateQuotaConsumption).toHaveBeenCalledWith({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspaceUsageIncremented: true,
    })
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
    mockAdapter.provider.kind = "channel"
    mocks.subscribe.mockRejectedValueOnce(new Error("webhook endpoint down"))

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "telegram",
      config: { apiKey: "sk-live" },
    })

    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-new",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: "tx",
      quotaConsumption: expect.anything(),
    })
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-new",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })
    expect(result).toBeDefined()
  })

  it("degrades the connect result best-effort only — returns the already-persisted connection instead of failing when both the webhook subscribe and the degrade transition fail (regression: this previously rethrew the degrade-transition failure and failed an already-successful connect)", async () => {
    mockAdapter.provider.kind = "channel"
    mocks.subscribe.mockRejectedValueOnce(new Error("webhook endpoint down"))
    mocks.transition
      .mockImplementationOnce(async (input) => ({
        id: input.connectionId,
        status: "connected",
      }))
      .mockRejectedValueOnce(new Error("degradation transition unavailable"))

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "telegram",
      config: { apiKey: "sk-live" },
    })

    expect(result).toEqual({ id: "conn-new", status: "connected" })
    expect(mocks.transition).toHaveBeenLastCalledWith({
      connectionId: "conn-new",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })
  })

  it("passes config fields the store's configColumns allow-list permits through to the satellite insert", async () => {
    mockAdapter.store.configColumns = ["model", "temperature"]

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

    mockAdapter.store.configColumns = undefined
  })
  it("persists the normalized baseURL returned by credential validation", async () => {
    mockAdapter.store.configColumns = ["baseURL"]
    mocks.fromCredentials.mockResolvedValueOnce({
      authType: "secretText",
      secretText: "sk-live",
      baseURL: "https://provider.example.com/v1/",
    })

    await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: {
        apiKey: "sk-live",
        baseURL: " https://provider.example.com/v1 ",
      },
    })

    expect(mocks.insertRow).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { baseURL: "https://provider.example.com/v1/" },
      }),
      "tx",
    )

    mockAdapter.store.configColumns = undefined
  })

  it("rejects a config field outside the store's configColumns allow-list instead of passing it to the satellite insert", async () => {
    mockAdapter.store.configColumns = ["model"]

    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-live", temperature: 0.7 },
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.insertRow).not.toHaveBeenCalled()

    mockAdapter.store.configColumns = undefined
  })

  it("rejects a config payload that attempts to override a system column (workspaceId) instead of silently stripping or applying it", async () => {
    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "claude",
        config: { apiKey: "sk-live", workspaceId: "other-workspace" },
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.insertRow).not.toHaveBeenCalled()
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
      ownerId: undefined,
      tx: "tx",
      quotaConsumption: expect.anything(),
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
      "ws-1",
      expect.objectContaining({ authType: "secretText" }),
      {},
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
      ownerId: undefined,
      tx: "tx",
      quotaConsumption: expect.anything(),
    })
    expect(result.id).toBe("conn-existing")

    mockAdapter.store.onDisconnect = "delete_row"
  })

  it("falls back to inserting a fresh satellite row when saveAuthByForeignKey matches zero rows (regression I2: a delete_row provider's stale integrationId used to either 409 or orphan a second Integration row)", async () => {
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-existing",
      status: "connected",
      integrationId: "int-stale",
    })
    mocks.saveAuthByForeignKey.mockResolvedValueOnce(false)

    const result = await connectionService.connectFromCredentials({
      workspaceId: "ws-1",
      provider: "claude",
      config: { apiKey: "sk-new" },
      allowUpdate: true,
    })

    expect(mocks.saveAuthByForeignKey).toHaveBeenCalledWith(
      "int-stale",
      "ws-1",
      expect.objectContaining({ authType: "secretText" }),
      {},
      "tx",
    )
    expect(mocks.insertRow).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-existing",
        values: expect.objectContaining({ integrationId: "int-1" }),
      }),
      "tx",
    )
    expect(result.id).toBe("conn-existing")
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

  it("rejects a reconnect target that does not belong to the session workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)

    await expect(
      connectionService.startSession({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "reconnect",
        targetConnectionId: "conn-other-workspace",
        credential: {},
        callbackUrl: "https://app.example.test/integrations/messenger/callback",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.createSession).not.toHaveBeenCalled()
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
      state: expect.stringMatching(SESSION_STATE_PATTERN),
    })
    expect(mocks.submitInput).not.toHaveBeenCalled()
    expect(result.nextAction).toEqual({
      type: "open_url",
      url: "https://provider.example.com/authorize",
    })
  })

  it("mints the workspace and the session inside one transaction when createWorkspace is given instead of workspaceId (M-7: a failed/cancelled start must not leave an empty orphan workspace behind)", async () => {
    const mockCreateWorkspace = vi.fn((tx: unknown) => {
      expect(tx).toBe("tx")
      return Promise.resolve({ id: "ws-new" })
    })

    const result = await connectionService.startSession({
      createWorkspace: mockCreateWorkspace,
      provider: "messenger",
      purpose: "connect",
      credential: { clientId: "app-1" },
      callbackUrl: "https://app.example.test/integrations/messenger/callback",
      actorUserId: "user-1",
    })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mockCreateWorkspace).toHaveBeenCalledWith("tx")
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-new",
        provider: "messenger",
        purpose: "connect",
      }),
      "tx",
    )
    expect(result.nextAction).toEqual({
      type: "open_url",
      url: "https://provider.example.com/authorize",
    })
  })

  it("never creates a session when createWorkspace itself fails (the real transaction rolls both back together)", async () => {
    const workspaceError = new Error("workspace quota exhausted")
    const mockCreateWorkspace = vi.fn(() => Promise.reject(workspaceError))

    await expect(
      connectionService.startSession({
        createWorkspace: mockCreateWorkspace,
        provider: "messenger",
        purpose: "connect",
        credential: {},
        callbackUrl: "https://app.example.test/integrations/messenger/callback",
        actorUserId: "user-1",
      }),
    ).rejects.toBe(workspaceError)
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it("rejects a reconnect target that belongs to a different workspace even when createWorkspace is supplied instead of workspaceId (authorization bypass regression)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)
    const mockCreateWorkspace = vi.fn((tx: unknown) => {
      expect(tx).toBe("tx")
      return Promise.resolve({ id: "ws-new" })
    })

    await expect(
      connectionService.startSession({
        createWorkspace: mockCreateWorkspace,
        provider: "messenger",
        purpose: "reconnect",
        targetConnectionId: "conn-other-workspace",
        credential: {},
        callbackUrl: "https://app.example.test/integrations/messenger/callback",
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "conn-other-workspace",
      workspaceId: "ws-new",
    })
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it("throws when both workspaceId and createWorkspace are given", async () => {
    const mockCreateWorkspace = vi.fn(() => Promise.resolve({ id: "ws-new" }))
    await expect(
      connectionService.startSession({
        workspaceId: "ws-1",
        createWorkspace: mockCreateWorkspace,
        provider: "messenger",
        purpose: "connect",
        credential: {},
        callbackUrl: "https://app.example.test/integrations/messenger/callback",
        actorUserId: "user-1",
      }),
    ).rejects.toThrow(
      "startSession requires exactly one of workspaceId/createWorkspace",
    )
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it("throws when neither workspaceId nor createWorkspace is given", async () => {
    await expect(
      connectionService.startSession({
        provider: "messenger",
        purpose: "connect",
        credential: {},
        callbackUrl: "https://app.example.test/integrations/messenger/callback",
        actorUserId: "user-1",
      }),
    ).rejects.toThrow(
      "startSession requires exactly one of workspaceId/createWorkspace",
    )
    expect(mocks.createSession).not.toHaveBeenCalled()
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

  it("fails the session with exchange_failed when exchangeCode rejects the authorization", async () => {
    mocks.exchangeCode.mockRejectedValue(
      new ConnectionProviderRejectedError("bad code"),
    )
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
      workspaceId: "ws-1",
      errorCode: "exchange_failed",
      statuses: ["authorized"],
    })
  })

  it("fails the session when persisting exchanged authorization fails", async () => {
    mocks.storeAuthorization.mockRejectedValueOnce(
      new Error("authorization storage unavailable"),
    )

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toThrow("authorization storage unavailable")

    expect(mocks.failSession).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      errorCode: "internal_error",
      statuses: ["authorized"],
    })
  })

  it("returns a retryable gateway error and releases an exchange claim without failing the session", async () => {
    mocks.exchangeCode.mockRejectedValue(
      Object.assign(new Error("provider unavailable"), {
        response: { status: 503 },
      }),
    )

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({
      code: "connectionProviderUnavailable",
      httpStatusCode: 502,
    })
    expect(mocks.releaseAuthorization).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
    })
    expect(mocks.failSession).not.toHaveBeenCalled()
  })

  it("preserves the original transaction error when quota compensation fails", async () => {
    mockAdapter.provider.kind = "channel"
    mocks.transition.mockImplementationOnce((input) => {
      Object.assign(input.quotaConsumption as object, {
        consumed: true,
        workspaceId: "ws-1",
        workspaceUsageIncremented: true,
      })
      return { id: input.connectionId, status: "connected" }
    })
    mocks.transaction.mockImplementationOnce(async (fn) => {
      await fn("tx")
      throw new Error("transaction commit failed")
    })
    mocks.compensateQuotaConsumption.mockRejectedValueOnce(
      new Error("compensation unavailable"),
    )

    await expect(
      connectionService.connectFromCredentials({
        workspaceId: "ws-1",
        provider: "telegram",
        config: { apiKey: "sk-live" },
      }),
    ).rejects.toThrow("transaction commit failed")
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "connection: quota compensation failed",
    )
  })

  it("does not exchange a duplicate callback after the pending claim is lost", async () => {
    mocks.claimAuthorization.mockRejectedValueOnce(
      Object.assign(new Error("Connect session expired"), {
        code: "connectSessionExpired",
      }),
    )

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })

    expect(mocks.exchangeCode).not.toHaveBeenCalled()
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
      workspaceId: "ws-1",
      errorCode: "no_candidates",
    })
  })

  it("keeps encrypted authorization for a retryable candidate listing failure", async () => {
    mocks.listCandidates.mockRejectedValue(
      Object.assign(new Error("provider unavailable"), {
        response: { status: 503 },
      }),
    )

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toMatchObject({ code: "connectionProviderUnavailable" })
    expect(mocks.storeAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        workspaceId: "ws-1",
        encryptedAuth: expect.anything(),
      }),
    )
    expect(mocks.failSession).not.toHaveBeenCalled()
  })

  it("resumes candidate listing from encrypted authorization without re-exchanging the code", async () => {
    mocks.findByNonce.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      provider: "messenger",
      status: "authorized",
      encryptedAuth: { iv: "iv", ciphertext: "c", keyId: "k" },
    })
    mocks.decryptObject.mockResolvedValue({
      authType: "oauth2",
      clientId: "id",
      clientSecret: "secret",
      redirectUrl: "https://x",
      tokens: { accessToken: "tok" },
    })

    await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "unused-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })

    expect(mocks.exchangeCode).not.toHaveBeenCalled()
    expect(mocks.decryptObject).toHaveBeenCalledWith(
      { iv: "iv", ciphertext: "c", keyId: "k" },
      expect.anything(),
      "connect-session:session-1:authorization",
    )
    expect(mocks.attachAuthorization).toHaveBeenCalled()
  })

  it("marks a candidate not selectable when it is already connected in this workspace", async () => {
    mocks.findByProviderAndSourceIdsAnyWorkspace.mockResolvedValue([
      {
        sourceId: "page-1",
        workspaceId: "ws-1",
        status: "connected",
      },
    ])
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
    mocks.findByProviderAndSourceIdsAnyWorkspace.mockResolvedValue([
      {
        sourceId: "page-1",
        workspaceId: "ws-2",
        status: "connected",
      },
    ])
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
      workspaceId: "ws-1",
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
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({ sourceId: "page-1" }),
    )
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
      "ws-1",
      expect.objectContaining({ authType: "oauth2" }),
      {},
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
      quotaConsumption: expect.anything(),
    })
    expect(mocks.recordAuthSaved).not.toHaveBeenCalled()
    expect(mocks.completeReconnect).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      tx: "tx",
      result: {
        targetId: "page-1",
        status: "connected",
        connectionId: "conn-1",
      },
    })
    expect(result.status).toBe("completed")
  })

  it("fails the authorized session when reconnect rollback compensation fails", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({ sourceId: "page-1" }),
    )
    mockAdapter.provider.describe = () => ({
      sourceId: "page-1",
      displayName: "Page One",
    })
    mocks.transition.mockImplementationOnce((input) => {
      const quotaConsumption = input.quotaConsumption as {
        consumed: boolean
        workspaceId?: string
        workspaceUsageIncremented: boolean
      }
      quotaConsumption.consumed = true
      quotaConsumption.workspaceId = "ws-1"
      quotaConsumption.workspaceUsageIncremented = true
      throw new Error("transition failed")
    })
    mocks.compensateQuotaConsumption.mockRejectedValueOnce(
      new Error("compensation failed"),
    )

    await expect(
      connectionService.completeAuthorization({
        sessionId: "session-1",
        nonce: "nonce-abc",
        code: "auth-code",
        callbackUrl: "https://app.example.test/callback",
        credential: {},
      }),
    ).rejects.toThrow("transition failed")

    expect(mocks.failSession).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      errorCode: "internal_error",
      statuses: ["authorized"],
    })
  })

  it("falls back to inserting a fresh satellite row when the delete_row channel's satellite is already gone (regression I3: used to silently no-op the update, then still report connect.completed with no auth persisted)", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({ sourceId: "page-1" }),
    )
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
    mocks.saveAuthByForeignKey.mockResolvedValueOnce(false)

    await connectionService.completeAuthorization({
      sessionId: "session-1",
      nonce: "nonce-abc",
      code: "auth-code",
      callbackUrl: "https://app.example.test/callback",
      credential: {},
    })

    expect(mocks.insertRow).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", inboxId: "inbox-1" }),
      "tx",
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-1",
        values: expect.objectContaining({ lastError: null }),
      }),
      "tx",
    )
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        event: "connect.completed",
      }),
    )

    mockAdapter.provider.describe = () => ({
      sourceId: "workspace",
      displayName: "Test Provider",
    })
  })

  it("throws connectionIdentityMismatch and fails the session when the re-granted account differs", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseConnection({ sourceId: "page-1" }),
    )
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
      workspaceId: "ws-1",
      errorCode: "provider_denied",
      statuses: ["authorized"],
    })
    expect(mocks.saveAuthByForeignKey).not.toHaveBeenCalled()

    mockAdapter.provider.describe = () => ({
      sourceId: "workspace",
      displayName: "Test Provider",
    })
  })

  it("throws notFound and fails the session when the target connection no longer exists", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)

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
      workspaceId: "ws-1",
      errorCode: "internal_error",
    })
  })

  it("never resolves an ownerId for a kind:integration connection being reconnected", async () => {
    mocks.findByNonce.mockResolvedValue(reconnectSession)
    mocks.findByIdForWorkspace.mockResolvedValue(
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

  it("preserves the original flow error when recording results fails", async () => {
    mocks.claimTarget.mockRejectedValueOnce(new Error("claim failed"))
    mocks.recordResults.mockRejectedValueOnce(new Error("result write failed"))

    await expect(
      connectionService.connectTargets({
        sessionId: "session-1",
        workspaceId: "ws-1",
        targetIds: ["page-1"],
      }),
    ).rejects.toThrow("claim failed")

    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: "result write failed" }),
        sessionId: "session-1",
        connectionIds: [],
      },
      "connectTargets: failed to record collected results",
    )
  })

  it("connects a selectable target: creates the inbox with skipQuota, inserts the Connection, and reports connected", async () => {
    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(mocks.claimTarget).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      targetId: "page-1",
      ownerToken: expect.any(String),
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
      workspaceId: "ws-1",
      results: result.outcomes,
      resultConnectionIds: ["conn-new"],
    })
  })

  it("reports an in-progress target without taking over its live claim", async () => {
    mocks.claimTarget.mockResolvedValue(false)

    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(mocks.releaseTarget).not.toHaveBeenCalled()
    expect(result.outcomes).toEqual([
      { targetId: "page-1", status: "failed", reason: "inProgress" },
    ])
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

  it("records an active connection as duplicated when its claim is already held", async () => {
    mocks.claimTarget.mockResolvedValue(false)
    mocks.findByProviderSourceId.mockResolvedValue({
      id: "conn-existing",
      status: "connected",
    })

    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(mocks.insertRow).not.toHaveBeenCalled()
    expect(mocks.releaseTarget).not.toHaveBeenCalled()
    expect(result.outcomes).toEqual([
      {
        targetId: "page-1",
        status: "duplicated",
        reason: "alreadyConnected",
      },
    ])
  })

  it("maps a channelLimitReached failure from connectCandidate to a limitReached outcome and releases the claim (regression: a claimed target was never released on failure, so a retry always saw duplicated)", async () => {
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
    expect(mocks.releaseTarget).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      targetId: "page-1",
      ownerToken: expect.any(String),
    })
  })

  it("reports internal connect failures separately from provider rejections and releases the claim", async () => {
    mocks.inboxCreate.mockRejectedValue(new Error("database write failed"))

    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(result.outcomes).toEqual([
      {
        targetId: "page-1",
        status: "failed",
        reason: "internalError",
        detail: "Connect failed",
      },
    ])
    expect(mocks.releaseTarget).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      targetId: "page-1",
      ownerToken: expect.any(String),
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: "database write failed" }),
        targetId: "page-1",
        provider: "messenger",
      },
      "connectTargets: candidate connect failed internally",
    )
  })
  it("reports explicit provider rejections without classifying them as internal errors", async () => {
    mocks.inboxCreate.mockRejectedValue(
      new ConnectionProviderRejectedError("provider denied"),
    )

    const result = await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })

    expect(result.outcomes).toEqual([
      {
        targetId: "page-1",
        status: "failed",
        reason: "providerRejected",
        detail: "provider denied",
      },
    ])
  })

  it("does not release a claim when the connect actually succeeds", async () => {
    mocks.inboxCreate.mockResolvedValue({
      inbox: { id: "inbox-new" },
      wasCreated: true,
    })
    await connectionService.connectTargets({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["page-1"],
    })
    expect(mocks.releaseTarget).not.toHaveBeenCalled()
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
      "ws-1",
      { authType: "none" },
      {},
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
