// @vitest-environment node

import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockGetCurrentUserId,
  mockRedirect,
  mockResolveConnectSession,
  mockSelectPage,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockResolveConnectSession: vi.fn(),
  mockSelectPage: vi.fn(() => null),
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

vi.mock("@/features/integration-messenger/components/select-account", () => ({
  SelectPage: mockSelectPage,
}))

const { default: MessengerSelectPage } = await import(
  "../src/app/(no-sidebar)/channels/messenger/select/page"
)

type SelectPageElementProps = {
  bmLookupFailed: boolean
  items: Array<{
    id: string
    isAlreadyConnected: boolean
    isConnectable: boolean
    disabled?: boolean
    disabledReason?: string
    secondary?: string
  }>
  sessionId: string
  workspaceId: string
}

const pageArgs = {
  searchParams: Promise.resolve({ session: "session-1" }),
}

const connectableTarget = {
  id: "page-connectable",
  name: "Connectable Page",
  selectable: true,
}

const alreadyConnectedTarget = {
  id: "page-connected",
  name: "Connected Page",
  selectable: false,
  alreadyConnected: "other_workspace" as const,
}

describe("MessengerSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockResolveConnectSession.mockResolvedValue({
      session: {
        targets: [alreadyConnectedTarget, connectableTarget],
      },
      workspace: { id: "ws-1" },
    })
  })

  test("passes session targets through as picker items, ranked selectable first then already-connected", async () => {
    const element = await MessengerSelectPage(pageArgs)

    expect(isValidElement<SelectPageElementProps>(element)).toBe(true)
    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(mockResolveConnectSession).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      credentialType: "messenger",
      brandingChannel: "messenger",
    })
    expect(element.props.sessionId).toBe("session-1")
    expect(element.props.workspaceId).toBe("ws-1")
    expect(element.props.items).toEqual([
      expect.objectContaining({
        id: "page-connectable",
        isConnectable: true,
        isAlreadyConnected: false,
        disabled: false,
      }),
      expect.objectContaining({
        id: "page-connected",
        isConnectable: true,
        isAlreadyConnected: true,
        disabled: true,
        disabledReason: "messenger.selectPage.alreadyConnectedNote",
      }),
    ])
  })

  test("renders an empty picker when the session has no targets", async () => {
    mockResolveConnectSession.mockResolvedValue({
      session: { targets: [] },
      workspace: { id: "ws-1" },
    })

    const element = await MessengerSelectPage(pageArgs)

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(element.props.items).toEqual([])
  })

  test("uses the page id as the secondary line", async () => {
    const element = await MessengerSelectPage(pageArgs)

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    const connectable = element.props.items.find(
      (item) => item.id === "page-connectable",
    )
    expect(connectable?.secondary).toBe("page-connectable")
  })

  // Non-admin pages are filtered before session targets are created, so the
  // old not-admin warning cannot structurally render in this picker anymore.
  test("does not set the legacy Business Manager lookup warning", async () => {
    const element = await MessengerSelectPage(pageArgs)

    if (!isValidElement<SelectPageElementProps>(element)) {
      throw new Error("MessengerSelectPage did not return a valid element")
    }

    expect(element.props.bmLookupFailed).toBe(false)
  })

  test("redirects to channel creation when the session id is missing", async () => {
    await expect(
      MessengerSelectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/channels/create")

    expect(mockGetCurrentUserId).not.toHaveBeenCalled()
    expect(mockResolveConnectSession).not.toHaveBeenCalled()
  })

  test("redirects to channel creation when the user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    await expect(MessengerSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create",
    )

    expect(mockResolveConnectSession).not.toHaveBeenCalled()
  })
})
