// @vitest-environment node

import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCookies,
  mockDecryptAuth,
  mockFindConnectedMessengerPageIds,
  mockGetUserPages,
  mockRedirect,
  mockSelectPage,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockDecryptAuth: vi.fn(),
  mockFindConnectedMessengerPageIds: vi.fn(),
  mockGetUserPages: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockSelectPage: vi.fn(() => null),
}))

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
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
  decryptAuth: mockDecryptAuth,
  FB_MESSENGER_PENDING_AUTH_COOKIE: "fb_messenger_pending_auth",
}))

vi.mock("@/features/integration-messenger/components/select-account", () => ({
  SelectPage: mockSelectPage,
}))

const { default: MessengerSelectPage } = await import(
  "../src/app/(no-sidebar)/channels/messenger/select/page"
)

type SelectPageElementProps = {
  pages: Array<{
    id: string
    isAlreadyConnected: boolean
    access_token?: string
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
// rank last and lose its token, exactly like any other already-connected page.
const connectableAndConnectedPage: ConnectableFacebookPage = {
  id: "page-connectable-and-connected",
  name: "Connectable But Connected Page",
  access_token: "connectable-and-connected-token",
  isConnectable: true,
}

describe("MessengerSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "encrypted-auth" })),
    })
    mockDecryptAuth.mockResolvedValue({
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
    mockFindConnectedMessengerPageIds.mockResolvedValue([
      "page-connected",
      "page-connectable-and-connected",
    ])
  })

  test("passes every page through, ranked connectable first, then non-admin, then already-connected", async () => {
    const element = await MessengerSelectPage()

    expect(isValidElement<SelectPageElementProps>(element)).toBe(true)
    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(element.props.pages).toEqual([
      expect.objectContaining({
        id: "page-connectable",
        isAlreadyConnected: false,
      }),
      expect.objectContaining({
        id: "page-not-admin",
        isAlreadyConnected: false,
      }),
      expect.objectContaining({
        id: "page-connected",
        isAlreadyConnected: true,
      }),
      expect.objectContaining({
        id: "page-connectable-and-connected",
        isAlreadyConnected: true,
      }),
    ])
  })

  test("strips access_token from every non-selectable page and keeps it on selectable ones", async () => {
    const element = await MessengerSelectPage()

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    const tokensById = new Map(
      element.props.pages.map((page) => [page.id, page.access_token]),
    )

    expect(tokensById.get("page-connectable")).toBe("connectable-token")
    expect(tokensById.get("page-not-admin")).toBeUndefined()
    expect(tokensById.get("page-connected")).toBeUndefined()
    expect(tokensById.get("page-connectable-and-connected")).toBeUndefined()
  })

  test("redirects to channel creation when pending auth is missing", async () => {
    mockCookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    })
    mockDecryptAuth.mockResolvedValue(null)

    await expect(MessengerSelectPage()).rejects.toThrow(
      "redirect:/channels/create",
    )
  })
})
