import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  DecryptionError: class DecryptionError extends Error {},
  UnreadableError: class UnreadableError extends Error {},
  applyRefreshedToken: vi.fn(),
  claimDueForRefresh: vi.fn(),
  deferRefresh: vi.fn(),
  deferRefreshUnderLease: vi.fn(),
  exists: vi.fn(),
  getCredentials: vi.fn(),
  isLockAcquisitionError: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  markNeedsReauth: vi.fn(),
  markNeedsReauthUnreadable: vi.fn(),
  refreshInstagram: vi.fn(),
  refreshThreads: vi.fn(),
  refreshTiktok: vi.fn(),
  resolveForOwner: vi.fn(),
  requiresReconnect: vi.fn(),
  runExclusive: vi.fn(),
  withBlockedOwnerGuard: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
  resolveCredentialOwnerIdForWorkspace: async () => "owner-1",
  socialAccountService: {
    applyRefreshedToken: mocks.applyRefreshedToken,
    claimDueForRefresh: mocks.claimDueForRefresh,
    deferRefresh: mocks.deferRefresh,
    deferRefreshUnderLease: mocks.deferRefreshUnderLease,
    getCredentials: mocks.getCredentials,
    markNeedsReauth: mocks.markNeedsReauth,
    markNeedsReauthUnreadable: mocks.markNeedsReauthUnreadable,
  },
  SocialTokenDecryptionError: mocks.DecryptionError,
  SocialTokenUnreadableError: mocks.UnreadableError,
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))
vi.mock("@chatbotx.io/channel-registry/social-account", () => ({
  socialAccountProviders: {
    facebook: {
      provider: "facebook",
      requiresReconnect: mocks.requiresReconnect,
    },
    instagram: {
      provider: "instagram",
      refreshToken: mocks.refreshInstagram,
      requiresReconnect: mocks.requiresReconnect,
    },
    threads: {
      provider: "threads",
      refreshToken: mocks.refreshThreads,
      requiresReconnect: mocks.requiresReconnect,
    },
    tiktok: {
      credentialType: "tiktokPublishing",
      provider: "tiktok",
      refreshToken: mocks.refreshTiktok,
      refreshUsesAppCredentials: true,
      requiresReconnect: mocks.requiresReconnect,
    },
  },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  }),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  distributedStore: { exists: mocks.exists },
  isLockAcquisitionError: mocks.isLockAcquisitionError,
}))

const { refreshSocialAccountTokens } = await import(
  "../src/schedule/handlers/refresh-social-account-tokens"
)

const leaseUntil = new Date("2026-01-01T00:15:00Z")
const ciphertext = { cipher: "read" }
const account = {
  id: "acc-1",
  leaseUntil,
  provider: "instagram",
  workspaceId: "ws-1",
}
const fence = { leaseUntil, readAccessToken: ciphertext }
const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)

const credentials = (overrides: Record<string, unknown> = {}) => ({
  accessToken: "old-token",
  accessTokenCiphertext: ciphertext,
  provider: "instagram",
  tokenExpiresAt: future,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<void> }) => await fn(),
  )
  mocks.withBlockedOwnerGuard.mockImplementation(
    async (_workspaceId: string, run: () => Promise<void>) => await run(),
  )
  mocks.claimDueForRefresh.mockResolvedValue([account])
  mocks.getCredentials.mockResolvedValue(credentials())
  mocks.refreshInstagram.mockResolvedValue({
    accessToken: "new-token",
    expiresAt: new Date("2026-05-01T00:00:00Z"),
  })
  mocks.requiresReconnect.mockReturnValue(false)
})

