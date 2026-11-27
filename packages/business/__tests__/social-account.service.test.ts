import { enabledContentTypes } from "@chatbotx.io/utils/post-publishing"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyRefreshedToken: vi.fn(),
  claimDueForRefresh: vi.fn(),
  deactivateMissingDestinations: vi.fn(),
  decryptObject: vi.fn(),
  deferRefresh: vi.fn(),
  disconnect: vi.fn(),
  encryptObject: vi.fn(),
  findForWorkspace: vi.fn(),
  findIdByExternalAccount: vi.fn(),
  findTokens: vi.fn(),
  list: vi.fn(),
  lockConnectedForSync: vi.fn(),
  listDestinationTokens: vi.fn(),
  listDestinations: vi.fn(),
  saveDestinationTokens: vi.fn(),
  saveTokens: vi.fn(),
  setNeedsReauthUnderLease: vi.fn(),
  setStatus: vi.fn(),
  upsertDestinations: vi.fn(),
  upsertIdentity: vi.fn(),
  createId: vi.fn(),
  ensureForTiktokDestinations: vi.fn(),
  invalidateCacheKeys: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  publishDestinationRepository: {
    ensureForTiktokDestinations: mocks.ensureForTiktokDestinations,
  },
  socialAccountRepository: {
    applyRefreshedToken: mocks.applyRefreshedToken,
    claimDueForRefresh: mocks.claimDueForRefresh,
    deactivateMissingDestinations: mocks.deactivateMissingDestinations,
    deferRefresh: mocks.deferRefresh,
    disconnect: mocks.disconnect,
    findForWorkspace: mocks.findForWorkspace,
    findIdByExternalAccount: mocks.findIdByExternalAccount,
    findTokens: mocks.findTokens,
    list: mocks.list,
    lockConnectedForSync: mocks.lockConnectedForSync,
    listDestinationTokens: mocks.listDestinationTokens,
    listDestinations: mocks.listDestinations,
    saveDestinationTokens: mocks.saveDestinationTokens,
    saveTokens: mocks.saveTokens,
    setNeedsReauthUnderLease: mocks.setNeedsReauthUnderLease,
    setStatus: mocks.setStatus,
    upsertDestinations: mocks.upsertDestinations,
    upsertIdentity: mocks.upsertIdentity,
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  isMalformedEncryptedData: (err: unknown) =>
    err instanceof Error && err.name === "MalformedEncryptedDataError",
  encryptUtils: {
    decryptObject: mocks.decryptObject,
    encryptObject: mocks.encryptObject,
  },
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: mocks.createId,
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  invalidateCacheKeys: mocks.invalidateCacheKeys,
}))
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

const {
  SOCIAL_TOKEN_REFRESH_BATCH,
  SOCIAL_TOKEN_REFRESH_LEAD_MS,
  SOCIAL_TOKEN_REFRESH_LEASE_MS,
  SocialTokenDecryptionError,
  SocialTokenUnreadableError,
  socialAccountService,
} = await import("../src/social-account/service")
const { socialAccountAad, socialDestinationAad } = await import(
  "@chatbotx.io/database/partials"
)

const safeAccountRow = {
  avatar: null,
  connectedById: "u-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  displayName: "Shop",
  externalAccountId: "ext-1",
  grantedScopes: [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
  ],
  id: "acc-1",
  lastVerifiedAt: null,
  provider: "facebook" as const,
  status: "connected" as const,
  statusReason: null,
  tokenExpiresAt: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  username: null,
  workspaceId: "ws-1",
}

const destination = (overrides: Record<string, unknown> = {}) => ({
  accessToken: "page-token",
  avatar: null,
  externalId: "page-1",
  isActive: true,
  kind: "profile" as const,
  name: "Profile 1",
  username: null,
  ...overrides,
})

const tiktokAccount = (overrides: Record<string, unknown> = {}) => ({
  accessToken: "user-token",
  avatar: null,
  destinations: [destination()],
  displayName: "Shop",
  externalAccountId: "ext-1",
  grantedScopes: ["user.info.basic", "video.publish", "video.upload"],
  provider: "tiktok" as const,
  refreshToken: null,
  tokenExpiresAt: new Date("2026-03-01T00:00:00Z"),
  username: null,
  ...overrides,
})

