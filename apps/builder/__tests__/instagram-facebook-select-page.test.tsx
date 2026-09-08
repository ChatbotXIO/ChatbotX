// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

type SelectFacebookAccountsElementProps = {
  workspaceId: string
  items: Array<{
    id: string
    name: string
    secondary?: string
    disabled?: boolean
    disabledReason?: string
  }>
}

const {
  mockFindConnectedIgIds,
  mockGetUserInstagramAccounts,
  mockReadPendingAuth,
  mockRedirect,
  mockSelectFacebookAccounts,
} = vi.hoisted(() => ({
  mockFindConnectedIgIds: vi.fn(),
  mockGetUserInstagramAccounts: vi.fn(),
  mockReadPendingAuth: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockSelectFacebookAccounts: vi.fn(
    (_props: { workspaceId: string; items: unknown[] }) => null,
  ),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  // Echoes the key back so assertions never depend on the English copy.
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: { findConnectedIgIds: mockFindConnectedIgIds },
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  getUserInstagramAccounts: mockGetUserInstagramAccounts,
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  readPendingAuth: mockReadPendingAuth,
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE:
    "fb_instagram_facebook_pending_auth",
}))

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))

vi.mock(
  "@/features/integration-instagram/components/select-facebook-accounts",
  () => ({
    SelectFacebookAccounts: mockSelectFacebookAccounts,
  }),
)

const { default: InstagramFacebookSelectPage } = await import(
  "../src/app/(no-sidebar)/channels/instagram-facebook/select/page"
)

const connectableAccount = {
  id: "ig-connectable",
  name: "Connectable Account",
  username: "connectable",
  profile_picture_url: "https://example.com/connectable.jpg",
  pageId: "page-connectable",
  pageAccessToken: "connectable-token",
}

const connectedAccount = {
  id: "ig-connected",
  name: "Connected Account",
  username: "connected",
  pageId: "page-connected",
  pageAccessToken: "connected-token",
}

describe("InstagramFacebookSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadPendingAuth.mockResolvedValue({
      userToken: "user-token",
      version: "v23.0",
      referer: "/channels/create",
      workspaceId: "ws-1",
      expiresAt: Date.now() + 600_000,
    })
    mockGetUserInstagramAccounts.mockResolvedValue([
      connectedAccount,
      connectableAccount,
    ])
    mockFindConnectedIgIds.mockResolvedValue(new Set(["ig-connected"]))
  })

  test("passes every account through as a picker item, ranked selectable first then already-connected, and never sends the page access token", async () => {
    const element = await InstagramFacebookSelectPage()
    renderToStaticMarkup(element)

    expect(mockSelectFacebookAccounts).toHaveBeenCalledTimes(1)
    const props = mockSelectFacebookAccounts.mock.calls[0]?.[0] as
      | SelectFacebookAccountsElementProps
      | undefined

    expect(props?.workspaceId).toBe("ws-1")
    expect(props?.items).toEqual([
      expect.objectContaining({
        id: "ig-connectable",
        name: "Connectable Account",
        secondary: "@connectable",
        disabled: false,
      }),
      expect.objectContaining({
        id: "ig-connected",
        name: "Connected Account",
        secondary: "@connected",
        disabled: true,
        disabledReason: "instagram.selectPage.alreadyConnectedNote",
      }),
    ])

    for (const item of props?.items ?? []) {
      expect(item).not.toHaveProperty("pageAccessToken")
    }
  })

  test("redirects to channel creation when the pending-auth cookie is missing or invalid", async () => {
    mockReadPendingAuth.mockResolvedValue(null)

    await expect(InstagramFacebookSelectPage()).rejects.toThrow(
      "redirect:/channels/create",
    )
    expect(mockGetUserInstagramAccounts).not.toHaveBeenCalled()
  })

  test("renders with zero items (no redirect) when the user has no Instagram business accounts — the picker shows its own empty state", async () => {
    mockGetUserInstagramAccounts.mockResolvedValue([])
    mockFindConnectedIgIds.mockResolvedValue(new Set<string>())

    const element = await InstagramFacebookSelectPage()
    renderToStaticMarkup(element)

    expect(mockRedirect).not.toHaveBeenCalled()
    const props = mockSelectFacebookAccounts.mock.calls[0]?.[0] as
      | SelectFacebookAccountsElementProps
      | undefined
    expect(props?.items).toEqual([])
  })
})
