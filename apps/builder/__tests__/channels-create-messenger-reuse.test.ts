// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockBuildMessengerReferer,
  mockCookieSet,
  mockCookies,
  mockEncryptAuth,
  mockFindWorkspace,
  mockFindWorkspaceById,
  mockGenerateMessengerRedirectUri,
  mockGetCurrentUserId,
  mockRedirect,
  mockRequireWorkspacePermission,
  mockResolveForOwner,
  mockTryReuseFacebookSsoToken,
  mockWorkspaceCreate,
} = vi.hoisted(() => ({
  mockBuildMessengerReferer: vi.fn(async () => "https://tenant.example.com"),
  mockCookieSet: vi.fn(),
  mockCookies: vi.fn(),
  mockEncryptAuth: vi.fn(async () => "encrypted-token"),
  mockFindWorkspace: vi.fn(async () => ({ ownerId: "owner-1" })),
  mockFindWorkspaceById: vi.fn(async () => ({
    id: "ws-1",
    ownerId: "owner-1",
  })),
  mockGenerateMessengerRedirectUri: vi.fn(
    async () => "https://facebook.com/oauth-dialog",
  ),
  mockGetCurrentUserId: vi.fn(async () => "user-1"),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockRequireWorkspacePermission: vi.fn(async () => undefined),
  mockResolveForOwner: vi.fn(),
  mockTryReuseFacebookSsoToken: vi.fn(),
  mockWorkspaceCreate: vi.fn(async () => ({ id: "ws-new", ownerId: "user-1" })),
}))

vi.mock("next/headers", () => ({
  cookies: mockCookies,
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
    find: mockFindWorkspace,
    findById: mockFindWorkspaceById,
    create: mockWorkspaceCreate,
  },
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

vi.mock("@/lib/facebook-pending-auth", () => ({
  encryptAuth: mockEncryptAuth,
  FB_MESSENGER_PENDING_AUTH_COOKIE: "fb_messenger_pending_auth",
  FB_PENDING_AUTH_MAX_AGE: 600,
}))

vi.mock("@/features/integration-messenger/libs/oauth", () => ({
  buildMessengerReferer: mockBuildMessengerReferer,
  generateMessengerRedirectUri: mockGenerateMessengerRedirectUri,
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

/** Only the messenger credential resolves; every other channel is unconfigured. */
function resolveOnlyMessenger() {
  mockResolveForOwner.mockImplementation(({ type }: { type: string }) =>
    Promise.resolve(type === "messenger" ? messengerCredential : undefined),
  )
}

describe("GET /channels/create/messenger — Facebook SSO token reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockCookies.mockResolvedValue({ set: mockCookieSet })
    resolveOnlyMessenger()
  })

  test("reuses a valid SSO token: writes the pending-auth cookie and redirects straight to the Page picker", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({
      reusable: true,
      userToken: "long-lived-user-token",
      userId: "fb-1",
      userName: "Jane Doe",
      userAvatarUrl: "https://example.com/a.png",
    })

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "redirect:/channels/messenger/select",
    )

    expect(mockRequireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "superAdmin",
    )
    expect(mockFindWorkspaceById).toHaveBeenCalledWith({ id: "ws-1" })
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()
    expect(mockEncryptAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        userToken: "long-lived-user-token",
        userId: "fb-1",
        userName: "Jane Doe",
        userAvatarUrl: "https://example.com/a.png",
        workspaceId: "ws-1",
        version: "v23.0",
      }),
    )
    expect(mockCookieSet).toHaveBeenCalledWith(
      "fb_messenger_pending_auth",
      "encrypted-token",
      expect.objectContaining({ path: "/channels/messenger/select" }),
    )
    expect(mockGenerateMessengerRedirectUri).not.toHaveBeenCalled()
  })

  test("creates a workspace first when reusing a token with no workspaceId yet (first channel ever)", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({
      reusable: true,
      userToken: "long-lived-user-token",
    })

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:/channels/messenger/select",
    )

    expect(mockRequireWorkspacePermission).not.toHaveBeenCalled()
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      data: { name: "New Workspace", ownerId: "user-1" },
      createdBy: "user-1",
    })
    expect(mockEncryptAuth).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-new" }),
    )
  })

  test("falls back to the full OAuth redirect when there is no reusable token", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({ reusable: false })

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    expect(mockEncryptAuth).not.toHaveBeenCalled()
    expect(mockCookieSet).not.toHaveBeenCalled()
    expect(mockGenerateMessengerRedirectUri).toHaveBeenCalledWith(
      messengerCredential.publicConfig,
      "ws-1",
    )
  })

  test("404s when the workspace has no messenger credential configured", async () => {
    mockResolveForOwner.mockResolvedValue(undefined)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "not found",
    )

    expect(mockTryReuseFacebookSsoToken).not.toHaveBeenCalled()
  })
})
