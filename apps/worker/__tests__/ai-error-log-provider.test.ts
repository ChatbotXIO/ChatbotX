import { describe, expect, it } from "vitest"
import { aiErrorLogProvider } from "../src/integration/handlers/shared/ai-error-log-provider"

describe("aiErrorLogProvider", () => {
  it("keeps every AI vendor distinct instead of folding it into openai", () => {
    expect(aiErrorLogProvider("openai")).toBe("openai")
    expect(aiErrorLogProvider("gemini")).toBe("gemini")
    expect(aiErrorLogProvider("claude")).toBe("claude")
    expect(aiErrorLogProvider("deepseek")).toBe("deepseek")
    expect(aiErrorLogProvider("openrouter")).toBe("openrouter")
  })

  // A self-hosted or third-party OpenAI-shaped endpoint is not OpenAI, and its
  // failures are the workspace's own to fix.
  it("gives an OpenAI-compatible endpoint its own provider", () => {
    expect(aiErrorLogProvider("openaiCompatible")).toBe("openai-compatible")
  })
})
