// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockGetCurrentUserId,
  mockRedirect,
  mockResolveConnectSessionForSelect,
  mockSelectAccount,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockResolveConnectSessionForSelect: vi.fn(),
  mockSelectAccount: vi.fn(() => null),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
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
    const element = await InstagramSelectPage(pageArgs)

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