const TOKEN_FIELD = /accessToken|refreshToken|"token"/i

let nextId = 0

beforeEach(() => {
  vi.clearAllMocks()
  nextId = 0
  mocks.createId.mockImplementation(() => `gen-${++nextId}`)
  mocks.encryptObject.mockImplementation(
    async (value: unknown, aad: string) => ({
      aad,
      value,
    }),
  )
  mocks.findIdByExternalAccount.mockResolvedValue(null)
  mocks.upsertIdentity.mockImplementation(
    async (input: { id: string }) => input.id,
  )
  mocks.upsertDestinations.mockImplementation(
    async (input: { destinations: { externalId: string; id: string }[] }) =>
      input.destinations.map(({ externalId, id }) => ({ externalId, id })),
  )
  mocks.findForWorkspace.mockResolvedValue(safeAccountRow)
  mocks.listDestinations.mockResolvedValue([])
})

describe("socialAccountService.connect", () => {
  test.each([
    "facebook",
    "instagram",
    "threads",
  ])("refuses a %s account, writing nothing: Meta networks publish with inbox tokens", async (provider) => {
    await expect(
      socialAccountService.connect({
        account: tiktokAccount({ provider }) as never,
        connectedById: "u-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({
      code: "providerNotSupported",
      httpStatusCode: 422,
    })

    expect(mocks.upsertIdentity).not.toHaveBeenCalled()
    expect(mocks.saveTokens).not.toHaveBeenCalled()
    expect(mocks.ensureForTiktokDestinations).not.toHaveBeenCalled()
    expect(mocks.encryptObject).not.toHaveBeenCalled()
  })

  test("refuses a TikTok login that withholds a publishing permission, naming it", async () => {
    await expect(
      socialAccountService.connect({
        account: tiktokAccount({
          grantedScopes: ["user.info.basic", "video.upload"],
        }),
        connectedById: "u-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({
      code: "permissionNotGranted",
      data: { permissions: "video.publish" },
    })

    expect(mocks.upsertIdentity).not.toHaveBeenCalled()
  })

  test("binds the account token to the row id, in one transaction", async () => {
    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.upsertIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gen-1", workspaceId: "ws-1" }),
      tx,
    )
    expect(mocks.encryptObject).toHaveBeenCalledWith(
      { token: "user-token" },
      socialAccountAad("ws-1", "gen-1"),
    )
    expect(mocks.saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gen-1", refreshToken: null }),
      tx,
    )
  })

  test("a successful connect drops the cached creator settings of the account", async () => {
    mocks.findIdByExternalAccount.mockResolvedValue("existing-9")
    mocks.upsertIdentity.mockResolvedValue("existing-9")

    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.invalidateCacheKeys).toHaveBeenCalledWith(
      "social-account:publishing-settings:ws-1:existing-9",
    )
  })

  test("a reconnect of the same login keeps its row id", async () => {
    mocks.findIdByExternalAccount.mockResolvedValue("existing-9")

    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.upsertIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: "existing-9" }),
      tx,
    )
  })

  test("tokens are bound to the id a concurrent connect won the insert with", async () => {
    mocks.upsertIdentity.mockResolvedValue("winner-5")

    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.encryptObject).toHaveBeenCalledWith(
      { token: "user-token" },
      socialAccountAad("ws-1", "winner-5"),
    )
    expect(mocks.saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ id: "winner-5" }),
      tx,
    )
  })

  test("a refresh token, when the platform gives one, is encrypted too", async () => {
    await socialAccountService.connect({
      account: tiktokAccount({ refreshToken: "refresh-1" }),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.encryptObject).toHaveBeenCalledWith(
      { token: "refresh-1" },
      socialAccountAad("ws-1", "gen-1"),
    )
  })

  test("each destination token is bound to its own row id", async () => {
    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    const [{ destinations }] = mocks.upsertDestinations.mock.calls[0] as [
      { destinations: { id: string }[] },
    ]
    expect(mocks.encryptObject).toHaveBeenCalledWith(
      { token: "page-token" },
      socialDestinationAad("ws-1", destinations[0]?.id ?? ""),
    )
  })

  test("a destination the person cannot publish to is stored inactive with no token", async () => {
    await socialAccountService.connect({
      account: tiktokAccount({
        destinations: [destination({ accessToken: "secret", isActive: false })],
      }),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    const [{ tokens }] = mocks.saveDestinationTokens.mock.calls[0] as [
      { tokens: { token: unknown }[] },
    ]
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.token).toBeNull()
    expect(mocks.encryptObject).not.toHaveBeenCalledWith(
      { token: "secret" },
      expect.anything(),
    )
  })

  test("keeps at most one hundred destinations, active ones first", async () => {
    const pages = Array.from({ length: 130 }, (_, index) =>
      destination({
        externalId: `page-${index}`,
        isActive: index >= 100,
        name: `Page ${index}`,
      }),
    )

    await socialAccountService.connect({
      account: tiktokAccount({ destinations: pages }),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    const [{ destinations }] = mocks.upsertDestinations.mock.calls[0] as [
      { destinations: { externalId: string; isActive: boolean }[] },
    ]
    expect(destinations).toHaveLength(100)
    expect(destinations.filter((entry) => entry.isActive)).toHaveLength(30)
    expect(destinations[0]?.isActive).toBe(true)
  })

  test("a binding is ensured for every stored destination, in the same transaction", async () => {
    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.ensureForTiktokDestinations).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
      tx,
    )
  })

  test("destinations the platform no longer lists are deactivated", async () => {
    await socialAccountService.connect({
      account: tiktokAccount(),
      connectedById: "u-1",
      workspaceId: "ws-1",
    })

    expect(mocks.deactivateMissingDestinations).toHaveBeenCalledWith(
      expect.objectContaining({
        keepExternalIds: ["page-1"],
        socialAccountId: "gen-1",
        workspaceId: "ws-1",
      }),
      tx,
    )
  })
})

