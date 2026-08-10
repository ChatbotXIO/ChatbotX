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
  }>
}

const connectablePage: ConnectableFacebookPage = {
  id: "page-connectable",
  name: "Connectable Page",
  access_token: "page-token",
  isConnectable: true,
}

const connectedWithoutPermissionPage: ConnectableFacebookPage = {
  id: "page-connected",
  name: "Connected Page",
  isConnectable: false,
}

const unavailablePage: ConnectableFacebookPage = {
  id: "page-unavailable",
  name: "Unavailable Page",
  isConnectable: false,
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
      pages: [unavailablePage, connectedWithoutPermissionPage, connectablePage],
      bmLookupFailed: false,
    })
    mockFindConnectedMessengerPageIds.mockResolvedValue(["page-connected"])
  })

  test("passes only connectable or already-connected pages to the picker", async () => {
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
        id: "page-connected",
        isAlreadyConnected: true,
      }),
    ])
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
