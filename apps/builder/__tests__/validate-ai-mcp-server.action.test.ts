import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertSafeMcpEndpoint: vi.fn(),
  createMCPClient: vi.fn(),
  resolveBotFieldVariableText: vi.fn(),
}))

vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: mocks.createMCPClient }))
vi.mock("@chatbotx.io/business", () => ({
  assertSafeMcpEndpoint: mocks.assertSafeMcpEndpoint,
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))
vi.mock("@chatbotx.io/database/partials", () => ({
  aiMcpServerAuthTypes: { enum: { header: "header", token: "token" } },
}))
vi.mock("@chatbotx.io/variables/bot-field-variable-resolver", () => ({
  resolveBotFieldVariableText: mocks.resolveBotFieldVariableText,
}))
const { validateAIMcpServer } = await import(
  "../src/features/ai-mcp-servers/actions/validate-ai-mcp-server.action"
)

describe("validateAIMcpServer", () => {
  test("does not resolve or send an authorization header for a blocked endpoint", async () => {
    mocks.assertSafeMcpEndpoint.mockRejectedValue(new Error("blocked"))

    await expect(
      validateAIMcpServer({
        parsedInput: {
          workspaceId: "workspace-1",
          url: "http://127.0.0.1:3000/mcp",
          auth: { type: "token", token: "{{secret}}" },
        },
      }),
    ).rejects.toThrow("blocked")

    expect(mocks.resolveBotFieldVariableText).not.toHaveBeenCalled()
    expect(mocks.createMCPClient).not.toHaveBeenCalled()
  })
})
