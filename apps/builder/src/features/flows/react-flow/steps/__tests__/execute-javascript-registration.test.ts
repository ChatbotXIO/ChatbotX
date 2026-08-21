import { readFileSync } from "node:fs"
import {
  actionSteps,
  executeJavascriptStepDefaultFn,
  executeJavascriptStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("executeJavascript step registration", () => {
  test("defines the type and validates shared flow actions", () => {
    const value = {
      ...executeJavascriptStepDefaultFn(),
      code: "return input",
      customFieldId: "field-1",
    }
    expect(stepTypes.enum.executeJavascript).toBe("executeJavascript")
    expect(executeJavascriptStepSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("is wired into the builder registry and tools menu", () => {
    const registry = readFileSync(
      "src/features/flows/react-flow/steps/index.tsx",
      "utf8",
    )
    const menu = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    expect(registry).toContain(
      'import { executeJavascriptStep } from "./execute-javascript"',
    )
    expect(registry).toContain(
      "[stepTypes.enum.executeJavascript]: executeJavascriptStep",
    )
    expect(menu).toContain("stepType: stepTypes.enum.executeJavascript")
  })
})
