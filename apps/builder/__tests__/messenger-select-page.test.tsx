// @vitest-environment node

import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindConnectedMessengerPageIds,
  mockGetUserPages,
  mockLoggerError,
  mockMapToChannelError,
  mockReadPendingAuth,
  mockRedirect,
  mockSelectPage,
} = vi.hoisted(() => ({
  mockFindConnectedMessengerPageIds: vi.fn(),
  mockGetUserPages: vi.fn(),
  mockLoggerError: vi.fn(),
  mockMapToChannelError: vi.fn(),
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
  mapToChannelError: mockMapToChannelError,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError },
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
  loadError?: { providerMessage?: string }
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

  // Meta answers `/me/accounts` with `{"error":{"code":1,"message":"Please
  // reduce the amount of data you're asking for…"}}` for some users. That
  // must render the picker's empty state with the provider's reason, not
  // the route-level "Something went wrong" boundary.
  test("renders an empty picker with the channel error message when Graph fails to list pages", async () => {
    const graphError = new Error("graph exploded")
    mockGetUserPages.mockRejectedValue(graphError)
    mockMapToChannelError.mockReturnValue({
      message: "(#1) Please reduce the amount of data you're asking for",
      code: 1,
      category: "unknown",
    })

    const element = await MessengerSelectPage()

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(mockMapToChannelError).toHaveBeenCalledWith(graphError)
    expect(element.props.items).toEqual([])
    expect(element.props.loadError).toEqual({
      providerMessage:
        "(#1) Please reduce the amount of data you're asking for",
    })
    expect(mockFindConnectedMessengerPageIds).not.toHaveBeenCalled()
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: graphError }),
      expect.any(String),
    )
  })

  // No Graph body to quote (timeout, DNS, malformed JSON): the mapper reports
  // UNKNOWN_ERROR's -1 code, so the UI must fall back to its own copy rather
  // than surface "Unknown error." or a raw network message as Meta's words.
  test("omits providerMessage when the failure carries no Graph error code", async () => {
    mockGetUserPages.mockRejectedValue(new Error("fetch failed"))
    mockMapToChannelError.mockReturnValue({
      message: "fetch failed",
      code: -1,
      category: "unknown",
    })

    const element = await MessengerSelectPage()

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(element.props.items).toEqual([])
    expect(element.props.loadError).toEqual({ providerMessage: undefined })
  })

  test("passes no loadError when Graph lists pages successfully", async () => {
    const element = await MessengerSelectPage()

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(element.props.loadError).toBeUndefined()
  })

  test("redirects to channel creation when the pending-auth cookie is missing or invalid", async () => {
    mockReadPendingAuth.mockResolvedValue(null)

    await expect(MessengerSelectPage()).rejects.toThrow(
      "redirect:/channels/create",
    )
    expect(mockGetUserPages).not.toHaveBeenCalled()
  })
})
