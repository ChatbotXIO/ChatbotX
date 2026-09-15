// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `resolveConnectSession` is the shared per-account connect helper every
// picker action (Messenger, Instagram direct, Instagram-via-Facebook)
// delegates to instead of re-implementing the same checks: `ConnectSession`
// row lookup -> workspace + membership -> owner quota/trial gate ->
// platform credential + branding menu entry. Every failure throws one of
// the session-level exceptions; this file pins each branch plus the happy
// path's full return shape.
// ---------------------------------------------------------------------------

const {
  checkWorkspaceOwnerAccessMock,
  findByIdMock,
  findWorkspaceMock,
  isMemberMock,
  platformCredentialResolveMock,
  resolveTenantSettingsMock,
} = vi.hoisted(() => ({
  checkWorkspaceOwnerAccessMock: vi.fn(),
  findByIdMock: vi.fn(),
  findWorkspaceMock: vi.fn(),
  isMemberMock: vi.fn(),
  platformCredentialResolveMock: vi.fn(),
  resolveTenantSettingsMock: vi.fn(),
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { findById: findByIdMock },
}))

// Fully replaced (not `importOriginal`) — the real module's
// `checkWorkspaceOwnerAccess` pulls in `@/env`, which requires real
// deployment env vars this test suite never sets. `workspaceAccessDenialException`
// still builds a genuine `ChatbotXException` so callers' (real, unmocked)
// `toConnectSessionError` recognizes it exactly like production.
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: checkWorkspaceOwnerAccessMock,
  workspaceAccessDenialException: (
    reason: "trialExpired" | "macLimitReached",
  ) =>
    new ChatbotXException(
      reason === "macLimitReached"
        ? "Monthly active contact limit reached"
        : "Trial expired",
      reason,
      403,
    ),
}))

vi.mock("@/features/integration-webchat/lib", () => ({
  BRANDING_TITLE: "ChatbotX",
  getBrandingUrl: (channel: string, appUrl: string) =>
    `${appUrl}/branding/${channel}`,
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { find: findWorkspaceMock },
  workspaceMemberService: { isMember: isMemberMock },
  platformCredentialService: { resolveForOwner: platformCredentialResolveMock },
  resolveTenantSettings: resolveTenantSettingsMock,
}))

const { resolveConnectSession } = await import(
  "@/features/channel-connect/lib/resolve-connect-session"
)

const session = {
  id: "session-1",
  workspaceId: "ws-1",
  platformOwnerId: "owner-1",
  provider: "messenger",
  status: "awaiting_selection",
  targets: [],
}

describe("resolveConnectSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    findByIdMock.mockResolvedValue(session)
    findWorkspaceMock.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    isMemberMock.mockResolvedValue(true)
    checkWorkspaceOwnerAccessMock.mockResolvedValue(null)
    platformCredentialResolveMock.mockResolvedValue({
      config: { clientId: "client-1", clientSecret: "secret-1" },
    })
    resolveTenantSettingsMock.mockResolvedValue({ appUrl: "https://app.test" })
  })

  test("throws connectSessionExpired when the session is missing/expired", async () => {
    findByIdMock.mockResolvedValue(null)

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(findWorkspaceMock).not.toHaveBeenCalled()
  })

  test("throws notWorkspaceMember when the workspace has vanished", async () => {
    findWorkspaceMock.mockResolvedValue(undefined)

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "notWorkspaceMember" })
    expect(isMemberMock).not.toHaveBeenCalled()
  })

  test("throws notWorkspaceMember before the owner gate/credential lookup when the user isn't a member", async () => {
    isMemberMock.mockResolvedValue(false)
    checkWorkspaceOwnerAccessMock.mockRejectedValue(
      new Error("must not be called"),
    )
    platformCredentialResolveMock.mockRejectedValue(
      new Error("must not be called"),
    )

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "notWorkspaceMember" })
    expect(checkWorkspaceOwnerAccessMock).not.toHaveBeenCalled()
    expect(platformCredentialResolveMock).not.toHaveBeenCalled()
  })

  test("throws trialExpired when the workspace owner is blocked", async () => {
    checkWorkspaceOwnerAccessMock.mockResolvedValue("trialExpired")

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "trialExpired" })
    expect(platformCredentialResolveMock).not.toHaveBeenCalled()
  })

  test("throws macLimitReached when the workspace owner is blocked on MAC", async () => {
    checkWorkspaceOwnerAccessMock.mockResolvedValue("macLimitReached")

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "macLimitReached" })
  })

  test("throws credentialMissing when the session has no platform owner", async () => {
    findByIdMock.mockResolvedValue({ ...session, platformOwnerId: null })

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "credentialMissing" })
    expect(platformCredentialResolveMock).not.toHaveBeenCalled()
  })

  test("throws credentialMissing when the owner has no configured credential", async () => {
    platformCredentialResolveMock.mockResolvedValue(undefined)

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "credentialMissing" })
    expect(resolveTenantSettingsMock).not.toHaveBeenCalled()
  })

  test("happy path resolves every field, sourcing the branding channel from the caller (not a hard-coded literal)", async () => {
    const result = await resolveConnectSession({
      userId: "user-1",
      sessionId: "session-1",
      credentialType: "messenger",
      brandingChannel: "instagram",
    })

    expect(result).toEqual({
      session,
      workspace: { id: "ws-1", ownerId: "owner-1" },
      platformOwnerId: "owner-1",
      credential: {
        config: { clientId: "client-1", clientSecret: "secret-1" },
      },
      appUrl: "https://app.test",
      brandingMenuEntry: {
        label: "ChatbotX",
        type: "url",
        url: "https://app.test/branding/instagram",
      },
    })
    expect(platformCredentialResolveMock).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "messenger",
    })
    expect(findWorkspaceMock).toHaveBeenCalledWith({
      where: { id: "ws-1" },
    })
  })
})
