// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Unlike /channels/create, /space/[workspaceId]/webchats/create used to check
// only workspace permission — it had no channel-visibility guard at all, so
// a workspace with webchat hidden by policy could still create one by
// navigating to this route directly, even though its Add button in settings
// is disabled. This pins the server-side fix.
// ---------------------------------------------------------------------------

const { mockRequireWorkspacePermission, mockResolveVisibleChannels } =
  vi.hoisted(() => ({
    mockRequireWorkspacePermission: vi.fn(async () => undefined),
    mockResolveVisibleChannels: vi.fn(),
  }))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: mockRequireWorkspacePermission,
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    distinctConnectedChannels: vi.fn(async () => []),
  },
  tenantService: {
    resolveVisibleChannels: mockResolveVisibleChannels,
  },
  workspaceService: {
    find: vi.fn(async () => ({ id: "ws-1", ownerId: "owner-1" })),
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(async () => "owner-1"),
}))

vi.mock("@/features/flows/provider/flow-store-context", () => ({
  FlowStoreProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock(
  "@/features/integration-webchat/components/create-webchat-form",
  () => ({
    CreateWebchatForm: () => null,
  }),
)

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    getIdFromParams: (
      params: Record<string, string | null | undefined>,
      key: string,
    ) => params[key] ?? null,
  }
})

const { default: CreateWebchatPage } = await import(
  "../src/app/space/[workspaceId]/webchats/create/page"
)

describe("webchats/create visibility guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("404s when webchat is hidden by policy, even with workspace permission", async () => {
    mockResolveVisibleChannels.mockResolvedValue([])

    await expect(
      CreateWebchatPage({ params: Promise.resolve({ workspaceId: "ws-1" }) }),
    ).rejects.toThrow("not found")

    expect(mockRequireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "superAdmin",
    )
  })

  test("renders the create form when webchat is visible", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["webchat"])

    const result = await CreateWebchatPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    expect(result).toBeDefined()
  })
})
