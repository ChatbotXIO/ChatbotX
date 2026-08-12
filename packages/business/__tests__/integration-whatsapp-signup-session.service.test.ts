import { beforeEach, describe, expect, test, vi } from "vitest"

// The service owns no SQL of its own — every statement lives in the repository,
// so this suite mocks that boundary and asserts on what the service asks for.
const { repositoryMock, encryptTextMock, decryptTextMock, loggerWarnMock } =
  vi.hoisted(() => ({
    repositoryMock: {
      createSignupSession: vi.fn(),
      consumeSignupSession: vi.fn(),
      findActiveSignupSession: vi.fn(),
      findConnectedPhoneNumberIds: vi.fn(),
      findByIdForWorkspace: vi.fn(),
      listByWorkspaceId: vi.fn(),
      claimCapiScopeCacheRefresh: vi.fn(),
      replaceAuth: vi.fn(),
      updateDatasetIdIfNull: vi.fn(),
      updateCapiScopeCache: vi.fn(),
      findVerificationCodeRequestedAt: vi.fn(),
      claimVerificationCodeSlot: vi.fn(),
      releaseVerificationCodeSlot: vi.fn(),
      purgeFinishedSignupSessions: vi.fn(),
      updateRegistration: vi.fn(),
    },
    encryptTextMock: vi.fn(),
    decryptTextMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: repositoryMock,
}))

vi.mock("../src/logger", () => ({
  logger: { warn: loggerWarnMock },
}))

vi.mock("@chatbotx.io/encryption", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/encryption")
  >("@chatbotx.io/encryption")
  return {
    ...actual,
    encryptUtils: {
      encryptText: encryptTextMock,
      decryptText: decryptTextMock,
    },
  }
})

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