describe("social account DTOs never carry a token", () => {
  test("get returns the safe fields only", async () => {
    mocks.listDestinations.mockResolvedValue([
      {
        avatar: null,
        createdAt: new Date(),
        externalId: "page-1",
        id: "d-1",
        isActive: true,
        kind: "page",
        lastSyncedAt: null,
        name: "Page 1",
        socialAccountId: "acc-1",
        username: null,
        workspaceId: "ws-1",
      },
    ])

    const account = await socialAccountService.get({
      id: "acc-1",
      workspaceId: "ws-1",
    })
    const serialised = JSON.stringify(account)

    expect(serialised).not.toMatch(TOKEN_FIELD)
    expect(Object.keys(account)).not.toContain("accessToken")
    expect(account.destinations[0]).not.toHaveProperty("accessToken")
    expect(account.missingScopes).toEqual([])
    expect(account.contentTypes).toEqual(enabledContentTypes("facebook"))
  })

  test("a TikTok account offers video only", async () => {
    mocks.findForWorkspace.mockResolvedValue({
      ...safeAccountRow,
      provider: "tiktok",
    })
    mocks.listDestinations.mockResolvedValue([])

    const account = await socialAccountService.get({
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(account.contentTypes).toEqual(["video"])
  })

  test("a missing permission is listed on the account", async () => {
    mocks.findForWorkspace.mockResolvedValue({
      ...safeAccountRow,
      grantedScopes: ["pages_show_list"],
    })

    const account = await socialAccountService.get({
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(account.missingScopes).toEqual([
      "pages_manage_posts",
      "pages_read_engagement",
    ])
  })

  test("get of another workspace's account is not found", async () => {
    mocks.findForWorkspace.mockResolvedValue(null)

    await expect(
      socialAccountService.get({ id: "acc-1", workspaceId: "ws-2" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("list reads the destinations of every account in one query", async () => {
    mocks.list.mockResolvedValue([
      safeAccountRow,
      { ...safeAccountRow, id: "acc-2" },
    ])

    await socialAccountService.list("ws-1")

    expect(mocks.listDestinations).toHaveBeenCalledTimes(1)
    expect(mocks.listDestinations).toHaveBeenCalledWith({
      accountIds: ["acc-1", "acc-2"],
      workspaceId: "ws-1",
    })
  })
})

describe("socialAccountService.getCredentials", () => {
  const connectedRow = {
    accessToken: { cipher: "a" },
    id: "acc-1",
    provider: "facebook",
    refreshToken: null,
    status: "connected",
    tokenExpiresAt: null,
    workspaceId: "ws-1",
  }

  test.each([
    [
      "a malformed encrypted blob",
      Object.assign(new Error("Invalid hex string"), {
        name: "MalformedEncryptedDataError",
      }),
    ],
    ["an unparsable payload", new SyntaxError("Unexpected token")],
  ])("%s is reported as an unreadable token", async (_label, failure) => {
    mocks.findTokens.mockResolvedValue(connectedRow)
    mocks.listDestinationTokens.mockResolvedValue([])
    mocks.decryptObject.mockRejectedValue(failure)

    await expect(
      socialAccountService.getCredentials({ id: "acc-1", workspaceId: "ws-1" }),
    ).rejects.toBeInstanceOf(SocialTokenUnreadableError)
  })

  test("a Web Crypto OperationError is a transient decryption failure, never unreadable", async () => {
    mocks.findTokens.mockResolvedValue(connectedRow)
    mocks.listDestinationTokens.mockResolvedValue([])
    mocks.decryptObject.mockRejectedValue(
      Object.assign(new Error("x"), { name: "OperationError" }),
    )

    const failure = await socialAccountService
      .getCredentials({ id: "acc-1", workspaceId: "ws-1" })
      .catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(SocialTokenDecryptionError)
    expect(failure).not.toBeInstanceOf(SocialTokenUnreadableError)
  })

  test("a key configuration or database failure is not an unreadable token", async () => {
    mocks.findTokens.mockResolvedValue(connectedRow)
    mocks.listDestinationTokens.mockResolvedValue([])
    mocks.decryptObject.mockRejectedValue(
      new Error("Cannot decrypt: no key available"),
    )

    const failure = await socialAccountService
      .getCredentials({ id: "acc-1", workspaceId: "ws-1" })
      .catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(SocialTokenUnreadableError)
  })

  test("markNeedsReauthUnreadable presents the claimed lease", async () => {
    const leaseUntil = new Date("2026-01-01T00:15:00Z")
    mocks.setNeedsReauthUnderLease.mockResolvedValue(false)

    const changed = await socialAccountService.markNeedsReauthUnreadable({
      id: "acc-1",
      leaseUntil,
      workspaceId: "ws-1",
    })

    expect(changed).toBe(false)
    expect(mocks.setNeedsReauthUnderLease).toHaveBeenCalledWith({
      id: "acc-1",
      leaseUntil,
      reason: "refreshRejected",
      workspaceId: "ws-1",
    })
    expect(mocks.invalidateCacheKeys).not.toHaveBeenCalled()
  })

  test("a disconnected account holds no token", async () => {
    mocks.findTokens.mockResolvedValue({
      accessToken: null,
      id: "acc-1",
      provider: "facebook",
      refreshToken: null,
      status: "disconnected",
      tokenExpiresAt: null,
      workspaceId: "ws-1",
    })

    await expect(
      socialAccountService.getCredentials({ id: "acc-1", workspaceId: "ws-1" }),
    ).resolves.toBeNull()
    expect(mocks.decryptObject).not.toHaveBeenCalled()
  })

  test("tokens are decrypted with the AAD of their own row", async () => {
    mocks.findTokens.mockResolvedValue({
      accessToken: { cipher: "a" },
      id: "acc-1",
      provider: "facebook",
      refreshToken: null,
      status: "connected",
      tokenExpiresAt: null,
      workspaceId: "ws-1",
    })
    mocks.listDestinationTokens.mockResolvedValue([
      {
        accessToken: { cipher: "d" },
        externalId: "page-1",
        id: "d-1",
        isActive: true,
        kind: "page",
      },
    ])
    mocks.decryptObject.mockResolvedValue({ token: "plain" })

    const credentials = await socialAccountService.getCredentials({
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(mocks.decryptObject).toHaveBeenCalledWith(
      { cipher: "a" },
      expect.anything(),
      socialAccountAad("ws-1", "acc-1"),
    )
    expect(mocks.decryptObject).toHaveBeenCalledWith(
      { cipher: "d" },
      expect.anything(),
      socialDestinationAad("ws-1", "d-1"),
    )
    expect(credentials?.accessToken).toBe("plain")
  })
})

describe("account lifecycle", () => {
  test("disconnecting an unknown account is not found", async () => {
    mocks.disconnect.mockResolvedValue(false)

    await expect(
      socialAccountService.disconnect({ id: "acc-1", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("disconnecting wipes the account inside one transaction", async () => {
    mocks.disconnect.mockResolvedValue(true)

    await socialAccountService.disconnect({ id: "acc-1", workspaceId: "ws-1" })

    expect(mocks.disconnect).toHaveBeenCalledWith(
      { id: "acc-1", workspaceId: "ws-1" },
      tx,
    )
  })

  test("disconnecting drops the cached creator settings of the account", async () => {
    mocks.disconnect.mockResolvedValue(true)

    await socialAccountService.disconnect({ id: "acc-1", workspaceId: "ws-1" })

    expect(mocks.invalidateCacheKeys).toHaveBeenCalledWith(
      "social-account:publishing-settings:ws-1:acc-1",
    )
  })

  test("a re-auth drops the cached creator settings only when the status changed", async () => {
    mocks.setStatus.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const input = {
      id: "acc-1",
      reason: "tokenRejected",
      workspaceId: "ws-1",
    } as const

    await socialAccountService.markNeedsReauth(input)
    expect(mocks.invalidateCacheKeys).not.toHaveBeenCalled()
    await socialAccountService.markNeedsReauth(input)

    expect(mocks.invalidateCacheKeys).toHaveBeenCalledWith(
      "social-account:publishing-settings:ws-1:acc-1",
    )
  })

  test("a rejected token moves the account to needsReauth with the reason", async () => {
    mocks.setStatus.mockResolvedValue(true)

    await socialAccountService.markNeedsReauth({
      id: "acc-1",
      reason: "tokenRejected",
      workspaceId: "ws-1",
    })

    expect(mocks.setStatus).toHaveBeenCalledWith({
      id: "acc-1",
      reason: "tokenRejected",
      status: "needsReauth",
      workspaceId: "ws-1",
    })
  })
})

describe("socialAccountService.rejectAccessToken", () => {
  const input = {
    fence: { readAccessToken: { cipher: "read" } as never },
    id: "acc-1",
    workspaceId: "ws-1",
  }
  const row = (overrides: Record<string, unknown> = {}) => ({
    refreshToken: { cipher: "refresh" },
    status: "connected",
    tokenExpiresAt: new Date(Date.now() - 60_000),
    ...overrides,
  })

  test("an expired access token with a refresh token stays connected for the refresh scan", async () => {
    mocks.findTokens.mockResolvedValue(row())

    const outcome = await socialAccountService.rejectAccessToken(input)

    expect(outcome).toBe("refreshPending")
    expect(mocks.setStatus).not.toHaveBeenCalled()
  })

  test.each([
    ["no refresh token", { refreshToken: null }],
    [
      "a token that has not expired (revoked)",
      {
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
      },
    ],
    ["an unknown expiry", { tokenExpiresAt: null }],
    ["an account already waiting for a reconnect", { status: "needsReauth" }],
  ])("%s needs a reconnect", async (_name, overrides) => {
    mocks.findTokens.mockResolvedValue(row(overrides))
    mocks.setStatus.mockResolvedValue(true)

    const outcome = await socialAccountService.rejectAccessToken(input)

    expect(outcome).toBe("needsReauth")
    expect(mocks.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        fence: input.fence,
        reason: "tokenRejected",
        status: "needsReauth",
      }),
    )
  })

  test("a token that was replaced meanwhile changes nothing", async () => {
    mocks.findTokens.mockResolvedValue(row({ refreshToken: null }))
    mocks.setStatus.mockResolvedValue(false)

    expect(await socialAccountService.rejectAccessToken(input)).toBe(
      "unchanged",
    )
  })
})

describe("socialAccountService.replaceDestinations", () => {
  const syncFence = { readAccessToken: { cipher: "read" } as never }
  const sync = () =>
    socialAccountService.replaceDestinations({
      destinations: [destination()],
      fence: syncFence,
      id: "acc-1",
      workspaceId: "ws-1",
    })

  test("writes under the row lock while the account is still connected", async () => {
    mocks.lockConnectedForSync.mockResolvedValue(true)

    await sync()

    expect(mocks.lockConnectedForSync).toHaveBeenCalledWith(
      { fence: syncFence, id: "acc-1", workspaceId: "ws-1" },
      tx,
    )
    expect(mocks.upsertDestinations).toHaveBeenCalledTimes(1)
  })

  test("writes nothing when the account was disconnected between fetch and write", async () => {
    mocks.lockConnectedForSync.mockResolvedValue(false)

    await sync()

    expect(mocks.upsertDestinations).not.toHaveBeenCalled()
    expect(mocks.saveDestinationTokens).not.toHaveBeenCalled()
    expect(mocks.deactivateMissingDestinations).not.toHaveBeenCalled()
  })
})

const fence = {
  leaseUntil: new Date("2026-01-01T00:15:00Z"),
  readAccessToken: { cipher: "read" } as never,
}

describe("token refresh", () => {
  test("the scan claims accounts expiring within the lead time, with a lease", async () => {
    const now = new Date("2026-01-01T00:00:00Z")
    mocks.claimDueForRefresh.mockResolvedValue([])

    await socialAccountService.claimDueForRefresh({
      now,
      providers: ["instagram", "threads"],
    })

    expect(mocks.claimDueForRefresh).toHaveBeenCalledWith({
      expiresBefore: new Date(now.getTime() + SOCIAL_TOKEN_REFRESH_LEAD_MS),
      leaseUntil: new Date(now.getTime() + SOCIAL_TOKEN_REFRESH_LEASE_MS),
      limit: SOCIAL_TOKEN_REFRESH_BATCH,
      now,
      providers: ["instagram", "threads"],
    })
  })

  test("TikTok's short-lived token is claimed on its own, shorter lead", async () => {
    const now = new Date("2026-01-01T00:00:00Z")
    mocks.claimDueForRefresh.mockResolvedValue([])

    await socialAccountService.claimDueForRefresh({
      now,
      providers: ["instagram", "tiktok"],
    })

    expect(mocks.claimDueForRefresh).toHaveBeenCalledTimes(2)
    expect(mocks.claimDueForRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresBefore: new Date(now.getTime() + SOCIAL_TOKEN_REFRESH_LEAD_MS),
        providers: ["instagram"],
      }),
    )
    expect(mocks.claimDueForRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresBefore: new Date(now.getTime() + 30 * 60 * 1000),
        providers: ["tiktok"],
      }),
    )
  })

  test("the batch limit is shared by the long- and short-lived claims", async () => {
    const accounts = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `a${i}` }))
    mocks.claimDueForRefresh
      .mockResolvedValueOnce(accounts(20))
      .mockResolvedValueOnce([])

    await socialAccountService.claimDueForRefresh({
      limit: 25,
      providers: ["instagram", "tiktok"],
    })

    expect(mocks.claimDueForRefresh).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 5, providers: ["tiktok"] }),
    )

    mocks.claimDueForRefresh.mockReset()
    mocks.claimDueForRefresh.mockResolvedValueOnce(accounts(25))
    await socialAccountService.claimDueForRefresh({
      limit: 25,
      providers: ["instagram", "tiktok"],
    })
    expect(mocks.claimDueForRefresh).toHaveBeenCalledTimes(1)
  })

  test("a rotated refresh token is encrypted and written with the access token", async () => {
    mocks.applyRefreshedToken.mockResolvedValue(true)

    await socialAccountService.applyRefreshedToken({
      accessToken: "new-token",
      fence,
      id: "acc-1",
      refreshToken: "rft.rotated",
      tokenExpiresAt: new Date("2026-03-01T00:00:00Z"),
      workspaceId: "ws-1",
    })

    expect(mocks.encryptObject).toHaveBeenCalledWith(
      { token: "rft.rotated" },
      socialAccountAad("ws-1", "acc-1"),
    )
    expect(mocks.applyRefreshedToken).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: expect.anything() }),
    )
  })

  test("a refreshed token is bound to the account row", async () => {
    mocks.applyRefreshedToken.mockResolvedValue(true)

    await socialAccountService.applyRefreshedToken({
      accessToken: "new-token",
      fence,
      id: "acc-1",
      tokenExpiresAt: new Date("2026-03-01T00:00:00Z"),
      workspaceId: "ws-1",
    })

    expect(mocks.encryptObject).toHaveBeenCalledWith(
      { token: "new-token" },
      socialAccountAad("ws-1", "acc-1"),
    )
  })

  test("a successful refresh drops the cached creator settings, a lost claim does not", async () => {
    const refresh = {
      accessToken: "new-token",
      fence,
      id: "acc-1",
      tokenExpiresAt: new Date("2026-03-01T00:00:00Z"),
      workspaceId: "ws-1",
    }
    mocks.applyRefreshedToken.mockResolvedValue(false)
    await socialAccountService.applyRefreshedToken(refresh)
    expect(mocks.invalidateCacheKeys).not.toHaveBeenCalled()

    mocks.applyRefreshedToken.mockResolvedValue(true)
    await socialAccountService.applyRefreshedToken(refresh)
    expect(mocks.invalidateCacheKeys).toHaveBeenCalledWith(
      "social-account:publishing-settings:ws-1:acc-1",
    )
  })

  test("the claim the worker took is presented to the repository, unchanged", async () => {
    mocks.applyRefreshedToken.mockResolvedValue(false)

    const stored = await socialAccountService.applyRefreshedToken({
      accessToken: "new-token",
      fence,
      id: "acc-1",
      tokenExpiresAt: null,
      workspaceId: "ws-1",
    })

    expect(stored).toBe(false)
    expect(mocks.applyRefreshedToken).toHaveBeenCalledWith(
      expect.objectContaining({ fence, id: "acc-1", workspaceId: "ws-1" }),
    )
  })

  test("a deferred retry is fenced by the same claim", async () => {
    mocks.deferRefresh.mockResolvedValue(true)
    const retryAt = new Date("2026-01-01T01:00:00Z")

    await socialAccountService.deferRefresh({
      fence,
      id: "acc-1",
      retryAt,
      workspaceId: "ws-1",
    })

    expect(mocks.deferRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ fence, retryAt }),
    )
  })
})

