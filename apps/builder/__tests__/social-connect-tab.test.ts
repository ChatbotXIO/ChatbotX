// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
)

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
  redirect: redirectMock,
}))

const { buildConnectTabRedirect, connectTabPath } = await import(
  "@/features/social-accounts/lib/connect-route"
)
const { default: AccountsRedirectPage } = await import(
  "@/app/space/[workspaceId]/posts/accounts/page"
)

describe("the Connect tab route", () => {
  test("lives under the posts area", () => {
    expect(connectTabPath("ws-1")).toBe("/space/ws-1/posts/connect")
  })

  test("the old Accounts URL redirects to it and keeps the connect outcome", () => {
    expect(
      buildConnectTabRedirect("ws-1", {
        socialConnect: "error",
        socialMissing: ["a", "b"],
      }),
    ).toBe(
      "/space/ws-1/posts/connect?socialConnect=error&socialMissing=a&socialMissing=b",
    )
    expect(buildConnectTabRedirect("ws-1", {})).toBe(
      "/space/ws-1/posts/connect",
    )
  })

  test("the old Accounts page redirects", async () => {
    await expect(
      AccountsRedirectPage({
        params: Promise.resolve({ workspaceId: "123" }),
        searchParams: Promise.resolve({ socialConnect: "success" }),
      }),
    ).rejects.toThrow("redirect:/space/123/posts/connect?socialConnect=success")
  })
})
