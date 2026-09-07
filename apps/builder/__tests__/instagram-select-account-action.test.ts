// @vitest-environment node

import {
  ChatbotXException,
  channelDuplicatedException,
  credentialMissingException,
  notWorkspaceMemberException,
} from "@chatbotx.io/business/errors"
import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `connectInstagramAccount` (Instagram direct login, plan §3.3) never trusts the
// wire payload for anything but the `igId` cross-check — the account is
// re-resolved server-side from `getInstagramAccount(cookie.userToken)` on
// every request. Session-level steps 1-4 are delegated to
// `resolveConnectSession` (mocked here as one function, exactly like the
// Messenger/Instagram-via-Facebook action tests). `findConnectedIgIds` is
// checked BEFORE the webhook subscribe, unlike the pre-phase-4 code.
// ---------------------------------------------------------------------------

const {
  buildContextMock,
  connectAccountMock,
  findConnectedIgIdsMock,
  getInstagramAccountMock,
  loggerWarnMock,
  loggerErrorMock,
  persistIntegrationUserInfoMock,
  resolveConnectSessionMock,
  runChannelHandlerMock,
  subscribePageToInstagramWebhookMock,
  updateUserInfoMock,
  updateWorkspaceLogoMock,
} = vi.hoisted(() => ({
  buildContextMock: vi.fn(),
  connectAccountMock: vi.fn(),
  findConnectedIgIdsMock: vi.fn(),
  getInstagramAccountMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  persistIntegrationUserInfoMock: vi.fn(),
  resolveConnectSessionMock: vi.fn(),
  runChannelHandlerMock: vi.fn(),
  subscribePageToInstagramWebhookMock: vi.fn(),
  updateUserInfoMock: vi.fn(),
  updateWorkspaceLogoMock: vi.fn(),
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  FB_INSTAGRAM_PENDING_AUTH_COOKIE: "fb_instagram_pending_auth",
}))

vi.mock("@/features/channel-connect/lib/resolve-connect-session", () => ({
  resolveConnectSession: resolveConnectSessionMock,
}))

vi.mock("@/features/integration-webchat/lib", () => ({
  BRANDING_TITLE: "ChatbotX",
  getBrandingUrl: () => "https://app.test/branding",
}))

vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo: updateWorkspaceLogoMock,
}))

vi.mock("@/lib/integration-user-info", () => ({
  persistIntegrationUserInfo: persistIntegrationUserInfoMock,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarnMock, error: loggerErrorMock, info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: buildContextMock,
  instagramIntegrationService: {
    findConnectedIgIds: findConnectedIgIdsMock,
    connectAccount: connectAccountMock,
    updateUserInfo: updateUserInfoMock,
  },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getInstagramAccount: getInstagramAccountMock,
  integration: { runChannelHandler: runChannelHandlerMock },
  subscribePageToInstagramWebhook: subscribePageToInstagramWebhookMock,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
  SdkException: class SdkException extends Error {},
}))

const { connectInstagramAccount } = await import(
  "../src/features/integration-instagram/actions/connect-account"
)

const call = connectInstagramAccount

const resolvedAccount = {
  id: "page-scoped-1",
  name: "IG Direct Account",
  username: "ig_direct",
  userId: "ig1",
  profile_picture_url: "https://example.com/avatar.jpg",
  accessToken: "account-token-1",
}

const resolvedSession = {
  pendingAuth: {
    userToken: "user-token-1",
    workspaceId: "ws-1",
    referer: "/channels/create",
    version: "v23.0",
    expiresAt: Date.now() + 600_000,
  },
  workspace: { id: "ws-1", ownerId: "owner-1" },
  platformOwnerId: "owner-1",
  credential: {
    config: {
      clientId: "client-1",
      clientSecret: "secret-1",
      version: "v23.0",
    },
  },
  appUrl: "https://app.test",
  brandingMenuEntry: {
    label: "ChatbotX",
    type: "url" as const,
    url: "https://app.test/branding",
  },
}

