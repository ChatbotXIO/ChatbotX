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

  test("renders the pancake script with the encoded page id on other routes", () => {
    mockUsePathname.mockReturnValue("/dashboard")

    const result = SupportChatScript({ pageId: "page 123" })

    expect(isValidElement(result)).toBe(true)
    expect((result as unknown as { props: { src: string } }).props.src).toBe(
      "https://chat-plugin.pancake.vn/main/auto?page_id=page%20123&hide_supplier=true",
    )
  })
})
