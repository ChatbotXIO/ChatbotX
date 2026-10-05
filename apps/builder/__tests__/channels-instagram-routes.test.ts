// @vitest-environment node

import type * as ChatbotxUtilsModule from "@chatbotx.io/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `channels/instagram/route.ts` and `channels/instagram-facebook/route.ts`
// mirror `channels/create/messenger/route.ts`'s non-reuse branch: resolve/
// create the target workspace up front, start a `ConnectSession`, then set
// its `returnUrl` to the channel's own select page (`?session={id}`) in a
// follow-up call — `startSession` doesn't know the session's own id until
// after it returns, so `returnUrl` can't be passed in up front. Without that
// follow-up call, the OAuth completion would land on the generic
// `/connect/{id}` page instead of the picker's confirm screen.
// ---------------------------------------------------------------------------

const {
  mockFailSession,
  mockFindWorkspaceById,
  mockGetCurrentUserId,
  mockRedirect,
  mockRequireWorkspacePermission,
  mockResolveOAuthCredential,
  mockStartSession,
  mockUpdateReturnUrl,
  mockWorkspaceCreate,
} = vi.hoisted(() => ({
  mockFailSession: vi.fn(),
  mockFindWorkspaceById: vi.fn(async () => ({
    id: "ws-1",
    ownerId: "owner-1",
  })),
  mockGetCurrentUserId: vi.fn(
    async (): Promise<string | undefined> => "user-1",
  ),
  mockRedirect: vi.fn((path: string) => {
    const error = new Error(`redirect:${path}`)
    Object.assign(error, { digest: `NEXT_REDIRECT;replace;${path};307;` })
    throw error
  }),
  mockRequireWorkspacePermission: vi.fn(async () => undefined),
  mockResolveOAuthCredential: vi.fn(),
  mockStartSession: vi.fn(),
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

vi.mock("@chatbotx.io/business/audit", () => ({}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { updateReturnUrl: mockUpdateReturnUrl },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { startSession: mockStartSession },
  failSession: mockFailSession,
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

function requestWithWorkspaceId(workspaceId: string | null) {
  const url = new URL("http://localhost/channels/instagram")
  if (workspaceId) {
    url.searchParams.set("workspaceId", workspaceId)
  }
  return { nextUrl: url } as unknown as { nextUrl: URL }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentUserId.mockResolvedValue("user-1")
  mockFindWorkspaceById.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mockResolveOAuthCredential.mockResolvedValue({
    credential: { clientId: "app-id", clientSecret: "app-secret" },
    callbackUrl: "https://app.example.com/integrations/instagram/callback",
  })
  mockStartSession.mockResolvedValue({
    session: { id: "session-1" },
    nextAction: { type: "open_url", url: "https://facebook.com/oauth-dialog" },
  })
  mockUpdateReturnUrl.mockResolvedValue({ id: "session-1" })
})

describe.each([
  {
    label: "instagram",
    routePath: "../src/app/(no-sidebar)/channels/instagram/route",
    provider: "instagram",
    selectPath: "/channels/instagram/select",
  },
  {
    label: "instagram-facebook",
    routePath: "../src/app/(no-sidebar)/channels/instagram-facebook/route",
    provider: "instagramFacebook",
    selectPath: "/channels/instagram-facebook/select",
  },
])("GET /channels/$label", ({ routePath, provider, selectPath }) => {
  test("starts an OAuth session, points returnUrl at its own select page, and redirects to the provider's authorize URL", async () => {
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    expect(mockRequireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "superAdmin",
    )
    expect(mockResolveOAuthCredential).toHaveBeenCalledWith({
      provider,
      ownerId: "owner-1",
    })
    expect(mockStartSession).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider,
      purpose: "connect",
      credential: { clientId: "app-id", clientSecret: "app-secret" },
      callbackUrl: "https://app.example.com/integrations/instagram/callback",
      actorUserId: "user-1",
      platformOwnerId: "owner-1",
      originHost: "localhost",
    })
    expect(mockUpdateReturnUrl).toHaveBeenCalledWith({
      id: "session-1",
      returnUrl: `${selectPath}?session=session-1`,
    })
  })

  test("defers workspace creation into startSession's own transaction when there is no workspaceId yet (first channel ever) (M-7: a cancelled/failed start must not leave an empty orphan workspace behind)", async () => {
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    expect(mockRequireWorkspacePermission).not.toHaveBeenCalled()
    // The workspace is minted by `startSession`'s own implementation, in the
    // same transaction as the `ConnectSession` insert — not eagerly by this
    // route — so `workspaceService.create` never runs here; this mock
    // `startSession` never invokes the callback it's handed.
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()
    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ createWorkspace: expect.any(Function) }),
    )

    // The callback itself, once invoked (as the real `startSession` does
    // inside its transaction), still creates the user's first workspace.
    const passedCreateWorkspace = mockStartSession.mock.calls[0]?.[0]
      .createWorkspace as (tx: unknown) => Promise<{ id: string }>
    await expect(passedCreateWorkspace("tx")).resolves.toEqual({
      id: "ws-new",
      ownerId: "user-1",
    })
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      data: { name: "New Workspace", ownerId: "user-1" },
      createdBy: "user-1",
      tx: "tx",
    })
  })

  test("never creates an orphan workspace when startSession fails before reaching the provider — simulated OAuth cancel (M-7)", async () => {
    mockStartSession.mockRejectedValueOnce(
      new Error("provider rejected the connect attempt"),
    )
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:/channels/create?error=sessionExpired",
    )

    // Workspace creation now lives INSIDE `startSession`'s own transaction
    // (`createWorkspace` below), so a failed/cancelled start — which never
    // gets to invoke that callback for real here — never calls
    // `workspaceService.create` directly from this route. Before M-7, the
    // route called it eagerly regardless of whether `startSession`
    // succeeded, leaving an empty orphan workspace behind on every
    // cancelled/failed attempt.
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()
    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ createWorkspace: expect.any(Function) }),
    )
  })

  test("rethrows createFirstWorkspace's plan-limit redirect instead of swallowing it as a generic session-start failure (regression: createWorkspace's own NEXT_REDIRECT was caught by this route's own catch and replaced with the generic /channels/create?error=sessionExpired page)", async () => {
    const { workspaceLimitReachedException } = await import(
      "@chatbotx.io/business/errors"
    )
    mockWorkspaceCreate.mockRejectedValueOnce(workspaceLimitReachedException())
    // Mirrors what the real `startSession` does inside its own transaction:
    // invokes the `createWorkspace` callback this route handed it.
    mockStartSession.mockImplementationOnce(
      async (input: { createWorkspace: (tx: unknown) => Promise<unknown> }) =>
        input.createWorkspace("tx"),
    )
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:/channels/create?error=workspaceLimitReached",
    )
  })

  test("404s when the owner has no credential configured for the provider, without ever creating a workspace", async () => {
    mockResolveOAuthCredential.mockResolvedValue(null)
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow("not found")
    expect(mockStartSession).not.toHaveBeenCalled()
    expect(mockWorkspaceCreate).not.toHaveBeenCalled()
  })

  test("404s when the caller is not signed in", async () => {
    mockGetCurrentUserId.mockResolvedValue(undefined)
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "not found",
    )
    expect(mockResolveOAuthCredential).not.toHaveBeenCalled()
  })

  test("fails the session and redirects to an error page when startSession returns a non-open_url next action, instead of an unhandled throw", async () => {
    mockStartSession.mockResolvedValue({
      session: { id: "session-1" },
      nextAction: { type: "show_qr", qr: "data:image/png;base64,..." },
    })
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "redirect:/channels/create?error=sessionExpired",
    )
    expect(mockFailSession).toHaveBeenCalledWith(
      { id: "session-1" },
      "internal_error",
    )
  })

  // Regression (C1): the route used to store an *absolute* returnUrl built
  // from the request's own origin — `connectSessionService.updateReturnUrl`
  // (real `validateReturnUrl`) rejects an absolute value outright, so every
  // non-SSO connect start 400'd. The route must store a *relative* path;
  // the OAuth callback resolves it against its own public origin before
  // handing it to `sanitizeReferer` (real, unmocked here), which only
  // accepts absolute URLs.
  test("stores a relative returnUrl that the callback can resolve to an absolute, allowed URL instead of an absolute value the service would reject", async () => {
    const { sanitizeReferer, FALLBACK_REDIRECT } = await import(
      "@/lib/oauth-referer"
    )
    const { GET } = await import(routePath)

    // Origin matches the test env's NEXT_PUBLIC_BUILDER_URL
    // (packages/vitest-config/src/setup-env.ts) exactly, so
    // `isAllowedOrigin` accepts it without needing `customDomainService`.
    const req = {
      nextUrl: new URL(
        `http://localhost:3123/channels/${provider}?workspaceId=ws-1`,
      ),
    } as unknown as { nextUrl: URL }

    await expect(GET(req)).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    const storedReturnUrl = mockUpdateReturnUrl.mock.calls.at(0)?.[0]
      .returnUrl as string
    expect(storedReturnUrl).toBe(`${selectPath}?session=session-1`)
    expect(storedReturnUrl.startsWith("/")).toBe(true)

    // Simulates the callback's own resolution step against its public origin.
    const resolved = new URL(
      storedReturnUrl,
      "http://localhost:3123",
    ).toString()
    await expect(sanitizeReferer(resolved)).resolves.toBe(resolved)
    await expect(sanitizeReferer(resolved)).resolves.not.toBe(FALLBACK_REDIRECT)
  })
})
