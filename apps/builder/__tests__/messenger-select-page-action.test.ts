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
// `connectMessengerPage` follows the shared per-account connect skeleton (plan
// §2.4): plan §2.4 steps 1-4 (pending-auth cookie -> workspace/membership ->
// owner gate -> credential + branding) are delegated to the shared
// `resolveConnectSession` helper (see `resolve-connect-session.test.ts` for
// that helper's own branch coverage) — mocked here as one function so this
// file only asserts the ACTION's behavior: it never throws, and every
// session-level failure `resolveConnectSession` raises is correctly mapped
// through `toConnectSessionError` before any provider/persist call runs.
// `getUserPages` runs once per request (no cache — provider lists carry
// page access tokens, §4.9).
// ---------------------------------------------------------------------------

const {
  buildContextMock,
  connectPageMock,
  enqueueChannelScanMock,
  exchangeLongLivedTokenMock,
  findConnectedPageIdsMock,
  getUserPagesMock,
  loggerWarnMock,
  loggerErrorMock,
  persistIntegrationUserInfoMock,
  resolveConnectSessionMock,
  runChannelHandlerMock,
  subscribePageToAppWebhookMock,
  updateUserInfoMock,
  updateWorkspaceLogoMock,
} = vi.hoisted(() => ({
  buildContextMock: vi.fn(),
  connectPageMock: vi.fn(),
  enqueueChannelScanMock: vi.fn(),
  exchangeLongLivedTokenMock: vi.fn(),
  findConnectedPageIdsMock: vi.fn(),
  getUserPagesMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  persistIntegrationUserInfoMock: vi.fn(),
  resolveConnectSessionMock: vi.fn(),
  runChannelHandlerMock: vi.fn(),
  subscribePageToAppWebhookMock: vi.fn(),
  updateUserInfoMock: vi.fn(),
  updateWorkspaceLogoMock: vi.fn(),
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  FB_MESSENGER_PENDING_AUTH_COOKIE: "fb_messenger_pending_auth",
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
  messengerIntegrationService: {
    findConnectedPageIds: findConnectedPageIdsMock,
    connectPage: connectPageMock,
    updateUserInfo: updateUserInfoMock,
  },
  tagSyncService: { enqueueChannelScan: enqueueChannelScanMock },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  getUserPages: getUserPagesMock,
  integration: { runChannelHandler: runChannelHandlerMock },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  exchangeLongLivedToken: exchangeLongLivedTokenMock,
  subscribePageToAppWebhook: subscribePageToAppWebhookMock,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
  SdkException: class SdkException extends Error {},
}))

const { connectMessengerPage } = await import(
  "../src/features/integration-messenger/actions/connect-page"
)

const call = connectMessengerPage

const connectablePage = {
  id: "p1",
  name: "Page One",
  access_token: "page-token-1",
  isConnectable: true,
}

