import { describe, expect, test } from "vitest"
import {
  buildMcpClientGuides,
  MCP_GUIDED_CLIENT_IDS,
} from "@/features/mcp-oauth/lib/connect-clients"
import { buildMcpConnectSnippets } from "@/features/mcp-oauth/lib/connect-snippets"
import en from "../messages/en.json"

const snippets = buildMcpConnectSnippets({
  builderUrl: "https://app.chatbotx.io",
  mcpUrl: "https://app.chatbotx.io/mcp",
})
const guides = buildMcpClientGuides(snippets)

const lookup = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en.chatbotxMcp,
    )

describe("buildMcpClientGuides", () => {
  test("gives every guided client exactly three steps with existing translations", () => {
    for (const id of MCP_GUIDED_CLIENT_IDS) {
      expect(guides[id]).toHaveLength(3)
      for (const step of guides[id]) {
        expect(typeof lookup(step.titleKey)).toBe("string")
        expect(typeof lookup(step.bodyKey)).toBe("string")
      }
    }
  })

  test("points Claude at the Claude profile and its connector settings", () => {
    expect(guides.claude.map((step) => step.action)).toEqual([
      { kind: "copy", value: "https://app.chatbotx.io/mcp/claude" },
      {
        kind: "link",
        href: "https://claude.ai/new#customize/connectors/yours",
        label: "addConnector",
      },
      { kind: "link", href: "https://claude.ai/new", label: "startChatting" },
    ])
  })

  test("points ChatGPT at the OpenAI profile and its plugins page", () => {
    expect(guides.chatgpt[0]?.action).toEqual({
      kind: "copy",
      value: "https://app.chatbotx.io/mcp/openai",
    })
    expect(guides.chatgpt[1]?.action).toEqual({
      kind: "link",
      href: "https://chatgpt.com/plugins",
      label: "addConnector",
    })
  })

  test("CLI clients copy their install and login commands", () => {
    expect(guides.claudeCode[0]?.action).toEqual({
      kind: "copy",
      value: snippets.claudeCode,
    })
    expect(guides.openclaw.slice(0, 2).map((step) => step.action)).toEqual([
      { kind: "copy", value: snippets.openclawInstall },
      { kind: "copy", value: snippets.openclawLogin },
    ])
    expect(guides.hermes.slice(0, 2).map((step) => step.action)).toEqual([
      { kind: "copy", value: snippets.hermes },
      { kind: "copy", value: "/reload-mcp" },
    ])
  })
})
