import { describe, expect, test } from "vitest"
import {
  actionSteps,
  executeJavascriptStepDefaultFn,
  executeJavascriptStepSchema,
} from "../src"

describe("JavaScript execution flow contract", () => {
  test("creates defaults with success and error states", () => {
    const value = executeJavascriptStepDefaultFn()
    expect(value).toMatchObject({
      stepType: "executeJavascript",
      code: "",
      customFieldId: "",
    })
    expect(value.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
  })

  test("accepts a code snippet and an output custom field", () => {
    const value = {
      ...executeJavascriptStepDefaultFn(),
      code: "return input.firstName.toUpperCase()",
      customFieldId: "field-1",
    }
    expect(executeJavascriptStepSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("rejects blank code and output field ids", () => {
    const blankCode = {
      ...executeJavascriptStepDefaultFn(),
      code: "  ",
      customFieldId: "field-1",
    }
    const blankOutputField = {
      ...executeJavascriptStepDefaultFn(),
      code: "return input",
      customFieldId: " ",
    }
    expect(executeJavascriptStepSchema.safeParse(blankCode).success).toBe(false)
    expect(
      executeJavascriptStepSchema.safeParse(blankOutputField).success,
    ).toBe(false)
  })

  test("rejects code exceeding the max length", () => {
    const oversizedCode = {
      ...executeJavascriptStepDefaultFn(),
      code: "a".repeat(10_001),
      customFieldId: "field-1",
    }
    expect(executeJavascriptStepSchema.safeParse(oversizedCode).success).toBe(
      false,
    )
  })
})
