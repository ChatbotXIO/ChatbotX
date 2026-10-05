// @vitest-environment node

import type * as ChatbotxUtilsModule from "@chatbotx.io/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectSessionCreate,
  mockFindWorkspaceById,
  mockGetCurrentUserId,
  mockListAndAttachCandidates,
  mockRedirect,
  mockRequireWorkspacePermission,
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
    const error = new Error(`redirect:${path}`)
    Object.assign(error, { digest: `NEXT_REDIRECT;replace;${path};307;` })
    throw error
  }),
  mockRequireWorkspacePermission: vi.fn(async () => undefined),
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
  unstable_rethrow: (error: unknown) => {
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error
    }
  },
}))

// The mock request objects below only carry `nextUrl`, not the real
// `url`/`headers` a NextRequest would have — resolve the public URL (used
// to pin the connect session's `originHost`) straight from `nextUrl`.
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof ChatbotxUtilsModule>()
  return {
    ...actual,
    getPublicUrlFromRequest: (request: { nextUrl: URL }) => request.nextUrl,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    findById: mockFindWorkspaceById,
    findActiveByOwner: vi.fn(async () => undefined),
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
  // `startChannelConnect`'s error paths call `failSession` — unused by these
  // happy/plan-limit-only tests, but the module must export it.
  failSession: vi.fn(),
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

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { GET } = await import(
  "../src/app/(no-sidebar)/channels/create/messenger/route"
)

const messengerCredential = {
  clientId: "app-id",
  clientSecret: "app-secret",
  version: "v23.0",
}

function requestWithWorkspaceId(workspaceId: string | null) {
  const url = new URL("http://localhost/channels/create/messenger")
  if (workspaceId) {
    url.searchParams.set("workspaceId", workspaceId)
  }
  return { nextUrl: url } as unknown as Parameters<typeof GET>[0]
}

describe("GET /channels/create/messenger — Facebook SSO token reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockConnectSessionCreate.mockResolvedValue({ session: { id: "session-1" } })
    // One resolve, shared by the SSO pre-check and the OAuth fallback — no
    // more duplicate `platformCredentialService.resolveForOwner("messenger")`.
    mockResolveOAuthCredential.mockResolvedValue({
      credential: messengerCredential,
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
    expect(mockTryReuseFacebookSsoToken).toHaveBeenCalledWith({
      userId: "user-1",
      messengerCredential,
    })
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
      credential: messengerCredential,
      callbackUrl: "https://app.example.com/integrations/messenger/callback",
      actorUserId: "user-1",
      platformOwnerId: "owner-1",
      originHost: "localhost",
    })
    // Relative — `connectSessionService.updateReturnUrl`'s real
    // `validateReturnUrl` rejects an absolute value outright (regression C1).
    expect(mockUpdateReturnUrl).toHaveBeenCalledWith({
      id: "session-2",
      returnUrl: "/channels/messenger/select?session=session-2",
    })
  })

  // Regression (C1): the route used to store an *absolute* returnUrl built
  // from the request's own origin — `connectSessionService.updateReturnUrl`
  // (real `validateReturnUrl`) rejects an absolute value outright, so every
  // non-SSO connect start 400'd. The route must store a *relative* path;
  // the OAuth callback resolves it against its own public origin before
  // handing it to `sanitizeReferer` (real, unmocked here), which only
  // accepts absolute URLs.
  test("stores a relative returnUrl that the callback can resolve to an absolute, allowed URL instead of an absolute value the service would reject", async () => {
    mockTryReuseFacebookSsoToken.mockResolvedValue({ reusable: false })
    const { sanitizeReferer, FALLBACK_REDIRECT } = await import(
      "@/lib/oauth-referer"
    )

    // Origin matches the test env's NEXT_PUBLIC_BUILDER_URL
    // (packages/vitest-config/src/setup-env.ts) exactly, so
    // `isAllowedOrigin` accepts it without needing `customDomainService`.
    const req = {
      nextUrl: new URL(
        "http://localhost:3123/channels/create/messenger?workspaceId=ws-1",
      ),
    } as unknown as Parameters<typeof GET>[0]

    await expect(GET(req)).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    const storedReturnUrl = mockUpdateReturnUrl.mock.calls.at(0)?.[0]
      .returnUrl as string
    expect(storedReturnUrl).toBe("/channels/messenger/select?session=session-2")
    expect(storedReturnUrl.startsWith("/")).toBe(true)

    const resolved = new URL(
      storedReturnUrl,
      "http://localhost:3123",
    ).toString()
    await expect(sanitizeReferer(resolved)).resolves.toBe(resolved)
    await expect(sanitizeReferer(resolved)).resolves.not.toBe(FALLBACK_REDIRECT)
  })

  test("404s when the workspace has no messenger credential configured", async () => {
    mockResolveOAuthCredential.mockResolvedValue(null)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "not found",
    )

    expect(mockTryReuseFacebookSsoToken).not.toHaveBeenCalled()
  })
})
