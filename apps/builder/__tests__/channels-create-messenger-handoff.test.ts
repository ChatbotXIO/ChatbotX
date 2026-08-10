// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetCurrentUserId, mockRedirect, mockResolveForOwner } = vi.hoisted(
  () => ({
    mockGetCurrentUserId: vi.fn(async () => "user-1"),
    mockRedirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`)
    }),
    mockResolveForOwner: vi.fn(),
  }),
)

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
  redirect: mockRedirect,
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: mockResolveForOwner },
  tenantService: {
    resolveVisibleChannels: vi.fn(async () => [
      "instagram",
      "messenger",
      "smtp",
      "telegram",
      "tiktok",
      "webchat",
      "whatsapp",
      "zalo",
    ]),
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: vi.fn(async () => "owner-1"),
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

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: vi.fn(async () => undefined),
}))

vi.mock("@/lib/auth/utils", () => ({ getCurrentUserId: mockGetCurrentUserId }))

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

const { default: CreateChannelPage } = await import(
  "../src/app/(no-sidebar)/channels/create/page"
)

describe("channels/create — hands the messenger channel off to the reuse-check route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockResolveForOwner.mockImplementation(({ type }: { type: string }) =>
      Promise.resolve(
        type === "messenger" ? { config: {}, publicConfig: {} } : undefined,
      ),
    )
  })

  test("redirects to the reuse-check route, carrying the workspaceId", async () => {
    await expect(
      CreateChannelPage({
        searchParams: Promise.resolve({
          channel: "messenger",
          workspaceId: "ws-1",
        }),
      }),
    ).rejects.toThrow("redirect:/channels/create/messenger?workspaceId=ws-1")
  })

  test("redirects without a query string when there is no workspace yet", async () => {
    await expect(
      CreateChannelPage({
        searchParams: Promise.resolve({
          channel: "messenger",
          workspaceId: null,
        }),
      }),
    ).rejects.toThrow("redirect:/channels/create/messenger")
  })
})
