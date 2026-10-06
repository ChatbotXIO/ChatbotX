// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `resolveConnectSession` is the shared per-account connect helper every
// picker action (Messenger, Instagram direct, Instagram-via-Facebook)
// delegates to instead of re-implementing the same checks: session binding
// (actor/status/purpose/provider) -> workspace + membership -> owner
// quota/trial gate -> platform credential existence + branding menu entry.
// Every failure throws one of the session-level exceptions; this file pins
// each branch plus the happy path's full (trimmed) return shape.
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

const { resolveConnectSession, resolveConnectSessionForSelect } = await import(
  "@/features/channel-connect/lib/resolve-connect-session"
)

const session = {
  id: "session-1",
  workspaceId: "ws-1",
  platformOwnerId: "owner-1",
  provider: "messenger",
  purpose: "connect",
  status: "awaiting_selection",
  actorUserId: "user-1",
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
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(findWorkspaceMock).not.toHaveBeenCalled()
  })

  test("throws connectSessionExpired for a different actor", async () => {
    findByIdMock.mockResolvedValue({ ...session, actorUserId: "someone-else" })

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(findWorkspaceMock).not.toHaveBeenCalled()
  })

  test("throws connectSessionExpired for the wrong provider", async () => {
    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "instagram",
        expectedProvider: "instagram",
        brandingChannel: "instagram",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(findWorkspaceMock).not.toHaveBeenCalled()
  })

  test("throws connectSessionExpired for a failed session", async () => {
    findByIdMock.mockResolvedValue({
      ...session,
      status: "failed",
      errorCode: "internal_error",
    })

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(findWorkspaceMock).not.toHaveBeenCalled()
  })

  test("throws connectSessionExpired for a completed session", async () => {
    findByIdMock.mockResolvedValue({ ...session, status: "completed" })

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        expectedProvider: "messenger",
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
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "notWorkspaceMember" })
    // `workspaceService.find` and `workspaceMemberService.isMember` run in
    // `Promise.all` (both keyed off `session.workspaceId` alone), so the
    // membership check still fires even though its result is moot once the
    // workspace itself is gone.
    expect(isMemberMock).toHaveBeenCalled()
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
        expectedProvider: "messenger",
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
        expectedProvider: "messenger",
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
        expectedProvider: "messenger",
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
        expectedProvider: "messenger",
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
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "credentialMissing" })
    // `platformCredentialService.resolveForOwner` and `resolveTenantSettings`
    // run in `Promise.all` (both keyed off `platformOwnerId`/`workspace.id`
    // alone), so the tenant-settings lookup still fires even though its
    // result is discarded once the credential turns out to be missing.
    expect(resolveTenantSettingsMock).toHaveBeenCalled()
  })

  test("happy path resolves session/workspace/branding, sourcing the branding channel from the caller (not a hard-coded literal) and discarding the credential value", async () => {
    const result = await resolveConnectSession({
      userId: "user-1",
      sessionId: "session-1",
      credentialType: "messenger",
      expectedProvider: "messenger",
      brandingChannel: "instagram",
    })

    expect(result).toEqual({
      session,
      workspace: { id: "ws-1", ownerId: "owner-1" },
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

  test("throws connectSessionExpired — not connectSessionCancelled — for a cancelled session belonging to a different actor (regression: the ownership check ran AFTER the cancelled short-circuit, so guessing another user's cancelled session id leaked that it was cancelled)", async () => {
    findByIdMock.mockResolvedValue({
      ...session,
      actorUserId: "someone-else",
      status: "failed",
      errorCode: "provider_denied",
    })

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
    expect(findWorkspaceMock).not.toHaveBeenCalled()
  })

  test("throws connectSessionCancelled — carrying no returnUrl, since the session's own select-page-shaped returnUrl would otherwise send the only caller straight back into an infinite redirect loop — when the owning actor's own session was cancelled", async () => {
    findByIdMock.mockResolvedValue({
      ...session,
      status: "failed",
      errorCode: "provider_denied",
      returnUrl: "/channels/messenger/select?session=session-1",
    })

    await expect(
      resolveConnectSession({
        userId: "user-1",
        sessionId: "session-1",
        credentialType: "messenger",
        expectedProvider: "messenger",
        brandingChannel: "messenger",
      }),
    ).rejects.toMatchObject({
      code: "connectSessionCancelled",
      data: undefined,
    })
  })

  test("never puts the session's internal errorCode in a thrown exception's message (regression: the combined expired message embedded `errorCode=...`, which a caller could surface to the client)", async () => {
    findByIdMock.mockResolvedValue({
      ...session,
      status: "failed",
      errorCode: "internal_error",
    })

    const failure: unknown = await resolveConnectSession({
      userId: "user-1",
      sessionId: "session-1",
      credentialType: "messenger",
      expectedProvider: "messenger",
      brandingChannel: "messenger",
    }).catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: "connectSessionExpired" })
    expect((failure as Error).message).not.toContain("errorCode")
    expect((failure as Error).message).not.toContain("internal_error")
  })
})

describe("resolveConnectSessionForSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    findByIdMock.mockResolvedValue(session)
    findWorkspaceMock.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    isMemberMock.mockResolvedValue(true)
    checkWorkspaceOwnerAccessMock.mockResolvedValue(null)
  })

  test("resolves session + workspace without touching the credential or branding lookups", async () => {
    const result = await resolveConnectSessionForSelect({
      userId: "user-1",
      sessionId: "session-1",
      expectedProvider: "messenger",
    })

    expect(result).toEqual({
      session,
      workspace: { id: "ws-1", ownerId: "owner-1" },
    })
    expect(platformCredentialResolveMock).not.toHaveBeenCalled()
    expect(resolveTenantSettingsMock).not.toHaveBeenCalled()
  })

  test("still applies the same session-binding checks as the full resolve", async () => {
    await expect(
      resolveConnectSessionForSelect({
        userId: "user-1",
        sessionId: "session-1",
        expectedProvider: "instagram",
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
  })
})
