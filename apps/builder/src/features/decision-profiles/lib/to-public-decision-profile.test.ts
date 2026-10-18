import type { DecisionProfileModel } from "@chatbotx.io/database/types"
import { describe, expect, test } from "vitest"
import { toPublicDecisionProfile } from "./to-public-decision-profile"

const baseProfile = {
  connectionId: "2",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  description: "Routes customer intent",
  globalRouterConfig: null,
  globalRouterEnabled: false,
  id: "1",
  model: "router-model",
  name: "Customer intent",
  status: "enabled",
  thresholdConfig: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  workspaceId: "3",
} satisfies Omit<DecisionProfileModel, "contract">

describe("toPublicDecisionProfile", () => {
  test("maps a stored choice contract to the editable public shape", () => {
    const result = toPublicDecisionProfile({
      ...baseProfile,
      contract: {
        inputs: [{ key: "currentMessage", required: true }],
        questions: [
          {
            instructions: "Classify the message.",
            key: "result",
            label: "Customer intent",
            options: [
              {
                description: "The customer wants support.",
                label: "Support",
                value: "support",
              },
              {
                description: "The customer wants to buy.",
                label: "Sales",
                value: "sales",
              },
            ],
            type: "choice",
          },
        ],
      },
      globalRouterConfig: {
        fallback: { id: "10", type: "flow" },
        metadataMappings: [],
        noul: { falseMaximum: 0.4, trueMinimum: 0.6 },
        routes: [
          {
            destination: { id: "11", type: "aiAgent" },
            type: "choice",
            value: "support",
          },
        ],
        version: 1,
      },
      globalRouterEnabled: true,
      thresholdConfig: { minimum: 0.8, type: "choice_confidence" },
    })

    expect(result).toMatchObject({
      connectionId: "2",
      decision: {
        instructions: "Classify the message.",
        options: [
          { description: "The customer wants support.", value: "support" },
          { description: "The customer wants to buy.", value: "sales" },
        ],
        type: "choice",
      },
      globalRouterEnabled: true,
      id: "1",
      thresholdConfig: { minimum: 0.8, type: "choice_confidence" },
    })
    expect(result).not.toHaveProperty("contract")
  })

  test("maps score and noul contracts without provider-only labels", () => {
    const score = toPublicDecisionProfile({
      ...baseProfile,
      contract: {
        inputs: [{ key: "currentMessage", required: true }],
        questions: [
          {
            instructions: "Score urgency.",
            key: "result",
            label: "Customer intent",
            levels: [
              { description: "Low urgency.", label: "1", value: 1 },
              { description: "High urgency.", label: "2", value: 2 },
            ],
            type: "score",
          },
        ],
      },
      thresholdConfig: { operator: "gte", type: "score", value: 2 },
    })
    const noul = toPublicDecisionProfile({
      ...baseProfile,
      contract: {
        inputs: [{ key: "currentMessage", required: true }],
        questions: [
          {
            falseCriteria: "No purchase intent.",
            instructions: "Evaluate purchase intent.",
            key: "result",
            label: "Customer intent",
            trueCriteria: "The customer asks to buy.",
            type: "noul",
          },
        ],
      },
      thresholdConfig: { minimum: 0.7, type: "noul_true_probability" },
    })

    expect(score.decision).toEqual({
      instructions: "Score urgency.",
      levels: [
        { description: "Low urgency." },
        { description: "High urgency." },
      ],
      type: "score",
    })
    expect(noul.decision).toEqual({
      falseCriteria: "No purchase intent.",
      instructions: "Evaluate purchase intent.",
      trueCriteria: "The customer asks to buy.",
      type: "noul",
    })
  })
})
