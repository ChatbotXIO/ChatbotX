// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockGetCurrentUserId,
  mockRedirect,
  mockResolveConnectSessionForSelect,
  mockSelectAccount,
  mockSelectFacebookAccounts,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockResolveConnectSessionForSelect: vi.fn(),
  mockSelectAccount: vi.fn(() => null),
  mockSelectFacebookAccounts: vi.fn(() => null),
}))

vi.mock("@chatbotx.io/integration-ahachat", () => ({
  isAhachatConfigured: () => true,
}))

/** The page wraps the picker in the AhaChat availability provider: tests look at the picker inside. */
const unwrapAvailability = (node: ReactNode): ReactNode =>
  isValidElement<{ children: ReactNode }>(node) ? node.props.children : node

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@/features/contact-sync/lib/access", () => ({
  findConnectPagesOnAhachat: async () => [],
}))

vi.mock(
  "@/features/integration-instagram/components/select-facebook-accounts",
  () => ({ SelectFacebookAccounts: mockSelectFacebookAccounts }),
)

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mockGetCurrentUserId,
}))

vi.mock("@/features/channel-connect/lib/resolve-connect-session", () => ({
  resolveConnectSessionForSelect: mockResolveConnectSessionForSelect,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/features/integration-instagram/components/select-accounts", () => ({
  SelectAccount: mockSelectAccount,
}))

const { default: InstagramSelectPage } = await import(
  "../src/app/(no-sidebar)/channels/instagram/select/page"
)

type SelectAccountElementProps = {
  account: { avatarUrl?: string; id: string; name: string }
  sessionId: string
  workspaceId: string
}

const pageArgs = {
  searchParams: Promise.resolve({ session: "session-1" }),
}

const account = {
  avatarUrl: "https://example.com/account.jpg",
  id: "ig-1",
  name: "Instagram account",
  selectable: true,
}

describe("InstagramSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
    mockResolveConnectSessionForSelect.mockResolvedValue({
      session: { targets: [account] },
      workspace: { id: "ws-1" },
    })
  })

  test("renders SelectAccount with the resolved account, session id, and workspace id", async () => {
    const element = unwrapAvailability(await InstagramSelectPage(pageArgs))

    expect(isValidElement<SelectAccountElementProps>(element)).toBe(true)
    if (!isValidElement<SelectAccountElementProps>(element)) {
      throw new Error("InstagramSelectPage did not return a valid element")
    }

    expect(mockResolveConnectSessionForSelect).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      expectedProvider: "instagram",
    })
    expect(element.props.account).toEqual({
      avatarUrl: "https://example.com/account.jpg",
      id: "ig-1",
      name: "Instagram account",
    })
    expect(element.props.sessionId).toBe("session-1")
    expect(element.props.workspaceId).toBe("ws-1")
  })

  test("renders the multi-account picker on the direct-login route for several Unified Login accounts", async () => {
    mockResolveConnectSessionForSelect.mockResolvedValue({
      session: {
        targets: [account, { ...account, id: "ig-2", name: "Second" }],
      },
      workspace: { id: "ws-1" },
    })

    const page = await InstagramSelectPage(pageArgs)
    const findPicker = (node: ReactNode): ReactNode => {
      if (!isValidElement<{ children?: ReactNode }>(node)) {
        return null
      }
      if (node.type === mockSelectFacebookAccounts) {
        return node
      }
      const children = Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children]
      for (const child of children) {
        const found = findPicker(child)
        if (found) {
          return found
        }
      }
      return null
    }
    const picker = findPicker(page)

    expect(isValidElement(picker)).toBe(true)
    if (!isValidElement<{ provider: string; items: unknown[] }>(picker)) {
      throw new Error("the multi-account picker was not rendered")
    }
    expect(picker.props.provider).toBe("instagram")
    expect(picker.props.items).toHaveLength(2)
  })

  test("redirects to channel creation when the session id is missing", async () => {
    await expect(
      InstagramSelectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/channels/create")

    expect(mockGetCurrentUserId).not.toHaveBeenCalled()
    expect(mockResolveConnectSessionForSelect).not.toHaveBeenCalled()
  })

  test("redirects to channel creation when the user is not authenticated", async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    await expect(InstagramSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create",
    )

    expect(mockResolveConnectSessionForSelect).not.toHaveBeenCalled()
  })

  test("redirects to channel creation when the session has no Instagram account", async () => {
    mockResolveConnectSessionForSelect.mockResolvedValue({
      session: { targets: [] },
      workspace: { id: "ws-1" },
    })

    await expect(InstagramSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create",
    )
  })

  test("redirects to channel creation with the mapped error code when resolveConnectSessionForSelect throws a known session exception (regression: an expired/invalid session previously 500'd this page instead of redirecting)", async () => {
    mockResolveConnectSessionForSelect.mockRejectedValue(
      new ChatbotXException("expired", "connectSessionExpired"),
    )

    await expect(InstagramSelectPage(pageArgs)).rejects.toThrow(
      "redirect:/channels/create?error=sessionExpired",
    )
  })

  test("rethrows an unexpected (non-session) error instead of redirecting", async () => {
    mockResolveConnectSessionForSelect.mockRejectedValue(new Error("db blip"))

    await expect(InstagramSelectPage(pageArgs)).rejects.toThrow("db blip")
  })
})