const notAdminPage = {
  id: "p1",
  name: "Page One",
  access_token: "page-token-1",
  isConnectable: false,
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

describe("connectMessengerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    resolveConnectSessionMock.mockResolvedValue(resolvedSession)
    getUserPagesMock.mockResolvedValue({
      pages: [connectablePage],
      bmLookupFailed: false,
    })
    findConnectedPageIdsMock.mockResolvedValue(new Set<string>())
    exchangeLongLivedTokenMock.mockResolvedValue("long-lived-token")
    subscribePageToAppWebhookMock.mockResolvedValue(undefined)
    connectPageMock.mockResolvedValue({
      workspaceId: "ws-1",
      integrationId: "integration-1",
      wasCreated: true,
      integration: { id: "integration-1", workspaceId: "ws-1" },
    })
    runChannelHandlerMock.mockResolvedValue(undefined)
    updateWorkspaceLogoMock.mockResolvedValue(undefined)
    persistIntegrationUserInfoMock.mockResolvedValue(undefined)
    enqueueChannelScanMock.mockResolvedValue(undefined)
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
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(getUserPagesMock).not.toHaveBeenCalled()
  })

  test("returns notMember before any provider call when the resolver rejects membership", async () => {
    resolveConnectSessionMock.mockRejectedValue(notWorkspaceMemberException())

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
    expect(getUserPagesMock).not.toHaveBeenCalled()
  })

  test("returns trialExpired when the workspace owner is blocked", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      new ChatbotXException("Trial expired", "trialExpired", 403),
    )

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "trialExpired" })
    expect(getUserPagesMock).not.toHaveBeenCalled()
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
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "macLimitReached" })
  })

  test("returns credentialMissing when the workspace has no Messenger app credential", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      credentialMissingException(
        "App credentials are not configured for this workspace.",
      ),
    )

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "credentialMissing" })
    expect(getUserPagesMock).not.toHaveBeenCalled()
  })

  test("a forged/unknown page id resolves to notSelectable without any Meta call", async () => {
    const result = await call({
      userId: "user-1",
      pageId: "forged-id",
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
    expect(exchangeLongLivedTokenMock).not.toHaveBeenCalled()
    expect(subscribePageToAppWebhookMock).not.toHaveBeenCalled()
    expect(connectPageMock).not.toHaveBeenCalled()
  })

  test("a non-admin page id resolves to notSelectable without any Meta call", async () => {
    getUserPagesMock.mockResolvedValue({
      pages: [notAdminPage],
      bmLookupFailed: false,
    })

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "p1",
        name: "Page One",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
    expect(exchangeLongLivedTokenMock).not.toHaveBeenCalled()
  })

  test("an already-connected page resolves to duplicated without any further Meta call", async () => {
    findConnectedPageIdsMock.mockResolvedValue(new Set(["p1"]))

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "p1",
        name: "Page One",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
    expect(exchangeLongLivedTokenMock).not.toHaveBeenCalled()
    expect(connectPageMock).not.toHaveBeenCalled()
  })

  test("happy path: getUserPages -> exchange -> subscribe -> persist -> follow-ups, one Graph list call per request", async () => {
    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "p1",
        name: "Page One",
        status: "connected",
        warning: undefined,
        integrationId: "integration-1",
        coexistEligible: true,
      },
    })

    expect(getUserPagesMock).toHaveBeenCalledTimes(1)
    expect(exchangeLongLivedTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1" }),
      "page-token-1",
    )
    expect(subscribePageToAppWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "p1",
        accessToken: "long-lived-token",
      }),
    )
    expect(connectPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        ownerId: "owner-1",
        workspaceId: "ws-1",
        page: { pageId: "p1", pageName: "Page One" },
      }),
    )
    expect(enqueueChannelScanMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channelType: "messenger",
      integrationId: "integration-1",
    })

    const order = [
      getUserPagesMock,
      exchangeLongLivedTokenMock,
      subscribePageToAppWebhookMock,
      connectPageMock,
      runChannelHandlerMock,
      updateWorkspaceLogoMock,
      persistIntegrationUserInfoMock,
      enqueueChannelScanMock,
    ].map((mock) => mock.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  test("a subscribe-webhook failure resolves to providerRejected and never persists", async () => {
    subscribePageToAppWebhookMock.mockRejectedValue(
      new SdkException("Meta rejected the subscription"),
    )

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "p1",
        name: "Page One",
        status: "failed",
        reason: "providerRejected",
        coexistEligible: false,
      },
    })
    expect(connectPageMock).not.toHaveBeenCalled()
  })

  test("a follow-up failure still returns a connected outcome, carrying a followUpFailed warning", async () => {
    runChannelHandlerMock.mockRejectedValue(new Error("branding failed"))

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "p1",
        name: "Page One",
        status: "connected",
        warning: "followUpFailed",
        integrationId: "integration-1",
        coexistEligible: true,
      },
    })
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  test("a unique-violation race during persist resolves to duplicated", async () => {
    connectPageMock.mockRejectedValue(channelDuplicatedException())

    const result = await call({
      userId: "user-1",
      pageId: "p1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "p1",
        name: "Page One",
        status: "duplicated",
        reason: "alreadyConnected",
        coexistEligible: false,
      },
    })
  })
})