describe("integrationWhatsappService signup sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repositoryMock.updateRegistration.mockResolvedValue(null)
    repositoryMock.findByIdForWorkspace.mockResolvedValue(null)
    repositoryMock.claimCapiScopeCacheRefresh.mockResolvedValue(null)
    repositoryMock.updateCapiScopeCache.mockResolvedValue(null)
    repositoryMock.replaceAuth.mockResolvedValue(null)
    repositoryMock.updateDatasetIdIfNull.mockResolvedValue(null)
    repositoryMock.claimVerificationCodeSlot.mockResolvedValue(null)
    repositoryMock.findVerificationCodeRequestedAt.mockResolvedValue(null)
  })

  test("uses a fresh CAPI scope cache without calling the checker", async () => {
    const checkedAt = new Date("2026-08-10T00:00:00.000Z")
    repositoryMock.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: checkedAt,
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    const checkScope = vi.fn(async () => false)

    const result = await integrationWhatsappService.refreshCapiScopeCache({
      id: "iw-1",
      workspaceId: "ws-1",
      now: new Date("2026-08-10T12:00:00.000Z"),
      checkScope,
    })

    expect(result).toMatchObject({ hasCapiScope: true })
    expect(checkScope).not.toHaveBeenCalled()
    expect(repositoryMock.updateCapiScopeCache).not.toHaveBeenCalled()
  })

  test("returns cached dataset id without provisioning", async () => {
    repositoryMock.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      datasetId: "dataset-cached",
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    const provision = vi.fn(async () => "dataset-new")

    const result = await integrationWhatsappService.ensureDatasetId({
      id: "iw-1",
      workspaceId: "ws-1",
      provision,
    })

    expect(result).toBe("dataset-cached")
    expect(provision).not.toHaveBeenCalled()
    expect(repositoryMock.updateDatasetIdIfNull).not.toHaveBeenCalled()
  })

  test("provisions and persists an uncached dataset id", async () => {
    repositoryMock.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      datasetId: null,
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    repositoryMock.updateDatasetIdIfNull.mockResolvedValue({
      id: "iw-1",
      datasetId: "dataset-new",
    })
    const provision = vi.fn(async () => "dataset-new")

    const result = await integrationWhatsappService.ensureDatasetId({
      id: "iw-1",
      workspaceId: "ws-1",
      provision,
    })

    expect(result).toBe("dataset-new")
    expect(provision).toHaveBeenCalledWith({
      wabaId: "waba-1",
      accessToken: "token-1",
    })
    expect(repositoryMock.updateDatasetIdIfNull).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      datasetId: "dataset-new",
    })
  })

  test("re-reads dataset id when the conditional update loses a race", async () => {
    repositoryMock.findByIdForWorkspace
      .mockResolvedValueOnce({
        id: "iw-1",
        workspaceId: "ws-1",
        wabaId: "waba-1",
        datasetId: null,
        auth: {
          tokens: { accessToken: "token-1" },
          metadata: { wabaId: "waba-1" },
        },
      })
      .mockResolvedValueOnce({
        id: "iw-1",
        workspaceId: "ws-1",
        wabaId: "waba-1",
        datasetId: "dataset-race",
      })
    repositoryMock.updateDatasetIdIfNull.mockResolvedValue(null)
    const provision = vi.fn(async () => "dataset-new")

    const result = await integrationWhatsappService.ensureDatasetId({
      id: "iw-1",
      workspaceId: "ws-1",
      provision,
    })

    expect(result).toBe("dataset-race")
    expect(provision).toHaveBeenCalledTimes(1)
    expect(repositoryMock.findByIdForWorkspace).toHaveBeenCalledTimes(2)
  })

  test("refreshes a stale CAPI scope cache and stores the result", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    repositoryMock.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: false,
      capiScopeCheckedAt: new Date("2026-08-09T00:00:00.000Z"),
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    repositoryMock.claimCapiScopeCacheRefresh.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: false,
      capiScopeCheckedAt: now,
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    repositoryMock.updateCapiScopeCache.mockResolvedValue({
      id: "iw-1",
      hasCapiScope: true,
      capiScopeCheckedAt: now,
    })
    const checkScope = vi.fn(async () => true)

    const result = await integrationWhatsappService.refreshCapiScopeCache({
      id: "iw-1",
      workspaceId: "ws-1",
      now,
      checkScope,
    })

    expect(result).toMatchObject({ hasCapiScope: true })
    expect(checkScope).toHaveBeenCalledWith({
      accessToken: "token-1",
      wabaId: "waba-1",
    })
    expect(repositoryMock.claimCapiScopeCacheRefresh).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt: new Date("2026-08-09T00:00:00.000Z"),
    })
    expect(repositoryMock.updateCapiScopeCache).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      hasCapiScope: true,
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt: now,
    })
  })

  test("skips CAPI scope check when another refresh wins the claim", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    const current = {
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: new Date("2026-08-10T12:00:01.000Z"),
      auth: {
        tokens: { accessToken: "token-2" },
        metadata: { wabaId: "waba-1" },
      },
    }
    repositoryMock.findByIdForWorkspace
      .mockResolvedValueOnce({
        id: "iw-1",
        workspaceId: "ws-1",
        wabaId: "waba-1",
        hasCapiScope: false,
        capiScopeCheckedAt: new Date("2026-08-09T00:00:00.000Z"),
        auth: {
          tokens: { accessToken: "token-1" },
          metadata: { wabaId: "waba-1" },
        },
      })
      .mockResolvedValueOnce(current)
    repositoryMock.claimCapiScopeCacheRefresh.mockResolvedValue(null)
    const checkScope = vi.fn(async () => false)

    const result = await integrationWhatsappService.refreshCapiScopeCache({
      id: "iw-1",
      workspaceId: "ws-1",
      now,
      checkScope,
    })

    expect(result).toBe(current)
    expect(repositoryMock.claimCapiScopeCacheRefresh).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt: new Date("2026-08-09T00:00:00.000Z"),
    })
    expect(checkScope).not.toHaveBeenCalled()
    expect(repositoryMock.updateCapiScopeCache).not.toHaveBeenCalled()
  })

  test("keeps the existing CAPI scope cache when the checker throws", async () => {
    const existing = {
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: new Date("2026-08-09T00:00:00.000Z"),
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    }
    repositoryMock.findByIdForWorkspace.mockResolvedValue(existing)
    repositoryMock.claimCapiScopeCacheRefresh.mockResolvedValue({
      ...existing,
      capiScopeCheckedAt: new Date("2026-08-10T12:00:00.000Z"),
    })
    const checkScope = vi.fn().mockRejectedValue(new Error("Meta unavailable"))

    const result = await integrationWhatsappService.refreshCapiScopeCache({
      id: "iw-1",
      workspaceId: "ws-1",
      now: new Date("2026-08-10T12:00:00.000Z"),
      checkScope,
    })

    expect(result).toMatchObject({ hasCapiScope: true })
    expect(checkScope).toHaveBeenCalledWith({
      accessToken: "token-1",
      wabaId: "waba-1",
    })
    expect(repositoryMock.updateCapiScopeCache).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledOnce()
  })

  test("stores a definitive false CAPI scope result", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    repositoryMock.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: new Date("2026-08-09T00:00:00.000Z"),
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    repositoryMock.claimCapiScopeCacheRefresh.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: now,
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    })
    repositoryMock.updateCapiScopeCache.mockResolvedValue({
      id: "iw-1",
      hasCapiScope: false,
      capiScopeCheckedAt: now,
    })
    const checkScope = vi.fn(async () => false)

    const result = await integrationWhatsappService.refreshCapiScopeCache({
      id: "iw-1",
      workspaceId: "ws-1",
      now,
      checkScope,
    })

    expect(result).toMatchObject({ hasCapiScope: false })
    expect(repositoryMock.updateCapiScopeCache).toHaveBeenCalledWith({
      id: "iw-1",
      workspaceId: "ws-1",
      hasCapiScope: false,
      capiScopeCheckedAt: now,
      expectedCapiScopeCheckedAt: now,
    })
  })

  test("does not clobber fresh reconnect scope when refresh carries an old checked timestamp", async () => {
    const oldCheckedAt = new Date("2026-08-09T00:00:00.000Z")
    const reconnectCheckedAt = new Date("2026-08-10T12:00:01.000Z")
    const now = new Date("2026-08-10T12:00:00.000Z")
    const row = {
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-1",
      hasCapiScope: true,
      capiScopeCheckedAt: oldCheckedAt,
      auth: {
        tokens: { accessToken: "token-1" },
        metadata: { wabaId: "waba-1" },
      },
    }
    repositoryMock.findByIdForWorkspace
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        hasCapiScope: true,
        capiScopeCheckedAt: reconnectCheckedAt,
        auth: {
          tokens: { accessToken: "token-2" },
          metadata: { wabaId: "waba-1" },
        },
      })
    repositoryMock.claimCapiScopeCacheRefresh.mockImplementation(
      async (input: { expectedCapiScopeCheckedAt: Date | null }) =>
        input.expectedCapiScopeCheckedAt?.getTime() ===
        reconnectCheckedAt.getTime()
          ? { ...row, capiScopeCheckedAt: now }
          : null,
    )
    const checkScope = vi.fn(async () => false)

    const result = await integrationWhatsappService.refreshCapiScopeCache({
      id: "iw-1",
      workspaceId: "ws-1",
      now,
      checkScope,
    })

    expect(result).toMatchObject({
      hasCapiScope: true,
      capiScopeCheckedAt: reconnectCheckedAt,
    })
    expect(checkScope).not.toHaveBeenCalled()
    expect(repositoryMock.updateCapiScopeCache).not.toHaveBeenCalled()
  })

  test("rejects replaceAuth when the new auth belongs to a different WABA", async () => {
    repositoryMock.findByIdForWorkspace.mockResolvedValue({
      id: "iw-1",
      workspaceId: "ws-1",
      wabaId: "waba-expected",
    })

    await expect(
      integrationWhatsappService.replaceAuth({
        id: "iw-1",
        workspaceId: "ws-1",
        auth: {
          tokens: { accessToken: "token-1" },
          metadata: { wabaId: "waba-other" },
        },
        hasCapiScope: true,
      }),
    ).rejects.toThrow("different WhatsApp Business Account")
    expect(repositoryMock.replaceAuth).not.toHaveBeenCalled()
  })

  test("encrypts access token before creating a signup session", async () => {
    const encryptedAccessToken = {
      v: 1,
      iv: "0".repeat(24),
      text: "ciphertext",
      tag: "1".repeat(32),
    }
    encryptTextMock.mockResolvedValue(encryptedAccessToken)
    repositoryMock.createSignupSession.mockResolvedValue({ id: "session-1" })

    const result = await integrationWhatsappService.createSignupSession({
      userId: "user-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      wabaId: "waba-1",
      businessId: "business-1",
      accessToken: "plain-token",
      apiVersion: "v23.0",
      candidatePhoneNumberIds: ["phone-1"],
    })

    expect(result).toEqual({ id: "session-1" })
    expect(encryptTextMock).toHaveBeenCalledWith("plain-token")
    expect(repositoryMock.createSignupSession).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedAccessToken,
        candidatePhoneNumberIds: ["phone-1"],
      }),
    )
  })

  test("decrypts access token after atomically consuming a session", async () => {
    const encryptedAccessToken = {
      v: 1,
      iv: "0".repeat(24),
      text: "ciphertext",
      tag: "1".repeat(32),
    }
    repositoryMock.consumeSignupSession.mockResolvedValue({
      id: "session-1",
      encryptedAccessToken,
    })
    decryptTextMock.mockResolvedValue("plain-token")

    const result = await integrationWhatsappService.consumeSignupSession({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "phone-1",
    })

    expect(result).toMatchObject({
      id: "session-1",
      accessToken: "plain-token",
    })
    expect(repositoryMock.consumeSignupSession).toHaveBeenCalledWith({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "phone-1",
    })
  })

  test("returns null when the repository cannot consume the session", async () => {
    repositoryMock.consumeSignupSession.mockResolvedValue(null)

    const result = await integrationWhatsappService.consumeSignupSession({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "phone-1",
    })

    expect(result).toBeNull()
    expect(decryptTextMock).not.toHaveBeenCalled()
  })

  test("stores Meta user-facing registration error details", async () => {
    const error = new ChannelError(
      "Invalid parameter",
      ChannelErrorCategory.PAYLOAD_INVALID,
      {
        code: 100,
        subCode: 2_593_005,
        type: "OAuthException",
      },
    ).setOriginError({
      userTitle: "Phone number is not verified",
      userMessage: "Phone number is not verified through SMS or voice.",
      fbtraceId: "trace-1",
    })

    const result = await integrationWhatsappService.recordRegistrationOutcome({
      id: "integration-1",
      workspaceId: "workspace-1",
      outcome: { status: "failed", error },
    })

    expect(result).toBeNull()
    expect(repositoryMock.updateRegistration).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      values: {
        registrationStatus: "failed",
        registrationError: expect.objectContaining({
          code: 100,
          subCode: 2_593_005,
          message: "Invalid parameter",
          type: "OAuthException",
          userTitle: "Phone number is not verified",
          userMessage: "Phone number is not verified through SMS or voice.",
          fbtraceId: "trace-1",
        }),
      },
    })
  })

  test("claims a verification code request slot atomically", async () => {
    const requestedAt = new Date("2026-07-27T08:00:00.000Z")
    repositoryMock.claimVerificationCodeSlot.mockResolvedValueOnce(requestedAt)

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: requestedAt,
    })

    expect(result).toEqual({ status: "claimed", requestedAt })
    // The cutoff is the service's job: the repository only applies whatever
    // window it is handed.
    expect(repositoryMock.claimVerificationCodeSlot).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      now: requestedAt,
      cutoff: new Date("2026-07-27T07:59:00.000Z"),
    })
    expect(
      repositoryMock.findVerificationCodeRequestedAt,
    ).not.toHaveBeenCalled()
  })

  test("returns remaining cooldown when verification code was requested recently", async () => {
    repositoryMock.findVerificationCodeRequestedAt.mockResolvedValueOnce({
      verificationCodeRequestedAt: new Date("2026-07-27T08:00:10.000Z"),
    })

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: new Date("2026-07-27T08:00:30.000Z"),
    })

    expect(result).toEqual({
      status: "cooldown",
      requestedAt: new Date("2026-07-27T08:00:10.000Z"),
      remainingSeconds: 40,
    })
  })

  test("reports not_found when neither the claim nor the row lookup matches", async () => {
    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "missing",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
    })

    expect(result).toEqual({ status: "not_found" })
  })

  test("allows an immediate retry when a released slot left no timestamp", async () => {
    // A concurrent request that failed at Meta clears the timestamp on its way
    // out, so the row exists with nothing to wait for.
    repositoryMock.findVerificationCodeRequestedAt.mockResolvedValueOnce({
      verificationCodeRequestedAt: null,
    })

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: new Date("2026-07-27T08:00:30.000Z"),
    })

    expect(result).toEqual({
      status: "cooldown",
      requestedAt: null,
      remainingSeconds: 0,
    })
  })
})
