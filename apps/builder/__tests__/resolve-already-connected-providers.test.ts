// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockListProvidersWithStatus,
  mockResolveForOwner,
  mockResolveChannelPolicy,
} = vi.hoisted(() => ({
  mockListProvidersWithStatus: vi.fn(),
  mockResolveForOwner: vi.fn(
    async (): Promise<
      { config: Record<string, unknown>; userId: string | null } | undefined
    > => undefined,
  ),
  mockResolveChannelPolicy: vi.fn(async () => ({
    ownerId: "owner-1",
    visibleChannels: ["zalo"],
  })),
}))

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    listProvidersWithStatus: mockListProvidersWithStatus,
  },
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
}))

vi.mock("@chatbotx.io/connections", () => ({
  isCredentialStrategy: (strategy: string) =>
    strategy === "token" || strategy === "api_key" || strategy === "self_serve",
  toChannelType: (provider: string) =>
    provider === "instagramFacebook" ? "instagram" : provider,
  CONNECTION_REGISTRY: {
    zalo: {
      credentialType: "zalo",
      provider: {
        kind: "channel",
        strategy: "oauth_redirect",
        multiAccount: false,
        configFields: [],
      },
    },
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () =>
    Object.assign((key: string) => key, { has: () => false }),
  ),
}))

vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: mockResolveChannelPolicy,
}))

const { listConnectionProviderResources } = await import(
  "../src/features/connections/lib/resolve-provider"
)

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveChannelPolicy.mockResolvedValue({
    ownerId: "owner-1",
    visibleChannels: ["zalo"],
  })
  mockResolveForOwner.mockResolvedValue({ config: {}, userId: null })
})

describe("resolveAlreadyConnectedProviders (via listConnectionProviderResources)", () => {
  test("queries only non-disconnected statuses — a disconnected-only provider must not block a fresh connect", async () => {
    mockListProvidersWithStatus.mockResolvedValue([])

    const resources = await listConnectionProviderResources({
      workspaceId: "ws-1",
    })

    expect(mockListProvidersWithStatus).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      statuses: expect.arrayContaining([
        "connected",
        "degraded",
        "needs_reauth",
        "paused",
      ]),
    })
    const callArgs = mockListProvidersWithStatus.mock.calls[0]?.[0] as
      | { statuses?: string[] }
      | undefined
    expect(callArgs?.statuses).not.toContain("disconnected")

    const zalo = resources.find((r) => r.provider === "zalo")
    expect(zalo?.available).toBe(true)
    expect(zalo?.unavailableReason).toBeNull()
  })

  test("marks a provider unavailable when it comes back from the distinct-provider query, in a single call regardless of row count", async () => {
    mockListProvidersWithStatus.mockResolvedValue(["zalo"])

    const resources = await listConnectionProviderResources({
      workspaceId: "ws-1",
    })

    expect(mockListProvidersWithStatus).toHaveBeenCalledTimes(1)

    const zalo = resources.find((r) => r.provider === "zalo")
    expect(zalo?.available).toBe(false)
    expect(zalo?.unavailableReason).toBe("alreadyConnected")
  })
})
