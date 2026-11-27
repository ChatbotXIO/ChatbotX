// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: () => "" }),
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock(
  "../src/features/mcp-oauth/actions/revoke-mcp-oauth-grant.action",
  () => ({ revokeMcpOAuthGrantAction: vi.fn() }),
)

const { ManageMcpConnector } = await import(
  "../src/features/mcp-oauth/manage-mcp-connector"
)

const ANY_URL = /https?:\/\//
const BRAND = /chatbotx/i

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("ManageMcpConnector", () => {
  test("a white-label host shows no connect URLs or platform brand", () => {
    act(() => {
      root.render(
        <ManageMcpConnector connect={null} grants={[]} workspaceId="w1" />,
      )
    })
    const html = container.innerHTML

    expect(html).toContain("chatbotxMcp.unavailableOnDomain.title")
    expect(html.replaceAll("http://www.w3.org/2000/svg", "")).not.toMatch(
      ANY_URL,
    )
    // The i18n namespace is an internal key, not rendered copy.
    expect(html.replaceAll("chatbotxMcp.", "")).not.toMatch(BRAND)
  })

  test("the platform host shows the connect guide", () => {
    act(() => {
      root.render(
        <ManageMcpConnector
          connect={{
            builderUrl: "https://app.example.com",
            mcpUrl: "https://app.example.com/mcp",
          }}
          grants={[]}
          workspaceId="w1"
        />,
      )
    })

    expect(container.innerHTML).toContain("https://app.example.com/mcp/claude")
    expect(container.innerHTML).not.toContain("unavailableOnDomain")
  })
})