describe("fenced status changes", () => {
  test("needsReauth and connected pass the token fence to the repository", async () => {
    mocks.setStatus.mockResolvedValue(true)
    const readFence = { readAccessToken: { cipher: "read" } as never }

    await socialAccountService.markNeedsReauth({
      fence: readFence,
      id: "acc-1",
      reason: "tokenRejected",
      workspaceId: "ws-1",
    })
    await socialAccountService.markConnected({
      fence: readFence,
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(mocks.setStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fence: readFence, status: "needsReauth" }),
    )
    expect(mocks.setStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fence: readFence,
        reason: null,
        status: "connected",
      }),
    )
  })

  test("the credentials carry the ciphertext the token was read from", async () => {
    mocks.findTokens.mockResolvedValue({
      accessToken: { cipher: "a" },
      id: "acc-1",
      provider: "facebook",
      refreshToken: null,
      status: "connected",
      tokenExpiresAt: null,
      workspaceId: "ws-1",
    })
    mocks.listDestinationTokens.mockResolvedValue([])
    mocks.decryptObject.mockResolvedValue({ token: "plain" })

    const credentials = await socialAccountService.getCredentials({
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(credentials?.accessTokenCiphertext).toEqual({ cipher: "a" })
  })

  test("a status reason outside the finite set reads as none", async () => {
    mocks.findForWorkspace.mockResolvedValue({
      ...safeAccountRow,
      status: "needsReauth",
      statusReason: "permissionNotGranted:old,format",
    })

    const account = await socialAccountService.get({
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(account.statusReason).toBeNull()
  })

  test("a known status reason is returned as is", async () => {
    mocks.findForWorkspace.mockResolvedValue({
      ...safeAccountRow,
      status: "needsReauth",
      statusReason: "refreshRejected",
    })

    const account = await socialAccountService.get({
      id: "acc-1",
      workspaceId: "ws-1",
    })

    expect(account.statusReason).toBe("refreshRejected")
  })
})
