// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockResolveGuardedWorkspaceId,
  mockNotFound,
  mockRedirect,
  mockListMessagingAdsToolIntegrations,
  mockListActiveMessagingAdsIntegrationIds,
  mockCheckMessagingAdsConnectionState,
  mockMessagingAdsToolView,
} = vi.hoisted(() => ({
  mockResolveGuardedWorkspaceId: vi.fn(async () => "ws-1"),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  mockRedirect: vi.fn(),
  mockListMessagingAdsToolIntegrations: vi.fn(),
  mockListActiveMessagingAdsIntegrationIds: vi.fn(),
  mockCheckMessagingAdsConnectionState: vi.fn(),
  mockMessagingAdsToolView: vi.fn(() => null),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  resolveGuardedWorkspaceId: mockResolveGuardedWorkspaceId,
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@/features/ads-campaign/queries/tool-integrations", () => ({
  listMessagingAdsToolIntegrations: mockListMessagingAdsToolIntegrations,
}))

vi.mock("@/features/ads-campaign/queries/tool-active-integration-ids", () => ({
  listActiveMessagingAdsIntegrationIds:
    mockListActiveMessagingAdsIntegrationIds,
}))

vi.mock("@/features/ads-campaign/queries", () => ({
  checkMessagingAdsConnectionState: mockCheckMessagingAdsConnectionState,
}))

vi.mock("@/features/ads-campaign/components/messaging-ads-tool-view", () => ({
  MessagingAdsToolView: mockMessagingAdsToolView,
}))

const { default: MessagingAdsToolChannelPage } = await import(
  "../src/app/space/[workspaceId]/messaging-ads/[channel]/page"
)
const { default: MessagingAdsToolRedirectPage } = await import(
  "../src/app/space/[workspaceId]/messaging-ads/page"
)

const INTEGRATION_A = { id: "a", name: "Integration A" }
const INTEGRATION_B = { id: "b", name: "Integration B" }

