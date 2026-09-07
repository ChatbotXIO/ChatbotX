// @vitest-environment node

import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockGetInstagramAccount,
  mockReadPendingAuth,
  mockRedirect,
  mockSelectAccount,
} = vi.hoisted(() => ({
  mockGetInstagramAccount: vi.fn(),
  mockReadPendingAuth: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockSelectAccount: vi.fn(() => null),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getInstagramAccount: mockGetInstagramAccount,
}))

vi.mock("@/lib/facebook-pending-auth", () => ({
  readPendingAuth: mockReadPendingAuth,
  FB_INSTAGRAM_PENDING_AUTH_COOKIE: "fb_instagram_pending_auth",
}))

vi.mock("@/features/integration-instagram/components/select-accounts", () => ({
  SelectAccount: mockSelectAccount,
}))

const { default: InstagramSelectPage } = await import(
  "../src/app/(no-sidebar)/channels/instagram/select/page"
)

type SelectAccountElementProps = {
  account: { id: string; username: string }
  workspaceId: string
}

const account = { id: "ig-1", username: "handle" }

describe("InstagramSelectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadPendingAuth.mockResolvedValue({
      userToken: "user-token",
      version: "v23.0",
      referer: "/channels/create",
      workspaceId: "ws-1",
      expiresAt: Date.now() + 600_000,
    })
    mockGetInstagramAccount.mockResolvedValue(account)
  })

  test("renders SelectAccount with the resolved account and workspace id", async () => {
    const element = await InstagramSelectPage()

    expect(isValidElement<SelectAccountElementProps>(element)).toBe(true)
    if (!isValidElement<SelectAccountElementProps>(element)) {
      throw new Error("InstagramSelectPage did not return a valid element")
    }
    expect(element.props.account).toEqual(account)
    expect(element.props.workspaceId).toBe("ws-1")
    expect(mockGetInstagramAccount).toHaveBeenCalledWith("user-token")
  })

  test("redirects to channel creation when the pending-auth cookie is missing or invalid", async () => {
    mockReadPendingAuth.mockResolvedValue(null)

    await expect(InstagramSelectPage()).rejects.toThrow(
      "redirect:/channels/create",
    )
    expect(mockGetInstagramAccount).not.toHaveBeenCalled()
  })

  test("redirects to channel creation when no Instagram account is found", async () => {
    mockGetInstagramAccount.mockResolvedValue(null)

    await expect(InstagramSelectPage()).rejects.toThrow(
      "redirect:/channels/create",
    )
  })
})
