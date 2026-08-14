import { describe, expect, test } from "vitest"
import { appointmentSchedulingStepSchema, metadataSchema } from "../src"

const baseStep = {
  id: "step-1",
  stepType: "appointmentScheduling",
  mode: "checkAvailability",
  calendarId: "calendar-1",
  startDateFieldId: "start-field",
  endDateFieldId: "end-field",
  states: [
    { id: "1", stateType: "success" },
    { id: "2", stateType: "error" },
  ],
}

describe("appointment scheduling schemas", () => {
  test("requires outputCustomFieldId regardless of resultUsedByAI", () => {
    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...baseStep,
        resultUsedByAI: false,
      }).success,
    ).toBe(false)

    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...baseStep,
        resultUsedByAI: true,
      }).success,
    ).toBe(false)

    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...baseStep,
        resultUsedByAI: false,
        outputCustomFieldId: "output-field",
      }).success,
    ).toBe(true)

    expect(
      appointmentSchedulingStepSchema.safeParse({
        ...baseStep,
        resultUsedByAI: true,
        outputCustomFieldId: "output-field",
      }).success,
    ).toBe(true)
  })

  test("parses appointment availability range metadata", () => {
    expect(
      metadataSchema.safeParse({
        type: "appointmentAvailabilityRangeSelection",
        stepId: "step-1",
        contactInboxId: "contact-inbox-1",
        startDate: "2026-08-10T09:00:00.000",
        endDate: "2026-08-12T17:00:00.000",
      }).success,
    ).toBe(true)

    expect(
      metadataSchema.safeParse({
        type: "appointmentAvailabilityRangeSkipped",
        stepId: "step-1",
      }).success,
    ).toBe(true)
  })
})
