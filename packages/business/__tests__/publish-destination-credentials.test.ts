import { createHash } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  announce: vi.fn(),
  findCredentialSource: vi.fn(),
  getCredentials: vi.fn(),
  markInboxTokenRejected: vi.fn(),
  markNeedsReauth: vi.fn(),
  recordPermissionMissing: vi.fn(),
  rejectAccessToken: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  publishCredentialRepository: {
    findCredentialSource: mocks.findCredentialSource,
    markInboxTokenRejected: mocks.markInboxTokenRejected,
  },
  publishDestinationRepository: {
    recordPermissionMissing: mocks.recordPermissionMissing,
  },
}))
vi.mock("../src/social-account/service", () => ({
  socialAccountService: {
    getCredentials: mocks.getCredentials,
    markNeedsReauth: mocks.markNeedsReauth,
    rejectAccessToken: mocks.rejectAccessToken,
  },
}))
vi.mock("../src/publish-destination/notify-attention", () => ({
  announcePublishConnectionAttention: mocks.announce,
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}))

const {
  continuationViaMismatch,
  loadPublishCredentials,
  recordPublishAuthFailure,
} = await import("../src/publish-destination/credentials")

const WS = "ws-1"
const TOKEN = "EAAB-secret-token"
const fingerprint = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex")

const inboxSource = (overrides: Record<string, unknown> = {}) => ({
  auth: { tokens: { accessToken: TOKEN } },
  externalId: "page-1",
  grantedScopes: null,
  inboxId: "i-1",
  inboxStatus: "connected",
  integrationId: "g-1",
  integrationTable: "IntegrationMessenger",
  kind: "inbox",
  provider: "facebook",
  publishDestinationId: "pd-1",
  publishStatus: "ok",
  publisherKey: "facebook",
  tokenRefreshError: null,
  workspaceId: WS,
  ...overrides,
})

const tiktokSource = (overrides: Record<string, unknown> = {}) => ({
  accountStatus: "connected",
  destinationActive: true,
  externalId: "tt-open-1",
  kind: "socialAccount",
  provider: "tiktok",
  publishDestinationId: "pd-9",
  publisherKey: "tiktok",
  socialAccountDestinationId: "sad-1",
  socialAccountId: "acc-1",
  workspaceId: WS,
  ...overrides,
})

const load = async () =>
  await loadPublishCredentials({
    publishDestinationId: "pd-1",
    workspaceId: WS,
  })

const blockerCode = (result: Awaited<ReturnType<typeof load>>) =>
  result.ok ? null : result.blocker.code

beforeEach(() => {
  vi.resetAllMocks()
})

