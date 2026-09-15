// @vitest-environment node

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
  mockFindWorkspaceById,
  mockGetCurrentUserId,
  mockRedirect,
  mockRequireWorkspacePermission,
  mockResolveOAuthCredential,
  mockStartSession,
  mockUpdateReturnUrl,
  mockWorkspaceCreate,
} = vi.hoisted(() => ({
  mockFindWorkspaceById: vi.fn(async () => ({
    id: "ws-1",
    ownerId: "owner-1",
  })),
  mockGetCurrentUserId: vi.fn(
    async (): Promise<string | undefined> => "user-1",
  ),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
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
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    findById: mockFindWorkspaceById,
    create: mockWorkspaceCreate,
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({}))

vi.mock("@chatbotx.io/business/connect-session", () => ({
  connectSessionService: { updateReturnUrl: mockUpdateReturnUrl },
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { startSession: mockStartSession },
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
    })
    expect(mockUpdateReturnUrl).toHaveBeenCalledWith({
      id: "session-1",
      returnUrl: `${selectPath}?session=session-1`,
    })
  })

  test("creates a workspace first when there is no workspaceId yet (first channel ever)", async () => {
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId(null))).rejects.toThrow(
      "redirect:https://facebook.com/oauth-dialog",
    )

    expect(mockRequireWorkspacePermission).not.toHaveBeenCalled()
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      data: { name: "New Workspace", ownerId: "user-1" },
      createdBy: "user-1",
    })
    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-new" }),
    )
  })

  test("404s when the owner has no credential configured for the provider", async () => {
    mockResolveOAuthCredential.mockResolvedValue(null)
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "not found",
    )
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  test("404s when the caller is not signed in", async () => {
    mockGetCurrentUserId.mockResolvedValue(undefined)
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      "not found",
    )
    expect(mockResolveOAuthCredential).not.toHaveBeenCalled()
  })

  test("throws when startSession returns a non-open_url next action", async () => {
    mockStartSession.mockResolvedValue({
      session: { id: "session-1" },
      nextAction: { type: "show_qr", qr: "data:image/png;base64,..." },
    })
    const { GET } = await import(routePath)

    await expect(GET(requestWithWorkspaceId("ws-1"))).rejects.toThrow(
      `Unexpected connect next action for ${provider}`,
    )
  })
})
