// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/hooks/use-clipboard", () => ({
  useClipboard: () => ({ handleCopy: vi.fn() }),
}))
vi.mock("../actions/create-mcp-token-action", () => ({
  createMcpTokenAction: { bind: () => vi.fn() },
}))

let actionResult: { data?: { token: string } } = {}
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({
    execute: vi.fn(),
    result: actionResult,
    isPending: false,
  }),
}))

const { ConnectAgentCard } = await import("../components/connect-agent-card")

let container: HTMLDivElement
let root: Root

const render = async (mcpServerUrl: string | null) => {
  await act(() => {
    root.render(
      <ConnectAgentCard mcpServerUrl={mcpServerUrl} workspaceId="ws-1" />,
    )
  })
}

beforeEach(() => {
  actionResult = {}
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe("ConnectAgentCard", () => {
  it("shows only the generate button before a key exists", async () => {
    await render("https://mcp.example.com")

    expect(container.textContent).toContain("generate")
    expect(container.querySelector("pre")).toBeNull()
  })

  it("renders hosted MCP and CLI snippets with the key once generated", async () => {
    actionResult = { data: { token: "cbx_ws_abc" } }
    await render("https://mcp.example.com/")

    const snippets = Array.from(container.querySelectorAll("pre")).map(
      (node) => node.textContent ?? "",
    )
    expect(snippets).toHaveLength(3)
    expect(snippets[0]).toBe(
      'claude mcp add chatbotx -t sse "https://mcp.example.com/sse?workspace_token=cbx_ws_abc"',
    )
    expect(snippets[2]).toContain("CHATBOTX_API_KEY=cbx_ws_abc")
  })

  it("falls back to the CLI snippet when no hosted MCP url is configured", async () => {
    actionResult = { data: { token: "cbx_ws_abc" } }
    await render(null)

    expect(container.querySelectorAll("pre")).toHaveLength(1)
    expect(container.textContent).not.toContain("workspace_token=")
  })
})
