import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/ai", () => ({ aiTimeouts: { aiTotal: 120_000 } }))
vi.mock("../src/env", () => ({
  env: {
    HEAVY_JOB_WAIT_TIMEOUT_MS: 150_000,
    MUSE_TRANSCRIBE_TIMEOUT_MS: 540_000,
  },
}))

const {
  getHeavyStepAttemptBudgetMs,
  getMaxHeavyStepAttemptBudgetMs,
  getSpeechToTextAttemptTimeoutMs,
} = await import("../src/heavy/timeouts")

describe("heavy step timeouts", () => {
  test("keeps OpenAI speech-to-text on the shared AI timeout", () => {
    expect(getSpeechToTextAttemptTimeoutMs("openai")).toBe(120_000)
  })

  test("gives Muse speech-to-text its own attempt timeout", () => {
    expect(getSpeechToTextAttemptTimeoutMs("muse")).toBe(540_000)
  })

  test("only widens the caller budget for Muse speech-to-text", () => {
    expect(getHeavyStepAttemptBudgetMs("aiSpeechToText", "muse")).toBe(540_000)
    expect(getHeavyStepAttemptBudgetMs("aiSpeechToText", "openai")).toBe(
      150_000,
    )
    expect(getHeavyStepAttemptBudgetMs("aiGenerateImage", "muse")).toBe(150_000)
  })

  test("sizes the heavy lock from the longest attempt", () => {
    expect(getMaxHeavyStepAttemptBudgetMs()).toBe(540_000)
  })
})
