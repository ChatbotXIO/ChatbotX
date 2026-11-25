// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  ttls: [] as (number | undefined)[],
  listDestinations: vi.fn(),
  adapter: {
    credentialType: "tiktokPublishing",
    listDestinations: undefined as ReturnType<typeof vi.fn> | undefined,
    requiresReconnect: vi.fn(),
    revoke: undefined as ReturnType<typeof vi.fn> | undefined,
    verify: vi.fn(),
  },
  getPublishDestination: vi.fn(),
  get: vi.fn(),
  getCredentials: vi.fn(),
  markConnected: vi.fn(),
  markNeedsReauth: vi.fn(),
  queryCreatorInfo: vi.fn(),
  recordVerified: vi.fn(),
  rejectAccessToken: vi.fn(),
  replaceDestinations: vi.fn(),
  resolveForOwner: vi.fn(),
  revoke: vi.fn(),
  disconnect: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheKeys: vi.fn(),
  withCache: async <T>(
    key: string,
    fn: () => Promise<T>,
    options?: { ttlFor?: (result: T) => number | undefined },
  ): Promise<T> => {
    if (mocks.cache.has(key)) {
      return mocks.cache.get(key) as T
    }
    const result = await fn()
    mocks.cache.set(key, result)
    mocks.ttls.push(options?.ttlFor?.(result))
    return result
  },
}))
vi.mock("@chatbotx.io/integration-tiktok/publisher-api", () => ({
  queryCreatorInfo: mocks.queryCreatorInfo,
}))
vi.mock("../src/platform-credential/service", () => ({
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
}))
vi.mock("../src/publish-destination/service", () => ({
  publishDestinationService: { get: mocks.getPublishDestination },
}))
vi.mock("../src/google-ads/owner", () => ({
  resolveCredentialOwnerIdForWorkspace: async () => "owner-1",
}))
vi.mock("../src/social-account/service", () => ({
  socialAccountService: {
    disconnect: mocks.disconnect,
    get: mocks.get,
    getCredentials: mocks.getCredentials,
    markConnected: mocks.markConnected,
    markNeedsReauth: mocks.markNeedsReauth,
    rejectAccessToken: mocks.rejectAccessToken,
    recordVerified: mocks.recordVerified,
    replaceDestinations: mocks.replaceDestinations,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { socialAccountOperationService } = await import(
  "../src/social-account/operations"
)
const ports = { tiktok: mocks.adapter } as never
const socialAccountOperations = {
  disconnect: (input: { id: string; workspaceId: string }) =>
    socialAccountOperationService.disconnect(input, ports),
  publishingSettings: socialAccountOperationService.publishingSettings,
  syncDestinations: (input: { id: string; workspaceId: string }) =>
    socialAccountOperationService.syncDestinations(input, ports),
  verify: (input: { id: string; workspaceId: string }) =>
    socialAccountOperationService.verify(input, ports),
}

const ref = { id: "acc-1", workspaceId: "ws-1" }
const readCiphertext = { cipher: "read" }
const credentials = (overrides: Record<string, unknown> = {}) => ({
  accessToken: "user-token",
  accessTokenCiphertext: readCiphertext,
  destinations: [],
  id: "acc-1",
  provider: "tiktok",
  refreshToken: null,
  status: "connected",
  tokenExpiresAt: null,
  workspaceId: "ws-1",
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cache.clear()
  mocks.ttls.length = 0
  mocks.getCredentials.mockResolvedValue(credentials())
  mocks.get.mockResolvedValue({ id: "acc-1" })
  mocks.adapter.listDestinations = mocks.listDestinations
  mocks.adapter.revoke = undefined
  mocks.adapter.requiresReconnect.mockReturnValue(false)
  mocks.getPublishDestination.mockResolvedValue({
    id: "dest-1",
    provider: "tiktok",
    socialAccountId: "acc-1",
  })
  mocks.adapter.verify.mockResolvedValue({ grantedScopes: null })
  mocks.rejectAccessToken.mockResolvedValue("needsReauth")
})

describe("verify", () => {
  test("a working token is recorded as verified", async () => {
    await socialAccountOperations.verify(ref)

    expect(mocks.recordVerified).toHaveBeenCalledWith({
      ...ref,
      fence: { readAccessToken: readCiphertext },
      grantedScopes: null,
    })
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("a working token clears needsReauth", async () => {
    mocks.getCredentials.mockResolvedValue(
      credentials({ status: "needsReauth" }),
    )

    await socialAccountOperations.verify(ref)

    expect(mocks.markConnected).toHaveBeenCalledWith({
      ...ref,
      fence: { readAccessToken: readCiphertext },
    })
  })

  test("a withheld publishing permission moves the account to needsReauth", async () => {
    mocks.adapter.verify.mockResolvedValue({
      grantedScopes: ["pages_show_list"],
    })

    await socialAccountOperations.verify(ref)

    expect(mocks.markNeedsReauth).toHaveBeenCalledWith({
      ...ref,
      fence: { readAccessToken: readCiphertext },
      reason: "permissionNotGranted",
    })
    expect(mocks.markConnected).not.toHaveBeenCalled()
  })

  test("a token the platform rejects moves the account to needsReauth and answers 409", async () => {
    mocks.adapter.verify.mockRejectedValue(new Error("invalid token"))
    mocks.adapter.requiresReconnect.mockReturnValue(true)

    await expect(socialAccountOperations.verify(ref)).rejects.toMatchObject({
      code: "socialAccountNeedsReauth",
      httpStatusCode: 409,
    })
    expect(mocks.rejectAccessToken).toHaveBeenCalledWith({
      ...ref,
      fence: { readAccessToken: readCiphertext },
    })
  })

  test("an access token that only expired is left to the refresh scan: no reconnect, answers 502", async () => {
    mocks.adapter.verify.mockRejectedValue(new Error("expired"))
    mocks.adapter.requiresReconnect.mockReturnValue(true)
    mocks.rejectAccessToken.mockResolvedValue("refreshPending")

    await expect(socialAccountOperations.verify(ref)).rejects.toMatchObject({
      code: "providerUnavailable",
      httpStatusCode: 502,
    })
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("a platform outage leaves the status untouched and answers 502", async () => {
    mocks.adapter.verify.mockRejectedValue(new Error("timeout"))

    await expect(socialAccountOperations.verify(ref)).rejects.toMatchObject({
      code: "providerUnavailable",
      httpStatusCode: 502,
    })
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("a disconnected account cannot be verified", async () => {
    mocks.getCredentials.mockResolvedValue(null)

    await expect(socialAccountOperations.verify(ref)).rejects.toMatchObject({
      code: "socialAccountDisconnected",
      httpStatusCode: 409,
    })
    expect(mocks.adapter.verify).not.toHaveBeenCalled()
  })

  test("another workspace's account is not found, never 'disconnected'", async () => {
    mocks.getCredentials.mockResolvedValue(null)
    mocks.get.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "notFound" }),
    )

    await expect(socialAccountOperations.verify(ref)).rejects.toMatchObject({
      code: "notFound",
    })
  })

  test("a TikTok account verifies through its own adapter", async () => {
    await socialAccountOperations.verify(ref)

    expect(mocks.adapter.verify).toHaveBeenCalled()
  })
})

describe("publishingSettings", () => {
  const input = { destinationId: "dest-1", workspaceId: "ws-1" }
  const tiktokCredentials = (overrides: Record<string, unknown> = {}) =>
    credentials({
      destinations: [
        {
          accessToken: null,
          externalId: "open-1",
          id: "dest-1",
          isActive: true,
          kind: "profile",
        },
      ],
      provider: "tiktok",
      ...overrides,
    })

  test("returns the creator's live settings", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      data: {
        avatarUrl: null,
        commentDisabled: false,
        duetDisabled: true,
        maxVideoPostDurationSec: 300,
        nickname: "Nick",
        privacyLevelOptions: ["SELF_ONLY"],
        stitchDisabled: false,
        username: "nick",
      },
      ok: true,
    })

    expect(
      await socialAccountOperations.publishingSettings(input),
    ).toMatchObject({
      canPostNow: true,
      creatorNickname: "Nick",
      duetDisabled: true,
      privacyLevelOptions: ["SELF_ONLY"],
    })
  })

  test("a second read of the same destination uses the cache", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      data: {
        avatarUrl: null,
        commentDisabled: false,
        duetDisabled: false,
        maxVideoPostDurationSec: 300,
        nickname: "Nick",
        privacyLevelOptions: ["SELF_ONLY"],
        stitchDisabled: false,
        username: "nick",
      },
      ok: true,
    })

    const first = await socialAccountOperations.publishingSettings(input)
    const second = await socialAccountOperations.publishingSettings(input)

    expect(second).toEqual(first)
    expect(mocks.queryCreatorInfo).toHaveBeenCalledTimes(1)
    expect([...mocks.cache.keys()].join()).not.toContain("token")
  })

  test("a creator who cannot post now says why", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      failure: {
        category: "quotaExceeded",
        code: "spam_risk_too_many_posts",
        message: "m",
      },
      ok: false,
    })

    expect(
      await socialAccountOperations.publishingSettings(input),
    ).toMatchObject({
      canPostNow: false,
      cannotPostReason: "spam_risk_too_many_posts",
      privacyLevelOptions: [],
    })
  })

  test.each([
    ["networkError", "network_error"],
    ["unknown", "internal_error"],
  ])("a %s outage is unavailable and is not cached", async (category, code) => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      failure: { category, code, message: "m" },
      ok: false,
    })

    await expect(
      socialAccountOperations.publishingSettings(input),
    ).rejects.toMatchObject({ code: "providerUnavailable" })
    expect(mocks.cache.size).toBe(0)
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("a throttled token is unavailable and the throttle is remembered briefly", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      failure: {
        category: "rateLimited",
        code: "rate_limit_exceeded",
        message: "m",
      },
      ok: false,
    })

    await expect(
      socialAccountOperations.publishingSettings(input),
    ).rejects.toMatchObject({ code: "providerUnavailable" })
    await expect(
      socialAccountOperations.publishingSettings(input),
    ).rejects.toMatchObject({ code: "providerUnavailable" })

    expect(mocks.queryCreatorInfo).toHaveBeenCalledTimes(1)
    expect(mocks.ttls).toEqual([30])
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("a rejected token moves the account to needsReauth", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      failure: {
        category: "authFailed",
        code: "access_token_invalid",
        message: "m",
      },
      ok: false,
    })
    mocks.adapter.requiresReconnect.mockReturnValue(true)

    await expect(
      socialAccountOperations.publishingSettings(input),
    ).rejects.toMatchObject({
      code: "socialAccountNeedsReauth",
    })
    expect(mocks.rejectAccessToken).toHaveBeenCalled()
  })

  test("an expired access token with a refresh token does not ask for a reconnect", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      failure: {
        category: "authFailed",
        code: "access_token_invalid",
        message: "m",
      },
      ok: false,
    })
    mocks.rejectAccessToken.mockResolvedValue("refreshPending")

    await expect(
      socialAccountOperations.publishingSettings(input),
    ).rejects.toMatchObject({ code: "providerUnavailable" })
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("another network has no publishing settings", async () => {
    mocks.getPublishDestination.mockResolvedValue({
      id: "dest-1",
      provider: "facebook",
      socialAccountId: null,
    })

    await expect(
      socialAccountOperations.publishingSettings(input),
    ).rejects.toMatchObject({
      code: "publishingSettingsNotSupported",
    })
    expect(mocks.getCredentials).not.toHaveBeenCalled()
  })

  test("the cache is keyed by account and workspace, so a disconnect can drop it", async () => {
    mocks.getCredentials.mockResolvedValue(tiktokCredentials())
    mocks.queryCreatorInfo.mockResolvedValue({
      data: {
        avatarUrl: null,
        commentDisabled: false,
        duetDisabled: false,
        maxVideoPostDurationSec: 300,
        nickname: "Nick",
        privacyLevelOptions: ["SELF_ONLY"],
        stitchDisabled: false,
        username: "nick",
      },
      ok: true,
    })

    await socialAccountOperations.publishingSettings(input)

    expect([...mocks.cache.keys()]).toEqual([
      "social-account:publishing-settings:ws-1:acc-1",
    ])
  })
})

