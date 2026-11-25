// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const { McpConnectGuide } = await import(
  "../src/features/mcp-oauth/components/mcp-connect-guide"
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <McpConnectGuide
        builderUrl="https://app.chatbotx.io"
        mcpUrl="https://app.chatbotx.io/mcp"
        workspaceId="workspace-1"
      />,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const clickTab = (label: string) => {
  const tab = Array.from(
    container.querySelectorAll<HTMLElement>('[role="tab"]'),
  ).find((element) => element.textContent?.includes(label))
  expect(tab).toBeDefined()
  act(() => tab?.click())
}

const visiblePanelText = () =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
    .filter((panel) => !panel.hidden)
    .map((panel) => panel.textContent)
    .join("")

describe("McpConnectGuide", () => {
  test("opens on the Claude guide with the Claude profile URL", () => {
    const text = visiblePanelText()

    expect(text).toContain("https://app.chatbotx.io/mcp/claude")
    expect(text).toContain("guide.steps.claude.step2.title")
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="https://claude.ai/new#customize/connectors/yours"]',
    )
    expect(link?.target).toBe("_blank")
    expect(link?.rel).toContain("noopener")
  })

  test("switching to ChatGPT shows the OpenAI profile URL", () => {
    clickTab("clients.chatgpt")

    expect(visiblePanelText()).toContain("https://app.chatbotx.io/mcp/openai")
    expect(
      container.querySelector('a[href="https://chatgpt.com/plugins"]'),
    ).not.toBeNull()
  })

  test("the other-clients link opens the advanced configs with the stdio fallback", () => {
    const otherLink = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "guide.otherClients",
    )
    act(() => otherLink?.click())

    const text = visiblePanelText()
    expect(text).toContain("https://app.chatbotx.io/mcp/messages")
    expect(text).toContain("clients.stdioHint")
    expect(
      container.querySelector(
        'a[href="/space/workspace-1/settings/integrations/workspace-token"]',
      ),
    ).not.toBeNull()
  })
})
