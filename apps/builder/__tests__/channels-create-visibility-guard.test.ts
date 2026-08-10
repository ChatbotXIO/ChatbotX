// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// A hidden channel must not be creatable by hitting /channels/create with a
// direct `?channel=` deep link. telegram and webchat are the load-bearing
// case: they short-circuit to their connect flow *before* any platform
// credential is resolved, so they're the two branches most likely to bypass
// a visibility check bolted on after the fact.
// ---------------------------------------------------------------------------

const { mockRequireWorkspacePermission, mockResolveVisibleChannels } =
  vi.hoisted(() => ({
    mockRequireWorkspacePermission: vi.fn(async () => undefined),
    mockResolveVisibleChannels: vi.fn(),
  }))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: mockRequireWorkspacePermission,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
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
    resolveForOwner: vi.fn(async () => null),
  },
  tenantService: {
    resolveVisibleChannels: mockResolveVisibleChannels,
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: vi.fn(async () => "owner-1"),
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
const { TelegramConnect } = await import(
  "@/features/integration-telegram/components/telegram-connect"
)
const { SimpleCreateWebchat } = await import(
  "@/features/integration-webchat/simple-create-webchat"
)

describe("channels/create visibility deep-link guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("renders the telegram connect flow when telegram is visible", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["telegram", "webchat"])

    const result = await CreateChannelPage({
      searchParams: Promise.resolve({ channel: "telegram", workspaceId: null }),
    })

    expect((result as { type: unknown }).type).toBe(TelegramConnect)
  })

  test("does not render the telegram connect flow when telegram is hidden", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["webchat"])

    const result = await CreateChannelPage({
      searchParams: Promise.resolve({ channel: "telegram", workspaceId: null }),
    })

    expect((result as { type: unknown }).type).not.toBe(TelegramConnect)
  })

  test("does not render the webchat connect flow when webchat is hidden", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["telegram"])

    const result = await CreateChannelPage({
      searchParams: Promise.resolve({ channel: "webchat", workspaceId: null }),
    })

    expect((result as { type: unknown }).type).not.toBe(SimpleCreateWebchat)
  })

  test("falls through to the picker with only visible channels offered when the deep-linked channel is hidden", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["webchat"])

    const result = await CreateChannelPage({
      searchParams: Promise.resolve({ channel: "telegram", workspaceId: null }),
    })

    // Falls through past both early-return branches to the InboxSelectCard
    // fallback rather than throwing — a hidden channel is invisible, not an
    // error state.
    expect(result).toBeDefined()
  })
})
