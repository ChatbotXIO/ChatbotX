import { describe, expect, test } from "vitest"
import {
  actionSteps,
  stepTypes,
  threadControlStepDefaultFn,
  threadControlStepSchema,
} from "../src"

describe("Thread control flow step contract", () => {
  test("the default step releases the thread and has success and error states", () => {
    const parsed = threadControlStepSchema.parse(threadControlStepDefaultFn())

    expect(parsed).toMatchObject({
      stepType: "threadControl",
      action: "release",
    })
    expect(parsed.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
  })

  test.each(["release", "pass"] as const)("accepts the %s action", (action) => {
    expect(
      threadControlStepSchema.parse({
        ...threadControlStepDefaultFn(),
        action,
      }).action,
    ).toBe(action)
  })

  test("rejects an action the step cannot perform (take is a human action)", () => {
    expect(() =>
      threadControlStepSchema.parse({
        ...threadControlStepDefaultFn(),
        action: "take",
      }),
    ).toThrow()
  })

  test("rejects the wrong step type", () => {
    expect(() =>
      threadControlStepSchema.parse({
        ...threadControlStepDefaultFn(),
        stepType: "sendText",
      }),
    ).toThrow()
  })

  test("is registered as a step type and in the action steps, not as a node type", () => {
    expect(stepTypes.options).toContain("threadControl")
    expect(actionSteps).toContain(threadControlStepSchema)
  })
})
