// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `resolveConnectSession` is the shared plan §2.4 steps 1-4 helper every
// per-account connect action (Messenger today; Instagram's two actions in a
// later phase) delegates to instead of re-implementing the same five checks:
// pending-auth cookie -> workspace + membership -> owner quota/trial gate ->
// platform credential + branding menu entry. Every failure throws one of the
// session-level exceptions; this file pins each branch plus the happy path's
// full return shape.
// ---------------------------------------------------------------------------

const {
  checkWorkspaceOwnerAccessMock,
  findWorkspaceMock,
  isMemberMock,
  platformCredentialResolveMock,
  readPendingAuthMock,
  resolvePlatformOwnerIdMock,
  resolveTenantSettingsMock,
} = vi.hoisted(() => ({
  checkWorkspaceOwnerAccessMock: vi.fn(),
  findWorkspaceMock: vi.fn(),
  isMemberMock: vi.fn(),
  platformCredentialResolveMock: vi.fn(),
  readPendingAuthMock: vi.fn(),
  resolvePlatformOwnerIdMock: vi.fn(),
  resolveTenantSettingsMock: vi.fn(),
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  readPendingAuth: readPendingAuthMock,
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: resolvePlatformOwnerIdMock,
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

const pendingAuth = {
  userToken: "user-token-1",
  workspaceId: "ws-1",
  referer: "/channels/create",
  version: "v23.0",
  expiresAt: Date.now() + 600_000,
}

describe("resolveConnectSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    readPendingAuthMock.mockResolvedValue(pendingAuth)
    findWorkspaceMock.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    isMemberMock.mockResolvedValue(true)
    checkWorkspaceOwnerAccessMock.mockResolvedValue(null)
    resolvePlatformOwnerIdMock.mockResolvedValue("owner-1")
    platformCredentialResolveMock.mockResolvedValue({
      config: { clientId: "client-1", clientSecret: "secret-1" },
    })
    resolveTenantSettingsMock.mockResolvedValue({ appUrl: "https://app.test" })
  })

  test("throws connectSessionExpired when the pending-auth cookie is missing/invalid", async () => {
    readPendingAuthMock.mockResolvedValue(null)

    await expect(
      resolveConnectSession({
        userId: "user-1",
        cookieName: "fb_messenger_pending_auth",
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
        cookieName: "fb_messenger_pending_auth",
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
    resolvePlatformOwnerIdMock.mockRejectedValue(
      new Error("must not be called"),
    )
    platformCredentialResolveMock.mockRejectedValue(
      new Error("must not be called"),
    )

    await expect(
      resolveConnectSession({
        userId: "user-1",
        cookieName: "fb_messenger_pending_auth",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "notWorkspaceMember" })
    expect(checkWorkspaceOwnerAccessMock).not.toHaveBeenCalled()
    expect(resolvePlatformOwnerIdMock).not.toHaveBeenCalled()
    expect(platformCredentialResolveMock).not.toHaveBeenCalled()
  })

  test("throws trialExpired when the workspace owner is blocked", async () => {
    checkWorkspaceOwnerAccessMock.mockResolvedValue("trialExpired")

    await expect(
      resolveConnectSession({
        userId: "user-1",
        cookieName: "fb_messenger_pending_auth",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "trialExpired" })
    expect(resolvePlatformOwnerIdMock).not.toHaveBeenCalled()
  })

  test("throws macLimitReached when the workspace owner is blocked on MAC", async () => {
    checkWorkspaceOwnerAccessMock.mockResolvedValue("macLimitReached")

    await expect(
      resolveConnectSession({
        userId: "user-1",
        cookieName: "fb_messenger_pending_auth",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "macLimitReached" })
  })

  test("throws credentialMissing when the owner has no configured credential", async () => {
    platformCredentialResolveMock.mockResolvedValue(undefined)

    await expect(
      resolveConnectSession({
        userId: "user-1",
        cookieName: "fb_messenger_pending_auth",
        credentialType: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "credentialMissing" })
    expect(resolveTenantSettingsMock).not.toHaveBeenCalled()
  })

  test("happy path resolves every field, sourcing the branding channel from the caller (not a hard-coded literal)", async () => {
    const result = await resolveConnectSession({
      userId: "user-1",
      cookieName: "fb_messenger_pending_auth",
      credentialType: "messenger",
      brandingChannel: "instagram",
    })

    expect(result).toEqual({
      pendingAuth,
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
    expect(resolvePlatformOwnerIdMock).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })
})
