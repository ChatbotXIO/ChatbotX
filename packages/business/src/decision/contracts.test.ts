import { describe, expect, test } from "vitest"
import {
  compileNoulInstructions,
  decisionProfileContractSchema,
  decisionProfileFormSchema,
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
})
