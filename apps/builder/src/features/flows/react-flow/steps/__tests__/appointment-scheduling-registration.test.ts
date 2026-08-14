import { readFileSync } from "node:fs"
import {
  actionSteps,
  appointmentSchedulingStepDefaultFn,
  appointmentSchedulingStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("appointmentScheduling step registration", () => {
  test("defines the type and default state tuple", () => {
    const defaults = appointmentSchedulingStepDefaultFn()
    expect(stepTypes.enum.appointmentScheduling).toBe("appointmentScheduling")
    expect(defaults.mode).toBe("book")
    expect(defaults.states).toHaveLength(2)
  })

  test("registers valid values in the shared action union", () => {
    const value = {
      ...appointmentSchedulingStepDefaultFn(),
      calendarId: "123",
      dateTimeFieldId: "456",
    }
    expect(appointmentSchedulingStepSchema.safeParse(value).success).toBe(true)
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
      'import { appointmentSchedulingStep } from "./appointment-scheduling"',
    )
    expect(source).toContain(
      "[stepTypes.enum.appointmentScheduling]: appointmentSchedulingStep",
    )
  })

  test("appears above questionnaires in the action menu", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    expect(source.indexOf("stepTypes.enum.appointmentScheduling")).toBeLessThan(
      source.indexOf("stepTypes.enum.questionnaires"),
    )
  })
})
