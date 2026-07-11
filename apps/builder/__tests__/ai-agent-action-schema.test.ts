import { describe, expect, test } from "vitest"
import {
  createAIAgentRequest,
  updateAIAgentRequest,
} from "@/features/ai-agents/schemas/action"

describe("AI agent action schemas", () => {
  test("defaults rich response on create", () => {
    const result = createAIAgentRequest.safeParse({
      name: "Support",
      prompt: "Answer customer questions.",
      messages: [],
      models: [],
      temperature: 0.4,
      maxOutputTokens: 2048,
      tools: [],
      isDefault: false,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ isRichResponse: false })
  })

  test("does not default rich response on partial update", () => {
    const result = updateAIAgentRequest.safeParse({ isDefault: true })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ isDefault: true })
  })

  test("accepts legacy native and dynamic OpenAI-compatible model rows", () => {
    const result = createAIAgentRequest.safeParse({
      name: "Support",
      prompt: "Answer customer questions.",
      messages: [],
      models: [
        { provider: "openai", model: "gpt-5.4-mini" },
        {
          kind: "openaiCompatible",
          integrationId: "123",
          model: "local-model",
        },
      ],
      temperature: 0.4,
      maxOutputTokens: 2048,
      tools: [],
      isDefault: false,
    })

    expect(result.success).toBe(true)
  })

  test("rejects OpenAI-compatible model rows without integration id", () => {
    const result = createAIAgentRequest.safeParse({
      name: "Support",
      prompt: "Answer customer questions.",
      messages: [],
      models: [{ kind: "openaiCompatible", model: "local-model" }],
      temperature: 0.4,
      maxOutputTokens: 2048,
      tools: [],
      isDefault: false,
    })

    expect(result.success).toBe(false)
  })
})
