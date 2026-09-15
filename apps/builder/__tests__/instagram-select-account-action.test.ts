// @vitest-environment node

import {
  ChatbotXException,
  channelDuplicatedException,
  credentialMissingException,
  notWorkspaceMemberException,
} from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  buildContextMock,
  connectTargetsMock,
  findByInboxIdMock,
  loggerErrorMock,
  loggerWarnMock,
  resolveConnectSessionMock,
  runChannelHandlerMock,
  updateWorkspaceLogoMock,
} = vi.hoisted(() => ({
  buildContextMock: vi.fn(),
  connectTargetsMock: vi.fn(),
  findByInboxIdMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveConnectSessionMock: vi.fn(),
  runChannelHandlerMock: vi.fn(),
  updateWorkspaceLogoMock: vi.fn(),
}))

vi.mock("@/features/channel-connect/lib/resolve-connect-session", () => ({
  resolveConnectSession: resolveConnectSessionMock,
}))

vi.mock("@/features/integration-webchat/lib", () => ({
  BRANDING_TITLE: "ChatbotX",
}))

vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo: updateWorkspaceLogoMock,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarnMock, error: loggerErrorMock, info: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: buildContextMock,
  instagramIntegrationService: {
    findByInboxId: findByInboxIdMock,
  },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { connectTargets: connectTargetsMock },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: runChannelHandlerMock },
}))

const { connectInstagramAccount } = await import(
  "../src/features/integration-instagram/actions/connect-account"
)

const call = connectInstagramAccount

const resolvedSession = {
  session: {
    targets: [
      {
        id: "ig1",
        name: "IG Direct Account",
        selectable: true,
      },
    ],
  },
  workspace: { id: "ws-1", ownerId: "owner-1" },
  platformOwnerId: "owner-1",
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
    connectTargetsMock.mockResolvedValue({
      outcomes: [{ sourceId: "ig1", status: "connected" }],
      connections: [{ inboxId: "inbox-1" }],
    })
    findByInboxIdMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
    })
    runChannelHandlerMock.mockResolvedValue(undefined)
    updateWorkspaceLogoMock.mockResolvedValue(undefined)
    buildContextMock.mockResolvedValue({})
  })

  test("returns sessionExpired and touches nothing else when the connect session is missing/invalid", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      new ChatbotXException(
        "Your connect session expired. Please start again.",
        "connectSessionExpired",
      ),
    )

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "sessionExpired" })
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("returns notMember before connecting when the resolver rejects membership", async () => {
    resolveConnectSessionMock.mockRejectedValue(notWorkspaceMemberException())

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "notMember" })
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("returns trialExpired when the workspace owner is blocked", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      new ChatbotXException("Trial expired", "trialExpired", 403),
    )

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "trialExpired" })
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("returns credentialMissing when the workspace has no Instagram app credential", async () => {
    resolveConnectSessionMock.mockRejectedValue(
      credentialMissingException(
        "App credentials are not configured for this workspace.",
      ),
    )

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    })

    expect(result).toEqual({ kind: "sessionError", code: "credentialMissing" })
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("an unknown igId resolves to notSelectable without connecting", async () => {
    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
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
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("a non-selectable account resolves to notSelectable without connecting", async () => {
    resolveConnectSessionMock.mockResolvedValue({
      ...resolvedSession,
      session: {
        targets: [{ id: "ig1", name: "IG Direct Account", selectable: false }],
      },
    })

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
      igId: "ig1",
    })

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "ig1",
        name: "IG Direct Account",
        status: "failed",
        reason: "notSelectable",
        coexistEligible: false,
      },
    })
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("an already-connected account resolves to duplicated without connecting", async () => {
    resolveConnectSessionMock.mockResolvedValue({
      ...resolvedSession,
      session: {
        targets: [
          {
            id: "ig1",
            name: "IG Direct Account",
            selectable: false,
            alreadyConnected: "this_workspace",
          },
        ],
      },
    })

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
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
    expect(connectTargetsMock).not.toHaveBeenCalled()
  })

  test("connects the selected target and runs Instagram follow-ups", async () => {
    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
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
    expect(connectTargetsMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      workspaceId: "ws-1",
      targetIds: ["ig1"],
      actorUserId: "user-1",
    })
  })

  test("a failed connection outcome is returned without follow-ups", async () => {
    connectTargetsMock.mockResolvedValue({
      outcomes: [
        {
          sourceId: "ig1",
          status: "failed",
          reason: "providerRejected",
        },
      ],
      connections: [],
    })

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
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
    expect(runChannelHandlerMock).not.toHaveBeenCalled()
  })

  test("a follow-up failure still returns a connected outcome, carrying a followUpFailed warning", async () => {
    runChannelHandlerMock.mockRejectedValue(new Error("branding failed"))

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
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

  test("a unique-violation race during connection resolves to duplicated", async () => {
    connectTargetsMock.mockRejectedValue(channelDuplicatedException())

    const result = await call({
      userId: "user-1",
      sessionId: "session-1",
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
