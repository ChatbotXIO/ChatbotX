// @vitest-environment node

import { isValidElement } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}))

vi.mock("next/script", () => ({
  default: (props: unknown) => ({ type: "Script", props }),
}))

const { SupportChatScript } = await import(
  "../src/components/support-chat-script"
)

describe("SupportChatScript", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("renders nothing on the /webchat route", () => {
    mockUsePathname.mockReturnValue("/webchat")

    const result = SupportChatScript({ pageId: "page-123" })

    expect(result).toBeNull()
  })

  test("renders nothing on the bot simulator route", () => {
    mockUsePathname.mockReturnValue("/bs/11612470479962112/11639136935936000")

    const result = SupportChatScript({ pageId: "page-123" })

    expect(result).toBeNull()
  })

  test("renders the pancake script with the encoded page id on other routes", () => {
    mockUsePathname.mockReturnValue("/dashboard")

    const [script, hideStyle] = renderChildren(
      SupportChatScript({ pageId: "page 123" }),
    )

    expect(script.props.src).toBe(
      "https://chat-plugin.pancake.vn/main/auto?page_id=page%20123&hide_supplier=true",
    )
    expect(hideStyle).toBe(false)
  })

  test("keeps the script but hides the bubble on the inbox route", () => {
    mockUsePathname.mockReturnValue("/space/11612470479962112/inbox")

    const [script, hideStyle] = renderChildren(
      SupportChatScript({ pageId: "page-123" }),
    )

    expect(script.props.src).toContain("page_id=page-123")
    expect(isValidElement(hideStyle)).toBe(true)
    expect(
      (hideStyle as unknown as { props: { children: string } }).props.children,
    ).toBe("#pancake-chat-plugin-root{display:none !important}")
  })

  test("shows the bubble on a route that only contains the word inbox", () => {
    mockUsePathname.mockReturnValue("/space/11612470479962112/inbox-settings")

    const [, hideStyle] = renderChildren(
      SupportChatScript({ pageId: "page-123" }),
    )

    expect(hideStyle).toBe(false)
  })
})

function renderChildren(result: ReturnType<typeof SupportChatScript>) {
  expect(isValidElement(result)).toBe(true)
  return (
    result as unknown as {
      props: { children: [{ props: { src: string } }, unknown] }
    }
  ).props.children
}
