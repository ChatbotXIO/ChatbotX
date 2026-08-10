// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `/channels/create` fans the resolved platform owner out to six
// `resolveForOwner` calls plus `resolveVisibleChannels` (page.tsx:57,68-93).
// Whatever `resolvePlatformOwnerId` returns must reach every one of them —
// a hand edit that updates five of six call sites and misses one would
// silently pick the wrong OAuth app for that single channel.
// ---------------------------------------------------------------------------

const {
  mockResolveForOwner,
  mockResolvePlatformOwnerId,
  mockResolveVisibleChannels,
} = vi.hoisted(() => ({
  mockResolveForOwner: vi.fn(
    async (_props: { ownerId: string; type: string }) => null,
  ),
  mockResolvePlatformOwnerId: vi.fn(async () => "resolved-owner-1"),
  mockResolveVisibleChannels: vi.fn(async () => [] as string[]),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: vi.fn(async () => undefined),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: mockResolvePlatformOwnerId,
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: {
    resolveForOwner: mockResolveForOwner,
  },
  tenantService: {
    resolveVisibleChannels: mockResolveVisibleChannels,
  },
}))

vi.mock("@/features/inboxes/components/inbox-select-card", () => ({
  default: () => null,
}))
vi.mock(
  "@/features/integration-instagram/components/instagram-login-select",
  () => ({ InstagramLoginSelect: () => null }),
)
vi.mock("@/features/integration-instagram/libs/oauth", () => ({
  generateInstagramRedirectUri: vi.fn(async () => ""),
}))
vi.mock("@/features/integration-instagram/libs/oauth-facebook", () => ({
  generateInstagramFacebookRedirectUri: vi.fn(async () => ""),
}))
vi.mock("@/features/integration-telegram/components/telegram-connect", () => ({
  TelegramConnect: () => null,
}))
vi.mock("@/features/integration-tiktok/libs/tiktok", () => ({
  generateTiktokRedirectUri: vi.fn(async () => ""),
}))
vi.mock("@/features/integration-webchat/simple-create-webchat", () => ({
  SimpleCreateWebchat: () => null,
}))
vi.mock("@/features/integration-whatsapp/components/whatsapp-create", () => ({
  default: () => null,
}))
vi.mock("@/features/integration-zalo/libs/zalo", () => ({
  generateZaloRedirectUri: vi.fn(async () => ""),
}))

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

const { default: CreateChannelPage } = await import(
  "../src/app/(no-sidebar)/channels/create/page"
)

describe("channels/create — platform owner fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolvePlatformOwnerId.mockResolvedValue("resolved-owner-1")
  })

  test("forwards userId and workspaceId from the request into the resolver", async () => {
    await CreateChannelPage({
      searchParams: Promise.resolve({
        channel: undefined,
        workspaceId: "ws-1",
      }),
    })

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "ws-1",
    })
  })

  test("forwards a null workspaceId for the no-workspace-yet flow", async () => {
    await CreateChannelPage({
      searchParams: Promise.resolve({
        channel: undefined,
        workspaceId: null,
      }),
    })

    expect(mockResolvePlatformOwnerId).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: null,
    })
  })

  test("the resolved owner reaches every resolveForOwner call and resolveVisibleChannels", async () => {
    await CreateChannelPage({
      searchParams: Promise.resolve({
        channel: undefined,
        workspaceId: "ws-1",
      }),
    })

    expect(mockResolveVisibleChannels).toHaveBeenCalledWith("resolved-owner-1")

    const requestedTypes = mockResolveForOwner.mock.calls.map(
      ([props]) => props.type,
    )
    expect(requestedTypes.sort()).toEqual(
      [
        "instagram",
        "instagramFacebook",
        "messenger",
        "tiktok",
        "whatsapp",
        "zalo",
      ].sort(),
    )
    for (const [props] of mockResolveForOwner.mock.calls) {
      expect(props.ownerId).toBe("resolved-owner-1")
    }
  })
})
