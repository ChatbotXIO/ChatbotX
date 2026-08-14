import { readFileSync } from "node:fs"
import {
  actionSteps,
  stepTypes,
  triggerN8nStepDefaultFn,
  triggerN8nStepSchema,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("trigger n8n step registration", () => {
  test("defines the type and default state tuple", () => {
    const defaults = triggerN8nStepDefaultFn()
    expect(stepTypes.enum.triggerN8n).toBe("triggerN8n")
    expect(defaults.events).toEqual([])
    expect(defaults.states).toHaveLength(2)
  })

  test("registers valid values in the shared action union", () => {
    const value = {
      ...triggerN8nStepDefaultFn(),
      events: ["order_confirmed"],
    }
    expect(triggerN8nStepSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("is wired into the builder step registry", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/steps/index.tsx",
      "utf8",
    )
    expect(source).toContain('import { triggerN8nStep } from "./trigger-n8n"')
    expect(source).toContain("[stepTypes.enum.triggerN8n]: triggerN8nStep")
  })

  test("appears in the triggers menu", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    expect(source).toContain("stepType: stepTypes.enum.triggerN8n")
  })
})