describe("Click to Message Ads tool [channel] page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveGuardedWorkspaceId.mockResolvedValue("ws-1")
    mockListMessagingAdsToolIntegrations.mockResolvedValue({
      integrations: [INTEGRATION_A, INTEGRATION_B],
      hasUnsupportedIntegrations: false,
    })
    mockListActiveMessagingAdsIntegrationIds.mockResolvedValue([
      INTEGRATION_B.id,
    ])
    mockCheckMessagingAdsConnectionState.mockResolvedValue({
      connected: true,
      reconnectNeeded: false,
    })
  })

  test("guards the workspace as superAdmin before any query runs, and propagates a denial", async () => {
    mockResolveGuardedWorkspaceId.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND")
    })

    await expect(
      MessagingAdsToolChannelPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(mockResolveGuardedWorkspaceId).toHaveBeenCalledWith(
      expect.any(Promise),
      "superAdmin",
    )
    expect(mockListMessagingAdsToolIntegrations).not.toHaveBeenCalled()
    expect(mockListActiveMessagingAdsIntegrationIds).not.toHaveBeenCalled()
    expect(mockCheckMessagingAdsConnectionState).not.toHaveBeenCalled()
  })

  test("404s for a channel that is not ads-eligible", async () => {
    await expect(
      MessagingAdsToolChannelPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "tiktok" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(mockNotFound).toHaveBeenCalled()
    expect(mockListMessagingAdsToolIntegrations).not.toHaveBeenCalled()
    expect(mockListActiveMessagingAdsIntegrationIds).not.toHaveBeenCalled()
  })

  test("404s for an empty channel segment", async () => {
    await expect(
      MessagingAdsToolChannelPage({
        params: Promise.resolve({ workspaceId: "ws-1", channel: "" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(mockNotFound).toHaveBeenCalled()
    expect(mockListMessagingAdsToolIntegrations).not.toHaveBeenCalled()
  })

  test("fetches integrations scoped to the channel and selects the active one when no ?integration= is given", async () => {
    const element = await MessagingAdsToolChannelPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
      searchParams: Promise.resolve({}),
    })
    renderToStaticMarkup(element)

    expect(mockListMessagingAdsToolIntegrations).toHaveBeenCalledTimes(1)
    expect(mockListMessagingAdsToolIntegrations).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })
    expect(mockListActiveMessagingAdsIntegrationIds).toHaveBeenCalledTimes(1)
    expect(mockListActiveMessagingAdsIntegrationIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })
    expect(mockCheckMessagingAdsConnectionState).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationId: "b",
    })
    expect(mockMessagingAdsToolView).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedIntegration: expect.objectContaining({ id: "b" }),
        initialConnectionState: { connected: true, reconnectNeeded: false },
      }),
      undefined,
    )
  })

  test("selects the requested integration when ?integration= names one still in the list", async () => {
    const element = await MessagingAdsToolChannelPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
      searchParams: Promise.resolve({ integration: "a" }),
    })
    renderToStaticMarkup(element)

    expect(mockCheckMessagingAdsConnectionState).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationId: "a",
    })
    expect(mockMessagingAdsToolView).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedIntegration: expect.objectContaining({ id: "a" }),
      }),
      undefined,
    )
  })

  test("falls back to the active integration when ?integration= names an unknown id", async () => {
    const element = await MessagingAdsToolChannelPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
      searchParams: Promise.resolve({ integration: "zzz" }),
    })
    renderToStaticMarkup(element)

    expect(mockMessagingAdsToolView).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedIntegration: expect.objectContaining({ id: "b" }),
      }),
      undefined,
    )
  })

  test("falls back to the first integration when ?integration= is unknown and none are active", async () => {
    mockListActiveMessagingAdsIntegrationIds.mockResolvedValue([])

    const element = await MessagingAdsToolChannelPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
      searchParams: Promise.resolve({ integration: "zzz" }),
    })
    renderToStaticMarkup(element)

    expect(mockMessagingAdsToolView).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedIntegration: expect.objectContaining({ id: "a" }),
      }),
      undefined,
    )
  })

  test("skips the connection-state query and passes null selection when the channel has zero integrations", async () => {
    mockListMessagingAdsToolIntegrations.mockResolvedValue({
      integrations: [],
      hasUnsupportedIntegrations: true,
    })
    mockListActiveMessagingAdsIntegrationIds.mockResolvedValue([])

    const element = await MessagingAdsToolChannelPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "instagram" }),
      searchParams: Promise.resolve({}),
    })
    renderToStaticMarkup(element)

    expect(mockCheckMessagingAdsConnectionState).not.toHaveBeenCalled()
    expect(mockMessagingAdsToolView).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedIntegration: null,
        initialConnectionState: null,
        hasUnsupportedIntegrations: true,
      }),
      undefined,
    )
  })

  test("renders a breadcrumb from Tools to the Click to Message Ads title", async () => {
    const element = await MessagingAdsToolChannelPage({
      params: Promise.resolve({ workspaceId: "ws-1", channel: "whatsapp" }),
      searchParams: Promise.resolve({}),
    })

    const breadcrumbItems = (
      element as unknown as {
        props: { children: Array<{ props: { items: unknown } }> }
      }
    ).props.children[0].props.items

    expect(breadcrumbItems).toEqual([
      { label: "tools.title", href: "/space/ws-1/tools" },
      { label: "clickToMessageAds.title", href: "" },
    ])
  })
})

describe("Click to Message Ads channel-less redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("redirects to the default whatsapp channel with no search params", async () => {
    await MessagingAdsToolRedirectPage({
      params: Promise.resolve({ workspaceId: "ws1" }),
      searchParams: Promise.resolve({}),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws1/messaging-ads/whatsapp",
    )
  })

  test("honors a valid ?channel= and forwards the full query string", async () => {
    await MessagingAdsToolRedirectPage({
      params: Promise.resolve({ workspaceId: "ws1" }),
      searchParams: Promise.resolve({ channel: "messenger", foo: "1" }),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws1/messaging-ads/messenger?channel=messenger&foo=1",
    )
  })

  test("falls back to the default channel for an unrecognized ?channel=", async () => {
    await MessagingAdsToolRedirectPage({
      params: Promise.resolve({ workspaceId: "ws1" }),
      searchParams: Promise.resolve({ channel: "bogus" }),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws1/messaging-ads/whatsapp?channel=bogus",
    )
  })
})
