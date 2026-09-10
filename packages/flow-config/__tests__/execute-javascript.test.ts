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
      mapping: [{ jsonPath: "", outputFieldId: "" }],
    })
    expect(value.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
  })

  test("accepts a code snippet with a dump field or JSON-path mapping", () => {
    const withOutput = {
      ...executeJavascriptStepDefaultFn(),
      code: "return input.firstName.toUpperCase()",
      customFieldId: "field-1",
      mapping: [],
    }
    const objectReturn = {
      ...executeJavascriptStepDefaultFn(),
      code: "return { latitude: 1, longitude: 2 }",
      customFieldId: "",
      mapping: [
        { jsonPath: "latitude", outputFieldId: "field-lat" },
        { jsonPath: "longitude", outputFieldId: "field-lng" },
      ],
    }
    expect(executeJavascriptStepSchema.safeParse(withOutput).success).toBe(true)
    expect(executeJavascriptStepSchema.safeParse(objectReturn).success).toBe(
      true,
    )
    expect(
      actionSteps.some((schema) => schema.safeParse(withOutput).success),
    ).toBe(true)
  })

  test("accepts a published step that has no mapping key yet", () => {
    const parsed = executeJavascriptStepSchema.safeParse({
      id: executeJavascriptStepDefaultFn().id,
      stepType: "executeJavascript",
      code: "return input.first_name",
      customFieldId: "field-1",
      states: executeJavascriptStepDefaultFn().states,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.mapping).toEqual([])
    }
  })

  test("rejects blank code and a step with neither dump field nor mapping", () => {
    const blankCode = {
      ...executeJavascriptStepDefaultFn(),
      code: "  ",
      customFieldId: "field-1",
    }
    const blankOutputs = {
      ...executeJavascriptStepDefaultFn(),
      code: "return { latitude: 1, longitude: 2 }",
      customFieldId: "",
      mapping: [{ jsonPath: "", outputFieldId: "" }],
    }
    expect(executeJavascriptStepSchema.safeParse(blankCode).success).toBe(false)
    expect(executeJavascriptStepSchema.safeParse(blankOutputs).success).toBe(
      false,
    )
  })

  test("rejects a mapping row that fills only one of path or field", () => {
    const missingField = {
      ...executeJavascriptStepDefaultFn(),
      code: "return { latitude: 1 }",
      mapping: [{ jsonPath: "latitude", outputFieldId: "" }],
    }
    const missingPath = {
      ...executeJavascriptStepDefaultFn(),
      code: "return { latitude: 1 }",
      mapping: [{ jsonPath: "", outputFieldId: "field-lat" }],
    }
    expect(executeJavascriptStepSchema.safeParse(missingField).success).toBe(
      false,
    )
    expect(executeJavascriptStepSchema.safeParse(missingPath).success).toBe(
      false,
    )
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
