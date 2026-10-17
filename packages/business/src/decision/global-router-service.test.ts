import { describe, expect, test } from "vitest"
import { globalRouterService } from "./global-router-service"

const flow = { id: "1", type: "flow" } as const
const choiceContract = {
  inputs: [{ key: "currentMessage", required: true }],
  questions: [
    {
      instructions: "Classify the message.",
      key: "result",
      label: "Intent",
      options: [
        { description: "Buy", label: "Buy", value: "buy" },
        { description: "Other", label: "Other", value: "other" },
      ],
      type: "choice" as const,
    },
  ],
}

describe("GlobalRouterService.resolveRoute", () => {
  test("routes a valid Choice answer and uses fallback when no route exists", () => {
    const config = {
      fallback: { id: "2", type: "flow" as const },
      metadataMappings: [],
      noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
      routes: [{ destination: flow, type: "choice" as const, value: "buy" }],
      version: 1 as const,
    }
    expect(
      globalRouterService.resolveRoute({
        answer: { choice: "buy", confidence: 0.9, type: "choice" },
        config,
        contract: choiceContract,
      }),
    ).toEqual({ destination: flow })
    expect(
      globalRouterService.resolveRoute({
        answer: { choice: "other", confidence: 0.9, type: "choice" },
        config,
        contract: choiceContract,
      }),
    ).toEqual({ destination: null })
  })

  test("uses the Noul uncertainty band instead of inventing a boolean", () => {
    const contract = {
      inputs: [{ key: "currentMessage", required: true }],
      questions: [
        {
          falseCriteria: "No",
          instructions: "Escalate?",
          key: "result",
          label: "Escalate",
          trueCriteria: "Yes",
          type: "noul" as const,
        },
      ],
    }
    const config = {
      fallback: { id: "2", type: "flow" as const },
      metadataMappings: [],
      noul: { falseMaximum: 0.4, trueMinimum: 0.6 },
      routes: [{ destination: flow, type: "noul" as const, value: true }],
      version: 1 as const,
    }
    expect(
      globalRouterService.resolveRoute({
        answer: { probabilityTrue: 0.5, type: "noul" },
        config,
        contract,
      }),
    ).toEqual({ destination: null, reason: "thresholdUnmet" })

    expect(
      globalRouterService.resolveRoute({
        answer: { probabilityTrue: 0.5, type: "noul" },
        config: {
          ...config,
          noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
        },
        contract,
      }),
    ).toEqual({ destination: flow })
  })

  test("only routes an integral Score level inside the configured contract", () => {
    const contract = {
      inputs: [{ key: "currentMessage", required: true }],
      questions: [
        {
          instructions: "Prioritize the request.",
          key: "result",
          label: "Priority",
          levels: [
            { description: "Low", label: "1", value: 1 },
            { description: "High", label: "2", value: 2 },
          ],
          type: "score" as const,
        },
      ],
    }
    const config = {
      fallback: { id: "2", type: "flow" as const },
      metadataMappings: [],
      noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
      routes: [{ destination: flow, from: 2, to: 2, type: "score" as const }],
      version: 1 as const,
    }

    expect(
      globalRouterService.resolveRoute({
        answer: { score: 2, type: "score" },
        config,
        contract,
      }),
    ).toEqual({ destination: flow })
    expect(
      globalRouterService.resolveRoute({
        answer: { score: 1.5, type: "score" },
        config,
        contract,
      }),
    ).toEqual({ destination: null, invalid: true })
  })
})
