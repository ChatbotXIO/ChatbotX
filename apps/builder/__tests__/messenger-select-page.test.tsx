// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockGetCurrentUserId,
  mockRedirect,
  mockResolveConnectSessionForSelect,
  mockSelectPage,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockResolveConnectSessionForSelect: vi.fn(),
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
  resolveConnectSessionForSelect: mockResolveConnectSessionForSelect,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
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
    mockResolveConnectSessionForSelect.mockResolvedValue({
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

    expect(mockResolveConnectSessionForSelect).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      expectedProvider: "messenger",
    })
    expect(element.props.sessionId).toBe("session-1")
    expect(element.props.workspaceId).toBe("ws-1")
    expect(element.props.items).toEqual([
      expect.objectContaining({
        id: "page-connectable",
        disabled: false,
      }),
      expect.objectContaining({
        id: "page-connected",
        disabled: true,
        disabledReason: "messenger.selectPage.alreadyConnectedNote",
      }),
    ])
  })

  test("renders an empty picker when the session has no targets", async () => {
    mockResolveConnectSessionForSelect.mockResolvedValue({
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

  test("redirects to channel creation when the session id is missing", async () => {
    await expect(
      MessengerSelectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/channels/create")

    expect(mockGetCurrentUserId).not.toHaveBeenCalled()
    expect(mockResolveConnectSessionForSelect).not.toHaveBeenCalled()
  })

  test("redirects to channel creation when the user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    await expect(MessengerSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create",
    )

    expect(mockResolveConnectSessionForSelect).not.toHaveBeenCalled()
  })

  test("redirects to channel creation with the mapped error code when resolveConnectSessionForSelect throws a known session exception (regression: an expired/invalid session previously 500'd this page instead of redirecting)", async () => {
    mockResolveConnectSessionForSelect.mockRejectedValue(
      new ChatbotXException("expired", "connectSessionExpired"),
    )

    await expect(MessengerSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create?error=sessionExpired",
    )
  })

  test("rethrows an unexpected (non-session) error instead of redirecting", async () => {
    mockResolveConnectSessionForSelect.mockRejectedValue(new Error("db blip"))

    await expect(MessengerSelectPage(pageArgs)).rejects.toThrow("db blip")
  })
})
