import { readFileSync } from "node:fs"
import {
  actionSteps,
  externalRequestStepDefaultFn,
  externalRequestStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("callApi step registration", () => {
  test("defines the type and default state tuple", () => {
    const defaults = externalRequestStepDefaultFn()
    expect(stepTypes.enum.callApi).toBe("callApi")
    expect(defaults.method).toBe("GET")
    expect(defaults.url).toBe("")
    expect(defaults.states).toHaveLength(2)
  })

  test("registers valid values in the shared action union", () => {
    const value = {
      ...externalRequestStepDefaultFn(),
      url: "https://api.example.com",
      mapping: [{ jsonPath: "data.id", outputFieldId: "field-1" }],
    }
    expect(externalRequestStepSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("is wired into the builder step registry", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/steps/index.tsx",
      "utf8",
    )
    expect(source).toContain(
      'import { externalRequestStep } from "./external-request"',
    )
    expect(source).toContain("[stepTypes.enum.callApi]: externalRequestStep")
  })

  test("appears in the tools menu", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    expect(source).toContain("stepType: stepTypes.enum.callApi")
  })
})
