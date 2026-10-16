import { describe, expect, test } from "vitest"
import {
  compileNoulInstructions,
  decisionProfileContractSchema,
  decisionProfileFormSchema,
  decisionProfileThresholdConfigSchema,
  decisionProviderContractSchema,
} from "./contracts"

const choiceContract = {
  inputs: [{ key: "currentMessage", required: true }],
  questions: [
    {
      instructions: "Classify the message.",
      key: "result",
      label: "Intent",
      options: [
        { description: "Customer wants to buy.", label: "Buy", value: "buy" },
        {
          description: "Does not match another choice.",
          label: "Other",
          value: "other",
        },
      ],
      type: "choice" as const,
    },
  ],
}

describe("Decision Profile contracts", () => {
  test("accepts exactly one stable result question", () => {
    expect(
      decisionProfileContractSchema.safeParse(choiceContract).success,
    ).toBe(true)
    expect(
      decisionProfileContractSchema.safeParse({
        ...choiceContract,
        questions: [{ ...choiceContract.questions[0], key: "intent" }],
      }).success,
    ).toBe(false)
  })

  test("keeps generic provider contracts multi-question while rejecting them for profiles", () => {
    const multiQuestionContract = {
      ...choiceContract,
      questions: [
        ...choiceContract.questions,
        {
          instructions: "Score the message.",
          key: "score",
          label: "Score",
          levels: [
            { description: "Low", label: "1", value: 1 },
            { description: "High", label: "2", value: 2 },
          ],
          type: "score" as const,
        },
      ],
    }

    expect(
      decisionProviderContractSchema.safeParse(multiQuestionContract).success,
    ).toBe(true)
    expect(
      decisionProfileContractSchema.safeParse(multiQuestionContract).success,
    ).toBe(false)
  })

  test("keeps Noul criteria in the profile domain and out of generic provider requests", () => {
    const providerNoulContract = {
      inputs: [{ key: "currentMessage", required: true }],
      questions: [
        {
          instructions: "Evaluate the message.",
          key: "noul_test",
          label: "Noul",
          type: "noul" as const,
        },
      ],
    }

    expect(
      decisionProviderContractSchema.safeParse(providerNoulContract).success,
    ).toBe(true)
    expect(
      decisionProfileContractSchema.safeParse(providerNoulContract).success,
    ).toBe(false)
  })

  test("rejects duplicate Choice values before a profile is persisted", () => {
    expect(
      decisionProfileFormSchema.safeParse({
        connectionId: "1",
        decision: {
          instructions: "Classify intent.",
          options: [
            { description: "Purchase intent", value: "purchase" },
            { description: "A duplicate purchase intent", value: "purchase" },
          ],
          type: "choice",
        },
        model: "model",
        name: "Intent",
        status: "enabled",
        thresholdConfig: null,
      }).success,
    ).toBe(false)
  })

  test("rejects a threshold outside the Score scale", () => {
    expect(
      decisionProfileFormSchema.safeParse({
        connectionId: "1",
        decision: {
          instructions: "Score intent.",
          levels: [{ description: "Low" }, { description: "High" }],
          type: "score",
        },
        model: "model",
        name: "Intent",
        thresholdConfig: { operator: "gte", type: "score", value: 3 },
      }).success,
    ).toBe(false)
  })

  test("compiles Noul criteria into one provider instruction", () => {
    expect(
      compileNoulInstructions({
        falseCriteria: "Shipping question.",
        instructions: "Needs a human.",
        trueCriteria: "Explicit refund request.",
      }),
    ).toContain("TRUE when:")
  })

  test("rejects an overlong compiled Noul instruction", () => {
    const maximum = "a".repeat(1000)
    expect(
      decisionProfileFormSchema.safeParse({
        connectionId: "1",
        decision: {
          falseCriteria: "false",
          instructions: maximum,
          trueCriteria: "true",
          type: "noul",
        },
        model: "model",
        name: "Escalation",
        status: "enabled",
        thresholdConfig: null,
      }).success,
    ).toBe(false)
  })

  test("does not permit an equality score threshold", () => {
    expect(
      decisionProfileThresholdConfigSchema.safeParse({
        operator: "eq",
        type: "score",
        value: 3,
      }).success,
    ).toBe(false)
  })
})
