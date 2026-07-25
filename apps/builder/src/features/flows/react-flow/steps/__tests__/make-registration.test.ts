import { readFileSync } from "node:fs"
import {
  actionSteps,
  makeStepDefaultFn,
  makeStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("make step registration", () => {
  test("defines the type and default state tuple", () => {
    const defaults = makeStepDefaultFn()
    expect(stepTypes.enum.make).toBe("make")
    expect(defaults.events).toEqual([])
    expect(defaults.states).toHaveLength(2)
  })

  test("registers valid values in the shared action union", () => {
    const value = {
      ...makeStepDefaultFn(),
      events: ["new_order"],
    }
    expect(makeStepSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("is wired into the builder step registry", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/steps/index.tsx",
      "utf8",
    )
    expect(source).toContain('import { makeStep } from "./make"')
    expect(source).toContain("[stepTypes.enum.make]: makeStep")
  })

  test("appears in the triggers menu", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    expect(source).toContain("stepType: stepTypes.enum.make")
  })
})