describe("disconnect", () => {
  test("revokes the TikTok token first, but a failed revoke never blocks the disconnect", async () => {
    mocks.adapter.revoke = mocks.revoke
    mocks.resolveForOwner.mockResolvedValue({
      config: { clientId: "ck", clientSecret: "cs" },
    })
    mocks.revoke.mockRejectedValue(new Error("down"))

    await socialAccountOperations.disconnect(ref)

    expect(mocks.revoke).toHaveBeenCalled()
    expect(mocks.disconnect).toHaveBeenCalledWith(ref)
  })

  test("credentials that cannot be read are wiped by the disconnect all the same", async () => {
    mocks.adapter.revoke = mocks.revoke
    mocks.getCredentials.mockRejectedValue(new Error("key unavailable"))

    await socialAccountOperations.disconnect(ref)

    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.disconnect).toHaveBeenCalledWith(ref)
  })

  test("a network without a revoke call just disconnects", async () => {
    await socialAccountOperations.disconnect(ref)

    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.disconnect).toHaveBeenCalledWith(ref)
  })
})

describe("syncDestinations", () => {
  test("replaces the destinations with the platform's own list", async () => {
    const destinations = [{ externalId: "p1" }]
    mocks.listDestinations.mockResolvedValue(destinations)

    await socialAccountOperations.syncDestinations(ref)

    expect(mocks.replaceDestinations).toHaveBeenCalledWith({
      ...ref,
      destinations,
      fence: { readAccessToken: readCiphertext },
    })
  })

  test("a network whose login owns one profile has nothing to re-list", async () => {
    mocks.adapter.listDestinations = undefined

    await socialAccountOperations.syncDestinations(ref)

    expect(mocks.replaceDestinations).not.toHaveBeenCalled()
    expect(mocks.get).toHaveBeenCalledWith(ref)
  })

  test("a rejected user token marks the account for reconnecting", async () => {
    mocks.listDestinations.mockRejectedValue(new Error("expired"))
    mocks.adapter.requiresReconnect.mockReturnValue(true)

    await expect(
      socialAccountOperations.syncDestinations(ref),
    ).rejects.toMatchObject({
      code: "socialAccountNeedsReauth",
    })
    expect(mocks.replaceDestinations).not.toHaveBeenCalled()
  })
})
