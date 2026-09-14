import { describe, expect, test } from "vitest"
import { flowSpecStepTypes } from "../../src"

describe("flowSpecStepTypes", () => {
  test("derives one entry per flowStepSpecSchema member, each with a non-empty description", () => {
    expect(flowSpecStepTypes.length).toBeGreaterThan(0)
    for (const stepType of flowSpecStepTypes) {
      expect(stepType.type.length).toBeGreaterThan(0)
      expect(stepType.description.length).toBeGreaterThan(0)
    }
  })

  test("covers every step type the DSL union declares", () => {
    expect(flowSpecStepTypes.map((stepType) => stepType.type).sort()).toEqual(
      [
        "action",
        "addNote",
        "branch",
        "goto",
        "send",
        "sendTemplate",
        "startFlow",
        "wait",
      ].sort(),
    )
  })
})