describe("connectInstagramAccount (Instagram direct login)", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    resolveConnectSessionMock.mockResolvedValue(resolvedSession)
    getInstagramAccountMock.mockResolvedValue(resolvedAccount)
    findConnectedIgIdsMock.mockResolvedValue(new Set<string>())
    subscribePageToInstagramWebhookMock.mockResolvedValue(undefined)
    connectAccountMock.mockResolvedValue({
      workspaceId: "ws-1",
      integrationId: "integration-1",
      wasCreated: true,
      integration: { id: "integration-1", workspaceId: "ws-1" },
    })
    runChannelHandlerMock.mockResolvedValue(undefined)
    updateWorkspaceLogoMock.mockResolvedValue(undefined)
    persistIntegrationUserInfoMock.mockResolvedValue(undefined)
    buildContextMock.mockResolvedValue({})
  })

  test("returns sessionExpired and touches nothing else when the pending-auth cookie is missing/invalid", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      new ChatbotXException(
        "Your connect session expired. Please start again.",
        "connectSessionExpired",
      ),
    )

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(getInstagramAccountMock).not.toHaveBeenCalled()
  })

  test("returns notMember before any provider call when the resolver rejects membership (owner gate)", async () => {
    resolveConnectSessionMock.mockRejectedValue(notWorkspaceMemberException())

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
    expect(getInstagramAccountMock).not.toHaveBeenCalled()
  })

  test("returns trialExpired when the workspace owner is blocked", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      new ChatbotXException("Trial expired", "trialExpired", 403),
    )

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "trialExpired" })
    expect(getInstagramAccountMock).not.toHaveBeenCalled()
  })

  test("returns credentialMissing when the workspace has no Instagram app credential", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      credentialMissingException(
        "App credentials are not configured for this workspace.",
      ),
    )

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "credentialMissing" })
    expect(getInstagramAccountMock).not.toHaveBeenCalled()
  })

  test("an igId that doesn't match the re-resolved account resolves to notSelectable without persisting", async () => {
    getInstagramAccountMock.mockResolvedValue({
      ...resolvedAccount,
      userId: "some-other-ig-id",
    })

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "ig1",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
    expect(subscribePageToInstagramWebhookMock).not.toHaveBeenCalled()
    expect(connectAccountMock).not.toHaveBeenCalled()
  })

  test("a null re-resolved account (unsupported account type) resolves to notSelectable", async () => {
    getInstagramAccountMock.mockResolvedValue(null)

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "ig1",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
    expect(connectAccountMock).not.toHaveBeenCalled()
  })

  test("an already-connected account resolves to duplicated with NO subscribe call", async () => {
    findConnectedIgIdsMock.mockResolvedValue(new Set(["ig1"]))

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Direct Account",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
    expect(subscribePageToInstagramWebhookMock).not.toHaveBeenCalled()
    expect(connectAccountMock).not.toHaveBeenCalled()
  })

  test("happy path: getInstagramAccount -> findConnectedIgIds -> subscribe -> persist -> follow-ups, in order", async () => {
    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Direct Account",
        status: "connected",
        warning: undefined,
        integrationId: "integration-1",
        coexistEligible: true,
      },
    })

    expect(getInstagramAccountMock).toHaveBeenCalledTimes(1)
    expect(subscribePageToInstagramWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        igId: "page-scoped-1",
        accessToken: "account-token-1",
      }),
    )
    expect(connectAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        ownerId: "owner-1",
        workspaceId: "ws-1",
        type: "instagram",
        account: {
          igId: "ig1",
          igName: "IG Direct Account",
          igUsername: "ig_direct",
          pageId: "page-scoped-1",
        },
      }),
    )

    const order = [
      getInstagramAccountMock,
      findConnectedIgIdsMock,
      subscribePageToInstagramWebhookMock,
      connectAccountMock,
      runChannelHandlerMock,
      updateWorkspaceLogoMock,
      persistIntegrationUserInfoMock,
    ].map((mock) => mock.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  test("a subscribe-webhook failure resolves to providerRejected and never persists", async () => {
    subscribePageToInstagramWebhookMock.mockRejectedValue(
      new SdkException("Meta rejected the subscription"),
    )

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Direct Account",
        status: "failed",
        reason: "providerRejected",
        coexistEligible: false,
      },
    })
    expect(connectAccountMock).not.toHaveBeenCalled()
  })

  test("a follow-up failure still returns a connected outcome, carrying a followUpFailed warning", async () => {
    runChannelHandlerMock.mockRejectedValue(new Error("branding failed"))

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Direct Account",
        status: "connected",
        warning: "followUpFailed",
        integrationId: "integration-1",
        coexistEligible: true,
      },
    })
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  test("a unique-violation race during persist resolves to duplicated", async () => {
    connectAccountMock.mockRejectedValue(channelDuplicatedException())

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Direct Account",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
  })
})
