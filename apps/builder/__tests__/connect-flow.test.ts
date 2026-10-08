// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `facebookAds` has no interactive OAuth connect flow of its own — it piggy-
// backs on Messenger's existing OAuth grant and only ever completes through
// the legacy `callback.ts` "messenger" case (see that file's "Facebook Ads
// OAuth is routed through this same Messenger callback" comment). Before
// this fix, `startConnect` had no explicit guard for it: `isCredentialStrategy`
// only excludes `token`/`api_key`/`self_serve`, so a `facebookAds` request
// fell through to the generic OAuth branch and minted a `ConnectSession`
// nothing would ever complete.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectFromCredentials: vi.fn(),
  connectSelfServeChannel: vi.fn(),
  reconnect: vi.fn(),
  resolveChannelPolicy: vi.fn(async () => null),
  resolveOAuthCredential: vi.fn(),
  sanitizeOptionalReturnUrl: vi.fn(async (url?: string) => url),
  startSession: vi.fn(),
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: {
    connectFromCredentials: mocks.connectFromCredentials,
    connectSelfServeChannel: mocks.connectSelfServeChannel,
    startSession: mocks.startSession,
    reconnect: mocks.reconnect,
  },
  isCredentialStrategy: (strategy: string) =>
    strategy === "token" || strategy === "api_key" || strategy === "self_serve",
  toChannelType: (provider: string) => provider,
  CONNECTION_REGISTRY: {
    facebookAds: {
      credentialType: "facebookAds",
      provider: { strategy: "oauth_redirect", kind: "integration" },
    },
    messenger: {
      credentialType: "messenger",
      provider: { strategy: "oauth_redirect", kind: "channel" },
    },
    webchat: {
      provider: { strategy: "self_serve", kind: "channel" },
      connect: vi.fn(),
    },
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
  channelHiddenException: (channel: string) =>
    new MockChatbotXException(`${channel} hidden`, "channelHidden"),
  connectionNotConfiguredException: (provider: string) =>
    new MockChatbotXException(
      `${provider} not configured`,
      "connectionNotConfigured",
    ),
  connectionNotOAuthException: (provider: string) =>
    new MockChatbotXException(
      `Connection provider "${provider}" does not support an OAuth connect flow.`,
      "connectionNotOAuth",
    ),
}))

vi.mock("@/lib/oauth-referer", () => ({
  sanitizeOptionalReturnUrl: mocks.sanitizeOptionalReturnUrl,
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: mocks.resolveChannelPolicy,
}))

vi.mock("@/features/connections/lib/resolve-connect-credential", () => ({
  resolveOAuthCredential: mocks.resolveOAuthCredential,
}))

// Dynamic `import()` is required here, not a static import: the mocks
// above must be registered before `connect-flow.ts` (and its
// `@chatbotx.io/connections`/`@/lib/oauth-referer` dependencies) are
// evaluated, which only a post-`vi.mock` dynamic import guarantees.
const { startConnect } = await import("@/features/connections/lib/connect-flow")

describe("startConnect — facebookAds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveChannelPolicy.mockResolvedValue(null)
  })

  test("rejects facebookAds with connectionNotOAuth instead of minting a session nothing ever completes", async () => {
    await expect(
      startConnect({
        workspaceId: "ws-1",
        provider: "facebookAds",
        config: undefined,
        redirectUrl: undefined,
        ownerId: "owner-1",
        actor: { actorUserId: "user-1" },
      }),
    ).rejects.toMatchObject({ code: "connectionNotOAuth" })

    expect(mocks.resolveOAuthCredential).not.toHaveBeenCalled()
    expect(mocks.startSession).not.toHaveBeenCalled()
  })

  test("still starts an OAuth session for messenger (regression guard)", async () => {
    mocks.resolveOAuthCredential.mockResolvedValue({
      credential: {},
      callbackUrl: "https://app.test/callback",
    })
    mocks.startSession.mockResolvedValue({ session: { id: "session-1" } })

    const result = await startConnect({
      workspaceId: "ws-1",
      provider: "messenger",
      config: undefined,
      redirectUrl: undefined,
      ownerId: "owner-1",
      actor: { actorUserId: "user-1" },
    })

    expect(result).toEqual({
      connection: null,
      session: { id: "session-1" },
      secret: null,
    })
    expect(mocks.startSession).toHaveBeenCalled()
  })
})

describe("startConnect — self serve", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveChannelPolicy.mockResolvedValue(null)
  })

  test("resolves the workspace owner inside the self-serve service", async () => {
    const connection = { id: "connection-1" }
    mocks.connectSelfServeChannel.mockResolvedValue({
      connection,
      secret: null,
    })

    await expect(
      startConnect({
        workspaceId: "ws-1",
        provider: "webchat",
        config: { name: "Support" },
        redirectUrl: undefined,
        ownerId: "platform-credential-owner",
        actor: { actorUserId: "user-1" },
      }),
    ).resolves.toEqual({ connection, session: null, secret: null })

    expect(mocks.connectSelfServeChannel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "webchat",
      config: { name: "Support" },
      actor: { actorUserId: "user-1" },
    })
  })
})
