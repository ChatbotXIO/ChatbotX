// @vitest-environment node

import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindConnectedMessengerPageIds,
  mockGetUserPages,
  mockReadPendingAuth,
  mockRedirect,
  mockSelectPage,
} = vi.hoisted(() => ({
  mockFindConnectedMessengerPageIds: vi.fn(),
  mockGetUserPages: vi.fn(),
  mockReadPendingAuth: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockSelectPage: vi.fn(() => null),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  // Echoes the key back so assertions never depend on the English copy.
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findConnectedPageIds: mockFindConnectedMessengerPageIds,
  },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  getUserPages: mockGetUserPages,
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  readPendingAuth: mockReadPendingAuth,
  FB_MESSENGER_PENDING_AUTH_COOKIE: "fb_messenger_pending_auth",
}))

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))

vi.mock("@/features/integration-messenger/components/select-account", () => ({
  SelectPage: mockSelectPage,
}))

const { default: MessengerSelectPage } = await import(
  "../src/app/(no-sidebar)/channels/messenger/select/page"
)

type SelectPageElementProps = {
  items: Array<{
    id: string
    isAlreadyConnected: boolean
    isConnectable: boolean
    disabled?: boolean
    disabledReason?: string
    secondary?: string
  }>
}

const connectablePage: ConnectableFacebookPage = {
  id: "page-connectable",
  name: "Connectable Page",
  access_token: "connectable-token",
  isConnectable: true,
}

const notAdminPage: ConnectableFacebookPage = {
  id: "page-not-admin",
  name: "Not Admin Page",
  access_token: "not-admin-token",
  isConnectable: false,
}

const alreadyConnectedPage: ConnectableFacebookPage = {
  id: "page-connected",
  name: "Connected Page",
  access_token: "connected-token",
  isConnectable: false,
}

// Meta can report a page as both connect-eligible and already connected
// elsewhere (e.g. reconnected under a different workspace) — this must still
// rank last and be treated as disabled, exactly like any other
// already-connected page.
const connectableAndConnectedPage: ConnectableFacebookPage = {
  id: "page-connectable-and-connected",
  name: "Connectable But Connected Page",
  access_token: "connectable-and-connected-token",
  isConnectable: true,
}

describe("MessengerSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadPendingAuth.mockResolvedValue({
      userToken: "user-token",
      version: "v23.0",
      referer: "/channels/create",
      workspaceId: "ws-1",
    })
    mockGetUserPages.mockResolvedValue({
      pages: [
        notAdminPage,
        alreadyConnectedPage,
        connectablePage,
        connectableAndConnectedPage,
      ],
      bmLookupFailed: false,
    })
    mockFindConnectedMessengerPageIds.mockResolvedValue(
      new Set(["page-connected", "page-connectable-and-connected"]),
    )
  })

  test("passes every page through as a picker item, ranked connectable first, then non-admin, then already-connected", async () => {
    const element = await MessengerSelectPage()

    expect(isValidElement<SelectPageElementProps>(element)).toBe(true)
    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(element.props.items).toEqual([
      expect.objectContaining({
        id: "page-connectable",
        isConnectable: true,
        isAlreadyConnected: false,
        disabled: false,
      }),
      expect.objectContaining({
        id: "page-not-admin",
        isConnectable: false,
        isAlreadyConnected: false,
        disabled: true,
        disabledReason: "messenger.selectPage.notAdminNote",
      }),
      expect.objectContaining({
        id: "page-connected",
        isConnectable: false,
        isAlreadyConnected: true,
        disabled: true,
        disabledReason: "messenger.selectPage.alreadyConnectedNote",
      }),
      expect.objectContaining({
        id: "page-connectable-and-connected",
        isConnectable: true,
        isAlreadyConnected: true,
        disabled: true,
        disabledReason: "messenger.selectPage.alreadyConnectedNote",
      }),
    ])
  })

  test("never sends access_token to the client for any page", async () => {
    const element = await MessengerSelectPage()

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    for (const item of element.props.items) {
      expect(item).not.toHaveProperty("access_token")
    }
  })

  test("uses the page id as the secondary line", async () => {
    const element = await MessengerSelectPage()

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    const connectable = element.props.items.find(
      (item) => item.id === "page-connectable",
    )
    expect(connectable?.secondary).toBe("page-connectable")
  })

  test("redirects to channel creation when the pending-auth cookie is missing or invalid", async () => {
    mockReadPendingAuth.mockResolvedValue(null)

    await expect(MessengerSelectPage()).rejects.toThrow(
      "redirect:/channels/create",
    )
    expect(mockGetUserPages).not.toHaveBeenCalled()
  })
})
