import { describe, expect, test } from "vitest"
import {
  evaluateDecisionStepDefaultFn,
  evaluateDecisionStepSchema,
} from "../src/steps/evaluate-decision"

const validStep = () => ({
  ...evaluateDecisionStepDefaultFn(),
  contextCustomFieldIds: ["1"],
  profileId: "2",
})

describe("evaluateDecisionStepSchema", () => {
  test("accepts a required allowed contact context", () => {
    expect(evaluateDecisionStepSchema.safeParse(validStep()).success).toBe(true)
  })

  test("rejects missing, duplicate, and over-limit context fields", () => {
    expect(
      evaluateDecisionStepSchema.safeParse({
        ...validStep(),
        contextCustomFieldIds: [],
      }).success,
    ).toBe(false)
    expect(
      evaluateDecisionStepSchema.safeParse({
        ...validStep(),
        contextCustomFieldIds: ["1", "1"],
      }).success,
    ).toBe(false)
    expect(
      evaluateDecisionStepSchema.safeParse({
        ...validStep(),
        contextCustomFieldIds: Array.from({ length: 9 }, (_, index) =>
          String(index + 1),
        ),
      }).success,
    ).toBe(false)
  })

  test("rejects retired input source configuration", () => {
    expect(
      evaluateDecisionStepSchema.safeParse({
        ...validStep(),
        input: { type: "currentMessage" },
      }).success,
    ).toBe(false)
  })
})
