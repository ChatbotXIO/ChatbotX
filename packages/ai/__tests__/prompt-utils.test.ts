import { describe, expect, test } from "vitest"
import {
  AI_AGENT_ACTION_TOOL_PROTOCOL_PROMPT,
  appendAIAgentActionToolProtocol,
} from "../src/server/prompt-utils"

describe("AI Agent Action tool protocol", () => {
  test("is appended only when persisted action rules are available", () => {
    expect(appendAIAgentActionToolProtocol("base", false)).toBe("base")
    expect(appendAIAgentActionToolProtocol("base", true)).toBe(
      `base\n\n${AI_AGENT_ACTION_TOOL_PROTOCOL_PROMPT}`,
    )
  })

  test("requires the action tool before a customer-facing response", () => {
    expect(AI_AGENT_ACTION_TOOL_PROTOCOL_PROMPT).toContain(
      "MUST call apply_ai_agent_actions",
    )
    expect(AI_AGENT_ACTION_TOOL_PROTOCOL_PROMPT).toContain(
      "not exact keyword matching",
    )
  })
})
