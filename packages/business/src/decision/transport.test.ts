import { describe, expect, test } from "vitest"
import { formatDecisionRequestBody } from "./transport"

const request = {
  questions: {
    choice: {
      instructions: "Choose one.",
      label: "Choice",
      options: [
        { description: "The first option.", label: "One", value: "one" },
        { label: "Two", value: "two" },
      ],
      type: "choice",
    },
    score: {
      instructions: "Score it.",
      label: "Score",
      levels: [
        { description: "The low level.", label: "Low", value: 0 },
        { label: "High", value: 1 },
      ],
      type: "score",
    },
  },
}

describe("formatDecisionRequestBody", () => {
  test.each([
    "typesafe",
    "openrouterDecision",
  ] as const)("converts %s question criteria", (providerKind) => {
    expect(formatDecisionRequestBody({ body: request, providerKind })).toEqual({
      questions: {
        choice: {
          criteria: { one: "The first option.", two: "Two" },
          instructions: "Choose one.",
          label: "Choice",
          options: undefined,
          type: "choice",
        },
        score: {
          criteria: ["The low level.", "High"],
          instructions: "Score it.",
          label: "Score",
          levels: undefined,
          type: "score",
        },
      },
    })
  })

  test("preserves the System One Compatible request body", () => {
    expect(
      formatDecisionRequestBody({
        body: request,
        providerKind: "systemOneCompatible",
      }),
    ).toBe(request)
  })
})
