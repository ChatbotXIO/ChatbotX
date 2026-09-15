// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

type SelectFacebookAccountsElementProps = {
  items: Array<{
    disabled?: boolean
    disabledReason?: string
    id: string
    name: string
    secondary?: string
  }>
  sessionId: string
  workspaceId: string
}

const {
  mockGetCurrentUserId,
  mockRedirect,
  mockResolveConnectSession,
  mockSelectFacebookAccounts,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockResolveConnectSession: vi.fn(),
  mockSelectFacebookAccounts: vi.fn(
    (_props: { items: unknown[]; sessionId: string; workspaceId: string }) =>
      null,
  ),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  // Echoes the key back so assertions never depend on the English copy.
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mockGetCurrentUserId,
}))

vi.mock("@/features/channel-connect/lib/resolve-connect-session", () => ({
  resolveConnectSession: mockResolveConnectSession,
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

const pageArgs = {
  searchParams: Promise.resolve({ session: "session-1" }),
}

const connectableTarget = {
  avatarUrl: "https://example.com/connectable.jpg",
  id: "ig-connectable",
  name: "Connectable Account",
  selectable: true,
}

const connectedTarget = {
  id: "ig-connected",
  name: "Connected Account",
  alreadyConnected: "other_workspace" as const,
  selectable: false,
}

describe("InstagramFacebookSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockResolveConnectSession.mockResolvedValue({
      session: {
        targets: [connectedTarget, connectableTarget],
      },
      workspace: { id: "ws-1" },
    })
  })

  test("passes every session target through as a picker item, ranked selectable first then already-connected", async () => {
    const element = await InstagramFacebookSelectPage(pageArgs)
    renderToStaticMarkup(element)

    expect(mockResolveConnectSession).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      credentialType: "instagramFacebook",
      brandingChannel: "instagram",
    })
    expect(mockSelectFacebookAccounts).toHaveBeenCalledTimes(1)
    const props = mockSelectFacebookAccounts.mock.calls[0]?.[0] as
      | SelectFacebookAccountsElementProps
      | undefined

    expect(props?.sessionId).toBe("session-1")
    expect(props?.workspaceId).toBe("ws-1")
    expect(props?.items).toEqual([
      expect.objectContaining({
        id: "ig-connectable",
        name: "Connectable Account",
        secondary: "ig-connectable",
        disabled: false,
      }),
      expect.objectContaining({
        id: "ig-connected",
        name: "Connected Account",
        secondary: "ig-connected",
        disabled: true,
        disabledReason: "instagram.selectPage.alreadyConnectedNote",
      }),
    ])
  })

  test("redirects to channel creation when the session id is missing", async () => {
    await expect(
      InstagramFacebookSelectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/channels/create")

    expect(mockGetCurrentUserId).not.toHaveBeenCalled()
    expect(mockResolveConnectSession).not.toHaveBeenCalled()
  })

  test("redirects to channel creation when the user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    await expect(InstagramFacebookSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create",
    )

    expect(mockResolveConnectSession).not.toHaveBeenCalled()
  })

  test("renders with zero items when the session has no Instagram business accounts", async () => {
    mockResolveConnectSession.mockResolvedValue({
      session: { targets: [] },
      workspace: { id: "ws-1" },
    })

    const element = await InstagramFacebookSelectPage(pageArgs)
    renderToStaticMarkup(element)

    expect(mockRedirect).not.toHaveBeenCalled()
    const props = mockSelectFacebookAccounts.mock.calls[0]?.[0] as
      | SelectFacebookAccountsElementProps
      | undefined
    expect(props?.items).toEqual([])
  })
})