describe("refreshSocialAccountTokens", () => {
  test("claims only the networks whose adapter can refresh a token", async () => {
    await refreshSocialAccountTokens()

    expect(mocks.claimDueForRefresh).toHaveBeenCalledWith({
      providers: ["instagram", "threads", "tiktok"],
    })
  })

  test("a refreshed token is stored with its new expiry", async () => {
    await refreshSocialAccountTokens()

    expect(mocks.applyRefreshedToken).toHaveBeenCalledWith({
      accessToken: "new-token",
      fence,
      id: "acc-1",
      tokenExpiresAt: new Date("2026-05-01T00:00:00Z"),
      workspaceId: "ws-1",
    })
  })

  test("a workspace of a blocked owner is skipped without touching the account", async () => {
    mocks.withBlockedOwnerGuard.mockResolvedValue(undefined)

    await refreshSocialAccountTokens()

    expect(mocks.getCredentials).not.toHaveBeenCalled()
    expect(mocks.refreshInstagram).not.toHaveBeenCalled()
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("the guard runs for the account's own workspace", async () => {
    await refreshSocialAccountTokens()

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
  })

  test("a token the platform rejects moves the account to needsReauth", async () => {
    mocks.refreshInstagram.mockRejectedValue(new Error("invalid"))
    mocks.requiresReconnect.mockReturnValue(true)

    await refreshSocialAccountTokens()

    expect(mocks.markNeedsReauth).toHaveBeenCalledWith({
      fence,
      id: "acc-1",
      reason: "refreshRejected",
      workspaceId: "ws-1",
    })
    expect(mocks.applyRefreshedToken).not.toHaveBeenCalled()
    expect(mocks.deferRefresh).not.toHaveBeenCalled()
  })

  test("a transient failure keeps the lease so the account is retried later", async () => {
    mocks.refreshInstagram.mockRejectedValue(new Error("timeout"))

    await refreshSocialAccountTokens()

    expect(mocks.deferRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ fence, id: "acc-1", workspaceId: "ws-1" }),
    )
    const [{ retryAt }] = mocks.deferRefresh.mock.calls[0] as [
      { retryAt: Date },
    ]
    expect(retryAt.getTime()).toBeGreaterThan(Date.now())
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("an already expired token cannot be refreshed: it needs a new login, no call is made", async () => {
    mocks.getCredentials.mockResolvedValue(
      credentials({ tokenExpiresAt: new Date(Date.now() - 1000) }),
    )

    await refreshSocialAccountTokens()

    expect(mocks.refreshInstagram).not.toHaveBeenCalled()
    expect(mocks.markNeedsReauth).toHaveBeenCalledWith({
      fence,
      id: "acc-1",
      reason: "tokenExpired",
      workspaceId: "ws-1",
    })
  })

  test("a lost claim stores nothing and the run just ends", async () => {
    mocks.applyRefreshedToken.mockResolvedValue(false)

    await expect(refreshSocialAccountTokens()).resolves.toBeUndefined()

    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
    expect(mocks.deferRefresh).not.toHaveBeenCalled()
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      { accountId: "acc-1" },
      expect.stringContaining("claim lost"),
    )
  })

  test("the status reasons written are only the finite set", async () => {
    mocks.refreshInstagram.mockRejectedValue(new Error("invalid"))
    mocks.requiresReconnect.mockReturnValue(true)
    await refreshSocialAccountTokens()
    mocks.getCredentials.mockResolvedValue(
      credentials({ tokenExpiresAt: new Date(Date.now() - 1000) }),
    )
    await refreshSocialAccountTokens()

    const reasons = mocks.markNeedsReauth.mock.calls.map(
      ([call]) => (call as { reason: string }).reason,
    )
    expect(reasons).toEqual(["refreshRejected", "tokenExpired"])
  })

  test("an account that lost its token meanwhile is left alone", async () => {
    mocks.getCredentials.mockResolvedValue(null)

    await refreshSocialAccountTokens()

    expect(mocks.refreshInstagram).not.toHaveBeenCalled()
    expect(mocks.applyRefreshedToken).not.toHaveBeenCalled()
  })

  test("a network without a refresh endpoint is never refreshed", async () => {
    mocks.getCredentials.mockResolvedValue(
      credentials({ provider: "facebook" }),
    )

    await refreshSocialAccountTokens()

    expect(mocks.refreshInstagram).not.toHaveBeenCalled()
    expect(mocks.applyRefreshedToken).not.toHaveBeenCalled()
  })

  test("one account's failure does not stop the others", async () => {
    mocks.claimDueForRefresh.mockResolvedValue([
      account,
      { id: "acc-2", provider: "threads", workspaceId: "ws-2" },
    ])
    mocks.getCredentials
      .mockResolvedValueOnce(credentials())
      .mockResolvedValueOnce(credentials({ provider: "threads" }))
    mocks.refreshInstagram.mockRejectedValue(new Error("timeout"))
    mocks.refreshThreads.mockResolvedValue({
      accessToken: "t2",
      expiresAt: null,
    })

    await refreshSocialAccountTokens()

    expect(mocks.applyRefreshedToken).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "t2", id: "acc-2" }),
    )
  })

  test("an unreadable token needs a reconnect, fenced on the lease, and does not stop the accounts after it", async () => {
    mocks.claimDueForRefresh.mockResolvedValue([
      account,
      { id: "acc-2", leaseUntil, provider: "threads", workspaceId: "ws-2" },
    ])
    mocks.getCredentials
      .mockRejectedValueOnce(new mocks.UnreadableError("bad ciphertext"))
      .mockResolvedValueOnce(credentials({ provider: "threads" }))
    mocks.refreshThreads.mockResolvedValue({
      accessToken: "t2",
      expiresAt: null,
    })

    await expect(refreshSocialAccountTokens()).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-1" }),
      expect.any(String),
    )
    expect(mocks.markNeedsReauthUnreadable).toHaveBeenCalledWith({
      id: "acc-1",
      leaseUntil,
      workspaceId: "ws-1",
    })
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
    expect(mocks.applyRefreshedToken).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "t2", id: "acc-2" }),
    )
  })

  test("a decryption failure is logged and deferred, never flagged for reconnect", async () => {
    const leaseUntil = new Date("2026-01-01T00:15:00Z")
    mocks.claimDueForRefresh.mockResolvedValue([
      { id: "acc-1", leaseUntil, provider: "instagram", workspaceId: "ws-1" },
    ])
    mocks.getCredentials.mockRejectedValueOnce(
      new mocks.DecryptionError("wrong key"),
    )

    await expect(refreshSocialAccountTokens()).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-1" }),
      expect.any(String),
    )
    expect(mocks.deferRefreshUnderLease).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1", leaseUntil, workspaceId: "ws-1" }),
    )
    expect(mocks.markNeedsReauthUnreadable).not.toHaveBeenCalled()
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("any other credential read failure is logged and leaves the status alone", async () => {
    mocks.getCredentials.mockRejectedValueOnce(new Error("connection reset"))

    await expect(refreshSocialAccountTokens()).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-1",
        err: expect.any(Error),
      }),
      expect.any(String),
    )
    expect(mocks.markNeedsReauthUnreadable).not.toHaveBeenCalled()
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
    expect(mocks.deferRefresh).not.toHaveBeenCalled()
  })

  test("a failing status write of one account does not stop the accounts after it", async () => {
    mocks.claimDueForRefresh.mockResolvedValue([
      account,
      { id: "acc-2", provider: "threads", workspaceId: "ws-2" },
    ])
    mocks.getCredentials
      .mockResolvedValueOnce(credentials())
      .mockResolvedValueOnce(credentials({ provider: "threads" }))
    mocks.refreshInstagram.mockRejectedValue(new Error("timeout"))
    mocks.deferRefresh.mockRejectedValueOnce(new Error("db down"))
    mocks.refreshThreads.mockResolvedValue({
      accessToken: "t2",
      expiresAt: null,
    })

    await expect(refreshSocialAccountTokens()).resolves.toBeUndefined()

    expect(mocks.applyRefreshedToken).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "t2", id: "acc-2" }),
    )
  })

  test("a tick that finds the previous one still holding the lock is skipped", async () => {
    const lockError = new Error("lock held")
    mocks.runExclusive.mockRejectedValue(lockError)
    mocks.isLockAcquisitionError.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)

    await expect(refreshSocialAccountTokens()).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("any other failure propagates", async () => {
    mocks.runExclusive.mockRejectedValue(new Error("db down"))
    mocks.isLockAcquisitionError.mockReturnValue(false)

    await expect(refreshSocialAccountTokens()).rejects.toThrow("db down")
  })

  describe("a network that rotates the refresh token (TikTok)", () => {
    const tiktokAccount = { ...account, provider: "tiktok" }
    const appSettings = { clientId: "ck", clientSecret: "cs" }

    beforeEach(() => {
      mocks.claimDueForRefresh.mockResolvedValue([tiktokAccount])
      mocks.getCredentials.mockResolvedValue(
        credentials({
          provider: "tiktok",
          refreshToken: "rft.old",
          // already expired: a refresh token still refreshes it
          tokenExpiresAt: new Date(Date.now() - 60_000),
        }),
      )
      mocks.resolveForOwner.mockResolvedValue({ config: appSettings })
      mocks.refreshTiktok.mockResolvedValue({
        accessToken: "act.new",
        expiresAt: new Date("2026-05-01T00:00:00Z"),
        refreshToken: "rft.rotated",
      })
    })

    test("stores the rotated refresh token in the same fenced write as the access token", async () => {
      await refreshSocialAccountTokens()

      expect(mocks.refreshTiktok).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: "rft.old" }),
        appSettings,
      )
      expect(mocks.applyRefreshedToken).toHaveBeenCalledWith({
        accessToken: "act.new",
        fence,
        id: "acc-1",
        refreshToken: "rft.rotated",
        tokenExpiresAt: new Date("2026-05-01T00:00:00Z"),
        workspaceId: "ws-1",
      })
      expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
    })

    test("a rejected refresh token moves the account to needsReauth", async () => {
      mocks.refreshTiktok.mockRejectedValue(new Error("invalid_grant"))
      mocks.requiresReconnect.mockReturnValue(true)

      await refreshSocialAccountTokens()

      expect(mocks.markNeedsReauth).toHaveBeenCalledWith({
        fence,
        id: "acc-1",
        reason: "refreshRejected",
        workspaceId: "ws-1",
      })
      expect(mocks.applyRefreshedToken).not.toHaveBeenCalled()
    })

    test("a removed app defers the refresh instead of punishing the account", async () => {
      mocks.resolveForOwner.mockResolvedValue(undefined)

      await refreshSocialAccountTokens()

      expect(mocks.refreshTiktok).not.toHaveBeenCalled()
      expect(mocks.deferRefresh).toHaveBeenCalled()
      expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
    })

    test("a lost claim stores nothing", async () => {
      mocks.applyRefreshedToken.mockResolvedValue(false)

      await refreshSocialAccountTokens()

      expect(mocks.loggerInfo).toHaveBeenCalled()
    })
  })
})
