import { describe, expect, test } from "vitest"
import { flowVersionSchema } from "../src/nodes"
import { performActionNodeDefaultFn } from "../src/nodes/perform-action"
import { sendMessageNodeDefaultFn } from "../src/nodes/send-message"
import {
  AISpeechToTextDefaultFn,
  aiSpeechToTextSchema,
  MUSE_TRANSCRIBE_MAX_KEYWORDS,
  museVoiceLanguages,
} from "../src/steps/ai-speech-to-text"

const fields = { inputFieldId: "1", outputFieldId: "2" }

function museStep(overrides: Record<string, unknown> = {}) {
  return {
    ...AISpeechToTextDefaultFn({ provider: "muse", ...fields }),
    ...overrides,
  }
}

describe("aiSpeechToText step schema", () => {
  test("defaults OpenAI to whisper-1", () => {
    const step = AISpeechToTextDefaultFn()
    expect(step.provider).toBe("openai")
    expect(step.model).toBe("whisper-1")
  })

  test("defaults Muse to muse-voice-transcribe-1.0", () => {
    const step = AISpeechToTextDefaultFn({ provider: "muse" })
    expect(step.provider).toBe("muse")
    expect(step.model).toBe("muse-voice-transcribe-1.0")
  })

  test("keeps a legacy OpenAI step without Muse fields valid", () => {
    const legacy = {
      id: "1",
      stepType: "aiSpeechToText",
      provider: "openai",
      model: "whisper-1",
      ...fields,
    }
    expect(aiSpeechToTextSchema.safeParse(legacy).success).toBe(true)
  })

  test("accepts a Muse step with language bias and keywords", () => {
    const parsed = aiSpeechToTextSchema.parse(
      museStep({ languageBias: ["Vietnamese"], keywords: ["ChatbotX"] }),
    )
    expect(parsed).toMatchObject({
      provider: "muse",
      languageBias: ["Vietnamese"],
      keywords: ["ChatbotX"],
    })
  })

  test("rejects an unknown provider", () => {
    expect(
      aiSpeechToTextSchema.safeParse(museStep({ provider: "gemini" })).success,
    ).toBe(false)
  })

  test("rejects a Muse step with another model", () => {
    expect(
      aiSpeechToTextSchema.safeParse(museStep({ model: "whisper-1" })).success,
    ).toBe(false)
  })

  test("rejects Muse-only fields on an OpenAI step", () => {
    const openai = AISpeechToTextDefaultFn(fields)
    expect(
      aiSpeechToTextSchema.safeParse({ ...openai, languageBias: ["English"] })
        .success,
    ).toBe(false)
    expect(
      aiSpeechToTextSchema.safeParse({ ...openai, keywords: ["x"] }).success,
    ).toBe(false)
  })

  test("drops Muse-only fields when defaulting an OpenAI step", () => {
    const step = AISpeechToTextDefaultFn({
      provider: undefined,
      ...fields,
    })
    expect(step).not.toHaveProperty("languageBias")
    expect(step).not.toHaveProperty("keywords")
  })

  test("rejects a language outside the Muse list", () => {
    expect(
      aiSpeechToTextSchema.safeParse(museStep({ languageBias: ["Klingon"] }))
        .success,
    ).toBe(false)
  })

  test("rejects empty keywords and oversized arrays", () => {
    expect(
      aiSpeechToTextSchema.safeParse(museStep({ keywords: ["  "] })).success,
    ).toBe(false)
    expect(
      aiSpeechToTextSchema.safeParse(
        museStep({
          keywords: Array.from(
            { length: MUSE_TRANSCRIBE_MAX_KEYWORDS + 1 },
            (_, index) => `k${index}`,
          ),
        }),
      ).success,
    ).toBe(false)
    expect(
      aiSpeechToTextSchema.safeParse(
        museStep({
          languageBias: [...museVoiceLanguages.options, "English"],
        }),
      ).success,
    ).toBe(false)
  })

  test("parses a flow version holding a Muse step in both node unions", () => {
    const step = museStep({ languageBias: ["Vietnamese"] })
    const performAction = performActionNodeDefaultFn({
      nodeProps: { id: "1" },
      detailProps: { steps: [] },
    })
    const sendMessage = sendMessageNodeDefaultFn({
      labelVersion: 1,
      nodeProps: { id: "2" },
    })

    const parsed = flowVersionSchema.array().parse([
      {
        ...performAction,
        data: {
          ...performAction.data,
          details: { ...performAction.data.details, steps: [step] },
        },
      },
      {
        ...sendMessage,
        data: {
          ...sendMessage.data,
          details: { ...sendMessage.data.details, steps: [step] },
        },
      },
    ])

    expect(parsed).toHaveLength(2)
  })
})
