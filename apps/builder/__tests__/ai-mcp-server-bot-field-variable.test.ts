import { describe, expect, test } from "vitest"
import {
  createAIMcpServerRequest,
  createPrivateAIMcpServerRequest,
} from "@/features/ai-mcp-servers/schema/action"

const templateInput = (token: string) => ({
  auth: { token, type: "token" as const },
  availableTools: {},
  name: "MCP server",
  selectedTools: [],
  url: "https://mcp.example.test",
})

describe("private MCP server token schema", () => {
  test("accepts static text and Bot Field variables", () => {
    expect(
      createPrivateAIMcpServerRequest.safeParse(templateInput("static-token"))
        .success,
    ).toBe(true)
    expect(
      createPrivateAIMcpServerRequest.safeParse(
        templateInput("Bearer {{bot_field:42}}"),
      ).success,
    ).toBe(true)
  })

  test("rejects contact variables without changing the public API schema", () => {
    expect(
      createPrivateAIMcpServerRequest.safeParse(templateInput("{{email}}"))
        .success,
    ).toBe(false)
    expect(
      createAIMcpServerRequest.safeParse(templateInput("{{email}}")).success,
    ).toBe(true)
  })
})
