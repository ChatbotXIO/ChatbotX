// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockList, mockResolveForOwner, mockResolveChannelPolicy } = vi.hoisted(
  () => ({
    mockList: vi.fn(),
    mockResolveForOwner: vi.fn(
      async (): Promise<
        { config: Record<string, unknown>; userId: string | null } | undefined
      > => undefined,
    ),
    mockResolveChannelPolicy: vi.fn(async () => ({
      ownerId: "owner-1",
      visibleChannels: ["zalo"],
    })),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: { list: mockList },
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
}))

vi.mock("@chatbotx.io/connections", () => ({
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

const connectionRow = (provider: string) => ({ provider })

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveChannelPolicy.mockResolvedValue({
    ownerId: "owner-1",
    visibleChannels: ["zalo"],
  })
  mockResolveForOwner.mockResolvedValue({ config: {}, userId: null })
})

describe("resolveAlreadyConnectedProviders (via listConnectionProviderResources)", () => {
  test("only requests non-disconnected statuses — a disconnected-only provider must not block a fresh connect (regression: previously had no status filter at all)", async () => {
    mockList.mockResolvedValue({ data: [] })

    const resources = await listConnectionProviderResources({
      workspaceId: "ws-1",
    })

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        status: expect.arrayContaining([
          "connected",
          "degraded",
          "needs_reauth",
          "paused",
        ]),
      }),
    )
    const callArgs = mockList.mock.calls[0]?.[0] as
      | { status?: string[] }
      | undefined
    expect(callArgs?.status).not.toContain("disconnected")

    const zalo = resources.find((r) => r.provider === "zalo")
    expect(zalo?.available).toBe(true)
    expect(zalo?.unavailableReason).toBeNull()
  })

  test("finds a provider connected only on a page past the 50-row cap (regression: previously only the first page was ever read)", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      connectionRow(`other-${i}`),
    )
    mockList
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: [connectionRow("zalo")] })

    const resources = await listConnectionProviderResources({
      workspaceId: "ws-1",
    })

    expect(mockList).toHaveBeenCalledTimes(2)
    expect(mockList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ page: 1 }),
    )
    expect(mockList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2 }),
    )

    const zalo = resources.find((r) => r.provider === "zalo")
    expect(zalo?.available).toBe(false)
    expect(zalo?.unavailableReason).toBe("alreadyConnected")
  })

  test("stops paginating once a short page is returned", async () => {
    mockList.mockResolvedValueOnce({ data: [connectionRow("zalo")] })

    await listConnectionProviderResources({ workspaceId: "ws-1" })

    expect(mockList).toHaveBeenCalledTimes(1)
  })
})
