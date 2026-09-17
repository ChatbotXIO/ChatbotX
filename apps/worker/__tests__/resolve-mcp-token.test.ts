import { describe, expect, test, vi } from "vitest"

const resolveBotFieldVariableTextMock = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/variables", () => ({
  resolveBotFieldVariableText: resolveBotFieldVariableTextMock,
}))

const { createMcpTokenResolver } = await import(
  "../src/integration/handlers/shared/resolve-mcp-token"
)

describe("createMcpTokenResolver", () => {
  test("uses the conversation workspace and never accepts a contact context", async () => {
    resolveBotFieldVariableTextMock.mockResolvedValue({
      status: "resolved",
      value: "resolved-secret",
    })

    await expect(
      createMcpTokenResolver("workspace-1")("{{bot_field:42}}"),
    ).resolves.toEqual({ status: "resolved", token: "resolved-secret" })

    expect(resolveBotFieldVariableTextMock).toHaveBeenCalledWith({
      text: "{{bot_field:42}}",
      workspaceId: "workspace-1",
    })
  })

  test("maps missing and empty fields to an MCP-local skip result", async () => {
    resolveBotFieldVariableTextMock.mockResolvedValue({
      fieldId: "42",
      reason: "empty",
      status: "empty",
    })

    await expect(
      createMcpTokenResolver("workspace-1")("{{bot_field:42}}"),
    ).resolves.toEqual({ reason: "empty", status: "unresolved" })
  })
})