describe("loadPublishCredentials per network and flavour", () => {
  test("Facebook Page: the Page token, the page id, the facebook publisher", async () => {
    mocks.findCredentialSource.mockResolvedValue(inboxSource())

    const result = await load()

    expect(result).toEqual({
      credentials: {
        accessToken: TOKEN,
        destinationExternalId: "page-1",
        fence: {
          grantedScopes: null,
          integrationId: "g-1",
          integrationTable: "IntegrationMessenger",
          kind: "inbox",
          provider: "facebook",
          publishDestinationId: "pd-1",
          tokenFingerprint: fingerprint(TOKEN),
        },
        publisherKey: "facebook",
      },
      ok: true,
    })
    expect(mocks.findCredentialSource).toHaveBeenCalledWith({
      publishDestinationId: "pd-1",
      workspaceId: WS,
    })
  })

  test("Instagram Login with the publish scopes: graph.instagram.com publisher", async () => {
    mocks.findCredentialSource.mockResolvedValue(
      inboxSource({
        externalId: "ig-1",
        grantedScopes: [
          "instagram_business_basic",
          "instagram_business_content_publish",
        ],
        integrationTable: "IntegrationInstagram",
        provider: "instagram",
        publisherKey: "instagram",
      }),
    )

    const result = await load()

    expect(result.ok && result.credentials.publisherKey).toBe("instagram")
    expect(result.ok && result.credentials.destinationExternalId).toBe("ig-1")
  })

  test("Instagram through a Facebook Page: the same column, the instagramFacebook publisher", async () => {
    mocks.findCredentialSource.mockResolvedValue(
      inboxSource({
        externalId: "ig-2",
        grantedScopes: [
          "instagram_basic",
          "instagram_content_publish",
          "pages_read_engagement",
          "pages_show_list",
        ],
        integrationTable: "IntegrationInstagram",
        provider: "instagram",
        publisherKey: "instagramFacebook",
      }),
    )

    const result = await load()

    expect(result.ok && result.credentials.publisherKey).toBe(
      "instagramFacebook",
    )
    expect(result.ok && result.credentials.accessToken).toBe(TOKEN)
  })

  test("Threads publishes with unknown scopes until a network error says otherwise", async () => {
    mocks.findCredentialSource.mockResolvedValue(
      inboxSource({
        externalId: "th-1",
        integrationTable: "IntegrationThreads",
        provider: "threads",
        publisherKey: "threads",
      }),
    )

    const result = await load()

    expect(result.ok && result.credentials.publisherKey).toBe("threads")
  })

  test("TikTok: the destination's own token wins over the account's", async () => {
    mocks.findCredentialSource.mockResolvedValue(tiktokSource())
    mocks.getCredentials.mockResolvedValue({
      accessToken: "account-token",
      accessTokenCiphertext: { ciphertext: "c" },
      destinations: [{ accessToken: "dest-token", id: "sad-1" }],
      status: "connected",
    })

    const result = await load()

    expect(result).toEqual({
      credentials: {
        accessToken: "dest-token",
        destinationExternalId: "tt-open-1",
        fence: {
          ciphertext: { ciphertext: "c" },
          kind: "socialAccount",
          socialAccountId: "acc-1",
        },
        publisherKey: "tiktok",
      },
      ok: true,
    })
    expect(mocks.getCredentials).toHaveBeenCalledWith({
      id: "acc-1",
      workspaceId: WS,
    })
  })

  test("TikTok without a destination token falls back to the account token", async () => {
    mocks.findCredentialSource.mockResolvedValue(tiktokSource())
    mocks.getCredentials.mockResolvedValue({
      accessToken: "account-token",
      accessTokenCiphertext: {},
      destinations: [{ accessToken: null, id: "sad-1" }],
      status: "connected",
    })

    const result = await load()

    expect(result.ok && result.credentials.accessToken).toBe("account-token")
  })
})

