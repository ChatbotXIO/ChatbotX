import { describe, expect, test } from "vitest"
import {
  compileDecisionProfileRequest,
  normalizeDecisionProviderResponse,
} from "./adapters"
import { decisionProfileContractSchema } from "./contracts"

const choiceProfile = decisionProfileContractSchema.parse({
  inputs: [{ key: "currentMessage", required: true }],
  questions: [
    {
      instructions: "Classify intent.",
      key: "result",
      label: "Intent",
      options: [
        { description: "Wants to buy", label: "Purchase", value: "purchase" },
        { description: "Does not match", label: "Other", value: "other" },
      ],
      type: "choice",
    },
  ],
})

describe("Decision Profile adapter", () => {
  test("compiles Choice to the allowlisted provider wire shape", () => {
    expect(compileDecisionProfileRequest(choiceProfile)).toEqual({
      questions: {
        result: {
          criteria: {
            other: "Does not match",
            purchase: "Wants to buy",
          },
          instructions: "Classify intent.",
          type: "choice",
        },
      },
    })
  })

  test("does not leak profile-only Noul fields into the provider request", () => {
    const noulProfile = decisionProfileContractSchema.parse({
      inputs: [{ key: "currentMessage", required: true }],
      questions: [
        {
          falseCriteria: "The bot can continue.",
          instructions: "Determine whether a human is required.",
          key: "result",
          label: "Human escalation",
          trueCriteria: "The customer explicitly asks for a refund.",
          type: "noul",
        },
      ],
    })

    expect(compileDecisionProfileRequest(noulProfile)).toEqual({
      questions: {
        result: {
          instructions:
            "Determine whether a human is required.\n\nTRUE when:\nThe customer explicitly asks for a refund.\n\nFALSE when:\nThe bot can continue.",
          type: "noul",
        },
      },
    })
  })

  test("normalizes native zero-based scores to the product scale", () => {
    const scoreProfile = decisionProfileContractSchema.parse({
      inputs: [{ key: "currentMessage", required: true }],
      questions: [
        {
          instructions: "Score intent.",
          key: "result",
          label: "Intent score",
          levels: [
            { description: "Low", label: "1", value: 1 },
            { description: "High", label: "2", value: 2 },
          ],
          type: "score",
        },
      ],
    })

    expect(
      normalizeDecisionProviderResponse({
        contract: scoreProfile,
        raw: {
          answers: {
            result: { score: 0, type: "score" },
          },
          model: "model",
        },
      }),
    ).toEqual({
      answers: {
        result: { score: 1, type: "score" },
      },
      model: "model",
    })
  })
})
