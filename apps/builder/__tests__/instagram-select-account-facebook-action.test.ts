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
// `connectInstagramAccountViaFacebook` follows the shared per-account connect
// skeleton (plan §2.4), mirroring Messenger's `selectPageAction`: plan §2.4
// steps 1-4 (pending-auth cookie -> workspace/membership -> owner gate ->
// credential + branding) are delegated to the shared `resolveConnectSession`
// helper (mocked here as one function so this file only asserts the
// ACTION's own behavior). `getUserInstagramAccounts` runs once per request
// (no cache — provider lists carry page access tokens, §4.9), and the
// webhook subscribe now runs BEFORE the persist call (plan §3.2 — it used to
// run after commit).
// ---------------------------------------------------------------------------

const {
  buildContextMock,
  connectAccountMock,
  findConnectedIgIdsMock,
  getUserInstagramAccountsMock,
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
  getUserInstagramAccountsMock: vi.fn(),
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
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE:
    "fb_instagram_facebook_pending_auth",
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

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  getUserInstagramAccounts: getUserInstagramAccountsMock,
  integration: { runChannelHandler: runChannelHandlerMock },
  subscribePageToInstagramWebhook: subscribePageToInstagramWebhookMock,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
  SdkException: class SdkException extends Error {},
}))

const { connectInstagramAccountViaFacebook } = await import(
  "../src/features/integration-instagram/actions/connect-account-facebook"
)

const call = connectInstagramAccountViaFacebook

const connectableAccount = {
  id: "ig1",
  name: "IG Account",
  username: "ig_account",
  profile_picture_url: "https://example.com/avatar.jpg",
  pageId: "page-1",
  pageAccessToken: "page-token-1",
}

const resolvedSession = {
  pendingAuth: {
    userToken: "user-token-1",
    userId: "fb-user-1",
    userName: "FB User",
    userAvatarUrl: "https://example.com/avatar.jpg",
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

describe("connectInstagramAccountViaFacebook", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    resolveConnectSessionMock.mockResolvedValue(resolvedSession)
    getUserInstagramAccountsMock.mockResolvedValue([connectableAccount])
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
    expect(getUserInstagramAccountsMock).not.toHaveBeenCalled()
  })

  test("returns notMember before any provider call when the resolver rejects membership", async () => {
    resolveConnectSessionMock.mockRejectedValue(notWorkspaceMemberException())

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
    expect(getUserInstagramAccountsMock).not.toHaveBeenCalled()
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
    expect(getUserInstagramAccountsMock).not.toHaveBeenCalled()
  })

  test("returns macLimitReached when the workspace owner is blocked on MAC", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      new ChatbotXException(
        "Monthly active contact limit reached",
        "macLimitReached",
        403,
      ),
    )

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "macLimitReached" })
  })

  test("returns credentialMissing when the workspace has no Instagram-via-Facebook app credential", async () => {
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
    expect(getUserInstagramAccountsMock).not.toHaveBeenCalled()
  })

  test("a forged/unknown account id resolves to notSelectable without any Meta call", async () => {
    const result = await call({
      userId: "user-1",
      igId: "forged-id",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "forged-id",
        name: "forged-id",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
    expect(subscribePageToInstagramWebhookMock).not.toHaveBeenCalled()
    expect(connectAccountMock).not.toHaveBeenCalled()
  })

  test("an already-connected account resolves to duplicated without any further Meta call", async () => {
    findConnectedIgIdsMock.mockResolvedValue(new Set(["ig1"]))

    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Account",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
    expect(subscribePageToInstagramWebhookMock).not.toHaveBeenCalled()
    expect(connectAccountMock).not.toHaveBeenCalled()
  })

  test("happy path: getUserInstagramAccounts -> subscribe -> persist -> follow-ups, one Graph list call per request", async () => {
    const result = await call({
      userId: "user-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Account",
        status: "connected",
        warning: undefined,
        integrationId: "integration-1",
        coexistEligible: true,
      },
    })

    expect(getUserInstagramAccountsMock).toHaveBeenCalledTimes(1)
    expect(subscribePageToInstagramWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        accessToken: "page-token-1",
      }),
    )
    expect(connectAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        ownerId: "owner-1",
        workspaceId: "ws-1",
        type: "facebook",
        account: {
          igId: "ig1",
          igName: "IG Account",
          igUsername: "ig_account",
          pageId: "page-1",
        },
      }),
    )

    const order = [
      getUserInstagramAccountsMock,
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
        name: "IG Account",
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
        name: "IG Account",
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
        name: "IG Account",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
  })
})