describe("loadPublishCredentials blockers", () => {
  test.each([
    ["inboxDisconnected", { inboxStatus: "disconnected" }],
    ["inboxNeedsReconnect", { tokenRefreshError: "tokenExpired" }],
    ["inboxNeedsReconnect", { tokenRefreshError: "publishTokenRejected" }],
    ["publishPermissionMissing", { publishStatus: "permissionMissing" }],
    [
      "publishPermissionMissing",
      { grantedScopes: ["pages_show_list"], publisherKey: "facebook" },
    ],
    [
      "publishPermissionMissing",
      {
        grantedScopes: null,
        provider: "instagram",
        publisherKey: "instagram",
      },
    ],
  ])("%s for %j", async (code, overrides) => {
    mocks.findCredentialSource.mockResolvedValue(inboxSource(overrides))

    const result = await load()

    expect(result.ok).toBe(false)
    expect(blockerCode(result)).toBe(code)
    // A blocker proves nothing was sent, and is an auth failure for the settle path.
    expect(result.ok ? null : result.blocker).toMatchObject({
      category: "authFailed",
      provablyNotCreated: true,
      status: "failed",
    })
  })

  test("a disconnected inbox wins over a stored token error", async () => {
    mocks.findCredentialSource.mockResolvedValue(
      inboxSource({
        inboxStatus: "disconnected",
        tokenRefreshError: "tokenExpired",
      }),
    )
    expect(blockerCode(await load())).toBe("inboxDisconnected")
  })

  test("an auth blob without a token needs a reconnect, and never leaks it", async () => {
    mocks.findCredentialSource.mockResolvedValue(
      inboxSource({ auth: { tokens: {}, secret: TOKEN } }),
    )

    const result = await load()

    expect(blockerCode(result)).toBe("inboxNeedsReconnect")
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  test("a destination of another workspace (no source row) is not found", async () => {
    mocks.findCredentialSource.mockResolvedValue(null)
    expect(blockerCode(await load())).toBe("inboxDisconnected")
    expect(await load()).toMatchObject({
      blocker: { category: "notFound" },
      ok: false,
    })
  })

  test.each([
    ["needsReauth", "accountNeedsReauth"],
    ["disconnected", "accountDisconnected"],
  ])("TikTok account %s -> %s (codes unchanged)", async (status, code) => {
    mocks.findCredentialSource.mockResolvedValue(
      tiktokSource({ accountStatus: status }),
    )
    expect(blockerCode(await load())).toBe(code)
    expect(mocks.getCredentials).not.toHaveBeenCalled()
  })

  test("TikTok destination the platform no longer lists", async () => {
    mocks.findCredentialSource.mockResolvedValue(
      tiktokSource({ destinationActive: false }),
    )
    expect(blockerCode(await load())).toBe("destinationInactive")
  })

  test("TikTok account without a stored token", async () => {
    mocks.findCredentialSource.mockResolvedValue(tiktokSource())
    mocks.getCredentials.mockResolvedValue(null)
    expect(blockerCode(await load())).toBe("accountNotConnected")
  })
})

describe("recordPublishAuthFailure", () => {
  const inboxCredentials = {
    fence: {
      grantedScopes: null,
      integrationId: "g-1",
      integrationTable: "IntegrationMessenger" as const,
      kind: "inbox" as const,
      provider: "facebook" as const,
      publishDestinationId: "pd-1",
      tokenFingerprint: fingerprint(TOKEN),
    },
    publisherKey: "facebook" as const,
  }

  test("authFailed marks the integration with the token fingerprint the call used", async () => {
    mocks.markInboxTokenRejected.mockResolvedValue(true)

    const written = await recordPublishAuthFailure({
      category: "authFailed",
      credentials: inboxCredentials,
      workspaceId: WS,
    })

    expect(written).toBe(true)
    expect(mocks.markInboxTokenRejected).toHaveBeenCalledWith({
      integrationId: "g-1",
      provider: "facebook",
      tokenFingerprint: fingerprint(TOKEN),
      workspaceId: WS,
    })
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
    expect(mocks.recordPermissionMissing).not.toHaveBeenCalled()
  })

  test("a rejected token announces the transition once, keyed by its fingerprint", async () => {
    mocks.markInboxTokenRejected.mockResolvedValue(true)

    await recordPublishAuthFailure({
      category: "authFailed",
      credentials: inboxCredentials,
      workspaceId: WS,
    })

    expect(mocks.announce).toHaveBeenCalledWith({
      alert: "needsReconnect",
      publishDestinationId: "pd-1",
      transitionKey: fingerprint(TOKEN),
      workspaceId: WS,
    })
  })

  test("a missing permission announces it; a write that changed nothing announces nothing", async () => {
    mocks.recordPermissionMissing.mockResolvedValue(true)
    await recordPublishAuthFailure({
      category: "permissionDenied",
      credentials: inboxCredentials,
      workspaceId: WS,
    })
    expect(mocks.announce).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: "permissionMissing",
        publishDestinationId: "pd-1",
      }),
    )

    mocks.announce.mockClear()
    mocks.recordPermissionMissing.mockResolvedValue(false)
    mocks.markInboxTokenRejected.mockResolvedValue(false)
    await recordPublishAuthFailure({
      category: "permissionDenied",
      credentials: inboxCredentials,
      workspaceId: WS,
    })
    await recordPublishAuthFailure({
      category: "authFailed",
      credentials: inboxCredentials,
      workspaceId: WS,
    })
    expect(mocks.announce).not.toHaveBeenCalled()
  })

  test("a fingerprint mismatch (the token was replaced) writes nothing and does not log a rejection", async () => {
    mocks.markInboxTokenRejected.mockResolvedValue(false)

    const written = await recordPublishAuthFailure({
      category: "authFailed",
      credentials: inboxCredentials,
      workspaceId: WS,
    })

    expect(written).toBe(false)
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("the fingerprint is the sha256 hex of the token and the logs never carry the token", async () => {
    mocks.markInboxTokenRejected.mockResolvedValue(true)
    mocks.findCredentialSource.mockResolvedValue(inboxSource())
    const loaded = await load()
    if (!loaded.ok) {
      throw new Error("expected credentials")
    }

    await recordPublishAuthFailure({
      category: "authFailed",
      credentials: loaded.credentials,
      workspaceId: WS,
    })

    expect(
      mocks.markInboxTokenRejected.mock.calls[0]?.[0].tokenFingerprint,
    ).toBe(fingerprint(TOKEN))
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(TOKEN)
  })

  test("permissionDenied records the missing scopes of a known grant, with the fence", async () => {
    mocks.recordPermissionMissing.mockResolvedValue(true)

    await recordPublishAuthFailure({
      category: "permissionDenied",
      credentials: {
        ...inboxCredentials,
        fence: {
          ...inboxCredentials.fence,
          grantedScopes: ["pages_show_list", "pages_read_engagement"],
        },
      },
      now: new Date("2026-01-01T00:00:00Z"),
      workspaceId: WS,
    })

    expect(mocks.recordPermissionMissing).toHaveBeenCalledWith({
      id: "pd-1",
      missingScopes: ["pages_manage_posts"],
      now: new Date("2026-01-01T00:00:00Z"),
      provider: "facebook",
      tokenFingerprint: fingerprint(TOKEN),
      workspaceId: WS,
    })
    expect(mocks.markInboxTokenRejected).not.toHaveBeenCalled()
  })

  test("permissionDenied with unknown scopes records everything publishing needs", async () => {
    mocks.recordPermissionMissing.mockResolvedValue(true)

    await recordPublishAuthFailure({
      category: "permissionDenied",
      credentials: inboxCredentials,
      workspaceId: WS,
    })

    expect(
      mocks.recordPermissionMissing.mock.calls[0]?.[0].missingScopes,
    ).toEqual([
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ])
  })

  const tiktokCredentials = {
    fence: {
      ciphertext: { ciphertext: "c" } as never,
      kind: "socialAccount" as const,
      socialAccountId: "acc-1",
    },
    publisherKey: "tiktok" as const,
  }

  test("a rejected TikTok token goes through the account's rejection policy", async () => {
    mocks.rejectAccessToken.mockResolvedValue("needsReauth")

    const written = await recordPublishAuthFailure({
      category: "authFailed",
      credentials: tiktokCredentials,
      workspaceId: WS,
    })

    expect(written).toBe(true)
    expect(mocks.rejectAccessToken).toHaveBeenCalledWith({
      fence: { readAccessToken: { ciphertext: "c" } },
      id: "acc-1",
      workspaceId: WS,
    })
    expect(mocks.markInboxTokenRejected).not.toHaveBeenCalled()
  })

  test("a TikTok access token that only expired writes nothing (the refresh scan renews it)", async () => {
    mocks.rejectAccessToken.mockResolvedValue("refreshPending")

    const written = await recordPublishAuthFailure({
      category: "authFailed",
      credentials: tiktokCredentials,
      workspaceId: WS,
    })

    expect(written).toBe(false)
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled()
  })

  test("a TikTok permission denial still moves the account to needsReauth", async () => {
    mocks.markNeedsReauth.mockResolvedValue(true)

    await recordPublishAuthFailure({
      category: "permissionDenied",
      credentials: tiktokCredentials,
      workspaceId: WS,
    })

    expect(mocks.markNeedsReauth).toHaveBeenCalledWith({
      fence: { readAccessToken: { ciphertext: "c" } },
      id: "acc-1",
      reason: "permissionNotGranted",
      workspaceId: WS,
    })
    expect(mocks.rejectAccessToken).not.toHaveBeenCalled()
  })
})

describe("continuationViaMismatch", () => {
  test("a continuation from the other Instagram flavour mismatches", () => {
    expect(
      continuationViaMismatch(
        { containerId: "c", via: "instagram" },
        "instagramFacebook",
      ),
    ).toBe(true)
    expect(
      continuationViaMismatch(
        { containerId: "c", via: "instagramFacebook" },
        "instagram",
      ),
    ).toBe(true)
  })

  test("the same flavour, a legacy continuation without `via` and no continuation proceed", () => {
    expect(
      continuationViaMismatch(
        { containerId: "c", via: "instagram" },
        "instagram",
      ),
    ).toBe(false)
    expect(continuationViaMismatch({ containerId: "c" }, "instagram")).toBe(
      false,
    )
    expect(continuationViaMismatch(null, "threads")).toBe(false)
  })
})
