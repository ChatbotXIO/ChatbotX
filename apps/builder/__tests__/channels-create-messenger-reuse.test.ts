// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectSessionCreate,
  mockFindWorkspaceById,
  mockGetCurrentUserId,
  mockListAndAttachCandidates,
  mockRedirect,
  mockRequireWorkspacePermission,
  mockResolveForOwner,
  mockResolveOAuthCredential,
  mockStartSession,
  mockTryReuseFacebookSsoToken,
  mockUpdateReturnUrl,
  mockWorkspaceCreate,
} = vi.hoisted(() => ({
  mockConnectSessionCreate: vi.fn(),
  mockFindWorkspaceById: vi.fn(async () => ({
    id: "ws-1",
    ownerId: "owner-1",
  })),
  mockGetCurrentUserId: vi.fn(async () => "user-1"),
  mockListAndAttachCandidates: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockRequireWorkspacePermission: vi.fn(async () => undefined),
  mockResolveForOwner: vi.fn(),
  mockResolveOAuthCredential: vi.fn(),
  mockStartSession: vi.fn(),
  mockTryReuseFacebookSsoToken: vi.fn(),
  mockUpdateReturnUrl: vi.fn(),
  mockWorkspaceCreate: vi.fn(async () => ({ id: "ws-new", ownerId: "user-1" })),
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
  redirect: mockRedirect,
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
  workspaceService: {
    findById: mockFindWorkspaceById,
    create: mockWorkspaceCreate,
  },
}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: {
    create: mockConnectSessionCreate,
    updateReturnUrl: mockUpdateReturnUrl,
  },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: {
    listAndAttachCandidates: mockListAndAttachCandidates,
    startSession: mockStartSession,
  },
}))

vi.mock("@/features/connections/lib/resolve-connect-credential", () => ({
  resolveOAuthCredential: mockResolveOAuthCredential,
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: vi.fn(async () => "owner-1"),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: mockRequireWorkspacePermission,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mockGetCurrentUserId,
}))

vi.mock("@/features/integration-messenger/libs/sso-reuse", () => ({
  tryReuseFacebookSsoToken: mockTryReuseFacebookSsoToken,
}))

const { GET } = await import(
  "../src/app/(no-sidebar)/channels/create/messenger/route"
)

const messengerCredential = {
  config: { clientId: "app-id", clientSecret: "app-secret", version: "v23.0" },
  publicConfig: { clientId: "app-id", version: "v23.0" },
}

function requestWithWorkspaceId(workspaceId: string | null) {
  const url = new URL("http://localhost/channels/create/messenger")
  if (workspaceId) {
    url.searchParams.set("workspaceId", workspaceId)
  }
  return { nextUrl: url } as unknown as Parameters<typeof GET>[0]
}

function resolveOnlyMessenger() {
  mockResolveForOwner.mockResolvedValue(messengerCredential)
}

describe("GET /channels/create/messenger — Facebook SSO token reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockConnectSessionCreate.mockResolvedValue({ session: { id: "session-1" } })
    mockResolveOAuthCredential.mockResolvedValue({
      credential: { clientId: "app-id", clientSecret: "app-secret" },
      callbackUrl: "https://app.example.com/integrations/messenger/callback",
    })
    mockStartSession.mockResolvedValue({
      session: { id: "session-2" },
      nextAction: {
        type: "open_url",
        url: "https://facebook.com/oauth-dialog",
      },
    })
    mockUpdateReturnUrl.mockResolvedValue({ id: "session-2" })
    resolveOnlyMessenger()
  })

  test("reuses a valid SSO token: attaches candidates and redirects to the Page picker session", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({
      reusable: true,
      userToken: "long-lived-user-token",
    })

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "redirect:/channels/messenger/select?session=session-1",
    )

    expect(mockRequireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "superAdmin",
    )
    expect(mockFindWorkspaceById).toHaveBeenCalledWith({ id: "ws-1" })
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()
    expect(mockConnectSessionCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "messenger",
      purpose: "connect",
      actorUserId: "user-1",
      platformOwnerId: "owner-1",
    })
    expect(mockListAndAttachCandidates).toHaveBeenCalledWith(
      { id: "session-1" },
      {
        authType: "oauth2",
        clientId: "app-id",
        clientSecret: "app-secret",
        redirectUrl: "",
        version: "v23.0",
        tokens: { accessToken: "long-lived-user-token" },
      },
    )
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  test("creates a workspace first when reusing a token with no workspaceId yet (first channel ever)", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({
      reusable: true,
      userToken: "long-lived-user-token",
    })

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:/channels/messenger/select?session=session-1",
    )

    expect(mockRequireWorkspacePermission).not.toHaveBeenCalled()
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      data: { name: "New Workspace", ownerId: "user-1" },
      createdBy: "user-1",
    })
    expect(mockConnectSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-new" }),
    )
  })

  test("redirects to /channels/create?error=… instead of 500 when the first workspace hits the plan limit", async () => {
    const { workspaceLimitReachedException } = await import(
      "@chatbotx.io/business/errors"
    )
    mockTryReuseFacebookSsoToken.mockResolvedValue({
      reusable: true,
      userToken: "long-lived-user-token",
    })
    mockWorkspaceCreate.mockRejectedValueOnce(workspaceLimitReachedException())

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:/channels/create?error=workspaceLimitReached",
    )

    expect(mockConnectSessionCreate).not.toHaveBeenCalled()
    expect(mockListAndAttachCandidates).not.toHaveBeenCalled()
  })

  test("starts a full OAuth session when there is no reusable token", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({ reusable: false })

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    expect(mockConnectSessionCreate).not.toHaveBeenCalled()
    expect(mockListAndAttachCandidates).not.toHaveBeenCalled()
    expect(mockResolveOAuthCredential).toHaveBeenCalledWith({
      provider: "messenger",
      ownerId: "owner-1",
    })
    expect(mockStartSession).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "messenger",
      purpose: "connect",
      credential: { clientId: "app-id", clientSecret: "app-secret" },
      callbackUrl: "https://app.example.com/integrations/messenger/callback",
      actorUserId: "user-1",
      platformOwnerId: "owner-1",
    })
    expect(mockUpdateReturnUrl).toHaveBeenCalledWith({
      id: "session-2",
      returnUrl: "/channels/messenger/select?session=session-2",
    })
  })

  test("404s when the workspace has no messenger credential configured", async () => {
    mockResolveForOwner.mockResolvedValue(undefined)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "not found",
    )

    expect(mockTryReuseFacebookSsoToken).not.toHaveBeenCalled()
  })
})
